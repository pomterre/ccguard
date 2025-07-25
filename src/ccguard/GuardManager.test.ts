import { describe, it, expect, beforeEach } from 'vitest'
import { GuardManager } from './GuardManager'
import { MemoryStorage } from '../storage/MemoryStorage'

describe('GuardManager', () => {
  let storage: MemoryStorage
  let guardManager: GuardManager

  beforeEach(() => {
    storage = new MemoryStorage()
    guardManager = new GuardManager(storage)
  })

  describe('isEnabled', () => {
    it('should default to disabled', async () => {
      const enabled = await guardManager.isEnabled()
      expect(enabled).toBe(false)
    })

    it('should return stored state', async () => {
      await guardManager.disable()
      const enabled = await guardManager.isEnabled()
      expect(enabled).toBe(false)
    })
  })

  describe('enable/disable', () => {
    it('should enable the guard', async () => {
      await guardManager.disable()
      await guardManager.enable()
      const enabled = await guardManager.isEnabled()
      expect(enabled).toBe(true)
    })

    it('should disable the guard', async () => {
      await guardManager.disable()
      const enabled = await guardManager.isEnabled()
      expect(enabled).toBe(false)
    })
  })

  describe('session stats', () => {
    it('should track session statistics', async () => {
      await guardManager.updateSessionStats(5, 3)
      const stats = await guardManager.getSessionStats()
      
      expect(stats).toBeDefined()
      expect(stats?.totalLinesAdded).toBe(5)
      expect(stats?.totalLinesRemoved).toBe(3)
      expect(stats?.netChange).toBe(2)
      expect(stats?.operationCount).toBe(1)
    })

    it('should accumulate statistics', async () => {
      await guardManager.updateSessionStats(5, 3)
      await guardManager.updateSessionStats(2, 7)
      
      const stats = await guardManager.getSessionStats()
      expect(stats?.totalLinesAdded).toBe(7)
      expect(stats?.totalLinesRemoved).toBe(10)
      expect(stats?.netChange).toBe(-3)
      expect(stats?.operationCount).toBe(2)
    })

    it('should reset statistics', async () => {
      await guardManager.updateSessionStats(5, 3)
      await guardManager.resetStats()
      
      const stats = await guardManager.getSessionStats()
      expect(stats?.totalLinesAdded).toBe(0)
      expect(stats?.totalLinesRemoved).toBe(0)
      expect(stats?.netChange).toBe(0)
      expect(stats?.operationCount).toBe(0)
    })
  })
})