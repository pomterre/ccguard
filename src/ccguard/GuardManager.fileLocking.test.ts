import { GuardManager } from './GuardManager'
import { MemoryStorage } from '../storage/MemoryStorage'
import * as path from 'path'

describe('GuardManager - File Locking', () => {
  let guardManager: GuardManager
  let storage: MemoryStorage

  beforeEach(() => {
    storage = new MemoryStorage()
    guardManager = new GuardManager(storage)
  })

  describe('lockFile', () => {
    it('should lock a file with absolute path', async () => {
      const filePath = '/home/user/project/src/index.ts'
      
      await guardManager.lockFile(filePath)
      
      const locked = await guardManager.isFileLocked(filePath)
      expect(locked).toBe(true)
    })

    it('should lock a file with relative path', async () => {
      const filePath = 'src/index.ts'
      const absolutePath = path.resolve(process.cwd(), filePath)
      
      await guardManager.lockFile(filePath)
      
      const locked = await guardManager.isFileLocked(absolutePath)
      expect(locked).toBe(true)
    })

    it('should throw error when locking already locked file', async () => {
      const filePath = '/home/user/project/src/index.ts'
      
      await guardManager.lockFile(filePath)
      
      await expect(guardManager.lockFile(filePath)).rejects.toThrow(
        'File is already locked: /home/user/project/src/index.ts'
      )
    })

    it('should handle multiple locked files', async () => {
      const file1 = '/home/user/project/src/index.ts'
      const file2 = '/home/user/project/src/utils.ts'
      
      await guardManager.lockFile(file1)
      await guardManager.lockFile(file2)
      
      const locked1 = await guardManager.isFileLocked(file1)
      const locked2 = await guardManager.isFileLocked(file2)
      
      expect(locked1).toBe(true)
      expect(locked2).toBe(true)
    })
  })

  describe('unlockFile', () => {
    it('should unlock a locked file', async () => {
      const filePath = '/home/user/project/src/index.ts'
      
      await guardManager.lockFile(filePath)
      await guardManager.unlockFile(filePath)
      
      const locked = await guardManager.isFileLocked(filePath)
      expect(locked).toBe(false)
    })

    it('should throw error when unlocking non-locked file', async () => {
      const filePath = '/home/user/project/src/index.ts'
      
      await expect(guardManager.unlockFile(filePath)).rejects.toThrow(
        'File is not locked: /home/user/project/src/index.ts'
      )
    })

    it('should handle relative paths correctly', async () => {
      const relativePath = 'src/index.ts'
      const absolutePath = path.resolve(process.cwd(), relativePath)
      
      await guardManager.lockFile(relativePath)
      await guardManager.unlockFile(relativePath)
      
      const locked = await guardManager.isFileLocked(absolutePath)
      expect(locked).toBe(false)
    })
  })

  describe('isFileLocked', () => {
    it('should return false for unlocked file', async () => {
      const filePath = '/home/user/project/src/index.ts'
      
      const locked = await guardManager.isFileLocked(filePath)
      expect(locked).toBe(false)
    })

    it('should return true for locked file', async () => {
      const filePath = '/home/user/project/src/index.ts'
      
      await guardManager.lockFile(filePath)
      
      const locked = await guardManager.isFileLocked(filePath)
      expect(locked).toBe(true)
    })

    it('should handle relative paths', async () => {
      const relativePath = 'src/index.ts'
      
      await guardManager.lockFile(relativePath)
      
      const locked = await guardManager.isFileLocked(relativePath)
      expect(locked).toBe(true)
    })
  })

  describe('getLockedFiles', () => {
    it('should return empty array when no files are locked', async () => {
      const files = await guardManager.getLockedFiles()
      expect(files).toEqual([])
    })

    it('should return all locked files', async () => {
      const file1 = '/home/user/project/src/index.ts'
      const file2 = '/home/user/project/src/utils.ts'
      
      await guardManager.lockFile(file1)
      await guardManager.lockFile(file2)
      
      const files = await guardManager.getLockedFiles()
      expect(files).toHaveLength(2)
      expect(files).toContain(file1)
      expect(files).toContain(file2)
    })

    it('should update list after unlock', async () => {
      const file1 = '/home/user/project/src/index.ts'
      const file2 = '/home/user/project/src/utils.ts'
      
      await guardManager.lockFile(file1)
      await guardManager.lockFile(file2)
      await guardManager.unlockFile(file1)
      
      const files = await guardManager.getLockedFiles()
      expect(files).toHaveLength(1)
      expect(files).toContain(file2)
      expect(files).not.toContain(file1)
    })
  })

  describe('persistence', () => {
    it('should persist locked files across GuardManager instances', async () => {
      const filePath = '/home/user/project/src/index.ts'
      
      // Lock file with first instance
      await guardManager.lockFile(filePath)
      
      // Create new instance with same storage
      const newGuardManager = new GuardManager(storage)
      
      // Check if file is still locked
      const locked = await newGuardManager.isFileLocked(filePath)
      expect(locked).toBe(true)
    })
  })
})