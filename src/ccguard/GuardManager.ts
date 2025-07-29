import { Storage } from '../storage/Storage'
import { GuardState, SessionStats, HotConfig, OperationRecord, GuardConfig } from '../contracts'
import { ConfigLoader } from '../config/ConfigLoader'
import { HotConfigLoader } from '../config/HotConfigLoader'
import { SnapshotManager } from '../snapshot/SnapshotManager'
import { HistoryManager } from '../history/HistoryManager'
import * as path from 'path'

export class GuardManager {
  private snapshotManager?: SnapshotManager
  private hotConfigLoader?: HotConfigLoader
  private historyManager: HistoryManager
  
  constructor(
    private storage: Storage,
    private configLoader?: ConfigLoader,
    private rootDir: string = process.cwd()
  ) {
    this.historyManager = new HistoryManager(storage)
    if (configLoader) {
      this.hotConfigLoader = new HotConfigLoader(configLoader, storage)
    }
  }

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

  /**
   * Get the current configuration (including hot config overrides)
   */
  async getConfig(): Promise<GuardConfig> {
    if (this.hotConfigLoader) {
      return await this.hotConfigLoader.getConfig()
    }
    return this.configLoader?.getConfig() ?? {
      enforcement: {
        mode: 'session-wide',
        strategy: 'cumulative',
        ignoreEmptyLines: true,
        limitType: 'hard'
      },
      whitelist: {
        patterns: [],
        extensions: []
      },
      thresholds: {
        allowedPositiveLines: 0
      }
    }
  }

  /**
   * Update hot configuration
   */
  async updateHotConfig(updates: Partial<HotConfig>): Promise<void> {
    if (!this.hotConfigLoader) {
      throw new Error('Hot config loader not initialized')
    }
    await this.hotConfigLoader.updateConfig(updates)
  }

  /**
   * Get hot configuration
   */
  async getHotConfig(): Promise<HotConfig | null> {
    return await this.storage.getHotConfig()
  }

  /**
   * Add operation to history
   */
  async addOperationToHistory(record: Omit<OperationRecord, 'timestamp'>): Promise<void> {
    await this.historyManager.addOperation(record)
  }

  /**
   * Get recent operations from history
   */
  async getRecentOperations(limit?: number): Promise<OperationRecord[]> {
    return await this.historyManager.getRecentOperations(limit)
  }

  /**
   * Clear operation history
   */
  async clearHistory(): Promise<void> {
    await this.historyManager.clearHistory()
  }

  /**
   * Lock a file from modifications
   */
  async lockFile(filePath: string): Promise<void> {
    // Normalize the file path to absolute
    const absolutePath = path.isAbsolute(filePath) ? filePath : path.resolve(process.cwd(), filePath)
    
    const lockedFiles = await this.storage.getLockedFiles()
    const files = lockedFiles?.files ?? []
    
    // Check if already locked
    if (files.includes(absolutePath)) {
      throw new Error(`File is already locked: ${absolutePath}`)
    }
    
    // Add to locked files
    files.push(absolutePath)
    
    await this.storage.saveLockedFiles({
      files,
      lastUpdated: new Date().toISOString(),
    })
  }

  /**
   * Unlock a file
   */
  async unlockFile(filePath: string): Promise<void> {
    // Normalize the file path to absolute
    const absolutePath = path.isAbsolute(filePath) ? filePath : path.resolve(process.cwd(), filePath)
    
    const lockedFiles = await this.storage.getLockedFiles()
    const files = lockedFiles?.files ?? []
    
    // Check if file is locked
    const index = files.indexOf(absolutePath)
    if (index === -1) {
      throw new Error(`File is not locked: ${absolutePath}`)
    }
    
    // Remove from locked files
    files.splice(index, 1)
    
    await this.storage.saveLockedFiles({
      files,
      lastUpdated: new Date().toISOString(),
    })
  }

  /**
   * Check if a file is locked
   */
  async isFileLocked(filePath: string): Promise<boolean> {
    // Normalize the file path to absolute
    const absolutePath = path.isAbsolute(filePath) ? filePath : path.resolve(process.cwd(), filePath)
    
    const lockedFiles = await this.storage.getLockedFiles()
    const files = lockedFiles?.files ?? []
    
    return files.includes(absolutePath)
  }

  /**
   * Get all locked files
   */
  async getLockedFiles(): Promise<string[]> {
    const lockedFiles = await this.storage.getLockedFiles()
    return lockedFiles?.files ?? []
  }
}