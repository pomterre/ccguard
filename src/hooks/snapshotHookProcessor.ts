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
    this.guardManager = new GuardManager(this.storage, this.configLoader)
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
      // Initialize baseline if needed
      await this.snapshotManager.getBaseline(hookData.session_id)
      
      // Get affected files
      const affectedFiles = this.fileScanner.getAffectedFiles(hookData)
      
      // Take a lightweight snapshot of affected files
      const snapshot = await this.snapshotManager.takeOperationSnapshot(
        hookData.session_id,
        affectedFiles
      )
      
      // Store snapshot reference for PostToolUse
      await this.storage.set(
        `snapshot:pre:${hookData.session_id}:latest`,
        {
          snapshot,
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
      
      // Check threshold
      const config = this.configLoader.getConfig()
      const threshold = config.thresholds?.allowedPositiveLines ?? 0
      const thresholdCheck = await this.snapshotManager.checkThreshold(
        hookData.session_id,
        postSnapshot,
        threshold
      )
      
      if (thresholdCheck.exceeded) {
        // Threshold exceeded - revert changes
        const revertResult = await this.revertManager.revertToSnapshot(
          affectedFiles,
          this.snapshotManager.getLastValidSnapshot() || await this.snapshotManager.getBaseline(hookData.session_id)
        )
        
        if (!revertResult.success) {
          return {
            decision: 'block',
            reason: `LOC threshold exceeded (current: +${thresholdCheck.delta} lines, allowed: +${threshold} lines).\n\nFailed to revert: ${revertResult.error}\n\nPlease manually revert the changes.`,
          }
        }
        
        return {
          decision: 'block',
          reason: this.createThresholdExceededMessage(thresholdCheck, threshold),
        }
      }
      
      // Update last valid snapshot
      this.snapshotManager.updateLastValidSnapshot(postSnapshot)
      
      // Update session stats for backward compatibility
      const baseline = await this.snapshotManager.getBaseline(hookData.session_id)
      const diff = this.snapshotManager.compareSnapshots(baseline, postSnapshot)
      
      await this.guardManager.updateSessionStats(
        postSnapshot.totalLoc - baseline.totalLoc + Math.abs(diff.locDelta),
        baseline.totalLoc - postSnapshot.totalLoc + Math.abs(diff.locDelta)
      )
      
      return {
        decision: 'approve',
        reason: `Operation completed successfully.\n\nLOC change: ${diff.locDelta >= 0 ? '+' : ''}${diff.locDelta} lines\nSession total: ${thresholdCheck.delta >= 0 ? '+' : ''}${thresholdCheck.delta} lines from baseline`,
      }
    } catch (error) {
      console.error('Error in PostToolUse:', error)
      return {
        decision: 'approve',
        reason: 'Post-operation validation failed, but changes were already applied',
      }
    }
  }

  private shouldValidateOperation(hookData: HookData): boolean {
    const validTools = ['Edit', 'MultiEdit', 'Write']
    return validTools.includes(hookData.tool_name)
  }

  private createThresholdExceededMessage(
    thresholdCheck: any,
    threshold: number
  ): string {
    return `Operation reverted: LOC threshold exceeded!

Project LOC status:
  • Baseline: ${thresholdCheck.baseline} lines
  • Current: ${thresholdCheck.current} lines  
  • Change: ${thresholdCheck.delta >= 0 ? '+' : ''}${thresholdCheck.delta} lines
  • Allowed: +${threshold} lines

The changes have been reverted to maintain the LOC limit.

Suggestions:
  • Remove or refactor existing code before adding new features
  • Use MultiEdit to batch additions with removals
  • Consider if all new code is truly necessary
  • Look for opportunities to consolidate duplicate code`
  }
}