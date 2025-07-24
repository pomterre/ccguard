/**
 * Abstract interface for code formatters
 */
export interface Formatter {
  /**
   * Format the given content
   * @param content The code content to format
   * @param filePath The file path (used to determine formatter and for placeholder replacement)
   * @returns The formatted content
   */
  format(content: string, filePath: string): Promise<string>

  /**
   * Check if this formatter supports the given file
   * @param filePath The file path to check
   * @returns True if the formatter can handle this file type
   */
  isSupported(filePath: string): boolean
}

/**
 * Formatter configuration for a specific file extension
 */
export interface FormatterCommand {
  /**
   * The command to execute (e.g., "prettier --stdin-filepath {filepath}")
   * {filepath} will be replaced with the actual file path
   */
  command: string

  /**
   * Whether to send content via stdin (default: true)
   */
  stdin?: boolean

  /**
   * Additional arguments to pass to the command
   */
  args?: string[]
}

/**
 * Complete formatter configuration
 */
export interface FormatterConfig {
  /**
   * Whether formatting is enabled
   */
  enabled: boolean

  /**
   * Commands mapped by file extension (e.g., ".js": { command: "prettier" })
   */
  commands: Record<string, FormatterCommand>

  /**
   * Timeout for formatter execution in milliseconds (default: 5000)
   */
  timeout?: number

  /**
   * Whether to continue without formatting if formatter fails (default: true)
   */
  fallbackOnError?: boolean
}