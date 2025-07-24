import { Command } from './types'
import { ValidationResult } from '../contracts'
import { GuardManager } from '../ccguard/GuardManager'

export const StatusCommand: Command = {
  name: 'status',
  description: 'Show CCGuard status and session statistics',
  execute: async (guardManager: GuardManager): Promise<ValidationResult> => {
    const isEnabled = await guardManager.isEnabled()
    const stats = await guardManager.getSessionStats()
    
    let message = isEnabled 
      ? 'CCGuard is ENABLED\n\n' 
      : 'CCGuard is DISABLED\n\n'
    
    if (stats) {
      message += `Session Statistics:\n`
      message += `   Lines added: ${stats.totalLinesAdded}\n`
      message += `   Lines removed: ${stats.totalLinesRemoved}\n`
      message += `   Net change: ${stats.netChange > 0 ? '+' : ''}${stats.netChange}\n`
      message += `   Operations: ${stats.operationCount}`
    } else {
      message += 'No operations tracked yet in this session.'
    }
    
    return {
      decision: 'block',
      reason: message,
    }
  }
}