import { v4 as uuidv4 } from 'uuid'
import { ProjectSnapshot, FileSnapshot, SnapshotDiff } from './types'
import { FileScanner } from './FileScanner'
import { Storage } from '../storage/Storage'

export class SnapshotManager {
  private fileScanner: FileScanner
  private storage: Storage
  private baselineSnapshot: ProjectSnapshot | null = null
  private lastValidSnapshot: ProjectSnapshot | null = null

  constructor(
    rootDir: string,
    storage: Storage,
    ignoreEmptyLines: boolean = true
  ) {
    this.fileScanner = new FileScanner(rootDir, ignoreEmptyLines)
    this.storage = storage
  }

  /**
   * Initialize baseline snapshot for the session
   */
  async initializeBaseline(sessionId: string): Promise<ProjectSnapshot> {
    const files = await this.fileScanner.scanProject()
    
    const snapshot: ProjectSnapshot = {
      id: uuidv4(),
      sessionId,
      timestamp: new Date().toISOString(),
      files,
      totalLoc: this.calculateTotalLoc(files),
      isBaseline: true,
    }

    this.baselineSnapshot = snapshot
    this.lastValidSnapshot = snapshot
    
    // Store baseline in storage
    await this.storage.set(`snapshot:baseline:${sessionId}`, snapshot)
    
    return snapshot
  }

  /**
   * Get or create baseline snapshot
   */
  async getBaseline(sessionId: string): Promise<ProjectSnapshot> {
    if (this.baselineSnapshot && this.baselineSnapshot.sessionId === sessionId) {
      return this.baselineSnapshot
    }

    // Try to load from storage
    const stored = await this.storage.get(`snapshot:baseline:${sessionId}`)
    if (stored) {
      this.baselineSnapshot = stored as ProjectSnapshot
      // Reconstruct Map from stored object
      this.baselineSnapshot.files = new Map(Object.entries(this.baselineSnapshot.files as any))
      return this.baselineSnapshot
    }

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
    // Start with the last valid snapshot as base
    const base = this.lastValidSnapshot || await this.getBaseline(sessionId)
    
    // Scan only the affected files
    const updatedFiles = await this.fileScanner.scanFiles(affectedFiles)
    
    // Create new snapshot by merging
    const files = new Map(base.files)
    for (const [path, snapshot] of updatedFiles) {
      files.set(path, snapshot)
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
   * Take a snapshot after an operation completes
   */
  async takePostOperationSnapshot(
    sessionId: string,
    affectedFiles: string[]
  ): Promise<ProjectSnapshot> {
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
  updateLastValidSnapshot(snapshot: ProjectSnapshot): void {
    this.lastValidSnapshot = snapshot
  }

  /**
   * Compare two snapshots and calculate the difference
   */
  compareSnapshots(before: ProjectSnapshot, after: ProjectSnapshot): SnapshotDiff {
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
   * Get last valid snapshot
   */
  getLastValidSnapshot(): ProjectSnapshot | null {
    return this.lastValidSnapshot
  }

  /**
   * Calculate total LOC from file snapshots
   */
  private calculateTotalLoc(files: Map<string, FileSnapshot>): number {
    let total = 0
    for (const file of files.values()) {
      total += file.locCount
    }
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