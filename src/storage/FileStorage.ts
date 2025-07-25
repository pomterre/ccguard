import { promises as fs } from 'fs'
import path from 'path'
import os from 'os'
import { Storage } from './Storage'
import { SessionStats, GuardState, SessionStatsSchema, GuardStateSchema } from '../contracts'

export class FileStorage implements Storage {
  private dataDir: string
  private sessionStatsFile: string
  private guardStateFile: string

  constructor(sessionId?: string) {
    // Use session-specific directory if sessionId provided
    const baseDir = path.join(os.homedir(), '.ccguard')
    this.dataDir = sessionId ? path.join(baseDir, sessionId) : baseDir
    
    this.sessionStatsFile = path.join(this.dataDir, 'session-stats.json')
    this.guardStateFile = path.join(this.dataDir, 'ccguard-state.json')
  }

  async ensureDir(): Promise<void> {
    await fs.mkdir(this.dataDir, { recursive: true })
  }

  async getSessionStats(): Promise<SessionStats | null> {
    try {
      const data = await fs.readFile(this.sessionStatsFile, 'utf8')
      const parsed = JSON.parse(data)
      return SessionStatsSchema.parse(parsed)
    } catch {
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
    } catch {
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
    } catch {
      // Ignore errors
    }
  }

  async get(key: string): Promise<any> {
    try {
      const fileName = `${key.replace(/[^a-zA-Z0-9-_:]/g, '_')}.json`
      const filePath = path.join(this.dataDir, fileName)
      const data = await fs.readFile(filePath, 'utf8')
      return JSON.parse(data)
    } catch {
      return null
    }
  }

  async set(key: string, value: any): Promise<void> {
    await this.ensureDir()
    const fileName = `${key.replace(/[^a-zA-Z0-9-_:]/g, '_')}.json`
    const filePath = path.join(this.dataDir, fileName)
    await fs.writeFile(
      filePath,
      JSON.stringify(value, null, 2),
      'utf8'
    )
  }
}