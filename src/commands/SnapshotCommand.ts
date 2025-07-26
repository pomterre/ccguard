import { Command } from './types'
import { ValidationResult } from '../contracts'
import { GuardManager } from '../ccguard/GuardManager'

export const SnapshotCommand: Command = {
  name: 'snapshot',
  description: 'Take a snapshot of the current project LOC baseline',
  execute: async (guardManager: GuardManager): Promise<ValidationResult> => {
    try {
      const result = await guardManager.takeSnapshot()
      
      return {
        decision: 'block',
        reason: `Snapshot taken successfully!

Project baseline updated:
  • Total lines of code: ${result.totalLoc}
  • Files tracked: ${result.fileCount}
  • Timestamp: ${new Date(result.timestamp).toLocaleString()}

This is now your new baseline for LOC enforcement.`,
      }
    } catch (error) {
      return {
        decision: 'block',
        reason: `Failed to take snapshot: ${error instanceof Error ? error.message : 'Unknown error'}`,
      }
    }
  }
}