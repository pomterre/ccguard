import { Command } from './types'
import { ValidationResult } from '../contracts'
import { GuardManager } from '../ccguard/GuardManager'

export const UnlockCommand: Command = {
  name: 'unlock',
  description: 'Unlock a file to allow modifications',
  execute: async (guardManager: GuardManager, args: string[]): Promise<ValidationResult> => {
    if (args.length === 0) {
      return {
        decision: 'block',
        reason: 'Usage: ccguard unlock @<file-path>\n\nExample: ccguard unlock @src/index.ts',
      }
    }

    const filePath = args[0]
    
    // Check if file path has @ prefix
    if (!filePath.startsWith('@')) {
      return {
        decision: 'block',
        reason: 'File path must start with @ prefix.\n\nExample: ccguard unlock @src/index.ts',
      }
    }

    // Remove @ prefix
    const cleanPath = filePath.substring(1)
    
    if (!cleanPath) {
      return {
        decision: 'block',
        reason: 'Invalid file path. Please provide a valid path after @.',
      }
    }

    try {
      await guardManager.unlockFile(cleanPath)
      return {
        decision: 'block',
        reason: `File unlocked successfully: ${cleanPath}`,
      }
    } catch (error) {
      return {
        decision: 'block',
        reason: error instanceof Error ? error.message : 'Failed to unlock file',
      }
    }
  }
}