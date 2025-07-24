import { describe, it, expect, beforeEach } from 'vitest'
import { MemoryStorage } from '../../src/storage/MemoryStorage'
import { processHookData } from '../../src/hooks/processHookData'
import { createValidator } from '../../src/validation/validator'
import { ConfigLoader } from '../../src/config/ConfigLoader'
import { GuardConfig } from '../../src/contracts'

// Mock ConfigLoader for tests with zero threshold
class TestConfigLoader extends ConfigLoader {
  getConfig(): GuardConfig {
    return {
      enforcement: {
        mode: 'session-wide',
        ignoreEmptyLines: true,
      },
      whitelist: {
        patterns: [],
        extensions: [],
      },
      thresholds: {
        allowedPositiveLines: 0, // Original behavior: no positive lines allowed
      },
    }
  }
  
  isFileWhitelisted(): boolean {
    return false
  }
}

describe('ccguard integration', () => {
  let storage: MemoryStorage

  beforeEach(() => {
    storage = new MemoryStorage()
  })

  describe('Edit operations', () => {
    it('should block net positive changes', async () => {
      const hookData = {
        session_id: 'test-session',
        transcript_path: '/tmp/test',
        hook_event_name: 'PreToolUse',
        tool_name: 'Edit',
        tool_input: {
          file_path: 'test.ts',
          old_string: 'const x = 1',
          new_string: `const x = 1
const y = 2
const z = 3
const a = 4`
        }
      }

      const configLoader = new TestConfigLoader()
      const result = await processHookData(JSON.stringify(hookData), {
        storage,
        validator: await createValidator(storage, configLoader),
        configLoader
      })

      expect(result.decision).toBe('block')
      expect(result.reason).toContain('Net positive LOC change detected')
      expect(result.reason).toContain('Add 4 lines')
      expect(result.reason).toContain('Remove 1 lines')
    })

    it('should approve net negative changes', async () => {
      const hookData = {
        session_id: 'test-session',
        transcript_path: '/tmp/test',
        hook_event_name: 'PreToolUse',
        tool_name: 'Edit',
        tool_input: {
          file_path: 'test.ts',
          old_string: `function verbose() {
  const a = 1
  const b = 2
  const c = 3
  return a + b + c
}`,
          new_string: 'const sum = () => 6'
        }
      }

      const configLoader = new TestConfigLoader()
      const result = await processHookData(JSON.stringify(hookData), {
        storage,
        validator: await createValidator(storage, configLoader),
        configLoader
      })

      expect(result.decision).toBe('approve')
      expect(result.reason).toContain('approved')
    })
  })

  describe('MultiEdit operations', () => {
    it('should calculate cumulative changes correctly', async () => {
      const hookData = {
        session_id: 'test-session',
        transcript_path: '/tmp/test',
        hook_event_name: 'PreToolUse',
        tool_name: 'MultiEdit',
        tool_input: {
          file_path: 'test.ts',
          edits: [
            {
              old_string: `const a = 1
const b = 2`,
              new_string: 'const ab = 3'
            },
            {
              old_string: `function foo() {
  return 'bar'
}`,
              new_string: 'const foo = () => "bar"'
            }
          ]
        }
      }

      const configLoader = new TestConfigLoader()
      const result = await processHookData(JSON.stringify(hookData), {
        storage,
        validator: await createValidator(storage, configLoader),
        configLoader
      })

      expect(result.decision).toBe('approve')
    })
  })

  describe('Write operations', () => {
    it('should block new file creation', async () => {
      const hookData = {
        session_id: 'test-session',
        transcript_path: '/tmp/test',
        hook_event_name: 'PreToolUse',
        tool_name: 'Write',
        tool_input: {
          file_path: 'new-file.ts',
          content: `export function newFunction() {
  return 'hello'
}`
        }
      }

      const configLoader = new TestConfigLoader()
      const result = await processHookData(JSON.stringify(hookData), {
        storage,
        validator: await createValidator(storage, configLoader),
        configLoader
      })

      expect(result.decision).toBe('block')
      expect(result.reason).toContain('Add 3 lines')
      expect(result.reason).toContain('Remove 0 lines')
    })
  })

  describe('User commands', () => {
    it('should handle on/off commands', async () => {
      const onCommand = {
        session_id: 'test-session',
        transcript_path: '/tmp/test',
        hook_event_name: 'UserPromptSubmit',
        prompt: 'ccguard off',
        cwd: '/tmp'
      }

      const configLoader = new TestConfigLoader()
      const result = await processHookData(JSON.stringify(onCommand), {
        storage,
        validator: await createValidator(storage, configLoader),
        configLoader
      })

      expect(result.decision).toBe('block')
      expect(result.reason).toContain('DISABLED')
    })

    it('should show status', async () => {
      const statusCommand = {
        session_id: 'test-session',
        transcript_path: '/tmp/test',
        hook_event_name: 'UserPromptSubmit',
        prompt: 'ccguard status',
        cwd: '/tmp'
      }

      const result = await processHookData(JSON.stringify(statusCommand), {
        storage,
        validator: await createValidator(storage)
      })

      expect(result.decision).toBe('block')
      expect(result.reason).toContain('ENABLED')
    })

    it('should show version', async () => {
      const versionCommand = {
        session_id: 'test-session',
        transcript_path: '/tmp/test',
        hook_event_name: 'UserPromptSubmit',
        prompt: 'ccguard version',
        cwd: '/tmp'
      }

      const result = await processHookData(JSON.stringify(versionCommand), {
        storage,
        validator: await createValidator(storage)
      })

      expect(result.decision).toBe('block')
      expect(result.reason).toMatch(/CCGuard v\d+\.\d+\.\d+/)
    })

    it('should show status', async () => {
      const statusCommand = {
        session_id: 'test-session',
        transcript_path: '/tmp/test',
        hook_event_name: 'UserPromptSubmit',
        prompt: 'ccguard status',
        cwd: '/tmp'
      }

      const result = await processHookData(JSON.stringify(statusCommand), {
        storage,
        validator: await createValidator(storage)
      })

      expect(result.decision).toBe('block')
      expect(result.reason).toMatch(/CCGuard is (ENABLED|DISABLED)/)
      expect(result.reason).toMatch(/Session Statistics:|No operations tracked yet/)
    })
  })

  describe('Session tracking', () => {
    it('should track cumulative changes across operations', async () => {
      const configLoader = new TestConfigLoader()
      const validator = await createValidator(storage, configLoader)
      
      // First operation: -2 lines
      await processHookData(JSON.stringify({
        session_id: 'test-session',
        transcript_path: '/tmp/test',
        hook_event_name: 'PreToolUse',
        tool_name: 'Edit',
        tool_input: {
          file_path: 'test.ts',
          old_string: `line1
line2
line3`,
          new_string: 'combined'
        }
      }), { storage, validator, configLoader })

      // Second operation: +1 line (total -1)
      const result = await processHookData(JSON.stringify({
        session_id: 'test-session',
        transcript_path: '/tmp/test',
        hook_event_name: 'PreToolUse',
        tool_name: 'Edit',
        tool_input: {
          file_path: 'test.ts',
          old_string: 'x',
          new_string: `x
y`
        }
      }), { storage, validator, configLoader })

      expect(result.decision).toBe('approve')
      expect(result.reason).toContain('Session total: -1')
    })

    it('should block when cumulative goes positive', async () => {
      const configLoader = new TestConfigLoader()
      const validator = await createValidator(storage, configLoader)
      
      // First operation: -1 line
      await processHookData(JSON.stringify({
        session_id: 'test-session',
        transcript_path: '/tmp/test',
        hook_event_name: 'PreToolUse',
        tool_name: 'Edit',
        tool_input: {
          file_path: 'test.ts',
          old_string: `a
b`,
          new_string: 'ab'
        }
      }), { storage, validator, configLoader })

      // Second operation: +3 lines (would make total +2)
      const result = await processHookData(JSON.stringify({
        session_id: 'test-session',
        transcript_path: '/tmp/test',
        hook_event_name: 'PreToolUse',
        tool_name: 'Edit',
        tool_input: {
          file_path: 'test.ts',
          old_string: 'x',
          new_string: `x
y
z
w`
        }
      }), { storage, validator, configLoader })

      expect(result.decision).toBe('block')
      expect(result.reason).toContain('Session total would become: +2')
    })
  })
})