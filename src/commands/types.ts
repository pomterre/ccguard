import { ValidationResult } from '../contracts'
import { GuardManager } from '../ccguard/GuardManager'

export interface Command {
  name: string
  aliases?: string[]
  description: string
  execute: (guardManager: GuardManager, args: string[]) => Promise<ValidationResult>
}

export interface CommandRegistry {
  register(command: Command): void
  get(name: string): Command | undefined
  getAll(): Command[]
}