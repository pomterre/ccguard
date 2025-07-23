import { Storage } from '../storage/Storage'
import { GuardState, SessionStats } from '../contracts'
import { ConfigLoader } from '../config/ConfigLoader'

export class GuardManager {
  constructor(
    private storage: Storage,
    private configLoader?: ConfigLoader
  ) {}

  async isEnabled(): Promise<boolean> {
    const state = await this.storage.getGuardState()
    return state?.enabled ?? true // Default to enabled
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
}