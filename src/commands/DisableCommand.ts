import { Command } from './types'
import { ValidationResult } from '../contracts'
import { GuardManager } from '../ccguard/GuardManager'

export const DisableCommand: Command = {
  name: 'off',
  description: 'Disable CCGuard LOC enforcement',
  execute: async (guardManager: GuardManager): Promise<ValidationResult> => {
    await guardManager.disable()
    return {
      decision: 'block',
      reason: 'CCGuard is now DISABLED. LOC changes will not be enforced.',
    }
  }
}