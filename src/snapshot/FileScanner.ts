import fs from 'fs'
import crypto from 'crypto'
import { FileSnapshot } from './types'
import { GitIgnoreParser } from './GitIgnoreParser'
import { LocCounter } from '../validation/locCounter'

export class FileScanner {
  private gitIgnoreParser: GitIgnoreParser
  private locCounter: LocCounter
  private rootDir: string

  constructor(rootDir: string, ignoreEmptyLines: boolean = true) {
    this.rootDir = rootDir
    this.gitIgnoreParser = new GitIgnoreParser(rootDir)
    this.locCounter = new LocCounter({ ignoreEmptyLines })
  }

  /**
   * Scan all tracked files in the project
   */
  async scanProject(): Promise<Map<string, FileSnapshot>> {
    const files = new Map<string, FileSnapshot>()
    const trackedFiles = this.gitIgnoreParser.getTrackedFiles()

    for (const filePath of trackedFiles) {
      try {
        const snapshot = await this.scanFile(filePath)
        if (snapshot) {
          files.set(filePath, snapshot)
        }
      } catch (error) {
        console.debug(`Error scanning file ${filePath}:`, error)
      }
    }

    return files
  }

  /**
   * Scan specific files
   */
  async scanFiles(filePaths: string[]): Promise<Map<string, FileSnapshot>> {
    const files = new Map<string, FileSnapshot>()

    for (const filePath of filePaths) {
      if (this.gitIgnoreParser.isIgnored(filePath)) {
        continue
      }

      try {
        const snapshot = await this.scanFile(filePath)
        if (snapshot) {
          files.set(filePath, snapshot)
        }
      } catch (error) {
        console.debug(`Error scanning file ${filePath}:`, error)
      }
    }

    return files
  }

  /**
   * Scan a single file
   */
  private async scanFile(filePath: string): Promise<FileSnapshot | null> {
    try {
      // Check if file exists
      if (!fs.existsSync(filePath)) {
        return null
      }

      const stats = fs.statSync(filePath)
      
      // Skip if not a regular file
      if (!stats.isFile()) {
        return null
      }

      // Skip binary files (simple heuristic based on extension)
      if (this.isBinaryFile(filePath)) {
        return null
      }

      const content = fs.readFileSync(filePath, 'utf-8')
      const locCount = this.locCounter.countLines(content)
      const hash = this.calculateHash(content)

      return {
        path: filePath,
        locCount,
        hash,
        lastModified: stats.mtimeMs,
      }
    } catch (error) {
      // Handle files that can't be read (permissions, etc.)
      return null
    }
  }

  /**
   * Calculate hash of file content
   */
  private calculateHash(content: string): string {
    return crypto.createHash('sha256').update(content).digest('hex')
  }

  /**
   * Simple heuristic to detect binary files
   */
  private isBinaryFile(filePath: string): boolean {
    const binaryExtensions = [
      '.jpg', '.jpeg', '.png', '.gif', '.bmp', '.ico', '.svg',
      '.pdf', '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx',
      '.zip', '.tar', '.gz', '.rar', '.7z',
      '.exe', '.dll', '.so', '.dylib',
      '.mp3', '.mp4', '.avi', '.mov', '.wmv',
      '.ttf', '.otf', '.woff', '.woff2',
      '.db', '.sqlite',
      '.pyc', '.class', '.o', '.a',
      '.min.js', '.min.css', // Minified files
    ]

    const ext = filePath.toLowerCase().match(/\.[^.]+$/)?.[0]
    return ext ? binaryExtensions.includes(ext) : false
  }

  /**
   * Get files that would be affected by an operation
   */
  getAffectedFiles(operation: any): string[] {
    const files: string[] = []
    
    switch (operation.tool_name) {
      case 'Edit':
      case 'Write':
        if (operation.tool_input?.file_path) {
          files.push(operation.tool_input.file_path)
        }
        break
        
      case 'MultiEdit':
        if (operation.tool_input?.file_path) {
          files.push(operation.tool_input.file_path)
        }
        break
    }
    
    return files
  }
}