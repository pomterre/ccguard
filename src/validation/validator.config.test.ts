import { describe, it, expect, beforeEach } from 'vitest'
import { Validator } from './validator'
import { MemoryStorage } from '../storage/MemoryStorage'
import { ConfigLoader } from '../config/ConfigLoader'
import { Context, GuardConfig } from '../contracts'

// Mock ConfigLoader for testing
class MockConfigLoader extends ConfigLoader {
  constructor(private mockConfig: GuardConfig) {
    super()
  }

  getConfig(): GuardConfig {
    return this.mockConfig
  }

  isFileWhitelisted(filePath: string): boolean {
    const { patterns, extensions } = this.mockConfig.whitelist
    
    // Check extensions
    if (extensions.length > 0) {
      const ext = filePath.substring(filePath.lastIndexOf('.'))
      if (extensions.includes(ext)) {
        return true
      }
    }
    
    // Check patterns (simplified)
    if (patterns.length > 0) {
      for (const pattern of patterns) {
        if (filePath.includes(pattern.replace(/\*/g, ''))) {
          return true
        }
      }
    }
    
    return false
  }
}

describe('Validator with Config', () => {
  let storage: MemoryStorage
  
  beforeEach(() => {
    storage = new MemoryStorage()
  })

  describe('whitelist functionality', () => {
    it('should approve whitelisted files without LOC check', async () => {
      const config: GuardConfig = {
        enforcement: {
          mode: 'session-wide',
          ignoreEmptyLines: true,
        },
        whitelist: {
          patterns: [],
          extensions: ['.md', '.json'],
        },
      }
      
      const configLoader = new MockConfigLoader(config)
      const validator = new Validator(storage, configLoader)
      
      const context: Context = {
        operation: {
          session_id: 'test',
          transcript_path: '/tmp/test',
          hook_event_name: 'PreToolUse',
          tool_name: 'Write',
          tool_input: {
            file_path: '/project/README.md',
            content: `a
b
c
d
e
f
g
h
i
j`, // 10 lines
          },
        },
        guardEnabled: true,
      }
      
      const result = await validator.validate(context)
      expect(result.decision).toBe('approve')
      expect(result.reason).toContain('whitelisted')
    })

    it('should enforce LOC for non-whitelisted files', async () => {
      const config: GuardConfig = {
        enforcement: {
          mode: 'session-wide',
          ignoreEmptyLines: true,
        },
        whitelist: {
          patterns: [],
          extensions: ['.md'],
        },
      }
      
      const configLoader = new MockConfigLoader(config)
      const validator = new Validator(storage, configLoader)
      
      const context: Context = {
        operation: {
          session_id: 'test',
          transcript_path: '/tmp/test',
          hook_event_name: 'PreToolUse',
          tool_name: 'Write',
          tool_input: {
            file_path: '/project/script.js',
            content: `a
b
c`, // 3 lines, not whitelisted
          },
        },
        guardEnabled: true,
      }
      
      const result = await validator.validate(context)
      expect(result.decision).toBe('block')
      expect(result.reason).toContain('Net positive LOC')
    })
  })

  describe('enforcement modes', () => {
    it('should enforce per-operation mode', async () => {
      const config: GuardConfig = {
        enforcement: {
          mode: 'per-operation',
          ignoreEmptyLines: true,
        },
        whitelist: {
          patterns: [],
          extensions: [],
        },
        thresholds: {
          allowedPositiveLines: 2,
        },
      }
      
      const configLoader = new MockConfigLoader(config)
      const validator = new Validator(storage, configLoader)
      
      // First operation: +2 lines (allowed)
      const context1: Context = {
        operation: {
          session_id: 'test',
          transcript_path: '/tmp/test',
          hook_event_name: 'PreToolUse',
          tool_name: 'Write',
          tool_input: {
            file_path: '/project/file1.js',
            content: `a
b`,
          },
        },
        guardEnabled: true,
      }
      
      const result1 = await validator.validate(context1)
      expect(result1.decision).toBe('approve')
      
      // Second operation: +3 lines (blocked)
      const context2: Context = {
        operation: {
          session_id: 'test',
          transcript_path: '/tmp/test',
          hook_event_name: 'PreToolUse',
          tool_name: 'Write',
          tool_input: {
            file_path: '/project/file2.js',
            content: `a
b
c`,
          },
        },
        guardEnabled: true,
      }
      
      const result2 = await validator.validate(context2)
      expect(result2.decision).toBe('block')
      
      // Per-operation mode doesn't accumulate
      const stats = await storage.getSessionStats()
      expect(stats).toBeNull() // No stats in per-operation mode
    })

    it('should enforce session-wide mode', async () => {
      const config: GuardConfig = {
        enforcement: {
          mode: 'session-wide',
          ignoreEmptyLines: true,
        },
        whitelist: {
          patterns: [],
          extensions: [],
        },
        thresholds: {
          allowedPositiveLines: 3,
        },
      }
      
      const configLoader = new MockConfigLoader(config)
      const validator = new Validator(storage, configLoader)
      
      // First operation: +2 lines (allowed, total: +2)
      const context1: Context = {
        operation: {
          session_id: 'test',
          transcript_path: '/tmp/test',
          hook_event_name: 'PreToolUse',
          tool_name: 'Write',
          tool_input: {
            file_path: '/project/file1.js',
            content: `a
b`,
          },
        },
        guardEnabled: true,
      }
      
      const result1 = await validator.validate(context1)
      expect(result1.decision).toBe('approve')
      
      // Second operation: +2 lines (blocked, total would be: +4)
      const context2: Context = {
        operation: {
          session_id: 'test',
          transcript_path: '/tmp/test',
          hook_event_name: 'PreToolUse',
          tool_name: 'Write',
          tool_input: {
            file_path: '/project/file2.js',
            content: `a
b`,
          },
        },
        guardEnabled: true,
      }
      
      const result2 = await validator.validate(context2)
      expect(result2.decision).toBe('block')
      expect(result2.reason).toContain('Session total would become')
      
      // Session-wide mode accumulates stats
      const stats = await storage.getSessionStats()
      expect(stats?.totalLinesAdded).toBe(2)
      expect(stats?.netChange).toBe(2)
    })
  })

  describe('threshold configuration', () => {
    it('should allow positive changes up to threshold', async () => {
      const config: GuardConfig = {
        enforcement: {
          mode: 'session-wide',
          ignoreEmptyLines: true,
        },
        whitelist: {
          patterns: [],
          extensions: [],
        },
        thresholds: {
          allowedPositiveLines: 5,
        },
      }
      
      const configLoader = new MockConfigLoader(config)
      const validator = new Validator(storage, configLoader)
      
      const context: Context = {
        operation: {
          session_id: 'test',
          transcript_path: '/tmp/test',
          hook_event_name: 'PreToolUse',
          tool_name: 'Write',
          tool_input: {
            file_path: '/project/file.js',
            content: `a
b
c
d
e`, // 5 lines
          },
        },
        guardEnabled: true,
      }
      
      const result = await validator.validate(context)
      expect(result.decision).toBe('approve')
    })

    it('should block changes exceeding threshold', async () => {
      const config: GuardConfig = {
        enforcement: {
          mode: 'session-wide',
          ignoreEmptyLines: true,
        },
        whitelist: {
          patterns: [],
          extensions: [],
        },
        thresholds: {
          allowedPositiveLines: 5,
        },
      }
      
      const configLoader = new MockConfigLoader(config)
      const validator = new Validator(storage, configLoader)
      
      const context: Context = {
        operation: {
          session_id: 'test',
          transcript_path: '/tmp/test',
          hook_event_name: 'PreToolUse',
          tool_name: 'Write',
          tool_input: {
            file_path: '/project/file.js',
            content: `a
b
c
d
e
f`, // 6 lines
          },
        },
        guardEnabled: true,
      }
      
      const result = await validator.validate(context)
      expect(result.decision).toBe('block')
    })
  })

  describe('ignoreEmptyLines configuration', () => {
    it('should count empty lines when ignoreEmptyLines is false', async () => {
      const config: GuardConfig = {
        enforcement: {
          mode: 'session-wide',
          ignoreEmptyLines: false,
        },
        whitelist: {
          patterns: [],
          extensions: [],
        },
      }
      
      const configLoader = new MockConfigLoader(config)
      const validator = new Validator(storage, configLoader)
      
      const context: Context = {
        operation: {
          session_id: 'test',
          transcript_path: '/tmp/test',
          hook_event_name: 'PreToolUse',
          tool_name: 'Edit',
          tool_input: {
            file_path: '/project/file.js',
            old_string: 'a',
            new_string: `a

b`, // adds 2 lines, one is empty
          },
        },
        guardEnabled: true,
      }
      
      const result = await validator.validate(context)
      expect(result.decision).toBe('block')
      expect(result.reason).toContain('Add 3 lines')
    })

    it('should ignore empty lines when ignoreEmptyLines is true', async () => {
      const config: GuardConfig = {
        enforcement: {
          mode: 'session-wide',
          ignoreEmptyLines: true,
        },
        whitelist: {
          patterns: [],
          extensions: [],
        },
      }
      
      const configLoader = new MockConfigLoader(config)
      const validator = new Validator(storage, configLoader)
      
      const context: Context = {
        operation: {
          session_id: 'test',
          transcript_path: '/tmp/test',
          hook_event_name: 'PreToolUse',
          tool_name: 'Edit',
          tool_input: {
            file_path: '/project/file.js',
            old_string: 'a',
            new_string: `a

b`, // adds 2 lines, but only 1 non-empty
          },
        },
        guardEnabled: true,
      }
      
      const result = await validator.validate(context)
      expect(result.decision).toBe('block')
      expect(result.reason).toContain('Add 2 lines')
    })
  })
})