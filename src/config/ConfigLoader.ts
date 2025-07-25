import fs from 'fs'
import path from 'path'
import { GuardConfig } from '../contracts/types'
import { GuardConfigSchema } from '../contracts/schemas'
import { z } from 'zod'

export class ConfigLoader {
  private static DEFAULT_CONFIG: GuardConfig = {
    enforcement: {
      mode: 'session-wide',
      strategy: 'cumulative',
      ignoreEmptyLines: true,
    },
    whitelist: {
      patterns: [],
      extensions: [],
    },
    thresholds: {
      allowedPositiveLines: 0,
    },
  }

  private config: GuardConfig

  constructor(private configPath?: string) {
    this.config = this.loadConfig()
  }

  private findConfigFile(): string | null {
    const configNames = ['.ccguard.config.json', 'ccguard.config.json']
    
    // Start from current directory and walk up
    let currentDir = process.cwd()
    
    while (currentDir !== path.parse(currentDir).root) {
      for (const configName of configNames) {
        const configPath = path.join(currentDir, configName)
        if (fs.existsSync(configPath)) {
          return configPath
        }
      }
      currentDir = path.dirname(currentDir)
    }
    
    return null
  }

  private loadConfig(): GuardConfig {
    const configPath = this.configPath ?? this.findConfigFile()
    
    if (!configPath || !fs.existsSync(configPath)) {
      return ConfigLoader.DEFAULT_CONFIG
    }

    try {
      const rawConfig = fs.readFileSync(configPath, 'utf-8')
      const parsedConfig = JSON.parse(rawConfig)
      
      // Validate and apply defaults
      const validated = GuardConfigSchema.parse(parsedConfig)
      return validated
    } catch (error) {
      if (error instanceof z.ZodError) {
        console.error(`Invalid config at ${configPath}:`, error.errors)
      } else if (error instanceof SyntaxError) {
        console.error(`Invalid JSON in config file ${configPath}`)
      } else {
        console.error(`Error loading config from ${configPath}:`, error)
      }
      
      return ConfigLoader.DEFAULT_CONFIG
    }
  }

  getConfig(): GuardConfig {
    return this.config
  }

  isFileWhitelisted(filePath: string): boolean {
    const { patterns, extensions } = this.config.whitelist
    
    // Check extension whitelist
    if (extensions.length > 0) {
      const ext = path.extname(filePath).toLowerCase()
      if (extensions.includes(ext)) {
        return true
      }
    }
    
    // Check pattern whitelist (simple glob matching)
    if (patterns.length > 0) {
      const normalizedPath = path.normalize(filePath)
      for (const pattern of patterns) {
        if (this.matchPattern(normalizedPath, pattern)) {
          return true
        }
      }
    }
    
    return false
  }

  private matchPattern(filePath: string, pattern: string): boolean {
    // Simple glob matching - supports * and **
    const regexPattern = pattern
      .replace(/[.+^${}()|[\]\\]/g, '\\$&') // Escape regex special chars except * and ?
      .replace(/\*\*/g, '___DOUBLE_STAR___') // Temporary placeholder
      .replace(/\*/g, '[^/]*') // Single * matches anything except /
      .replace(/\?/g, '.') // ? matches any single character
      .replace(/___DOUBLE_STAR___/g, '.*') // ** matches anything including /
    
    const regex = new RegExp(`^${regexPattern}$`)
    return regex.test(filePath)
  }

  reloadConfig(): void {
    this.config = this.loadConfig()
  }
}