import { Storage } from '../storage/Storage'
import { GuardState, SessionStats } from '../contracts'
import { ConfigLoader } from '../config/ConfigLoader'
import { SnapshotManager } from '../snapshot/SnapshotManager'

export class GuardManager {
  private snapshotManager?: SnapshotManager
  
  constructor(
    private storage: Storage,
    private configLoader?: ConfigLoader,
    private rootDir: string = process.cwd()
  ) {}

  async isEnabled(): Promise<boolean> {
    const state = await this.storage.getGuardState()
    return state?.enabled ?? false // Default to disabled
  }

  async enable(): Promise<void> {
    const state: GuardState = {
      enabled: true,
      lastUpdated: new Date().toISOString(),
    }
    await this.storage.saveGuardState(state)
  }

  async disable(): Promise<void> {
    const state: GuardState = {
      enabled: false,
      lastUpdated: new Date().toISOString(),
    }
    await this.storage.saveGuardState(state)
  }

  async getSessionStats(): Promise<SessionStats | null> {
    return await this.storage.getSessionStats()
  }

  async updateSessionStats(
    linesAdded: number,
    linesRemoved: number
  ): Promise<SessionStats> {
    const current = await this.storage.getSessionStats()
    
    const updated: SessionStats = {
      totalLinesAdded: (current?.totalLinesAdded ?? 0) + linesAdded,
      totalLinesRemoved: (current?.totalLinesRemoved ?? 0) + linesRemoved,
      netChange: 0, // Will calculate below
      operationCount: (current?.operationCount ?? 0) + 1,
      lastUpdated: new Date().toISOString(),
    }
    
    updated.netChange = updated.totalLinesAdded - updated.totalLinesRemoved
    
    await this.storage.saveSessionStats(updated)
    return updated
  }

  async resetStats(): Promise<void> {
    const stats: SessionStats = {
      totalLinesAdded: 0,
      totalLinesRemoved: 0,
      netChange: 0,
      operationCount: 0,
      lastUpdated: new Date().toISOString(),
    }
    await this.storage.saveSessionStats(stats)
  }

  async takeSnapshot(sessionId?: string): Promise<{
    totalLoc: number
    fileCount: number
    timestamp: string
  }> {
    // Initialize snapshot manager if not already done
    if (!this.snapshotManager) {
      const config = this.configLoader?.getConfig() ?? { enforcement: { ignoreEmptyLines: true } }
      this.snapshotManager = new SnapshotManager(
        this.rootDir,
        this.storage,
        config.enforcement.ignoreEmptyLines
      )
    }

    // Use a default session ID if not provided
    const effectiveSessionId = sessionId ?? 'default'
    
    // Take a new baseline snapshot
    const snapshot = await this.snapshotManager.initializeBaseline(effectiveSessionId)
    
    return {
      totalLoc: snapshot.totalLoc,
      fileCount: snapshot.files.size,
      timestamp: snapshot.timestamp,
    }
  }

  /**
   * Check if the system is configured for snapshot mode
   */
  isSnapshotMode(): boolean {
    const config = this.configLoader?.getConfig()
    return config?.enforcement.strategy === 'snapshot'
  }

  /**
   * Get the snapshot manager instance
   */
  getSnapshotManager(): SnapshotManager | undefined {
    if (!this.snapshotManager) {
      const config = this.configLoader?.getConfig() ?? { enforcement: { ignoreEmptyLines: true } }
      this.snapshotManager = new SnapshotManager(
        this.rootDir,
        this.storage,
        config.enforcement.ignoreEmptyLines
      )
    }
    return this.snapshotManager
  }
}