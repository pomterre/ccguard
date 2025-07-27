import { v4 as uuidv4 } from 'uuid'
import { ProjectSnapshot, FileSnapshot, SnapshotDiff } from './types'
import { FileScanner } from './FileScanner'
import { Storage } from '../storage/Storage'
import { appendFileSync, mkdirSync } from 'fs'
import { join } from 'path'
import { homedir } from 'os'

// Debug logging - only enabled when CCGUARD_DEBUG environment variable is set
const DEBUG = process.env.CCGUARD_DEBUG === 'true' || process.env.CCGUARD_DEBUG === '1'
const debugLog = (message: any) => {
  if (!DEBUG) return
  
  const ccguardDir = join(homedir(), '.ccguard')
  const logPath = join(ccguardDir, 'debug.log')
  
  // Ensure directory exists
  mkdirSync(ccguardDir, { recursive: true })
  
  appendFileSync(logPath, `${new Date().toISOString()} - ${JSON.stringify(message)}\n`)
}

export class SnapshotManager {
  private fileScanner: FileScanner
  private storage: Storage
  private baselineSnapshot: ProjectSnapshot | null = null
  private lastValidSnapshot: ProjectSnapshot | null = null

  // Storage key constants to avoid magic strings
  private static readonly STORAGE_KEYS = {
    baseline: (sessionId: string) => `snapshot:baseline:${sessionId}`,
    baselineThreshold: (sessionId: string) => `snapshot:baseline:threshold:${sessionId}`,
    current: (sessionId: string) => `snapshot:current:${sessionId}`,
  }

  constructor(
    rootDir: string,
    storage: Storage,
    ignoreEmptyLines: boolean = true
  ) {
    this.fileScanner = new FileScanner(rootDir, ignoreEmptyLines)
    this.storage = storage
  }

  /**
   * Initialize or update baseline snapshot for the session
   * In snapshot mode, this sets the LOC threshold
   */
  async initializeBaseline(sessionId: string): Promise<ProjectSnapshot> {
    debugLog({
      event: 'initialize_baseline_start',
      sessionId: sessionId,
    })
    
    const files = await this.fileScanner.scanProject()
    const currentLoc = this.calculateTotalLoc(files)
    
    debugLog({
      event: 'project_scanned_for_baseline',
      sessionId: sessionId,
      fileCount: files.size,
      filePaths: Array.from(files.keys()),
      currentLoc: currentLoc,
    })
    
    const snapshot: ProjectSnapshot = {
      id: uuidv4(),
      sessionId,
      timestamp: new Date().toISOString(),
      files,
      totalLoc: currentLoc,
      isBaseline: true,
    }

    debugLog({
      event: 'baseline_created',
      sessionId: sessionId,
      snapshotId: snapshot.id,
      totalLoc: snapshot.totalLoc,
      timestamp: snapshot.timestamp,
      isBaseline: snapshot.isBaseline,
    })

    this.baselineSnapshot = snapshot
    this.lastValidSnapshot = snapshot
    
    // Store baseline in storage (convert Map to serializable format)
    await this.storage.set(SnapshotManager.STORAGE_KEYS.baseline(sessionId), this.toSerializable(snapshot))
    
    // Store snapshot baseline threshold for snapshot mode
    await this.storage.set(SnapshotManager.STORAGE_KEYS.baselineThreshold(sessionId), {
      totalLoc: currentLoc,
      timestamp: snapshot.timestamp,
      snapshotId: snapshot.id,
    })
    
    // Also persist current state
    await this.storage.set(SnapshotManager.STORAGE_KEYS.current(sessionId), {
      totalLoc: currentLoc,
      timestamp: snapshot.timestamp,
      snapshotId: snapshot.id,
    })
    
    debugLog({
      event: 'baseline_stored',
      sessionId: sessionId,
      storageKey: SnapshotManager.STORAGE_KEYS.baseline(sessionId),
      thresholdStored: true,
    })
    
    return snapshot
  }

