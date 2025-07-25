import { describe, it, expect, beforeEach } from 'vitest'
import { SnapshotManager } from './SnapshotManager'
import { MemoryStorage } from '../storage/MemoryStorage'
import { FileSnapshot, ProjectSnapshot } from './types'

describe('SnapshotManager', () => {
  let storage: MemoryStorage
  let snapshotManager: SnapshotManager

  beforeEach(() => {
    storage = new MemoryStorage()
    snapshotManager = new SnapshotManager('/test/project', storage)
  })

  describe('Map serialization', () => {
    it('should correctly serialize and deserialize snapshots with Maps', async () => {
      const sessionId = 'test-session'
      
      // Create a mock baseline snapshot with a Map
      const mockFiles = new Map<string, FileSnapshot>([
        ['/test/file1.ts', {
          path: '/test/file1.ts',
          locCount: 100,
          hash: 'hash1',
          lastModified: Date.now(),
        }],
        ['/test/file2.ts', {
          path: '/test/file2.ts',
          locCount: 200,
          hash: 'hash2',
          lastModified: Date.now(),
        }],
      ])

      const mockSnapshot: ProjectSnapshot = {
        id: 'test-id',
        sessionId,
        timestamp: new Date().toISOString(),
        files: mockFiles,
        totalLoc: 300,
        isBaseline: true,
      }

      // Directly save the snapshot using the storage
      await storage.set(`snapshot:baseline:${sessionId}`, {
        ...mockSnapshot,
        files: Object.fromEntries(mockSnapshot.files),
      })

      // Now load it through SnapshotManager
      const loadedSnapshot = await snapshotManager.getBaseline(sessionId)

      // Verify the loaded snapshot has the correct structure
      expect(loadedSnapshot.files).toBeInstanceOf(Map)
      expect(loadedSnapshot.files.size).toBe(2)
      expect(loadedSnapshot.files.get('/test/file1.ts')).toEqual({
        path: '/test/file1.ts',
        locCount: 100,
        hash: 'hash1',
        lastModified: expect.any(Number),
      })
      expect(loadedSnapshot.files.get('/test/file2.ts')).toEqual({
        path: '/test/file2.ts',
        locCount: 200,
        hash: 'hash2',
        lastModified: expect.any(Number),
      })
      expect(loadedSnapshot.totalLoc).toBe(300)
    })

    it('should persist Maps correctly when initializing baseline', async () => {
      const sessionId = 'test-session-2'
      
      // Mock the fileScanner to return specific files
      const mockFiles = new Map<string, FileSnapshot>([
        ['/test/app.ts', {
          path: '/test/app.ts',
          locCount: 50,
          hash: 'app-hash',
          lastModified: Date.now(),
        }],
      ])

      // Override the fileScanner's scanProject method
      ;(snapshotManager as any).fileScanner.scanProject = async () => mockFiles

      // Initialize baseline
      const baseline = await snapshotManager.initializeBaseline(sessionId)
      
      // Create a new instance to simulate loading from disk
      const newSnapshotManager = new SnapshotManager('/test/project', storage)
      const loadedBaseline = await newSnapshotManager.getBaseline(sessionId)

      // Verify the loaded baseline matches what was saved
      expect(loadedBaseline.files).toBeInstanceOf(Map)
      expect(loadedBaseline.files.size).toBe(1)
      expect(loadedBaseline.files.get('/test/app.ts')).toEqual({
        path: '/test/app.ts',
        locCount: 50,
        hash: 'app-hash',
        lastModified: expect.any(Number),
      })
      expect(loadedBaseline.totalLoc).toBe(50)
      expect(loadedBaseline.sessionId).toBe(sessionId)
      expect(loadedBaseline.isBaseline).toBe(true)
    })

    it('should handle empty Maps correctly', async () => {
      const sessionId = 'test-session-empty'
      
      // Mock empty project
      ;(snapshotManager as any).fileScanner.scanProject = async () => new Map()

      // Initialize baseline with empty Map
      const baseline = await snapshotManager.initializeBaseline(sessionId)
      
      // Load from storage
      const loadedBaseline = await snapshotManager.getBaseline(sessionId)

      // Verify empty Map is preserved
      expect(loadedBaseline.files).toBeInstanceOf(Map)
      expect(loadedBaseline.files.size).toBe(0)
      expect(loadedBaseline.totalLoc).toBe(0)
    })
  })
})