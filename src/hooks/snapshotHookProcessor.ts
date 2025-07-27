import {
  ValidationResult,
  HookDataSchema,
  HookData,
} from '../contracts'
import { Storage } from '../storage/Storage'
import { SnapshotManager } from '../snapshot/SnapshotManager'
import { RevertManager } from '../snapshot/RevertManager'
import { FileScanner } from '../snapshot/FileScanner'
import { ConfigLoader } from '../config/ConfigLoader'
import { GuardManager } from '../ccguard/GuardManager'
import { UserPromptHandler } from './userPromptHandler'

export interface SnapshotHookProcessorDeps {
  storage: Storage
  rootDir?: string
  configLoader?: ConfigLoader
}

export class SnapshotHookProcessor {
  private storage: Storage
  private snapshotManager: SnapshotManager
  private revertManager: RevertManager
  private fileScanner: FileScanner
  private configLoader: ConfigLoader
  private guardManager: GuardManager
  private userPromptHandler: UserPromptHandler
  private rootDir: string

  constructor(deps: SnapshotHookProcessorDeps) {
    this.storage = deps.storage
    this.rootDir = deps.rootDir ?? process.cwd()
    this.configLoader = deps.configLoader ?? new ConfigLoader()
    
    const config = this.configLoader.getConfig()
    this.snapshotManager = new SnapshotManager(
      this.rootDir,
      this.storage,
      config.enforcement.ignoreEmptyLines
    )
    this.revertManager = new RevertManager(this.rootDir)
    this.fileScanner = new FileScanner(this.rootDir, config.enforcement.ignoreEmptyLines)
    this.guardManager = new GuardManager(this.storage, this.configLoader, this.rootDir)
    this.userPromptHandler = new UserPromptHandler(this.guardManager)
  }

  async processHookData(inputData: string): Promise<ValidationResult> {
    try {
      const parsedData = JSON.parse(inputData)
      
      // Process user commands (on/off/status)
      const commandResult = await this.userPromptHandler.processUserCommand(inputData)
      if (commandResult) {
        return commandResult
      }

      // Check if guard is disabled
      const disabledResult = await this.userPromptHandler.getDisabledResult()
      if (disabledResult) {
        return disabledResult
      }

      // Parse hook data
      const hookResult = HookDataSchema.safeParse(parsedData)
      if (!hookResult.success) {
        return {
          decision: 'approve',
          reason: 'No validation required',
        }
      }

      const hookData = hookResult.data

      // Handle UserPromptSubmit to ensure baseline is initialized early
      if (hookData.hook_event_name === 'UserPromptSubmit' && hookData.session_id) {
        // Initialize baseline for new sessions
        await this.snapshotManager.getBaseline(hookData.session_id)
        return {
          decision: 'approve',
          reason: 'Session initialized',
        }
      }

      // Only process file modification operations
      if (!this.shouldValidateOperation(hookData)) {
        return {
          decision: 'approve',
          reason: 'Operation does not modify files',
        }
      }

      // Route to appropriate handler
      if (hookData.hook_event_name === 'PreToolUse') {
        return await this.handlePreToolUse(hookData)
      } else if (hookData.hook_event_name === 'PostToolUse') {
        return await this.handlePostToolUse(hookData)
      }

      return {
        decision: 'approve',
        reason: 'No validation required - not a file operation',
      }
    } catch (error) {
      console.error('Error processing hook data:', error)
      return {
        decision: 'block',
        reason: 'Error processing hook data. Please try again.',
      }
    }
  }