  /**
   * Get or create baseline snapshot
   */
  async getBaseline(sessionId: string): Promise<ProjectSnapshot> {
    debugLog({
      event: 'get_baseline_start',
      sessionId: sessionId,
      hasInMemoryBaseline: !!this.baselineSnapshot,
      inMemorySessionId: this.baselineSnapshot?.sessionId,
    })
    
    if (this.baselineSnapshot && this.baselineSnapshot.sessionId === sessionId) {
      debugLog({
        event: 'baseline_from_memory',
        sessionId: sessionId,
        snapshotId: this.baselineSnapshot.id,
      })
      return this.baselineSnapshot
    }

    // Try to load from storage
    const storageKey = SnapshotManager.STORAGE_KEYS.baseline(sessionId)
    const stored = await this.storage.get(storageKey)
    
    debugLog({
      event: 'baseline_storage_check',
      sessionId: sessionId,
      storageKey: storageKey,
      found: !!stored,
    })
    
    if (stored) {
      // Convert from serialized format back to ProjectSnapshot
      this.baselineSnapshot = this.fromSerializable(stored)
      debugLog({
        event: 'baseline_loaded_from_storage',
        sessionId: sessionId,
        snapshotId: this.baselineSnapshot.id,
        totalLoc: this.baselineSnapshot.totalLoc,
      })
      return this.baselineSnapshot
    }

    debugLog({
      event: 'baseline_not_found_creating_new',
      sessionId: sessionId,
    })
    
    // Create new baseline
    return this.initializeBaseline(sessionId)
  }

  /**
   * Take a lightweight snapshot of specific files before an operation
   */
  async takeOperationSnapshot(
    sessionId: string,
    affectedFiles: string[]
  ): Promise<ProjectSnapshot> {
    // Always scan the current project state to get accurate pre-operation snapshot
    // This ensures we capture the actual current state, not a stale baseline
    const files = await this.fileScanner.scanProject()
    const currentLoc = this.calculateTotalLoc(files)
    
    // Verify against persisted state if available
    const persistedLoc = await this.getCurrentValidLoc(sessionId)
    if (persistedLoc !== null && persistedLoc !== currentLoc) {
      debugLog({
        event: 'loc_mismatch_detected',
        sessionId: sessionId,
        persistedLoc: persistedLoc,
        actualLoc: currentLoc,
        difference: currentLoc - persistedLoc,
        warning: 'Correcting persisted state to match actual LOC',
      })
      
      // Correct the persisted state to match reality
      await this.storage.set(SnapshotManager.STORAGE_KEYS.current(sessionId), {
        totalLoc: currentLoc,
        timestamp: new Date().toISOString(),
        snapshotId: 'corrected-' + uuidv4(),
        correctedAt: new Date().toISOString(),
        reason: 'loc_mismatch_correction'
      })
    }
    
    const snapshot: ProjectSnapshot = {
      id: uuidv4(),
      sessionId,
      timestamp: new Date().toISOString(),
      files,
      totalLoc: currentLoc,
      isBaseline: false,
    }
    
    debugLog({
      event: 'operation_snapshot_taken',
      sessionId: sessionId,
      snapshotId: snapshot.id,
      totalLoc: snapshot.totalLoc,
      fileCount: files.size,
      affectedFiles: affectedFiles,
      method: 'full_scan',
      persistedLoc: persistedLoc,
      corrected: persistedLoc !== null && persistedLoc !== currentLoc,
    })
    
    return snapshot
  }

  /**
   * Take a snapshot after an operation completes
   */
  async takePostOperationSnapshot(
    sessionId: string,
    affectedFiles: string[]
  ): Promise<ProjectSnapshot> {
    // If no specific files provided, scan the entire project
    if (affectedFiles.length === 0) {
      const files = await this.fileScanner.scanProject()
      const snapshot: ProjectSnapshot = {
        id: uuidv4(),
        sessionId,
        timestamp: new Date().toISOString(),
        files,
        totalLoc: this.calculateTotalLoc(files),
        isBaseline: false,
      }
      return snapshot
    }

    // Scan affected files plus any new files
    const allFiles = [...new Set([
      ...affectedFiles,
      ...(await this.detectNewFiles(sessionId)),
    ])]

    const updatedFiles = await this.fileScanner.scanFiles(allFiles)
    
    // Start with last valid snapshot
    const base = this.lastValidSnapshot || await this.getBaseline(sessionId)
    const files = new Map(base.files)
    
    // Update with scanned files
    for (const [path, snapshot] of updatedFiles) {
      files.set(path, snapshot)
    }
    
    // Remove deleted files
    for (const path of affectedFiles) {
      if (!updatedFiles.has(path)) {
        files.delete(path)
      }
    }

    const snapshot: ProjectSnapshot = {
      id: uuidv4(),
      sessionId,
      timestamp: new Date().toISOString(),
      files,
      totalLoc: this.calculateTotalLoc(files),
      isBaseline: false,
    }

    return snapshot
  }

