import { Command } from './types'
import { ValidationResult } from '../contracts'
import { GuardManager } from '../ccguard/GuardManager'

export const ResetCommand: Command = {
  name: 'reset',
  description: 'Reset session statistics',
  execute: async (guardManager: GuardManager): Promise<ValidationResult> => {
    await guardManager.resetStats()
    return {
      decision: 'block',
      reason: 'Session statistics have been reset.',
    }
  }
}