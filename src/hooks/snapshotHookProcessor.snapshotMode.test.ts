import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { SnapshotHookProcessor } from './snapshotHookProcessor'
import { MemoryStorage } from '../storage/MemoryStorage'
import { GuardManager } from '../ccguard/GuardManager'
import fs from 'fs'
import path from 'path'
import os from 'os'

describe('SnapshotHookProcessor - Snapshot Mode', () => {
  let tempDir: string
  let storage: MemoryStorage
  let processor: SnapshotHookProcessor
  let guardManager: GuardManager

  beforeEach(async () => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'snapshot-mode-test-'))
    storage = new MemoryStorage()
    
    // Enable guard by default for tests
    await storage.saveGuardState({ enabled: true, lastUpdated: new Date().toISOString() })
    
    // Create a simple project structure
    fs.mkdirSync(path.join(tempDir, '.git'))
    fs.writeFileSync(path.join(tempDir, 'file1.ts'), 'const a = 1\nconst b = 2\n')
    fs.writeFileSync(path.join(tempDir, 'file2.ts'), 'export function test() {\n  return true\n}\n')
    
    // Create config with snapshot strategy
    const config = {
      enforcement: {
        mode: 'session-wide' as const,
        strategy: 'snapshot' as const,
        ignoreEmptyLines: true,
      },
      whitelist: {
        patterns: [],
        extensions: [],
      },
    }
    
    // Mock ConfigLoader
    const configLoader = {
      getConfig: () => config,
      isFileWhitelisted: () => false,
      reloadConfig: () => {},
    } as any
    
    guardManager = new GuardManager(storage, configLoader, tempDir)
    
    processor = new SnapshotHookProcessor({
      storage,
      rootDir: tempDir,
      configLoader,
    })
  })

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true })
  })

  describe('Snapshot baseline management', () => {
    it('should initialize baseline on first snapshot command', async () => {
      const sessionId = 'test-session'
      
      // Take initial snapshot
      const result = await guardManager.takeSnapshot(sessionId)
      
      expect(result.totalLoc).toBe(5) // 2 + 3 lines
      expect(result.fileCount).toBe(2)
      
      // Check baseline is stored
      const baseline = await storage.get(`snapshot:baseline:threshold:${sessionId}`)
      expect(baseline).toBeTruthy()
      expect(baseline.totalLoc).toBe(5)
    })

    it('should update baseline when snapshot command is called again', async () => {
      const sessionId = 'test-session'
      
      // Take initial snapshot
      const result1 = await guardManager.takeSnapshot(sessionId)
      expect(result1.totalLoc).toBe(5)
      
      // Add more code
      fs.writeFileSync(path.join(tempDir, 'file3.ts'), 'const x = 1\nconst y = 2\nconst z = 3\n')
      
      // Take another snapshot - this should update the baseline
      const result2 = await guardManager.takeSnapshot(sessionId)
      expect(result2.totalLoc).toBe(8) // 5 + 3 lines
      
      // Check baseline was updated
      const baseline = await storage.get(`snapshot:baseline:threshold:${sessionId}`)
      expect(baseline.totalLoc).toBe(8)
    })
  })

  describe('PreToolUse in snapshot mode', () => {
    it('should approve immediately without taking snapshots', async () => {
      const hookData = {
        session_id: 'test-session',
        transcript_path: '/tmp/transcript',
        hook_event_name: 'PreToolUse',
        tool_name: 'Edit',
        tool_input: {
          file_path: path.join(tempDir, 'file1.ts'),
          old_string: 'const a = 1',
          new_string: 'const a = 1\nconst c = 3',
        },
      }

      const result = await processor.processHookData(JSON.stringify(hookData))
      
      expect(result.decision).toBe('approve')
      expect(result.reason).toContain('Operation approved - will validate after completion')
      
      // Check that no pre-operation snapshot was stored
      const preData = await storage.get('snapshot:pre:test-session:latest')
      expect(preData).toBeNull()
    })
  })

  describe('PostToolUse in snapshot mode', () => {
    it('should approve changes within baseline threshold', async () => {
      const sessionId = 'test-session'
      
      // Initialize baseline with current state (5 lines)
      await guardManager.takeSnapshot(sessionId)
      
      // Simulate file modification (remove a line)
      fs.writeFileSync(path.join(tempDir, 'file1.ts'), 'const a = 1\n')
      
      // PostToolUse
      const postHookData = {
        session_id: sessionId,
        transcript_path: '/tmp/transcript',
        hook_event_name: 'PostToolUse',
        tool_name: 'Edit',
        tool_input: {
          file_path: path.join(tempDir, 'file1.ts'),
          old_string: 'const a = 1\nconst b = 2',
          new_string: 'const a = 1',
        },
      }
      
      const result = await processor.processHookData(JSON.stringify(postHookData))
      
      expect(result.decision).toBe('approve')
      expect(result.reason).toContain('Operation completed successfully')
      expect(result.reason).toContain('Current LOC: 4 lines')
      expect(result.reason).toContain('threshold: 5 lines')
    })

    it('should reject and revert changes exceeding baseline threshold', async () => {
      const sessionId = 'test-session'
      
      // Initialize baseline with current state (5 lines)
      await guardManager.takeSnapshot(sessionId)
      
      // PreToolUse - capture state before the operation
      const preHookData = {
        session_id: sessionId,
        transcript_path: '/tmp/transcript',
        hook_event_name: 'PreToolUse',
        tool_name: 'Write',
        tool_input: {
          file_path: path.join(tempDir, 'new-file.ts'),
          content: 'line1\nline2\nline3\nline4\n',
        },
      }
      
      let result = await processor.processHookData(JSON.stringify(preHookData))
      expect(result.decision).toBe('approve')
      
      // Simulate adding a new file that exceeds threshold
      fs.writeFileSync(path.join(tempDir, 'new-file.ts'), 'line1\nline2\nline3\nline4\n')
      
      // PostToolUse
      const postHookData = {
        session_id: sessionId,
        transcript_path: '/tmp/transcript',
        hook_event_name: 'PostToolUse',
        tool_name: 'Write',
        tool_input: {
          file_path: path.join(tempDir, 'new-file.ts'),
          content: 'line1\nline2\nline3\nline4\n',
        },
      }
      
      result = await processor.processHookData(JSON.stringify(postHookData))
      
      expect(result.decision).toBe('block')
      expect(result.reason).toContain('Operation reverted: LOC threshold exceeded!')
      expect(result.reason).toContain('Baseline threshold: 5 lines')
      expect(result.reason).toContain('Current LOC: 9 lines')
      expect(result.reason).toContain('Exceeded by: 4 lines')
      
      // File should be removed (reverted)
      expect(fs.existsSync(path.join(tempDir, 'new-file.ts'))).toBe(false)
    })

    it('should handle baseline updates between operations', async () => {
      const sessionId = 'test-session'
      
      // Initial baseline (5 lines)
      await guardManager.takeSnapshot(sessionId)
      
      // Add a file within threshold
      fs.writeFileSync(path.join(tempDir, 'small.ts'), 'const s = 1\n')
      
      // This should be rejected (6 > 5)
      const postHookData = {
        session_id: sessionId,
        transcript_path: '/tmp/transcript',
        hook_event_name: 'PostToolUse',
        tool_name: 'Write',
        tool_input: {
          file_path: path.join(tempDir, 'small.ts'),
          content: 'const s = 1\n',
        },
      }
      
      let result = await processor.processHookData(JSON.stringify(postHookData))
      expect(result.decision).toBe('block')
      
      // Update baseline to new threshold (6 lines)
      fs.writeFileSync(path.join(tempDir, 'small.ts'), 'const s = 1\n')
      await guardManager.takeSnapshot(sessionId)
      
      // Now the same operation should be allowed (6 <= 6)
      result = await processor.processHookData(JSON.stringify(postHookData))
      expect(result.decision).toBe('approve')
      expect(result.reason).toContain('6 lines')
      expect(result.reason).toContain('threshold: 6 lines')
    })

    it('should initialize baseline if not set', async () => {
      const sessionId = 'new-session'
      
      // PostToolUse without baseline should initialize it
      const postHookData = {
        session_id: sessionId,
        transcript_path: '/tmp/transcript',
        hook_event_name: 'PostToolUse',
        tool_name: 'Edit',
        tool_input: {
          file_path: path.join(tempDir, 'file1.ts'),
          old_string: 'const a = 1',
          new_string: 'const a = 1\nconst c = 3',
        },
      }
      
      const result = await processor.processHookData(JSON.stringify(postHookData))
      
      // Should approve since it initializes baseline to current state
      expect(result.decision).toBe('approve')
      
      // Check baseline was created
      const baseline = await storage.get(`snapshot:baseline:threshold:${sessionId}`)
      expect(baseline).toBeTruthy()
      expect(baseline.totalLoc).toBe(5)
    })
  })
})