import fs from 'fs'
import crypto from 'crypto'
import { exec } from 'child_process'
import { promisify } from 'util'
import { FileSnapshot } from './types'
import { GitIgnoreParser } from './GitIgnoreParser'

const execAsync = promisify(exec)

export class FileScanner {
  private gitIgnoreParser: GitIgnoreParser
  private rootDir: string
  private ignoreEmptyLines: boolean

  constructor(rootDir: string, ignoreEmptyLines: boolean = true) {
    this.rootDir = rootDir
    this.gitIgnoreParser = new GitIgnoreParser(rootDir)
    this.ignoreEmptyLines = ignoreEmptyLines
  }

  /**
   * Scan all files in the project (excluding those in .gitignore)
   */
  async scanProject(): Promise<Map<string, FileSnapshot>> {
    const files = new Map<string, FileSnapshot>()
    const allFiles = this.gitIgnoreParser.getAllFiles()

    for (const filePath of allFiles) {
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
      const locCount = await this.countLinesWithWc(filePath)
      const hash = this.calculateHash(content)

      return {
        path: filePath,
        locCount,
        hash,
        lastModified: stats.mtimeMs,
        content,
      }
    } catch {
      // Handle files that can't be read (permissions, etc.)
      return null
    }
  }

  /**
   * Count lines using wc -l command
   */
  private async countLinesWithWc(filePath: string): Promise<number> {
    try {
      // Use wc -l to count lines
      const { stdout } = await execAsync(`wc -l < "${filePath}"`)
      let totalLines = parseInt(stdout.trim(), 10)
      
      // wc -l doesn't count the last line if it doesn't end with newline
      // Check if file ends with newline
      const content = fs.readFileSync(filePath, 'utf-8')
      if (content.length > 0 && !content.endsWith('\n')) {
        totalLines += 1
      }
        
      // If ignoring empty lines, we need to count non-empty lines
      if (this.ignoreEmptyLines) {
        // Use grep to count non-empty lines
        try {
          const { stdout: grepOut } = await execAsync(`grep -c -v '^$' "${filePath}"`)
          return parseInt(grepOut.trim(), 10)
        } catch (grepError: any) {
          // grep returns exit code 1 if no lines match (all empty)
          if (grepError.code === 1) {
            return 0
          }
          // Fall back to total lines if grep fails
          return totalLines
        }
      }
      
      return totalLines
    } catch {
      // Fallback: count lines manually if command fails
      const content = fs.readFileSync(filePath, 'utf-8')
      const lines = content.split('\n')
      if (this.ignoreEmptyLines) {
        return lines.filter(line => line.trim().length > 0).length
      }
      return lines.length
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
    // For known file operations, return specific files for efficiency
    switch (operation.tool_name) {
      case 'Edit':
      case 'Write':
        if (operation.tool_input?.file_path) {
          return [operation.tool_input.file_path]
        }
        break
        
      case 'MultiEdit':
        if (operation.tool_input?.file_path) {
          return [operation.tool_input.file_path]
        }
        break
    }
    
    // For all other tools (including Bash), return empty array
    // This will trigger a full project scan in the snapshot manager
    return []
  }
}