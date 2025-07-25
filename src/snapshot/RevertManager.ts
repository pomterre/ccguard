import { execSync } from 'child_process'
import fs from 'fs'
import path from 'path'
import { ProjectSnapshot } from './types'

export class RevertManager {
  private rootDir: string

  constructor(rootDir: string) {
    this.rootDir = rootDir
  }

  /**
   * Revert files to their state in the last valid snapshot
   */
  async revertToSnapshot(
    affectedFiles: string[],
    lastValidSnapshot: ProjectSnapshot
  ): Promise<{ success: boolean; error?: string }> {
    try {
      // Create a backup of current changes in case revert fails
      const backup = this.createBackup(affectedFiles)

      try {
        for (const filePath of affectedFiles) {
          const absolutePath = path.isAbsolute(filePath) 
            ? filePath 
            : path.join(this.rootDir, filePath)
          
          const snapshotFile = lastValidSnapshot.files.get(absolutePath)
          
          if (!snapshotFile) {
            // File didn't exist in last valid snapshot, so remove it
            if (fs.existsSync(absolutePath)) {
              fs.unlinkSync(absolutePath)
            }
          } else {
            // File existed, revert using git
            this.revertFile(absolutePath)
          }
        }

        // Clean up backup on success
        this.cleanupBackup(backup)
        
        return { success: true }
      } catch (error) {
        // Restore from backup on failure
        this.restoreBackup(backup)
        throw error
      }
    } catch (error) {
      return {
        success: false,
        error: `Failed to revert changes: ${error instanceof Error ? error.message : String(error)}`,
      }
    }
  }

  /**
   * Check if we're in a git repository
   */
  isGitRepo(): boolean {
    try {
      execSync('git rev-parse --git-dir', {
        cwd: this.rootDir,
        stdio: 'pipe',
      })
      return true
    } catch {
      return false
    }
  }

  /**
   * Revert a single file using git
   */
  private revertFile(filePath: string): void {
    try {
      // First, check if file is tracked by git
      const isTracked = this.isFileTracked(filePath)
      
      if (isTracked) {
        // For tracked files, use git checkout to revert
        execSync(`git checkout HEAD -- "${filePath}"`, {
          cwd: this.rootDir,
          stdio: 'pipe',
        })
      } else {
        // For untracked files, we need to remove them
        if (fs.existsSync(filePath)) {
          fs.unlinkSync(filePath)
        }
      }
    } catch (error) {
      throw new Error(`Failed to revert ${filePath}: ${error}`)
    }
  }

  /**
   * Check if a file is tracked by git
   */
  private isFileTracked(filePath: string): boolean {
    try {
      execSync(`git ls-files --error-unmatch "${filePath}"`, {
        cwd: this.rootDir,
        stdio: 'pipe',
      })
      return true
    } catch {
      return false
    }
  }

  /**
   * Create a backup of files before reverting
   */
  private createBackup(files: string[]): Map<string, string> {
    const backup = new Map<string, string>()
    
    for (const filePath of files) {
      const absolutePath = path.isAbsolute(filePath) 
        ? filePath 
        : path.join(this.rootDir, filePath)
      
      if (fs.existsSync(absolutePath)) {
        try {
          const content = fs.readFileSync(absolutePath, 'utf-8')
          backup.set(absolutePath, content)
        } catch {
          // Skip files we can't read
        }
      }
    }
    
    return backup
  }

  /**
   * Restore files from backup
   */
  private restoreBackup(backup: Map<string, string>): void {
    for (const [filePath, content] of backup) {
      try {
        fs.writeFileSync(filePath, content)
      } catch {
        // Best effort restore
      }
    }
  }

  /**
   * Clean up backup (no-op for in-memory backup)
   */
  private cleanupBackup(backup: Map<string, string>): void {
    // In-memory backup, nothing to clean up
  }

  /**
   * Get git status for diagnostics
   */
  getGitStatus(): string {
    try {
      return execSync('git status --porcelain', {
        cwd: this.rootDir,
        encoding: 'utf-8',
      })
    } catch {
      return 'Not a git repository'
    }
  }
}