  private async handlePreToolUse(hookData: HookData): Promise<ValidationResult> {
    try {
      // In snapshot mode, we don't need full pre-operation snapshots
      if (this.isSnapshotMode()) {
        // Ensure baseline exists for the session
        await this.snapshotManager.getBaseline(hookData.session_id)
        
        // Store minimal pre-state for potential revert
        // We only need to store affected files for revert capability
        const affectedFiles = this.fileScanner.getAffectedFiles(hookData)
        const minimalSnapshot = await this.snapshotManager.takeOperationSnapshot(
          hookData.session_id,
          affectedFiles
        )
        
        // Store only the minimal snapshot for revert
        await this.storage.set(
          `snapshot:pre:${hookData.session_id}:minimal`,
          {
            snapshot: {
              ...minimalSnapshot,
              files: Array.from(minimalSnapshot.files.entries())
            },
            affectedFiles,
          }
        )
        
        return {
          decision: 'approve',
          reason: 'Operation approved - will validate after completion',
        }
      }

      // Cumulative mode: continue with existing logic
      // Get affected files  
      const affectedFiles = this.fileScanner.getAffectedFiles(hookData)
      
      // For operations that will create new files, we need to ensure baseline exists
      // but we must initialize it BEFORE any files are created
      await this.snapshotManager.getBaseline(hookData.session_id)
      
      // Take a snapshot of current state (before operation)
      // For new file operations, this won't include the new file yet
      const snapshot = await this.snapshotManager.takeOperationSnapshot(
        hookData.session_id,
        affectedFiles
      )
      
      // Convert Map to serializable format before storing
      const serializableSnapshot = {
        ...snapshot,
        files: Array.from(snapshot.files.entries())
      }
      
      // Store snapshot reference for PostToolUse
      await this.storage.set(
        `snapshot:pre:${hookData.session_id}:latest`,
        {
          snapshot: serializableSnapshot,
          affectedFiles,
          operation: hookData,
        }
      )
      
      // Always approve PreToolUse (validation happens in PostToolUse)
      return {
        decision: 'approve',
        reason: 'Operation approved - will validate after completion',
      }
    } catch (error) {
      console.error('Error in PreToolUse:', error)
      return {
        decision: 'approve',
        reason: 'Pre-operation snapshot failed, but allowing operation',
      }
    }
  }

  private async handlePostToolUse(hookData: HookData): Promise<ValidationResult> {
    try {
      // Route to mode-specific handler
      if (this.isSnapshotMode()) {
        return await this.handleSnapshotModePostToolUse(hookData)
      }

      // Cumulative mode: continue with existing logic
      // Get the pre-operation snapshot
      const preData = await this.storage.get(
        `snapshot:pre:${hookData.session_id}:latest`
      ) as any
      
      if (!preData) {
        // No pre-snapshot, can't validate
        return {
          decision: 'approve',
          reason: 'No pre-operation snapshot available',
        }
      }

      const { affectedFiles } = preData
      
      // Take post-operation snapshot
      const postSnapshot = await this.snapshotManager.takePostOperationSnapshot(
        hookData.session_id,
        affectedFiles
      )
      
      // Reconstruct the pre-operation snapshot with proper Map structure
      const preSnapshot = {
        ...preData.snapshot,
        files: new Map(preData.snapshot.files)
      }
      
      // Compare pre and post operation snapshots to get actual changes
      const operationDiff = this.snapshotManager.compareSnapshots(
        preSnapshot,
        postSnapshot
      )
      
      // Calculate lines added/removed from operation diff details
      let linesAdded = 0
      let linesRemoved = 0
      
      for (const fileDiff of operationDiff.details.values()) {
        if (fileDiff.delta > 0) {
          linesAdded += fileDiff.delta
        } else if (fileDiff.delta < 0) {
          linesRemoved += Math.abs(fileDiff.delta)
        }
      }
      
      // Get current session stats
      const sessionStats = await this.guardManager.getSessionStats() || {
        totalLinesAdded: 0,
        totalLinesRemoved: 0,
        netChange: 0,
        operationCount: 0,
        lastUpdated: new Date().toISOString()
      }
      
      // Calculate what the session totals would be after this operation
      const projectedLinesAdded = sessionStats.totalLinesAdded + linesAdded
      const projectedLinesRemoved = sessionStats.totalLinesRemoved + linesRemoved
      const projectedNetChange = projectedLinesAdded - projectedLinesRemoved
      
      // Check threshold based on session stats
      const config = this.configLoader.getConfig()
      const threshold = config.thresholds?.allowedPositiveLines ?? 0
      
      if (projectedNetChange > threshold) {
        // Threshold would be exceeded - revert to pre-operation state
        // If affectedFiles is empty, use the files that actually changed from operationDiff
        const filesToRevert = affectedFiles.length > 0 
          ? affectedFiles 
          : Array.from(operationDiff.details.keys())
        
        const revertResult = await this.revertManager.revertToSnapshot(
          filesToRevert,
          preSnapshot
        )
        
        if (!revertResult.success) {
          return {
            decision: 'block',
            reason: `LOC threshold exceeded (session would have: +${projectedNetChange} lines, allowed: +${threshold} lines).\n\nFailed to revert: ${revertResult.error}\n\nPlease manually revert the changes.`,
          }
        }
        
        // Use baseline comparison for the error message (for display purposes)
        const thresholdCheck = await this.snapshotManager.checkThreshold(
          hookData.session_id,
          postSnapshot,
          threshold
        )
        
        return {
          decision: 'block',
          reason: this.createThresholdExceededMessage(thresholdCheck, threshold),
        }
      }
      
      // Update last valid snapshot
      this.snapshotManager.updateLastValidSnapshot(postSnapshot)
      
      // Update session stats with the operation changes
      await this.guardManager.updateSessionStats(linesAdded, linesRemoved)
      
      // Get updated session stats
      const updatedStats = await this.guardManager.getSessionStats()
      
      return {
        decision: 'approve',
        reason: `Operation completed successfully.\n\nLOC change: ${operationDiff.locDelta >= 0 ? '+' : ''}${operationDiff.locDelta} lines\nSession total: ${(updatedStats?.netChange ?? 0) >= 0 ? '+' : ''}${updatedStats?.netChange ?? 0} lines`,
      }
    } catch (error) {
      console.error('Error in PostToolUse:', error)
      return {
        decision: 'approve',
        reason: 'Post-operation validation failed, but changes were already applied',
      }
    }
  }