  /**
   * Update the last valid snapshot (after successful validation)
   */
  async updateLastValidSnapshot(snapshot: ProjectSnapshot): Promise<void> {
    debugLog({
      event: 'update_last_valid_snapshot',
      oldSnapshotId: this.lastValidSnapshot?.id,
      newSnapshotId: snapshot.id,
      sessionId: snapshot.sessionId,
      totalLoc: snapshot.totalLoc,
    })
    
    this.lastValidSnapshot = snapshot
    
    // Persist the current valid state with version tracking
    const stateData = {
      totalLoc: snapshot.totalLoc,
      timestamp: snapshot.timestamp,
      snapshotId: snapshot.id,
      version: Date.now(), // Add version for tracking updates
    }
    
    await this.storage.set(SnapshotManager.STORAGE_KEYS.current(snapshot.sessionId), stateData)
    
    // Also store a backup of the last valid snapshot for recovery
    await this.storage.set(`snapshot:lastvalid:${snapshot.sessionId}`, {
      snapshot: this.toSerializable(snapshot),
      updatedAt: new Date().toISOString(),
    })
    
    debugLog({
      event: 'current_state_persisted',
      sessionId: snapshot.sessionId,
      totalLoc: snapshot.totalLoc,
      storageKey: SnapshotManager.STORAGE_KEYS.current(snapshot.sessionId),
      version: stateData.version,
    })
  }

  /**
   * Compare two snapshots and calculate the difference
   */
  compareSnapshots(before: ProjectSnapshot, after: ProjectSnapshot): SnapshotDiff {
    debugLog({
      event: 'compare_snapshots_start',
      beforeSnapshotId: before.id,
      afterSnapshotId: after.id,
      beforeTotalLoc: before.totalLoc,
      afterTotalLoc: after.totalLoc,
      beforeFileCount: before.files.size,
      afterFileCount: after.files.size,
    })
    
    const added: string[] = []
    const removed: string[] = []
    const modified: string[] = []
    const details = new Map<string, { before: number; after: number; delta: number }>()

    // Check for removed and modified files
    for (const [path, beforeFile] of before.files) {
      const afterFile = after.files.get(path)
      
      if (!afterFile) {
        removed.push(path)
        details.set(path, {
          before: beforeFile.locCount,
          after: 0,
          delta: -beforeFile.locCount,
        })
      } else if (afterFile.hash !== beforeFile.hash) {
        modified.push(path)
        details.set(path, {
          before: beforeFile.locCount,
          after: afterFile.locCount,
          delta: afterFile.locCount - beforeFile.locCount,
        })
      }
    }

    // Check for added files
    for (const [path, afterFile] of after.files) {
      if (!before.files.has(path)) {
        added.push(path)
        details.set(path, {
          before: 0,
          after: afterFile.locCount,
          delta: afterFile.locCount,
        })
      }
    }

    const locDelta = after.totalLoc - before.totalLoc

    debugLog({
      event: 'compare_snapshots_complete',
      locDelta: locDelta,
      filesAdded: added.length,
      filesRemoved: removed.length,
      filesModified: modified.length,
      addedFiles: added,
      removedFiles: removed,
      modifiedFiles: modified,
      fileDetailsCount: details.size,
    })

    return {
      added,
      removed,
      modified,
      locDelta,
      details,
    }
  }

  /**
   * Check if current state exceeds threshold from baseline
   * In snapshot mode, the baseline LOC IS the threshold
   */
  async checkThreshold(
    sessionId: string,
    currentSnapshot: ProjectSnapshot,
    allowedPositiveLines: number
  ): Promise<{ exceeded: boolean; current: number; baseline: number; delta: number }> {
    const baseline = await this.getBaseline(sessionId)
    const delta = currentSnapshot.totalLoc - baseline.totalLoc
    
    return {
      exceeded: delta > allowedPositiveLines,
      current: currentSnapshot.totalLoc,
      baseline: baseline.totalLoc,
      delta,
    }
  }

