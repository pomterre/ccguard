import { Command } from './types'
import { ValidationResult } from '../contracts'
import { GuardManager } from '../ccguard/GuardManager'

export const LockCommand: Command = {
  name: 'lock',
  description: 'Lock a file from modifications',
  execute: async (guardManager: GuardManager, args: string[]): Promise<ValidationResult> => {
    if (args.length === 0) {
      return {
        decision: 'block',
        reason: 'Usage: ccguard lock @<file-path>\n\nExample: ccguard lock @src/index.ts',
      }
    }

    const filePath = args[0]
    
    // Check if file path has @ prefix
    if (!filePath.startsWith('@')) {
      return {
        decision: 'block',
        reason: 'File path must start with @ prefix.\n\nExample: ccguard lock @src/index.ts',
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
      await guardManager.lockFile(cleanPath)
      return {
        decision: 'block',
        reason: `File locked successfully: ${cleanPath}`,
      }
    } catch (error) {
      return {
        decision: 'block',
        reason: error instanceof Error ? error.message : 'Failed to lock file',
      }
    }
  }
}