  private shouldValidateOperation(_hookData: HookData): boolean {
    // Validate all tools to track any file system changes
    return true
  }

  private createThresholdExceededMessage(
    thresholdCheck: any,
    threshold: number
  ): string {
    // Cumulative mode message (when changes are reverted)
    return `Operation reverted: LOC threshold exceeded!

Session cumulative LOC status:
  • Session start baseline: ${thresholdCheck.baseline} lines
  • Would be after operation: ${thresholdCheck.current} lines  
  • Change from baseline: ${thresholdCheck.delta >= 0 ? '+' : ''}${thresholdCheck.delta} lines
  • Allowed cumulative change: +${threshold} lines

The changes have been reverted to maintain the LOC limit.

Suggestions:
  • Remove or refactor existing code before adding new features
  • Use MultiEdit to batch additions with removals
  • Consider if all new code is truly necessary
  • Look for opportunities to consolidate duplicate code`
  }

  /**
   * Check if the system is in snapshot mode
   */
  private isSnapshotMode(): boolean {
    const config = this.configLoader.getConfig()
    return config.enforcement.strategy === 'snapshot'
  }

  /**
   * Handle PostToolUse in snapshot mode
   * Validates against baseline threshold instead of cumulative stats
   */
  private async handleSnapshotModePostToolUse(hookData: HookData): Promise<ValidationResult> {
    try {
      // Get affected files from the operation
      const affectedFiles = this.fileScanner.getAffectedFiles(hookData)
      
      // Take current snapshot after operation
      const currentSnapshot = await this.snapshotManager.takePostOperationSnapshot(
        hookData.session_id,
        affectedFiles
      )
      
      // Check against baseline threshold
      const thresholdCheck = await this.snapshotManager.checkSnapshotThreshold(
        hookData.session_id,
        currentSnapshot.totalLoc
      )
      
      // If threshold exceeded, we need to revert
      if (thresholdCheck.exceeded) {
        // Get the minimal pre-state for revert
        const preData = await this.storage.get(
          `snapshot:pre:${hookData.session_id}:minimal`
        ) as any
        
        if (preData) {
          // Reconstruct snapshot with Map
          const preSnapshot = {
            ...preData.snapshot,
            files: new Map(preData.snapshot.files)
          }
          
          // Revert to pre-operation state
          const revertResult = await this.revertManager.revertToSnapshot(
            affectedFiles,
            preSnapshot
          )
          
          if (!revertResult.success) {
            return {
              decision: 'block',
              reason: `Operation reverted: LOC threshold exceeded!

Baseline threshold: ${thresholdCheck.baseline} lines
Current LOC: ${thresholdCheck.current} lines
Exceeded by: ${thresholdCheck.delta} lines

Failed to automatically revert: ${revertResult.error}
Please manually revert the changes.`
            }
          }
        }
        
        return {
          decision: 'block',
          reason: `Operation reverted: LOC threshold exceeded!

Baseline threshold: ${thresholdCheck.baseline} lines
Current LOC: ${thresholdCheck.current} lines
Exceeded by: ${thresholdCheck.delta} lines

The baseline threshold was set by 'ccguard snapshot'.
To update the threshold, run 'ccguard snapshot' again.`
        }
      }
      
      // Update last valid snapshot
      await this.snapshotManager.updateLastValidSnapshot(currentSnapshot)
      
      // Clean up minimal snapshot storage
      await this.storage.delete(`snapshot:pre:${hookData.session_id}:minimal`)
      
      return {
        decision: 'approve',
        reason: `Operation completed successfully.

Current LOC: ${thresholdCheck.current} lines
Baseline threshold: ${thresholdCheck.baseline} lines`
      }
    } catch (error) {
      console.error('Error in snapshot mode PostToolUse:', error)
      return {
        decision: 'approve',
        reason: 'Post-operation validation failed, but changes were already applied',
      }
    }
  }
}