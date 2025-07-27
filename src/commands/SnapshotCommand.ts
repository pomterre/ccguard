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
        reason: `Snapshot baseline updated successfully!

New LOC threshold set:
  • Maximum allowed LOC: ${result.totalLoc}
  • Files tracked: ${result.fileCount}
  • Timestamp: ${new Date(result.timestamp).toLocaleString()}

Any changes that would exceed ${result.totalLoc} lines will be rejected.`,
      }
    } catch (error) {
      return {
        decision: 'block',
        reason: `Failed to take snapshot: ${error instanceof Error ? error.message : 'Unknown error'}`,
      }
    }
  }
}