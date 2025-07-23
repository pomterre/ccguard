import { LocChange, EditInput, MultiEditInput, WriteInput } from '../contracts'

export class LocCounter {
  private ignoreEmptyLines: boolean

  constructor(options: { ignoreEmptyLines?: boolean } = {}) {
    this.ignoreEmptyLines = options.ignoreEmptyLines ?? true
  }

  /**
   * Count lines of code in a string
   */
  countLines(content: string): number {
    if (!content) return 0
    
    const lines = content.split('\n')
    
    if (this.ignoreEmptyLines) {
      return lines.filter(line => line.trim().length > 0).length
    }
    
    return lines.length
  }

  /**
   * Calculate LOC change for an Edit operation
   */
  calculateEditChange(input: EditInput): LocChange {
    const linesRemoved = this.countLines(input.old_string)
    const linesAdded = this.countLines(input.new_string)
    
    return {
      linesAdded,
      linesRemoved,
      netChange: linesAdded - linesRemoved
    }
  }

  /**
   * Calculate LOC change for a MultiEdit operation
   */
  calculateMultiEditChange(input: MultiEditInput): LocChange {
    let totalAdded = 0
    let totalRemoved = 0
    
    // Process each edit in sequence
    for (const edit of input.edits) {
      const linesRemoved = this.countLines(edit.old_string)
      const linesAdded = this.countLines(edit.new_string)
      
      totalRemoved += linesRemoved
      totalAdded += linesAdded
    }
    
    return {
      linesAdded: totalAdded,
      linesRemoved: totalRemoved,
      netChange: totalAdded - totalRemoved
    }
  }

  /**
   * Calculate LOC change for a Write operation (new file)
   */
  calculateWriteChange(input: WriteInput): LocChange {
    const linesAdded = this.countLines(input.content)
    
    return {
      linesAdded,
      linesRemoved: 0,
      netChange: linesAdded
    }
  }

  /**
   * Calculate LOC change for any operation type
   */
  calculateChange(toolName: string, input: EditInput | MultiEditInput | WriteInput): LocChange {
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