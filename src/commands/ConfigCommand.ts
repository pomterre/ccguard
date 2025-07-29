import { Command } from './types'
import { ValidationResult } from '../contracts'
import { GuardManager } from '../ccguard/GuardManager'

export const ConfigCommand: Command = {
  name: 'config',
  description: 'Manage CCGuard configuration',
  execute: async (guardManager: GuardManager, args: string[]): Promise<ValidationResult> => {
    if (args.length < 2) {
      return {
        decision: 'block',
        reason: 'Usage: ccguard config <setting> <value>\n' +
               'Available settings:\n' +
               '  strategy <soft|hard>\n' +
               '  allowedPositiveLines <number>\n' +
               '  mode <cumulative|snapshot>\n' +
               '  limitType <perFile|perSession>'
      }
    }
    
    const [setting, ...valueArgs] = args
    const value = valueArgs.join(' ')
    
    switch (setting.toLowerCase()) {
      case 'strategy':
        return await handleStrategyConfig(guardManager, value)
      
      case 'allowedpositivelines':
        return await handleAllowedPositiveLinesConfig(guardManager, value)
      
      case 'mode':
        return await handleModeConfig(guardManager, value)
      
      case 'limittype':
        return await handleLimitTypeConfig(guardManager, value)
      
      default:
        return {
          decision: 'block',
          reason: `Unknown config setting: ${setting}\n` +
                 'Available settings: strategy, allowedPositiveLines, mode, limitType'
        }
    }
  }
}

async function handleStrategyConfig(
  guardManager: GuardManager, 
  value: string
): Promise<ValidationResult> {
  const normalizedValue = value.toLowerCase()
  
  if (normalizedValue !== 'soft' && normalizedValue !== 'hard') {
    return {
      decision: 'block',
      reason: 'Invalid strategy value. Use "soft" or "hard"'
    }
  }
  
  await guardManager.updateHotConfig({
    enforcement: {
      limitType: normalizedValue
    }
  })
  
  return {
    decision: 'block',
    reason: `Configuration updated: strategy set to "${normalizedValue}"`
  }
}

async function handleAllowedPositiveLinesConfig(
  guardManager: GuardManager,
  value: string
): Promise<ValidationResult> {
  const parsedValue = parseInt(value, 10)
  
  if (isNaN(parsedValue) || parsedValue < 0) {
    return {
      decision: 'block',
      reason: 'Invalid allowedPositiveLines value. Must be a non-negative number'
    }
  }
  
  await guardManager.updateHotConfig({
    thresholds: {
      allowedPositiveLines: parsedValue
    }
  })
  
  return {
    decision: 'block',
    reason: `Configuration updated: allowedPositiveLines set to ${parsedValue}`
  }
}

async function handleModeConfig(
  guardManager: GuardManager,
  value: string
): Promise<ValidationResult> {
  const normalizedValue = value.toLowerCase()
  
  if (normalizedValue !== 'cumulative' && normalizedValue !== 'snapshot') {
    return {
      decision: 'block',
      reason: 'Invalid mode value. Use "cumulative" or "snapshot"'
    }
  }
  
  await guardManager.updateHotConfig({
    enforcement: {
      strategy: normalizedValue
    }
  })
  
  return {
    decision: 'block',
    reason: `Configuration updated: mode set to "${normalizedValue}"`
  }
}

async function handleLimitTypeConfig(
  guardManager: GuardManager,
  value: string
): Promise<ValidationResult> {
  const normalizedValue = value.toLowerCase()
  
  if (normalizedValue !== 'perfile' && normalizedValue !== 'persession') {
    return {
      decision: 'block',
      reason: 'Invalid limitType value. Use "perFile" or "perSession"'
    }
  }
  
  const mode = normalizedValue === 'perfile' ? 'per-operation' : 'session-wide'
  
  await guardManager.updateHotConfig({
    enforcement: {
      mode: mode
    }
  })
  
  return {
    decision: 'block',
    reason: `Configuration updated: limitType set to "${normalizedValue}" (mode: ${mode})`
  }
}