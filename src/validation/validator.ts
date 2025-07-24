import { Context, ValidationResult, LocChange, SessionStats, ToolOperation } from '../contracts'
import { LocCounter } from './locCounter'
import { GuardManager } from '../ccguard/GuardManager'
import { Storage } from '../storage/Storage'
import { ConfigLoader } from '../config/ConfigLoader'
import { FormatterFactory } from '../formatting'

export class Validator {
  private locCounter: LocCounter
  private guardManager: GuardManager
  private configLoader: ConfigLoader

  constructor(storage: Storage, configLoader?: ConfigLoader) {
    this.configLoader = configLoader ?? new ConfigLoader()
    const config = this.configLoader.getConfig()
    
    // Create formatter if configured
    const formatter = FormatterFactory.createFormatter(config.formatter)
    
    this.locCounter = new LocCounter(
      { ignoreEmptyLines: config.enforcement.ignoreEmptyLines },
      formatter || undefined
    )
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
    const change = await this.locCounter.calculateChange(
      context.operation.tool_name,
      context.operation.tool_input
    )

    const config = this.configLoader.getConfig()
    
    // Per-operation mode: check this operation only
    if (config.enforcement.mode === 'per-operation') {
      const threshold = config.thresholds?.allowedPositiveLines ?? 0
      if (change.netChange > threshold) {
        return this.createResponse('block', change, null, true)
      }
      return this.createResponse('approve', change, null, true)
    }

    // Session-wide mode: calculate what stats would be
    const currentStats = await this.guardManager.getSessionStats()
    const projectedStats = this.projectStats(currentStats, change)

    const threshold = config.thresholds?.allowedPositiveLines ?? 0
    if (projectedStats.netChange > threshold) {
      return this.createResponse('block', change, projectedStats)
    }

    // Only update stats if approved
    const updatedStats = await this.guardManager.updateSessionStats(
      change.linesAdded,
      change.linesRemoved
    )

    return this.createResponse('approve', change, updatedStats)
  }

  private getFilePath(operation: ToolOperation): string | null {
    const input = operation.tool_input
    return input?.file_path ?? null
  }

  private formatChange(n: number): string {
    return n > 0 ? `+${n}` : `${n}`
  }

  private projectStats(current: SessionStats | null, change: LocChange): SessionStats {
    return {
      totalLinesAdded: (current?.totalLinesAdded ?? 0) + change.linesAdded,
      totalLinesRemoved: (current?.totalLinesRemoved ?? 0) + change.linesRemoved,
      netChange: (current?.netChange ?? 0) + change.netChange,
      operationCount: (current?.operationCount ?? 0) + 1,
      lastUpdated: new Date().toISOString(),
    }
  }

  private createResponse(
    decision: 'block' | 'approve',
    change: LocChange,
    stats: SessionStats | null = null,
    perOp = false
  ): ValidationResult {
    const c = this.formatChange(change.netChange)
    const t = stats ? this.formatChange(stats.netChange) : 'N/A'
    
    if (decision === 'block') {
      return {
        decision,
        reason: [
          `Operation blocked: Net positive LOC change detected!\n`,
          `This operation would:`,
          `  • Add ${change.linesAdded} lines`,
          `  • Remove ${change.linesRemoved} lines`,
          `  • Net change: ${c} lines\n`,
          !perOp && `Session total would become: ${t} lines\n`,
          `Suggestions:`,
          `  • Use MultiEdit to batch this change with code removal in other files`,
          `    (e.g., add feature in one file while removing old code in another)`,
          `  • Refactor existing code to be more concise before adding new code`,
          `  • Extract common patterns to reduce duplication`,
          `  • Remove unnecessary code, comments, or deprecated features`,
          `  • Consider if this feature is truly needed`
        ].filter(Boolean).join('\n')
      }
    }
    
    return {
      decision,
      reason: `Operation approved\n\nLOC change: ${c}${!perOp ? ` (Session total: ${t})` : ''}`
    }
  }
}

// Export a factory function for easier use
export async function createValidator(storage: Storage, configLoader?: ConfigLoader) {
  const validator = new Validator(storage, configLoader)
  return (context: Context) => validator.validate(context)
}