import { Validator } from './validator'
import { MemoryStorage } from '../storage/MemoryStorage'
import { GuardManager } from '../ccguard/GuardManager'
import { Context, EditInput, MultiEditInput, WriteInput } from '../contracts'

describe('Validator - File Locking', () => {
  let validator: Validator
  let storage: MemoryStorage
  let guardManager: GuardManager

  beforeEach(async () => {
    storage = new MemoryStorage()
    validator = new Validator(storage)
    guardManager = new GuardManager(storage)
    
    // Enable CCGuard
    await guardManager.enable()
  })

  describe('Edit operations', () => {
    it('should block edit on locked file', async () => {
      const filePath = '/home/user/project/src/index.ts'
      await guardManager.lockFile(filePath)

      const context: Context = {
        operation: {
          session_id: 'test-session',
          hook_event_name: 'PreToolUse',
          tool_name: 'Edit',
          tool_input: {
            file_path: filePath,
            old_string: 'const old = 1',
            new_string: 'const new = 2',
          } as EditInput,
        },
        guardEnabled: true,
      }

      const result = await validator.validate(context)
      
      expect(result.decision).toBe('block')
      expect(result.reason).toContain('File is locked and cannot be modified')
      expect(result.reason).toContain(filePath)
      expect(result.reason).toContain('ccguard unlock')
    })

    it('should allow edit on unlocked file', async () => {
      const filePath = '/home/user/project/src/index.ts'

      const context: Context = {
        operation: {
          session_id: 'test-session',
          hook_event_name: 'PreToolUse',
          tool_name: 'Edit',
          tool_input: {
            file_path: filePath,
            old_string: 'const old = 1',
            new_string: 'const new = 2',
          } as EditInput,
        },
        guardEnabled: true,
      }

      const result = await validator.validate(context)
      
      expect(result.decision).toBe('approve')
      expect(result.reason).not.toContain('locked')
    })
  })

  describe('MultiEdit operations', () => {
    it('should block multiedit on locked file', async () => {
      const filePath = '/home/user/project/src/utils.ts'
      await guardManager.lockFile(filePath)

      const context: Context = {
        operation: {
          session_id: 'test-session',
          hook_event_name: 'PreToolUse',
          tool_name: 'MultiEdit',
          tool_input: {
            file_path: filePath,
            edits: [
              { old_string: 'old1', new_string: 'new1' },
              { old_string: 'old2', new_string: 'new2' },
            ],
          } as MultiEditInput,
        },
        guardEnabled: true,
      }

      const result = await validator.validate(context)
      
      expect(result.decision).toBe('block')
      expect(result.reason).toContain('File is locked and cannot be modified')
      expect(result.reason).toContain(filePath)
    })
  })

  describe('Write operations', () => {
    it('should block write on locked file', async () => {
      const filePath = '/home/user/project/src/new-file.ts'
      await guardManager.lockFile(filePath)

      const context: Context = {
        operation: {
          session_id: 'test-session',
          hook_event_name: 'PreToolUse',
          tool_name: 'Write',
          tool_input: {
            file_path: filePath,
            content: 'console.log("new file")',
          } as WriteInput,
        },
        guardEnabled: true,
      }

      const result = await validator.validate(context)
      
      expect(result.decision).toBe('block')
      expect(result.reason).toContain('File is locked and cannot be modified')
      expect(result.reason).toContain(filePath)
    })
  })

  describe('File path normalization', () => {
    it('should handle relative paths correctly', async () => {
      const relativePath = 'src/index.ts'
      await guardManager.lockFile(relativePath)

      const context: Context = {
        operation: {
          session_id: 'test-session',
          hook_event_name: 'PreToolUse',
          tool_name: 'Edit',
          tool_input: {
            file_path: relativePath,
            old_string: 'const old = 1',
            new_string: 'const new = 2',
          } as EditInput,
        },
        guardEnabled: true,
      }

      const result = await validator.validate(context)
      
      expect(result.decision).toBe('block')
      expect(result.reason).toContain('File is locked')
    })
  })

  describe('Guard disabled', () => {
    it('should allow modifications when guard is disabled', async () => {
      const filePath = '/home/user/project/src/index.ts'
      await guardManager.lockFile(filePath)
      await guardManager.disable()

      const context: Context = {
        operation: {
          session_id: 'test-session',
          hook_event_name: 'PreToolUse',
          tool_name: 'Edit',
          tool_input: {
            file_path: filePath,
            old_string: 'const old = 1',
            new_string: 'const new = 2',
          } as EditInput,
        },
        guardEnabled: false,
      }

      const result = await validator.validate(context)
      
      expect(result.decision).toBe('approve')
      expect(result.reason).toBe('CCGuard is disabled')
    })
  })
})