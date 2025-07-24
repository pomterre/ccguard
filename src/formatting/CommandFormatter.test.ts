import { describe, it, expect, vi, beforeEach } from 'vitest'
import { CommandFormatter } from './CommandFormatter'
import { FormatterConfig } from './Formatter'
import * as child_process from 'child_process'

vi.mock('child_process')

describe('CommandFormatter', () => {
  const mockSpawn = vi.mocked(child_process.spawn)
  
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('format', () => {
    it('should format JavaScript files with prettier', async () => {
      const config: FormatterConfig = {
        enabled: true,
        commands: {
          '.js': { command: 'prettier --stdin-filepath {filepath}' }
        }
      }
      
      const formatter = new CommandFormatter(config)
      
      // Mock the spawn process
      const mockProcess = {
        stdin: { write: vi.fn(), end: vi.fn() },
        stdout: { on: vi.fn() },
        stderr: { on: vi.fn() },
        on: vi.fn()
      }
      
      mockSpawn.mockReturnValue(mockProcess as any)
      
      // Simulate successful formatting
      setTimeout(() => {
        const stdoutCallback = mockProcess.stdout.on.mock.calls[0][1]
        stdoutCallback('const formatted = true;\n')
        
        const closeCallback = mockProcess.on.mock.calls.find(call => call[0] === 'close')[1]
        closeCallback(0)
      }, 10)
      
      const result = await formatter.format('const formatted=true;', 'test.js')
      
      expect(result).toBe('const formatted = true;\n')
      expect(mockSpawn).toHaveBeenCalledWith('prettier', ['--stdin-filepath', 'test.js'], {
        timeout: 5000
      })
      expect(mockProcess.stdin.write).toHaveBeenCalledWith('const formatted=true;')
      expect(mockProcess.stdin.end).toHaveBeenCalled()
    })

    it('should replace {filepath} placeholder in command', async () => {
      const config: FormatterConfig = {
        enabled: true,
        commands: {
          '.py': { command: 'black --stdin-filename {filepath} -' }
        }
      }
      
      const formatter = new CommandFormatter(config)
      
      const mockProcess = {
        stdin: { write: vi.fn(), end: vi.fn() },
        stdout: { on: vi.fn() },
        stderr: { on: vi.fn() },
        on: vi.fn()
      }
      
      mockSpawn.mockReturnValue(mockProcess as any)
      
      setTimeout(() => {
        const stdoutCallback = mockProcess.stdout.on.mock.calls[0][1]
        stdoutCallback('def formatted():\n    pass\n')
        
        const closeCallback = mockProcess.on.mock.calls.find(call => call[0] === 'close')[1]
        closeCallback(0)
      }, 10)
      
      await formatter.format('def formatted():\\n  pass', '/path/to/test.py')
      
      expect(mockSpawn).toHaveBeenCalledWith('black', ['--stdin-filename', '/path/to/test.py', '-'], {
        timeout: 5000
      })
    })

    it('should use custom timeout if configured', async () => {
      const config: FormatterConfig = {
        enabled: true,
        commands: {
          '.rs': { command: 'rustfmt' }
        },
        timeout: 10000
      }
      
      const formatter = new CommandFormatter(config)
      
      const mockProcess = {
        stdin: { write: vi.fn(), end: vi.fn() },
        stdout: { on: vi.fn() },
        stderr: { on: vi.fn() },
        on: vi.fn()
      }
      
      mockSpawn.mockReturnValue(mockProcess as any)
      
      setTimeout(() => {
        const closeCallback = mockProcess.on.mock.calls.find(call => call[0] === 'close')[1]
        closeCallback(0)
      }, 10)
      
      await formatter.format('fn main() {}', 'test.rs')
      
      expect(mockSpawn).toHaveBeenCalledWith('rustfmt', [], {
        timeout: 10000
      })
    })

    it('should return original content when fallbackOnError is true and formatting fails', async () => {
      const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
      
      const config: FormatterConfig = {
        enabled: true,
        commands: {
          '.js': { command: 'prettier' }
        },
        fallbackOnError: true
      }
      
      const formatter = new CommandFormatter(config)
      
      const mockProcess = {
        stdin: { write: vi.fn(), end: vi.fn() },
        stdout: { on: vi.fn() },
        stderr: { on: vi.fn() },
        on: vi.fn()
      }
      
      mockSpawn.mockReturnValue(mockProcess as any)
      
      setTimeout(() => {
        const errorCallback = mockProcess.on.mock.calls.find(call => call[0] === 'error')[1]
        errorCallback(new Error('Command not found'))
      }, 10)
      
      const result = await formatter.format('const x = 1;', 'test.js')
      
      expect(result).toBe('const x = 1;')
      
      consoleWarnSpy.mockRestore()
    })

    it('should throw error when fallbackOnError is false and formatting fails', async () => {
      const config: FormatterConfig = {
        enabled: true,
        commands: {
          '.js': { command: 'prettier' }
        },
        fallbackOnError: false
      }
      
      const formatter = new CommandFormatter(config)
      
      const mockProcess = {
        stdin: { write: vi.fn(), end: vi.fn() },
        stdout: { on: vi.fn() },
        stderr: { on: vi.fn() },
        on: vi.fn()
      }
      
      mockSpawn.mockReturnValue(mockProcess as any)
      
      setTimeout(() => {
        const errorCallback = mockProcess.on.mock.calls.find(call => call[0] === 'error')[1]
        errorCallback(new Error('Command not found'))
      }, 10)
      
      await expect(formatter.format('const x = 1;', 'test.js')).rejects.toThrow('Formatter error: Command not found')
    })

    it('should return original content for unsupported file types', async () => {
      const config: FormatterConfig = {
        enabled: true,
        commands: {
          '.js': { command: 'prettier' }
        }
      }
      
      const formatter = new CommandFormatter(config)
      const result = await formatter.format('Some content', 'test.txt')
      
      expect(result).toBe('Some content')
      expect(mockSpawn).not.toHaveBeenCalled()
    })

    it('should cache formatted results', async () => {
      const config: FormatterConfig = {
        enabled: true,
        commands: {
          '.js': { command: 'prettier' }
        }
      }
      
      const formatter = new CommandFormatter(config)
      
      const mockProcess = {
        stdin: { write: vi.fn(), end: vi.fn() },
        stdout: { on: vi.fn() },
        stderr: { on: vi.fn() },
        on: vi.fn()
      }
      
      mockSpawn.mockReturnValue(mockProcess as any)
      
      setTimeout(() => {
        const stdoutCallback = mockProcess.stdout.on.mock.calls[0][1]
        stdoutCallback('formatted')
        
        const closeCallback = mockProcess.on.mock.calls.find(call => call[0] === 'close')[1]
        closeCallback(0)
      }, 10)
      
      const content = 'const x = 1;'
      const filePath = 'test.js'
      
      // First call
      const result1 = await formatter.format(content, filePath)
      expect(result1).toBe('formatted')
      expect(mockSpawn).toHaveBeenCalledTimes(1)
      
      // Second call with same content - should use cache
      const result2 = await formatter.format(content, filePath)
      expect(result2).toBe('formatted')
      expect(mockSpawn).toHaveBeenCalledTimes(1) // Not called again
    })
  })

  describe('isSupported', () => {
    it('should return true for configured file extensions', () => {
      const config: FormatterConfig = {
        enabled: true,
        commands: {
          '.js': { command: 'prettier' },
          '.ts': { command: 'prettier' },
          '.py': { command: 'black' }
        }
      }
      
      const formatter = new CommandFormatter(config)
      
      expect(formatter.isSupported('test.js')).toBe(true)
      expect(formatter.isSupported('test.ts')).toBe(true)
      expect(formatter.isSupported('test.py')).toBe(true)
      expect(formatter.isSupported('/path/to/file.js')).toBe(true)
    })

    it('should return false for unconfigured file extensions', () => {
      const config: FormatterConfig = {
        enabled: true,
        commands: {
          '.js': { command: 'prettier' }
        }
      }
      
      const formatter = new CommandFormatter(config)
      
      expect(formatter.isSupported('test.txt')).toBe(false)
      expect(formatter.isSupported('test.md')).toBe(false)
      expect(formatter.isSupported('test.rs')).toBe(false)
    })
  })
})