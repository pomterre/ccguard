import { promises as fs } from 'fs'
import path from 'path'
import os from 'os'
import { z } from 'zod'
import { Storage } from './Storage'
import { SessionStats, GuardState, SessionStatsSchema, GuardStateSchema } from '../contracts'

const locks = new Map<string, Promise<void>>()
const cache = new Map<string, { data: unknown, timestamp: number }>()
const CACHE_TTL = 60000 // 1 minute TTL

export class FileStorage implements Storage {
  private dataDir: string
  private sessionStatsFile: string
  private guardStateFile: string

  constructor(sessionId?: string) {
    const baseDir = path.join(os.homedir(), '.ccguard')
    // Sanitize sessionId: only alphanumeric, dash, underscore; max 64 chars
    const safeId = sessionId?.replace(/[^a-zA-Z0-9-_]/g, '_').slice(0, 64)
    this.dataDir = safeId ? path.join(baseDir, safeId) : baseDir
    this.sessionStatsFile = path.join(this.dataDir, 'session-stats.json')
    this.guardStateFile = path.join(this.dataDir, 'ccguard-state.json')
  }

  async ensureDir(): Promise<void> {
    await fs.mkdir(this.dataDir, { recursive: true })
  }

  private async withLock<T>(file: string, op: () => Promise<T>): Promise<T> {
    const current = locks.get(file)
    const task = (async () => {
      if (current) await current.catch(() => {})
      return op()
    })()
    locks.set(file, task.then(() => {}, () => {}))
    return task
  }

  private async readJSON<T>(file: string, schema: z.ZodType<T>): Promise<T | null> {
    const cached = cache.get(file)
    if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
      return schema.parse(cached.data)
    }
    return this.withLock(file, async () => {
      try {
        const data = schema.parse(JSON.parse(await fs.readFile(file, 'utf8')))
        cache.set(file, { data, timestamp: Date.now() })
        return data
      } catch { return null }
    })
  }

  private async writeJSON(file: string, data: SessionStats | GuardState): Promise<void> {
    cache.set(file, { data, timestamp: Date.now() })
    return this.withLock(file, async () => {
      await this.ensureDir()
      await fs.writeFile(file, JSON.stringify(data, null, 2), 'utf8')
    })
  }

  async getSessionStats() { return this.readJSON<SessionStats>(this.sessionStatsFile, SessionStatsSchema) }
  async saveSessionStats(stats: SessionStats) { await this.writeJSON(this.sessionStatsFile, stats) }
  async getGuardState() { return this.readJSON<GuardState>(this.guardStateFile, GuardStateSchema) }
  async saveGuardState(state: GuardState) { await this.writeJSON(this.guardStateFile, state) }

  async clearAll(): Promise<void> {
    cache.clear()
    try {
      await fs.rm(this.dataDir, { recursive: true, force: true })
    } catch {
      // Ignore errors during cleanup
    }
  }
}