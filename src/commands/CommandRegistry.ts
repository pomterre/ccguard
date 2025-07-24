import { Command, CommandRegistry as ICommandRegistry } from './types'

export class CommandRegistry implements ICommandRegistry {
  private commands: Map<string, Command> = new Map()

  register(command: Command): void {
    // Register main command name
    this.commands.set(command.name.toLowerCase(), command)
    
    // Register aliases
    if (command.aliases) {
      for (const alias of command.aliases) {
        this.commands.set(alias.toLowerCase(), command)
      }
    }
  }

  get(name: string): Command | undefined {
    return this.commands.get(name.toLowerCase())
  }

  getAll(): Command[] {
    // Return unique commands (avoid duplicates from aliases)
    const uniqueCommands = new Map<string, Command>()
    for (const command of this.commands.values()) {
      uniqueCommands.set(command.name, command)
    }
    return Array.from(uniqueCommands.values())
  }

  static createWithDefaults(commands: Command[]): CommandRegistry {
    const registry = new CommandRegistry()
    for (const command of commands) {
      registry.register(command)
    }
    return registry
  }
}