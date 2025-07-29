import { SessionStats, GuardState, HotConfig, OperationHistory } from '../contracts'

export interface Storage {
  // Session stats
  getSessionStats(): Promise<SessionStats | null>
  saveSessionStats(stats: SessionStats): Promise<void>
  
  // Guard state
  getGuardState(): Promise<GuardState | null>
  saveGuardState(state: GuardState): Promise<void>
  
  // Hot configuration
  getHotConfig(): Promise<HotConfig | null>
  saveHotConfig(config: HotConfig): Promise<void>
  
  // Operation history
  getOperationHistory(): Promise<OperationHistory | null>
  saveOperationHistory(history: OperationHistory): Promise<void>
  
  // Generic storage
  get(key: string): Promise<any>
  set(key: string, value: any): Promise<void>
  delete(key: string): Promise<void>
  
  // Cleanup
  clearAll(): Promise<void>
}