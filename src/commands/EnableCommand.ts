import { Command } from './types'
import { ValidationResult } from '../contracts'
import { GuardManager } from '../ccguard/GuardManager'

export const EnableCommand: Command = {
  name: 'on',
  description: 'Enable CCGuard net negative LOC enforcement',
  execute: async (guardManager: GuardManager): Promise<ValidationResult> => {
    await guardManager.enable()
    return {
      decision: 'block',
      reason: 'CCGuard is now ENABLED. Net negative LOC enforcement is active.',
    }
  }
}