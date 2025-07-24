import { describe, it, expect, vi, beforeEach } from 'vitest'
import { LocCounter } from './locCounter'
import { Formatter } from '../formatting'

describe('LocCounter with Formatter', () => {
  let mockFormatter: Formatter
  
  beforeEach(() => {
    mockFormatter = {
      format: vi.fn(),
      isSupported: vi.fn()
    }
  })

  describe('calculateEditChange with formatter', () => {
    it('should format content before counting lines', async () => {
      vi.mocked(mockFormatter.isSupported).mockReturnValue(true)
      vi.mocked(mockFormatter.format)
        .mockResolvedValueOnce('const x = 1;\n') // old_string formatted
        .mockResolvedValueOnce('const x = 1;\nconst y = 2;\n') // new_string formatted
      
      const counter = new LocCounter({ ignoreEmptyLines: true }, mockFormatter)
      
      const result = await counter.calculateEditChange({
        file_path: 'test.js',
        old_string: 'const x=1;',
        new_string: 'const x=1;const y=2;'
      })
      
      expect(mockFormatter.format).toHaveBeenCalledTimes(2)
      expect(mockFormatter.format).toHaveBeenCalledWith('const x=1;', 'test.js')
      expect(mockFormatter.format).toHaveBeenCalledWith('const x=1;const y=2;', 'test.js')
      
      expect(result).toEqual({
        linesAdded: 2,
        linesRemoved: 1,
        netChange: 1
      })
    })

    it('should work without formatter', async () => {
      const counter = new LocCounter({ ignoreEmptyLines: true })
      
      const result = await counter.calculateEditChange({
        file_path: 'test.js',
        old_string: 'const x = 1;',
        new_string: 'const x = 1;\nconst y = 2;'
      })
      
      expect(result).toEqual({
        linesAdded: 2,
        linesRemoved: 1,
        netChange: 1
      })
    })

    it('should handle formatter errors gracefully', async () => {
      const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
      
      vi.mocked(mockFormatter.isSupported).mockReturnValue(true)
      vi.mocked(mockFormatter.format).mockRejectedValue(new Error('Formatter failed'))
      
      const counter = new LocCounter({ ignoreEmptyLines: true }, mockFormatter)
      
      const result = await counter.calculateEditChange({
        file_path: 'test.js',
        old_string: 'const x = 1;',
        new_string: 'const x = 1;\nconst y = 2;'
      })
      
      // Should fall back to unformatted content
      expect(result).toEqual({
        linesAdded: 2,
        linesRemoved: 1,
        netChange: 1
      })
      
      consoleWarnSpy.mockRestore()
    })

    it('should skip formatting for unsupported files', async () => {
      vi.mocked(mockFormatter.isSupported).mockReturnValue(false)
      
      const counter = new LocCounter({ ignoreEmptyLines: true }, mockFormatter)
      
      const result = await counter.calculateEditChange({
        file_path: 'test.txt',
        old_string: 'line1',
        new_string: 'line1\nline2'
      })
      
      expect(mockFormatter.format).not.toHaveBeenCalled()
      expect(result).toEqual({
        linesAdded: 2,
        linesRemoved: 1,
        netChange: 1
      })
    })
  })

  describe('calculateMultiEditChange with formatter', () => {
    it('should format each edit before counting', async () => {
      vi.mocked(mockFormatter.isSupported).mockReturnValue(true)
      vi.mocked(mockFormatter.format)
        .mockResolvedValueOnce('const x = 1;\n') // first old_string
        .mockResolvedValueOnce('const x = 2;\n') // first new_string
        .mockResolvedValueOnce('const y = 1;\n') // second old_string
        .mockResolvedValueOnce('const y = 2;\nconst z = 3;\n') // second new_string
      
      const counter = new LocCounter({ ignoreEmptyLines: true }, mockFormatter)
      
      const result = await counter.calculateMultiEditChange({
        file_path: 'test.js',
        edits: [
          { old_string: 'const x=1;', new_string: 'const x=2;' },
          { old_string: 'const y=1;', new_string: 'const y=2;const z=3;' }
        ]
      })
      
      expect(mockFormatter.format).toHaveBeenCalledTimes(4)
      expect(result).toEqual({
        linesAdded: 3, // 1 + 2
        linesRemoved: 2, // 1 + 1
        netChange: 1
      })
    })
  })

  describe('calculateWriteChange with formatter', () => {
    it('should format content before counting lines', async () => {
      vi.mocked(mockFormatter.isSupported).mockReturnValue(true)
      vi.mocked(mockFormatter.format).mockResolvedValue('function test() {\n  return true;\n}\n')
      
      const counter = new LocCounter({ ignoreEmptyLines: true }, mockFormatter)
      
      const result = await counter.calculateWriteChange({
        file_path: 'test.js',
        content: 'function test(){return true;}'
      })
      
      expect(mockFormatter.format).toHaveBeenCalledWith('function test(){return true;}', 'test.js')
      expect(result).toEqual({
        linesAdded: 3,
        linesRemoved: 0,
        netChange: 3
      })
    })
  })

  describe('calculateChange with formatter', () => {
    it('should route to correct method based on tool name', async () => {
      vi.mocked(mockFormatter.isSupported).mockReturnValue(true)
      vi.mocked(mockFormatter.format).mockResolvedValue('formatted\ncontent\n')
      
      const counter = new LocCounter({ ignoreEmptyLines: true }, mockFormatter)
      
      // Test Edit
      const editResult = await counter.calculateChange('Edit', {
        file_path: 'test.js',
        old_string: 'old',
        new_string: 'new'
      })
      expect(editResult.netChange).toBeDefined()
      
      // Test Write
      const writeResult = await counter.calculateChange('Write', {
        file_path: 'test.js',
        content: 'content'
      })
      expect(writeResult.linesAdded).toBe(2)
      expect(writeResult.linesRemoved).toBe(0)
    })
  })
})