import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { SnapshotHookProcessor } from './snapshotHookProcessor'
import { MemoryStorage } from '../storage/MemoryStorage'
import { ConfigLoader } from '../config/ConfigLoader'
import fs from 'fs'
import path from 'path'
import os from 'os'

describe('SnapshotHookProcessor', () => {
  let tempDir: string
  let storage: MemoryStorage
  let processor: SnapshotHookProcessor

  beforeEach(async () => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'snapshot-processor-test-'))
    storage = new MemoryStorage()
    
    // Enable guard by default for tests
    await storage.saveGuardState({ enabled: true, lastUpdated: new Date().toISOString() })
    
    // Create a simple git repo structure
    fs.mkdirSync(path.join(tempDir, '.git'))
    fs.writeFileSync(path.join(tempDir, 'existing.ts'), 'const x = 1\nconst y = 2')
    
    // Create config with cumulative strategy for these tests
    const config = {
      enforcement: {
        mode: 'session-wide' as const,
        strategy: 'cumulative' as const,
        ignoreEmptyLines: true,
      },
      whitelist: {
        patterns: [],
        extensions: [],
      },
      thresholds: {
        allowedPositiveLines: 5, // Allow up to 5 lines increase
      },
    }
    
    // Mock ConfigLoader
    const configLoader = {
      getConfig: () => config,
      isFileWhitelisted: () => false,
      reloadConfig: () => {},
    } as any
    
    processor = new SnapshotHookProcessor({
      storage,
      rootDir: tempDir,
      configLoader,
    })
  })

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true })
  })

  it('should approve PreToolUse and take snapshot', async () => {
    const hookData = {
      session_id: 'test-session',
      transcript_path: '/tmp/transcript',
      hook_event_name: 'PreToolUse',
      tool_name: 'Edit',
      tool_input: {
        file_path: path.join(tempDir, 'existing.ts'),
        old_string: 'const x = 1',
        new_string: 'const x = 1\nconst z = 3',
      },
    }

    const result = await processor.processHookData(JSON.stringify(hookData))
    
    console.log('PreToolUse result:', result)
    expect(result.decision).toBe('approve')
    expect(result.reason).toContain('will validate after completion')
    
    // Check that snapshot was stored
    const preData = await storage.get('snapshot:pre:test-session:latest')
    expect(preData).toBeTruthy()
  })

  it('should validate PostToolUse within threshold', async () => {
    const sessionId = 'test-session-2'
    
    // Simulate PreToolUse
    const preHookData = {
      session_id: sessionId,
      transcript_path: '/tmp/transcript',
      hook_event_name: 'PreToolUse',
      tool_name: 'Edit',
      tool_input: {
        file_path: path.join(tempDir, 'existing.ts'),
        old_string: 'const y = 2',
        new_string: 'const y = 2\nconst z = 3\nconst w = 4',
      },
    }
    
    await processor.processHookData(JSON.stringify(preHookData))
    
    // Simulate the file change (normally done by Claude)
    fs.writeFileSync(
      path.join(tempDir, 'existing.ts'),
      'const x = 1\nconst y = 2\nconst z = 3\nconst w = 4'
    )
    
    // PostToolUse
    const postHookData = {
      ...preHookData,
      hook_event_name: 'PostToolUse',
    }
    
    const result = await processor.processHookData(JSON.stringify(postHookData))
    
    expect(result.decision).toBe('approve')
    expect(result.reason).toContain('Operation completed successfully')
    expect(result.reason).toContain('+2 lines') // Added 2 lines
  })

  it('should block and revert PostToolUse exceeding threshold', async () => {
    const sessionId = 'test-session-3'
    
    // Simulate PreToolUse
    const preHookData = {
      session_id: sessionId,
      transcript_path: '/tmp/transcript',
      hook_event_name: 'PreToolUse',
      tool_name: 'Write',
      tool_input: {
        file_path: path.join(tempDir, 'new-file.ts'),
        content: 'line1\nline2\nline3\nline4\nline5\nline6\nline7\nline8',
      },
    }
    
    await processor.processHookData(JSON.stringify(preHookData))
    
    // Simulate the file creation (normally done by Claude)
    fs.writeFileSync(
      path.join(tempDir, 'new-file.ts'),
      'line1\nline2\nline3\nline4\nline5\nline6\nline7\nline8'
    )
    
    // PostToolUse
    const postHookData = {
      ...preHookData,
      hook_event_name: 'PostToolUse',
    }
    
    const result = await processor.processHookData(JSON.stringify(postHookData))
    
    expect(result.decision).toBe('block')
    expect(result.reason).toContain('LOC threshold exceeded')
    expect(result.reason).toContain('reverted')
    
    // File should be removed (reverted)
    expect(fs.existsSync(path.join(tempDir, 'new-file.ts'))).toBe(false)
  })

  it('should handle disabled guard', async () => {
    // Disable guard
    await storage.saveGuardState({ enabled: false, lastUpdated: new Date().toISOString() })
    
    const hookData = {
      session_id: 'test-session',
      transcript_path: '/tmp/transcript',
      hook_event_name: 'PreToolUse',
      tool_name: 'Edit',
      tool_input: {
        file_path: '/some/file.ts',
        old_string: 'old',
        new_string: 'new',
      },
    }

    const result = await processor.processHookData(JSON.stringify(hookData))
    
    expect(result.decision).toBe('approve')
    expect(result.reason).toContain('CCGuard is disabled')
  })

  it('should handle user commands', async () => {
    const commandData = {
      session_id: 'test-session',
      transcript_path: '/tmp/transcript',
      hook_event_name: 'UserPromptSubmit',
      prompt: 'ccguard status',
      cwd: tempDir,
    }

    const result = await processor.processHookData(JSON.stringify(commandData))
    
    expect(result.decision).toBe('block')
    expect(result.reason).toContain('CCGuard is')
  })

  it('should revert changes even when affectedFiles is empty (e.g. Bash commands)', async () => {
    const sessionId = 'test-session-bash'
    
    // Simulate PreToolUse for a Bash command that creates files
    const preHookData = {
      session_id: sessionId,
      transcript_path: '/tmp/transcript',
      hook_event_name: 'PreToolUse',
      tool_name: 'Bash',
      tool_input: {
        command: 'echo "many lines here" > large-file.txt',
      },
    }
    
    await processor.processHookData(JSON.stringify(preHookData))
    
    // Simulate the file creation that would happen from the Bash command
    const largeContent = Array(10).fill('line content').join('\n')
    fs.writeFileSync(path.join(tempDir, 'large-file.txt'), largeContent)
    
    // PostToolUse - this should detect the new file and revert it
    const postHookData = {
      ...preHookData,
      hook_event_name: 'PostToolUse',
    }
    
    const result = await processor.processHookData(JSON.stringify(postHookData))
    
    expect(result.decision).toBe('block')
    expect(result.reason).toContain('LOC threshold exceeded')
    expect(result.reason).toContain('reverted')
    
    // File should be removed (reverted) even though affectedFiles was empty
    expect(fs.existsSync(path.join(tempDir, 'large-file.txt'))).toBe(false)
  })
})