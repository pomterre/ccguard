import { LocChange, EditInput, MultiEditInput, WriteInput } from '../contracts'
import { Formatter } from '../formatting'

export class LocCounter {
  private ignoreEmptyLines: boolean
  private formatter?: Formatter

  constructor(
    options: { ignoreEmptyLines?: boolean } = {},
    formatter?: Formatter
  ) {
    this.ignoreEmptyLines = options.ignoreEmptyLines ?? true
    this.formatter = formatter
  }

  /**
   * Format content if formatter is available
   */
  private async formatContent(content: string, filePath: string): Promise<string> {
    if (!this.formatter || !this.formatter.isSupported(filePath)) {
      return content
    }
    
    try {
      return await this.formatter.format(content, filePath)
    } catch (error) {
      // If formatting fails, continue with unformatted content
      console.warn(`Failed to format ${filePath}:`, error)
      return content
    }
  }

  /**
   * Count lines of code in a string
   */
  countLines(content: string): number {
    if (!content) return 0
    const matches = content.match(this.ignoreEmptyLines ? /\S.*$/gm : /^/gm)
    return matches ? matches.length : 0
  }

  /**
   * Calculate LOC change for an Edit operation
   */
  async calculateEditChange(input: EditInput): Promise<LocChange> {
    // For Edit operations, we format the strings independently
    // since they represent partial content
    const formattedOld = await this.formatContent(input.old_string, input.file_path)
    const formattedNew = await this.formatContent(input.new_string, input.file_path)
    
    const linesRemoved = this.countLines(formattedOld)
    const linesAdded = this.countLines(formattedNew)
    
    return {
      linesAdded,
      linesRemoved,
      netChange: linesAdded - linesRemoved
    }
  }

  /**
   * Calculate LOC change for a MultiEdit operation
   */
  async calculateMultiEditChange(input: MultiEditInput): Promise<LocChange> {
    const results = await Promise.all(input.edits.map(async edit => ({
      removed: this.countLines(await this.formatContent(edit.old_string, input.file_path)),
      added: this.countLines(await this.formatContent(edit.new_string, input.file_path))
    })))
    const totalRemoved = results.reduce((sum, r) => sum + r.removed, 0)
    const totalAdded = results.reduce((sum, r) => sum + r.added, 0)
    return {
      linesAdded: totalAdded,
      linesRemoved: totalRemoved,
      netChange: totalAdded - totalRemoved
    }
  }

  /**
   * Calculate LOC change for a Write operation (new file)
   */
  async calculateWriteChange(input: WriteInput): Promise<LocChange> {
    const formattedContent = await this.formatContent(input.content, input.file_path)
    const linesAdded = this.countLines(formattedContent)
    
    return {
      linesAdded,
      linesRemoved: 0,
      netChange: linesAdded
    }
  }

  /**
   * Calculate LOC change for any operation type
   */
  async calculateChange(toolName: string, input: EditInput | MultiEditInput | WriteInput): Promise<LocChange> {
    switch (toolName) {
      case 'Edit':
        return this.calculateEditChange(input as EditInput)
      case 'MultiEdit':
        return this.calculateMultiEditChange(input as MultiEditInput)
      case 'Write':
        return this.calculateWriteChange(input as WriteInput)
      default:
        throw new Error(`Unknown tool: ${toolName}`)
    }
  }
}