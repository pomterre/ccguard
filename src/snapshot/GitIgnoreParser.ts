import fs from 'fs'
import path from 'path'

export class GitIgnoreParser {
  private patterns: Array<{ pattern: RegExp; negated: boolean; directory: boolean }>
  private rootDir: string

  constructor(rootDir: string) {
    this.rootDir = rootDir
    this.patterns = []
    this.loadPatterns()
  }

  private loadPatterns(): void {
    // Add default patterns first
    this.addDefaultPatterns()
    
    // Then load .gitignore (so it can override defaults)
    this.loadGitignoreFile(path.join(this.rootDir, '.gitignore'))
  }

  private loadGitignoreFile(gitignorePath: string): void {
    if (!fs.existsSync(gitignorePath)) {
      return
    }

    try {
      const content = fs.readFileSync(gitignorePath, 'utf-8')
      const lines = content.split('\n')

      for (const line of lines) {
        const trimmed = line.trim()
        
        // Skip empty lines and comments
        if (!trimmed || trimmed.startsWith('#')) {
          continue
        }

        this.addPattern(trimmed)
      }
    } catch (error) {
      console.error(`Error reading .gitignore at ${gitignorePath}:`, error)
    }
  }

  private addDefaultPatterns(): void {
    // Always ignore these
    const defaults = [
      'node_modules',
      '.git',
      'dist',
      'build',
      '.DS_Store',
      '.env',
      '.env.local',
      'coverage',
      '.nyc_output',
      '.vscode',
      '.idea',
    ]

    for (const pattern of defaults) {
      this.addPattern(pattern)
    }
  }

  private addPattern(pattern: string): void {
    let negated = false
    let directory = false
    let workingPattern = pattern

    // Handle negation
    if (workingPattern.startsWith('!')) {
      negated = true
      workingPattern = workingPattern.slice(1)
    }

    // Handle directory-only patterns
    if (workingPattern.endsWith('/')) {
      directory = true
      workingPattern = workingPattern.slice(0, -1)
    }

    // Convert gitignore pattern to regex
    const regex = this.gitignoreToRegex(workingPattern)
    
    this.patterns.push({ pattern: regex, negated, directory })
  }

  private gitignoreToRegex(pattern: string): RegExp {
    // Escape regex special characters except * and ?
    let regex = pattern.replace(/[.+^${}()|[\]\\]/g, '\\$&')
    
    // Handle ** (matches any number of directories)
    regex = regex.replace(/\*\*/g, '___DOUBLE_STAR___')
    
    // Handle * (matches anything except /)
    regex = regex.replace(/\*/g, '[^/]*')
    
    // Handle ? (matches any single character except /)
    regex = regex.replace(/\?/g, '[^/]')
    
    // Replace back ** placeholder
    regex = regex.replace(/___DOUBLE_STAR___/g, '.*')
    
    // If pattern doesn't start with /, it can match anywhere
    if (!pattern.startsWith('/')) {
      regex = `(^|/)${regex}`
    } else {
      // Remove leading / and anchor to start
      regex = `^${regex.slice(1)}`
    }
    
    // Add end anchor if pattern doesn't end with *
    if (!pattern.endsWith('*')) {
      regex = `${regex}($|/)`
    }
    
    return new RegExp(regex)
  }

  isIgnored(filePath: string): boolean {
    // Convert to relative path from root
    const relativePath = path.relative(this.rootDir, filePath)
    
    // Never include files outside the root directory
    if (relativePath.startsWith('..')) {
      return true
    }

    let ignored = false
    
    // Check each pattern in order (later patterns can override earlier ones)
    for (const { pattern, negated } of this.patterns) {
      if (pattern.test(relativePath)) {
        ignored = !negated
      }
    }
    
    return ignored
  }

  // Get all files in a directory that are not ignored
  getTrackedFiles(dir: string = this.rootDir): string[] {
    const files: string[] = []
    
    const walkDir = (currentDir: string) => {
      try {
        const entries = fs.readdirSync(currentDir, { withFileTypes: true })
        
        for (const entry of entries) {
          const fullPath = path.join(currentDir, entry.name)
          
          if (this.isIgnored(fullPath)) {
            continue
          }
          
          if (entry.isDirectory()) {
            walkDir(fullPath)
          } else if (entry.isFile()) {
            files.push(fullPath)
          }
        }
      } catch (error) {
        // Skip directories we can't read
        console.debug(`Skipping unreadable directory: ${currentDir}`)
      }
    }
    
    walkDir(dir)
    return files
  }
}