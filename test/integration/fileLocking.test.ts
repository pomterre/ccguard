import { processHookData } from '../../src/hooks/processHookData'
import { MemoryStorage } from '../../src/storage/MemoryStorage'
import { GuardManager } from '../../src/ccguard/GuardManager'
import { createValidator } from '../../src/validation/validator'

describe('File Locking Integration', () => {
  let storage: MemoryStorage
  let guardManager: GuardManager

  beforeEach(async () => {
    storage = new MemoryStorage()
    guardManager = new GuardManager(storage)
    await guardManager.enable()
  })

  it('should process lock command via hook data', async () => {
    const hookData = JSON.stringify({
      session_id: 'test-session',
      transcript_path: '/tmp/transcript',
      hook_event_name: 'UserPromptSubmit',
      prompt: 'ccguard lock @src/index.ts',
      cwd: '/home/user/project',
    })

    const result = await processHookData(hookData, { storage })
    
    expect(result.decision).toBe('block')
    expect(result.reason).toContain('File locked successfully: src/index.ts')
    
    // Verify file is actually locked
    const locked = await guardManager.isFileLocked('src/index.ts')
    expect(locked).toBe(true)
  })

  it('should block file modification after locking', async () => {
    // First lock the file
    await guardManager.lockFile('/home/user/project/src/index.ts')

    // Try to edit the locked file
    const hookData = JSON.stringify({
      session_id: 'test-session',
      transcript_path: '/tmp/transcript',
      hook_event_name: 'PreToolUse',
      tool_name: 'Edit',
      tool_input: {
        file_path: '/home/user/project/src/index.ts',
        old_string: 'const x = 1',
        new_string: 'const x = 2',
      },
    })

    const validator = await createValidator(storage)
    const result = await processHookData(hookData, { storage, validator })
    
    expect(result.decision).toBe('block')
    expect(result.reason).toContain('File is locked and cannot be modified')
  })

  it('should process unlock command and allow modifications', async () => {
    // Lock file first
    await guardManager.lockFile('src/utils.ts')

    // Unlock via command
    const unlockData = JSON.stringify({
      session_id: 'test-session',
      transcript_path: '/tmp/transcript',
      hook_event_name: 'UserPromptSubmit',
      prompt: 'ccguard unlock @src/utils.ts',
      cwd: '/home/user/project',
    })

    const unlockResult = await processHookData(unlockData, { storage })
    expect(unlockResult.decision).toBe('block')
    expect(unlockResult.reason).toContain('File unlocked successfully')

    // Now try to edit
    const editData = JSON.stringify({
      session_id: 'test-session',
      transcript_path: '/tmp/transcript',
      hook_event_name: 'PreToolUse',
      tool_name: 'Edit',
      tool_input: {
        file_path: 'src/utils.ts',
        old_string: 'export function util() {}',
        new_string: 'export function util() { return 42; }',
      },
    })

    const validator = await createValidator(storage)
    const editResult = await processHookData(editData, { storage, validator })
    
    expect(editResult.decision).toBe('approve')
    expect(editResult.reason).not.toContain('locked')
  })

  it('should list locked files via command', async () => {
    // Lock multiple files
    await guardManager.lockFile('/home/user/project/src/index.ts')
    await guardManager.lockFile('/home/user/project/src/utils.ts')
    await guardManager.lockFile('/home/user/project/package.json')

    const listData = JSON.stringify({
      session_id: 'test-session',
      transcript_path: '/tmp/transcript',
      hook_event_name: 'UserPromptSubmit',
      prompt: 'ccguard locks',
      cwd: '/home/user/project',
    })

    const result = await processHookData(listData, { storage })
    
    expect(result.decision).toBe('block')
    expect(result.reason).toContain('Locked Files:')
    expect(result.reason).toContain('/home/user/project/src/index.ts')
    expect(result.reason).toContain('/home/user/project/src/utils.ts')
    expect(result.reason).toContain('/home/user/project/package.json')
    expect(result.reason).toContain('Total: 3 files locked')
  })

  it('should handle MultiEdit on locked file', async () => {
    await guardManager.lockFile('/home/user/project/src/app.ts')

    const multiEditData = JSON.stringify({
      session_id: 'test-session',
      transcript_path: '/tmp/transcript',
      hook_event_name: 'PreToolUse',
      tool_name: 'MultiEdit',
      tool_input: {
        file_path: '/home/user/project/src/app.ts',
        edits: [
          { old_string: 'import React', new_string: 'import * as React' },
          { old_string: 'export default App', new_string: 'export { App }' },
        ],
      },
    })

    const validator = await createValidator(storage)
    const result = await processHookData(multiEditData, { storage, validator })
    
    expect(result.decision).toBe('block')
    expect(result.reason).toContain('File is locked and cannot be modified')
    expect(result.reason).toContain('/home/user/project/src/app.ts')
  })

  it('should handle Write on locked file', async () => {
    await guardManager.lockFile('/home/user/project/README.md')

    const writeData = JSON.stringify({
      session_id: 'test-session',
      transcript_path: '/tmp/transcript',
      hook_event_name: 'PreToolUse',
      tool_name: 'Write',
      tool_input: {
        file_path: '/home/user/project/README.md',
        content: '# New README Content',
      },
    })

    const validator = await createValidator(storage)
    const result = await processHookData(writeData, { storage, validator })
    
    expect(result.decision).toBe('block')
    expect(result.reason).toContain('File is locked and cannot be modified')
  })

  it('should persist locked files across sessions', async () => {
    // Lock file in first session
    await guardManager.lockFile('/home/user/project/config.json')

    // Create new GuardManager instance (simulating new session)
    const newGuardManager = new GuardManager(storage)
    
    // Check if file is still locked
    const locked = await newGuardManager.isFileLocked('/home/user/project/config.json')
    expect(locked).toBe(true)

    // Try to edit with new instance
    const editData = JSON.stringify({
      session_id: 'new-session',
      transcript_path: '/tmp/transcript',
      hook_event_name: 'PreToolUse',
      tool_name: 'Edit',
      tool_input: {
        file_path: '/home/user/project/config.json',
        old_string: '{}',
        new_string: '{"version": "1.0.0"}',
      },
    })

    const validator = await createValidator(storage)
    const result = await processHookData(editData, { storage, validator })
    
    expect(result.decision).toBe('block')
    expect(result.reason).toContain('File is locked')
  })
})