  /**
   * Check if current LOC exceeds snapshot baseline threshold
   * Used in snapshot mode where baseline LOC is the threshold
   */
  async checkSnapshotThreshold(
    sessionId: string,
    currentLoc: number
  ): Promise<{ exceeded: boolean; current: number; baseline: number; delta: number }> {
    // Get the baseline threshold for snapshot mode
    const thresholdData = await this.storage.get(SnapshotManager.STORAGE_KEYS.baselineThreshold(sessionId))
    
    if (!thresholdData || typeof thresholdData !== 'object' || !('totalLoc' in thresholdData)) {
      // No baseline threshold set, initialize it
      const baseline = await this.initializeBaseline(sessionId)
      return {
        exceeded: false,
        current: currentLoc,
        baseline: baseline.totalLoc,
        delta: 0,
      }
    }
    
    const baselineLoc = thresholdData.totalLoc as number
    const delta = currentLoc - baselineLoc
    
    debugLog({
      event: 'snapshot_threshold_check',
      sessionId: sessionId,
      currentLoc: currentLoc,
      baselineLoc: baselineLoc,
      delta: delta,
      exceeded: currentLoc > baselineLoc,
    })
    
    return {
      exceeded: currentLoc > baselineLoc,
      current: currentLoc,
      baseline: baselineLoc,
      delta,
    }
  }

  /**
   * Get the current snapshot baseline threshold
   */
  async getSnapshotBaseline(sessionId: string): Promise<number | null> {
    const thresholdData = await this.storage.get(SnapshotManager.STORAGE_KEYS.baselineThreshold(sessionId))
    
    if (thresholdData && typeof thresholdData === 'object' && 'totalLoc' in thresholdData) {
      return thresholdData.totalLoc as number
    }
    
    return null
  }

  /**
   * Get last valid snapshot
   */
  getLastValidSnapshot(): ProjectSnapshot | null {
    return this.lastValidSnapshot
  }

  /**
   * Get or restore the current valid state for a session
   */
  async getCurrentValidLoc(sessionId: string): Promise<number | null> {
    const currentState = await this.storage.get(SnapshotManager.STORAGE_KEYS.current(sessionId))
    
    if (currentState && typeof currentState === 'object' && 'totalLoc' in currentState) {
      debugLog({
        event: 'current_state_restored',
        sessionId: sessionId,
        totalLoc: currentState.totalLoc,
        timestamp: currentState.timestamp,
      })
      return currentState.totalLoc
    }
    
    return null
  }

  /**
   * Convert a ProjectSnapshot to a JSON-serializable format
   */
  private toSerializable(snapshot: ProjectSnapshot): any {
    return {
      ...snapshot,
      files: Object.fromEntries(snapshot.files),
    }
  }

  /**
   * Convert a serialized snapshot back to ProjectSnapshot format
   */
  private fromSerializable(data: any): ProjectSnapshot {
    return {
      ...data,
      files: new Map(Object.entries(data.files)),
    }
  }

  /**
   * Calculate total LOC from file snapshots
   */
  private calculateTotalLoc(files: Map<string, FileSnapshot>): number {
    let total = 0
    const fileLocs: { [path: string]: number } = {}
    
    for (const [path, file] of files.entries()) {
      total += file.locCount
      fileLocs[path] = file.locCount
    }
    
    debugLog({
      event: 'calculate_total_loc',
      totalLoc: total,
      fileCount: files.size,
      topFiles: Object.entries(fileLocs)
        .sort(([, a], [, b]) => b - a)
        .slice(0, 5)
        .map(([path, loc]) => ({ path, loc })),
    })
    
    return total
  }

  /**
   * Detect new files created since last snapshot
   */
  private async detectNewFiles(sessionId: string): Promise<string[]> {
    const base = this.lastValidSnapshot || await this.getBaseline(sessionId)
    const currentFiles = await this.fileScanner.scanProject()
    
    const newFiles: string[] = []
    for (const path of currentFiles.keys()) {
      if (!base.files.has(path)) {
        newFiles.push(path)
      }
    }
    
    return newFiles
  }
}