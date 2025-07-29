import { Storage } from '../storage/Storage'
import { OperationRecord, OperationHistory } from '../contracts/types'

export class HistoryManager {
  private static readonly DEFAULT_MAX_RECORDS = 50
  
  constructor(
    private storage: Storage,
    private maxRecords: number = HistoryManager.DEFAULT_MAX_RECORDS
  ) {}
  
  async addOperation(record: Omit<OperationRecord, 'timestamp'>): Promise<void> {
    const history = await this.storage.getOperationHistory() || {
      records: [],
      maxRecords: this.maxRecords,
      lastUpdated: new Date().toISOString()
    }
    
    const newRecord: OperationRecord = {
      ...record,
      timestamp: new Date().toISOString()
    }
    
    // Add new record and trim to max size
    history.records.unshift(newRecord)
    if (history.records.length > history.maxRecords) {
      history.records = history.records.slice(0, history.maxRecords)
    }
    
    history.lastUpdated = new Date().toISOString()
    await this.storage.saveOperationHistory(history)
  }
  
  async getRecentOperations(limit?: number): Promise<OperationRecord[]> {
    const history = await this.storage.getOperationHistory()
    if (!history) return []
    
    return limit ? history.records.slice(0, limit) : history.records
  }
  
  async clearHistory(): Promise<void> {
    const history: OperationHistory = {
      records: [],
      maxRecords: this.maxRecords,
      lastUpdated: new Date().toISOString()
    }
    await this.storage.saveOperationHistory(history)
  }
}