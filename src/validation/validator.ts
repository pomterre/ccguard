import { Context, ValidationResult, LocChange, SessionStats } from '../contracts'
import { LocCounter } from './locCounter'
import { GuardManager } from '../ccguard/GuardManager'
import { Storage } from '../storage/Storage'
import { ConfigLoader } from '../config/ConfigLoader'

export class Validator {
  private locCounter: LocCounter
  private guardManager: GuardManager
  private configLoader: ConfigLoader

  constructor(storage: Storage, configLoader?: ConfigLoader) {
    this.configLoader = configLoader ?? new ConfigLoader()
    const config = this.configLoader.getConfig()
    this.locCounter = new LocCounter({ ignoreEmptyLines: config.enforcement.ignoreEmptyLines })
    this.guardManager = new GuardManager(storage, this.configLoader)
  }

  async validate(context: Context): Promise<ValidationResult> {
    // Check if guard is enabled
    if (!context.guardEnabled) {
      return {
        decision: 'approve',
        reason: 'CCGuard is disabled',
      }
    }

    // Check if file is whitelisted
    const filePath = this.getFilePath(context.operation)
    if (filePath && this.configLoader.isFileWhitelisted(filePath)) {
      return {
        decision: 'approve',
        reason: 'File is whitelisted - LOC enforcement skipped',
      }
    }

    // Calculate LOC change for this operation
    const change = this.locCounter.calculateChange(
      context.operation.tool_name,
      context.operation.tool_input
    )

    const config = await this.guardManager.getConfig() // Use hot config
    
    // Per-operation mode: check this operation only
    if (config.enforcement.mode === 'per-operation') {
      const threshold = config.thresholds?.allowedPositiveLines ?? 0
      const decision = change.netChange > threshold ? 'block' : 'approve'
      const result = decision === 'block' 
        ? this.createBlockResponse(change, null, true)
        : this.createApproveResponse(change, null, true)
      
      // Track operation in history
      if (filePath) {
        await this.guardManager.addOperationToHistory({
          toolName: context.operation.tool_name,
          filePath,
          linesAdded: change.linesAdded,
          linesRemoved: change.linesRemoved,
          netChange: change.netChange,
          decision,
          reason: result.reason.split('\n')[0] // First line only
        })
      }
      
      return result
    }

    // Session-wide mode: calculate what stats would be
    const currentStats = await this.guardManager.getSessionStats()
    const projectedStats: SessionStats = {
      totalLinesAdded: (currentStats?.totalLinesAdded ?? 0) + change.linesAdded,
      totalLinesRemoved: (currentStats?.totalLinesRemoved ?? 0) + change.linesRemoved,
      netChange: 0,
      operationCount: (currentStats?.operationCount ?? 0) + 1,
      lastUpdated: new Date().toISOString(),
    }
    projectedStats.netChange = projectedStats.totalLinesAdded - projectedStats.totalLinesRemoved

    const threshold = config.thresholds?.allowedPositiveLines ?? 0
    const decision = projectedStats.netChange > threshold ? 'block' : 'approve'
    
    let result: ValidationResult
    if (decision === 'block') {
      result = this.createBlockResponse(change, projectedStats)
    } else {
      // Only update stats if approved
      const updatedStats = await this.guardManager.updateSessionStats(
        change.linesAdded,
        change.linesRemoved
      )
      result = this.createApproveResponse(change, updatedStats)
    }
    
    // Track operation in history
    if (filePath) {
      await this.guardManager.addOperationToHistory({
        toolName: context.operation.tool_name,
        filePath,
        linesAdded: change.linesAdded,
        linesRemoved: change.linesRemoved,
        netChange: change.netChange,
        decision,
        reason: result.reason.split('\n')[0] // First line only
      })
    }

    return result
  }

  private getFilePath(operation: any): string | null {
    const input = operation.tool_input
    return input?.file_path ?? null
  }

  private createBlockResponse(
    change: LocChange,
    stats: SessionStats | null,
    perOperation: boolean = false
  ): ValidationResult {
    const changeStr = change.netChange > 0 ? `+${change.netChange}` : `${change.netChange}`
    const totalStr = stats ? (stats.netChange > 0 ? `+${stats.netChange}` : `${stats.netChange}`) : 'N/A'
    
    let reason = `Operation blocked: Net positive LOC change detected!\n\n`
    reason += `This operation would:\n`
    reason += `  • Add ${change.linesAdded} lines\n`
    reason += `  • Remove ${change.linesRemoved} lines\n`
    reason += `  • Net change: ${changeStr} lines\n\n`
    reason += perOperation ? `` : `Session total would become: ${totalStr} lines\n\n`
    reason += `Suggestions:\n`
    reason += `  • Use MultiEdit to batch this change with code removal in other files\n`
    reason += `    (e.g., add feature in one file while removing old code in another)\n`
    reason += `  • Refactor existing code to be more concise before adding new code\n`
    reason += `  • Extract common patterns to reduce duplication\n`
    reason += `  • Remove unnecessary code, comments, or deprecated features\n`
    reason += `  • Consider if this feature is truly needed`

    return {
      decision: 'block',
      reason,
    }
  }

  private createApproveResponse(
    change: LocChange,
    stats: SessionStats | null,
    perOperation: boolean = false
  ): ValidationResult {
    const changeStr = change.netChange > 0 ? `+${change.netChange}` : `${change.netChange}`
    const totalStr = stats ? (stats.netChange > 0 ? `+${stats.netChange}` : `${stats.netChange}`) : 'N/A'
    
    let reason = `Operation approved\n\n`
    reason += perOperation 
      ? `LOC change: ${changeStr}` 
      : `LOC change: ${changeStr} (Session total: ${totalStr})`

    return {
      decision: 'approve',
      reason,
    }
  }
}

// Export a factory function for easier use
export async function createValidator(storage: Storage, configLoader?: ConfigLoader) {
  const validator = new Validator(storage, configLoader)
  return (context: Context) => validator.validate(context)
}