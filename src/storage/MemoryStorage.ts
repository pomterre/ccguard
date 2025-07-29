import { Storage } from './Storage'
import { SessionStats, GuardState, HotConfig, OperationHistory, LockedFiles } from '../contracts'

export class MemoryStorage implements Storage {
  private sessionStats: SessionStats | null = null
  private guardState: GuardState | null = null
  private hotConfig: HotConfig | null = null
  private operationHistory: OperationHistory | null = null
  private lockedFiles: LockedFiles | null = null
  private data: Map<string, any> = new Map()

  async getSessionStats(): Promise<SessionStats | null> {
    return this.sessionStats
  }

  async saveSessionStats(stats: SessionStats): Promise<void> {
    this.sessionStats = stats
  }

  async getGuardState(): Promise<GuardState | null> {
    return this.guardState
  }

  async saveGuardState(state: GuardState): Promise<void> {
    this.guardState = state
  }

  async getHotConfig(): Promise<HotConfig | null> {
    return this.hotConfig
  }

  async saveHotConfig(config: HotConfig): Promise<void> {
    this.hotConfig = config
  }

  async getOperationHistory(): Promise<OperationHistory | null> {
    return this.operationHistory
  }

  async saveOperationHistory(history: OperationHistory): Promise<void> {
    this.operationHistory = history
  }

  async getLockedFiles(): Promise<LockedFiles | null> {
    return this.lockedFiles
  }

  async saveLockedFiles(lockedFiles: LockedFiles): Promise<void> {
    this.lockedFiles = lockedFiles
  }

  async clearAll(): Promise<void> {
    this.sessionStats = null
    this.guardState = null
    this.hotConfig = null
    this.operationHistory = null
    this.lockedFiles = null
    this.data.clear()
  }

  async get(key: string): Promise<any> {
    return this.data.get(key) || null
  }

  async set(key: string, value: any): Promise<void> {
    this.data.set(key, value)
  }

  async delete(key: string): Promise<void> {
    this.data.delete(key)
  }
}