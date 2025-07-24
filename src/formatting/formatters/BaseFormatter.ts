import { Formatter } from '../Formatter'
import * as path from 'path'

/**
 * Base implementation of the Formatter interface
 */
export abstract class BaseFormatter implements Formatter {
  /**
   * Get the file extension from a file path
   */
  protected getFileExtension(filePath: string): string {
    return path.extname(filePath).toLowerCase()
  }

  /**
   * Default implementation of isSupported
   * Can be overridden by subclasses
   */
  isSupported(filePath: string): boolean {
    const extension = this.getFileExtension(filePath)
    return this.getSupportedExtensions().includes(extension)
  }

  /**
   * Get the list of supported file extensions
   * Must be implemented by subclasses
   */
  protected abstract getSupportedExtensions(): string[]

  /**
   * Format the content
   * Must be implemented by subclasses
   */
  abstract format(content: string, filePath: string): Promise<string>
}