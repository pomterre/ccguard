import { Command } from './types'
import { ValidationResult } from '../contracts'
import { GuardManager } from '../ccguard/GuardManager'

export const LocksCommand: Command = {
  name: 'locks',
  description: 'List all locked files',
  execute: async (guardManager: GuardManager): Promise<ValidationResult> => {
    try {
      const lockedFiles = await guardManager.getLockedFiles()
      
      if (lockedFiles.length === 0) {
        return {
          decision: 'block',
          reason: 'No files are currently locked.',
        }
      }

      let message = 'Locked Files:\n'
      lockedFiles.forEach((file, index) => {
        message += `   ${index + 1}. ${file}\n`
      })
      
      message += `\nTotal: ${lockedFiles.length} file${lockedFiles.length > 1 ? 's' : ''} locked`

      return {
        decision: 'block',
        reason: message,
      }
    } catch (error) {
      return {
        decision: 'block',
        reason: error instanceof Error ? error.message : 'Failed to retrieve locked files',
      }
    }
  }
}