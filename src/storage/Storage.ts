import { SessionStats, GuardState } from '../contracts'

export interface Storage {
  // Session stats
  getSessionStats(): Promise<SessionStats | null>
  saveSessionStats(stats: SessionStats): Promise<void>
  
  // Guard state
  getGuardState(): Promise<GuardState | null>
  saveGuardState(state: GuardState): Promise<void>
  
  // Cleanup
  clearAll(): Promise<void>
}