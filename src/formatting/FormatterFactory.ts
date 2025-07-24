import { Formatter, FormatterConfig } from './Formatter'
import { CommandFormatter } from './CommandFormatter'

/**
 * Factory for creating formatter instances based on configuration
 */
export class FormatterFactory {
  /**
   * Create a formatter instance from configuration
   * @param config The formatter configuration
   * @returns A formatter instance or null if formatting is disabled
   */
  static createFormatter(config?: FormatterConfig): Formatter | null {
    if (!config?.enabled) {
      return null
    }

    // For now, we only support command-based formatters
    // In the future, we could add built-in formatters for common tools
    return new CommandFormatter(config)
  }
}