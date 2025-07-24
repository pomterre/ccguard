import { Command } from './types'
import { ValidationResult } from '../contracts'
import packageJson from '../../package.json'

export const VersionCommand: Command = {
  name: 'version',
  aliases: ['v', '--version', '-v'],
  description: 'Show CCGuard version',
  execute: async (): Promise<ValidationResult> => {
    return {
      decision: 'block',
      reason: `CCGuard v${packageJson.version}`,
    }
  }
}