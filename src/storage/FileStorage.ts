import { promises as fs } from 'fs'
import path from 'path'
import os from 'os'
import { appendFileSync, mkdirSync } from 'fs'
import { Storage } from './Storage'
import { 
  SessionStats, 
  GuardState, 
  HotConfig,
  OperationHistory,
  SessionStatsSchema, 
  GuardStateSchema,
  HotConfigSchema,
  OperationHistorySchema
} from '../contracts'

// Debug logging - only enabled when CCGUARD_DEBUG environment variable is set
const DEBUG = process.env.CCGUARD_DEBUG === 'true' || process.env.CCGUARD_DEBUG === '1'
const debugLog = (message: any) => {
  if (!DEBUG) return
  
  const ccguardDir = path.join(os.homedir(), '.ccguard')
  const logPath = path.join(ccguardDir, 'debug.log')
  
  // Ensure directory exists
  mkdirSync(ccguardDir, { recursive: true })
  
  appendFileSync(logPath, `${new Date().toISOString()} - ${JSON.stringify(message)}\n`)
}

export class FileStorage implements Storage {
  private dataDir: string
  private sessionStatsFile: string
  private guardStateFile: string
  private hotConfigFile: string
  private operationHistoryFile: string
  
  // Whitelist pattern for valid storage keys
  private static readonly VALID_KEY_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9-_:]*$/
  private static readonly MAX_KEY_LENGTH = 255

  constructor(sessionId?: string) {
    // Use session-specific directory if sessionId provided
    const baseDir = path.join(os.homedir(), '.ccguard')
    this.dataDir = sessionId ? path.join(baseDir, sessionId) : baseDir
    
    this.sessionStatsFile = path.join(this.dataDir, 'session-stats.json')
    this.guardStateFile = path.join(this.dataDir, 'ccguard-state.json')
    this.hotConfigFile = path.join(this.dataDir, 'hot-config.json')
    this.operationHistoryFile = path.join(this.dataDir, 'operation-history.json')
  }

  async ensureDir(): Promise<void> {
    await fs.mkdir(this.dataDir, { recursive: true })
  }

  async getSessionStats(): Promise<SessionStats | null> {
    try {
      const data = await fs.readFile(this.sessionStatsFile, 'utf8')
      const parsed = JSON.parse(data)
      return SessionStatsSchema.parse(parsed)
    } catch (error) {
      if (DEBUG) {
        debugLog({ 
          event: 'storage_error', 
          method: 'getSessionStats',
          file: this.sessionStatsFile,
          error: error instanceof Error ? error.message : String(error) 
        })
      }
      return null
    }
  }

  async saveSessionStats(stats: SessionStats): Promise<void> {
    await this.ensureDir()
    await fs.writeFile(
      this.sessionStatsFile,
      JSON.stringify(stats, null, 2),
      'utf8'
    )
  }

  async getGuardState(): Promise<GuardState | null> {
    try {
      const data = await fs.readFile(this.guardStateFile, 'utf8')
      const parsed = JSON.parse(data)
      return GuardStateSchema.parse(parsed)
    } catch (error) {
      if (DEBUG) {
        debugLog({ 
          event: 'storage_error', 
          method: 'getGuardState',
          file: this.guardStateFile,
          error: error instanceof Error ? error.message : String(error) 
        })
      }
      return null
    }
  }

  async saveGuardState(state: GuardState): Promise<void> {
    await this.ensureDir()
    await fs.writeFile(
      this.guardStateFile,
      JSON.stringify(state, null, 2),
      'utf8'
    )
  }

  async clearAll(): Promise<void> {
    try {
      await fs.rm(this.dataDir, { recursive: true, force: true })
    } catch (error) {
      if (DEBUG) {
        debugLog({ 
          event: 'storage_error', 
          method: 'clearAll',
          directory: this.dataDir,
          error: error instanceof Error ? error.message : String(error) 
        })
      }
      // Ignore errors
    }
  }

  async getHotConfig(): Promise<HotConfig | null> {
    try {
      const data = await fs.readFile(this.hotConfigFile, 'utf8')
      const parsed = JSON.parse(data)
      return HotConfigSchema.parse(parsed)
    } catch (error) {
      if (DEBUG) {
        debugLog({ 
          event: 'storage_error', 
          method: 'getHotConfig',
          file: this.hotConfigFile,
          error: error instanceof Error ? error.message : String(error) 
        })
      }
      return null
    }
  }

  async saveHotConfig(config: HotConfig): Promise<void> {
    await this.ensureDir()
    await fs.writeFile(
      this.hotConfigFile,
      JSON.stringify(config, null, 2),
      'utf8'
    )
  }

  async getOperationHistory(): Promise<OperationHistory | null> {
    try {
      const data = await fs.readFile(this.operationHistoryFile, 'utf8')
      const parsed = JSON.parse(data)
      return OperationHistorySchema.parse(parsed)
    } catch (error) {
      if (DEBUG) {
        debugLog({ 
          event: 'storage_error', 
          method: 'getOperationHistory',
          file: this.operationHistoryFile,
          error: error instanceof Error ? error.message : String(error) 
        })
      }
      return null
    }
  }

  async saveOperationHistory(history: OperationHistory): Promise<void> {
    await this.ensureDir()
    await fs.writeFile(
      this.operationHistoryFile,
      JSON.stringify(history, null, 2),
      'utf8'
    )
  }

  async get(key: string): Promise<any> {
    try {
      const sanitizedKey = this.sanitizeKey(key)
      const fileName = `${sanitizedKey}.json`
      const filePath = path.join(this.dataDir, fileName)
      const data = await fs.readFile(filePath, 'utf8')
      return JSON.parse(data)
    } catch (error) {
      if (DEBUG) {
        debugLog({ 
          event: 'storage_error', 
          method: 'get',
          key: key,
          error: error instanceof Error ? error.message : String(error) 
        })
      }
      return null
    }
  }

  async set(key: string, value: any): Promise<void> {
    await this.ensureDir()
    const sanitizedKey = this.sanitizeKey(key)
    const fileName = `${sanitizedKey}.json`
    const filePath = path.join(this.dataDir, fileName)
    await fs.writeFile(
      filePath,
      JSON.stringify(value, null, 2),
      'utf8'
    )
  }

  async delete(key: string): Promise<void> {
    try {
      const sanitizedKey = this.sanitizeKey(key)
      const fileName = `${sanitizedKey}.json`
      const filePath = path.join(this.dataDir, fileName)
      await fs.unlink(filePath)
    } catch (error) {
      if (DEBUG) {
        debugLog({ 
          event: 'storage_error', 
          method: 'delete',
          key: key,
          error: error instanceof Error ? error.message : String(error) 
        })
      }
      // Ignore errors if file doesn't exist
    }
  }
  
  /**
   * Sanitize storage key to prevent path injection attacks
   * Uses a whitelist approach for maximum security
   */
  private sanitizeKey(key: string): string {
    // Validate key length
    if (key.length > FileStorage.MAX_KEY_LENGTH) {
      throw new Error(`Storage key too long: ${key.length} characters (max: ${FileStorage.MAX_KEY_LENGTH})`)
    }
    
    // Validate key format
    if (!FileStorage.VALID_KEY_PATTERN.test(key)) {
      // If key doesn't match pattern, create a safe version
      const safeKey = key.replace(/[^a-zA-Z0-9-_:]/g, '_').replace(/^[^a-zA-Z0-9]/, 'k')
      
      if (DEBUG) {
        debugLog({
          event: 'key_sanitized',
          originalKey: key,
          sanitizedKey: safeKey
        })
      }
      
      return safeKey
    }
    
    return key
  }
}