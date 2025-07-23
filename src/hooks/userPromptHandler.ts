import { ValidationResult, UserPromptSubmitSchema } from '../contracts'
import { GuardManager } from '../ccguard/GuardManager'

export class UserPromptHandler {
  constructor(private guardManager: GuardManager) {}

  async processUserCommand(inputData: string): Promise<ValidationResult | null> {
    try {
      const parsedData = JSON.parse(inputData)
      const result = UserPromptSubmitSchema.safeParse(parsedData)
      
      if (!result.success) {
        return null
      }

      const prompt = result.data.prompt.trim().toLowerCase()
      
      // Handle guard commands
      if (prompt === 'ccguard on') {
        await this.guardManager.enable()
        return {
          decision: 'block',
          reason: 'CCGuard is now ENABLED. Net negative LOC enforcement is active.',
        }
      }

      if (prompt === 'ccguard off') {
        await this.guardManager.disable()
        return {
          decision: 'block',
          reason: 'CCGuard is now DISABLED. LOC changes will not be enforced.',
        }
      }

      if (prompt === 'ccguard status') {
        const isEnabled = await this.guardManager.isEnabled()
        const stats = await this.guardManager.getSessionStats()
        
        let message = isEnabled 
          ? 'CCGuard is ENABLED\n\n' 
          : 'CCGuard is DISABLED\n\n'
        
        if (stats) {
          message += `Session Statistics:\n`
          message += `   Lines added: ${stats.totalLinesAdded}\n`
          message += `   Lines removed: ${stats.totalLinesRemoved}\n`
          message += `   Net change: ${stats.netChange > 0 ? '+' : ''}${stats.netChange}\n`
          message += `   Operations: ${stats.operationCount}`
        } else {
          message += 'No operations tracked yet in this session.'
        }
        
        return {
          decision: 'block',
          reason: message,
        }
      }

      if (prompt === 'ccguard reset') {
        await this.guardManager.resetStats()
        return {
          decision: 'block',
          reason: 'Session statistics have been reset.',
        }
      }

      return null
    } catch {
      return null
    }
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
