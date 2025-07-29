import { Command } from './types'
import { ValidationResult } from '../contracts'
import { GuardManager } from '../ccguard/GuardManager'

export const StatusCommand: Command = {
  name: 'status',
  description: 'Show CCGuard status, configuration, and recent operations',
  execute: async (guardManager: GuardManager): Promise<ValidationResult> => {
    const isEnabled = await guardManager.isEnabled()
    const stats = await guardManager.getSessionStats()
    const config = await guardManager.getConfig()
    const hotConfig = await guardManager.getHotConfig()
    const history = await guardManager.getRecentOperations(10)
    
    let message = isEnabled 
      ? 'CCGuard is ENABLED\n\n' 
      : 'CCGuard is DISABLED\n\n'
    
    // Configuration section
    message += 'Current Configuration:\n'
    message += `   Strategy: ${config.enforcement.limitType || 'hard'}\n`
    message += `   Mode: ${config.enforcement.strategy}\n`
    message += `   Limit Type: ${config.enforcement.mode === 'per-operation' ? 'perFile' : 'perSession'}\n`
    message += `   Allowed Positive Lines: ${config.thresholds?.allowedPositiveLines || 0}\n`
    message += `   Ignore Empty Lines: ${config.enforcement.ignoreEmptyLines}\n`
    
    // Show if hot config is active
    if (hotConfig) {
      message += '   * Hot configuration active (runtime overrides)\n'
    }
    message += '\n'
    
    // Statistics section
    if (stats) {
      message += 'Session Statistics:\n'
      message += `   Lines added: ${stats.totalLinesAdded}\n`
      message += `   Lines removed: ${stats.totalLinesRemoved}\n`
      message += `   Net change: ${stats.netChange > 0 ? '+' : ''}${stats.netChange}\n`
      message += `   Operations: ${stats.operationCount}\n\n`
    } else {
      message += 'No operations tracked yet in this session.\n\n'
    }
    
    // History section
    if (history.length > 0) {
      message += 'Recent Operations:\n'
      history.forEach((op, i) => {
        const time = new Date(op.timestamp).toLocaleTimeString()
        const sign = op.netChange > 0 ? '+' : ''
        const status = op.decision === 'approve' ? '✓' : '✗'
        const fileName = op.filePath.split('/').pop() || op.filePath
        message += `   ${i + 1}. [${time}] ${status} ${op.toolName} ${fileName} (${sign}${op.netChange})\n`
        if (op.reason && op.decision === 'block') {
          message += `      → ${op.reason.split('\n')[0]}\n`
        }
      })
    }
    
    return {
      decision: 'block',
      reason: message.trimEnd(),
    }
  }
}