import { ValidationResult, UserPromptSubmitSchema } from '../contracts'
import { GuardManager } from '../ccguard/GuardManager'
import { CommandRegistry } from '../commands/CommandRegistry'
import { defaultCommands } from '../commands'

export class UserPromptHandler {
  private commandRegistry: CommandRegistry

  constructor(private guardManager: GuardManager) {
    this.commandRegistry = CommandRegistry.createWithDefaults(defaultCommands)
  }

  async processUserCommand(inputData: string): Promise<ValidationResult | null> {
    try {
      const parsedData = JSON.parse(inputData)
      const result = UserPromptSubmitSchema.safeParse(parsedData)
      
      if (!result.success) {
        return null
      }

      const prompt = result.data.prompt.trim().toLowerCase()
      
      // Check if this is a ccguard command
      if (!prompt.startsWith('ccguard ')) {
        return null
      }

      // Parse command and args
      const parts = prompt.split(' ').filter(p => p.length > 0)
      if (parts.length < 2) {
        return null
      }

      const commandName = parts[1]
      const args = parts.slice(2)

      // Find and execute command
      const command = this.commandRegistry.get(commandName)
      if (!command) {
        return {
          decision: 'block',
          reason: `Unknown command: ${commandName}. Available commands: ${this.getAvailableCommands()}`,
        }
      }

      return await command.execute(this.guardManager, args)
    } catch {
      return null
    }
  }

  private getAvailableCommands(): string {
    const commands = this.commandRegistry.getAll()
    return commands.map(c => c.name).join(', ')
  }

  async getDisabledResult(): Promise<ValidationResult | null> {
    const isEnabled = await this.guardManager.isEnabled()
    
    if (!isEnabled) {
      return {
        decision: 'approve',
        reason: '',
      }
    }
    
    return null
  }
}
