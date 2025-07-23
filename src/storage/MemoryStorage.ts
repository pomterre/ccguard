import { Storage } from './Storage'
import { SessionStats, GuardState } from '../contracts'

export class MemoryStorage implements Storage {
  private sessionStats: SessionStats | null = null
  private guardState: GuardState | null = null

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

  async clearAll(): Promise<void> {
    this.sessionStats = null
    this.guardState = null
  }
}