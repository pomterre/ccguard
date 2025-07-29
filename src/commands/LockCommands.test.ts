import { LockCommand } from './LockCommand'
import { UnlockCommand } from './UnlockCommand'
import { LocksCommand } from './LocksCommand'
import { GuardManager } from '../ccguard/GuardManager'
import { MemoryStorage } from '../storage/MemoryStorage'

describe('Lock Commands', () => {
  let guardManager: GuardManager
  let storage: MemoryStorage

  beforeEach(() => {
    storage = new MemoryStorage()
    guardManager = new GuardManager(storage)
  })

  describe('LockCommand', () => {
    it('should lock a file with @ prefix', async () => {
      const result = await LockCommand.execute(guardManager, ['@src/index.ts'])
      
      expect(result.decision).toBe('block')
      expect(result.reason).toBe('File locked successfully: src/index.ts')
      
      const locked = await guardManager.isFileLocked('src/index.ts')
      expect(locked).toBe(true)
    })

    it('should show usage when no arguments provided', async () => {
      const result = await LockCommand.execute(guardManager, [])
      
      expect(result.decision).toBe('block')
      expect(result.reason).toContain('Usage: ccguard lock @<file-path>')
    })

    it('should require @ prefix', async () => {
      const result = await LockCommand.execute(guardManager, ['src/index.ts'])
      
      expect(result.decision).toBe('block')
      expect(result.reason).toContain('File path must start with @ prefix')
    })

    it('should handle invalid file path', async () => {
      const result = await LockCommand.execute(guardManager, ['@'])
      
      expect(result.decision).toBe('block')
      expect(result.reason).toContain('Invalid file path')
    })

    it('should handle already locked file', async () => {
      await guardManager.lockFile('src/index.ts')
      
      const result = await LockCommand.execute(guardManager, ['@src/index.ts'])
      
      expect(result.decision).toBe('block')
      expect(result.reason).toContain('File is already locked:')
      expect(result.reason).toContain('src/index.ts')
    })
  })

  describe('UnlockCommand', () => {
    it('should unlock a locked file', async () => {
      await guardManager.lockFile('src/index.ts')
      
      const result = await UnlockCommand.execute(guardManager, ['@src/index.ts'])
      
      expect(result.decision).toBe('block')
      expect(result.reason).toBe('File unlocked successfully: src/index.ts')
      
      const locked = await guardManager.isFileLocked('src/index.ts')
      expect(locked).toBe(false)
    })

    it('should show usage when no arguments provided', async () => {
      const result = await UnlockCommand.execute(guardManager, [])
      
      expect(result.decision).toBe('block')
      expect(result.reason).toContain('Usage: ccguard unlock @<file-path>')
    })

    it('should require @ prefix', async () => {
      const result = await UnlockCommand.execute(guardManager, ['src/index.ts'])
      
      expect(result.decision).toBe('block')
      expect(result.reason).toContain('File path must start with @ prefix')
    })

    it('should handle non-locked file', async () => {
      const result = await UnlockCommand.execute(guardManager, ['@src/index.ts'])
      
      expect(result.decision).toBe('block')
      expect(result.reason).toContain('File is not locked:')
      expect(result.reason).toContain('src/index.ts')
    })
  })

  describe('LocksCommand', () => {
    it('should show no files when none are locked', async () => {
      const result = await LocksCommand.execute(guardManager, [])
      
      expect(result.decision).toBe('block')
      expect(result.reason).toBe('No files are currently locked.')
    })

    it('should list all locked files', async () => {
      await guardManager.lockFile('/home/user/src/index.ts')
      await guardManager.lockFile('/home/user/src/utils.ts')
      
      const result = await LocksCommand.execute(guardManager, [])
      
      expect(result.decision).toBe('block')
      expect(result.reason).toContain('Locked Files:')
      expect(result.reason).toContain('/home/user/src/index.ts')
      expect(result.reason).toContain('/home/user/src/utils.ts')
      expect(result.reason).toContain('Total: 2 files locked')
    })

    it('should show correct count for single file', async () => {
      await guardManager.lockFile('/home/user/src/index.ts')
      
      const result = await LocksCommand.execute(guardManager, [])
      
      expect(result.decision).toBe('block')
      expect(result.reason).toContain('Total: 1 file locked')
    })
  })
})