import { BaseFormatter } from './formatters/BaseFormatter'
import { FormatterConfig } from './Formatter'
import { spawn } from 'child_process'

/**
 * Formatter that executes shell commands to format code
 */
export class CommandFormatter extends BaseFormatter {
  private config: FormatterConfig
  private cache: Map<string, string> = new Map()

  constructor(config: FormatterConfig) {
    super()
    this.config = config
  }

  /**
   * Get supported extensions from config
   */
  protected getSupportedExtensions(): string[] {
    return Object.keys(this.config.commands)
  }

  /**
   * Format content using the configured command
   */
  async format(content: string, filePath: string): Promise<string> {
    const extension = this.getFileExtension(filePath)
    const commandConfig = this.config.commands[extension]

    if (!commandConfig) {
      // No formatter configured for this file type
      return content
    }

    // Check cache
    const cacheKey = `${filePath}:${content.length}:${content.substring(0, 100)}`
    const cached = this.cache.get(cacheKey)
    if (cached) {
      return cached
    }

    try {
      const formatted = await this.executeFormatter(content, filePath, commandConfig)
      
      // Cache the result
      this.cache.set(cacheKey, formatted)
      
      // Limit cache size
      if (this.cache.size > 100) {
        const firstKey = this.cache.keys().next().value
        if (firstKey !== undefined) {
          this.cache.delete(firstKey)
        }
      }

      return formatted
    } catch (error) {
      if (this.config.fallbackOnError !== false) {
        // Log error but continue with unformatted content
        console.warn(`Formatter failed for ${filePath}:`, error)
        return content
      }
      throw error
    }
  }

  /**
   * Execute the formatter command
   */
  private async executeFormatter(
    content: string,
    filePath: string,
    commandConfig: { command: string; stdin?: boolean; args?: string[] }
  ): Promise<string> {
    return new Promise((resolve, reject) => {
      // Parse command safely without shell
      const parts = commandConfig.command.split(' ')
      const cmd = parts[0]
      const args = parts.slice(1).map(arg => 
        arg === '{filepath}' ? filePath : arg
      ).concat(commandConfig.args || [])

      const child = spawn(cmd, args, {
        timeout: this.config.timeout || 5000,
      })

      let stdout = ''
      let stderr = ''

      child.stdout.on('data', (data) => {
        stdout += data.toString()
      })

      child.stderr.on('data', (data) => {
        stderr += data.toString()
      })

      child.on('error', (error) => {
        reject(new Error(`Formatter error: ${error.message}`))
      })

      child.on('close', (code) => {
        if (code !== 0) {
          reject(new Error(`Formatter exited with code ${code}: ${stderr}`))
        } else {
          resolve(stdout || content) // Fallback to original if no output
        }
      })

      // Send content via stdin if configured (default: true)
      if (commandConfig.stdin !== false) {
        child.stdin.write(content)
        child.stdin.end()
      }
    })
  }

  /**
   * Clear the formatting cache
   */
  clearCache(): void {
    this.cache.clear()
  }
}