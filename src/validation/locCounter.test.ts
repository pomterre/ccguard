import { describe, it, expect } from 'vitest'
import { LocCounter } from './locCounter'
import { EditInput, MultiEditInput, WriteInput } from '../contracts'

describe('LocCounter', () => {
  describe('countLines', () => {
    it('should count lines correctly with empty lines ignored', () => {
      const counter = new LocCounter({ ignoreEmptyLines: true })
      
      const content = `line1

line3

line5`
      
      expect(counter.countLines(content)).toBe(3)
    })

    it('should count all lines when ignoreEmptyLines is false', () => {
      const counter = new LocCounter({ ignoreEmptyLines: false })
      
      const content = `line1

line3

line5`
      
      expect(counter.countLines(content)).toBe(5)
    })

    it('should handle empty content', () => {
      const counter = new LocCounter()
      expect(counter.countLines('')).toBe(0)
    })

    it('should handle single line', () => {
      const counter = new LocCounter()
      expect(counter.countLines('single line')).toBe(1)
    })
  })

  describe('calculateEditChange', () => {
    it('should calculate net negative change', () => {
      const counter = new LocCounter()
      
      const input: EditInput = {
        file_path: 'test.ts',
        old_string: `function longFunction() {
  console.log('line 1')
  console.log('line 2')
  console.log('line 3')
  console.log('line 4')
  console.log('line 5')
}`,
        new_string: `function shortFunction() {
  console.log('refactored')
}`
      }
      
      const change = counter.calculateEditChange(input)
      expect(change.linesRemoved).toBe(7)
      expect(change.linesAdded).toBe(3)
      expect(change.netChange).toBe(-4)
    })

    it('should calculate net positive change', () => {
      const counter = new LocCounter()
      
      const input: EditInput = {
        file_path: 'test.ts',
        old_string: `const x = 1`,
        new_string: `const x = 1
const y = 2
const z = 3`
      }
      
      const change = counter.calculateEditChange(input)
      expect(change.linesRemoved).toBe(1)
      expect(change.linesAdded).toBe(3)
      expect(change.netChange).toBe(2)
    })
  })

  describe('calculateMultiEditChange', () => {
    it('should calculate cumulative changes', () => {
      const counter = new LocCounter()
      
      const input: MultiEditInput = {
        file_path: 'test.ts',
        edits: [
          {
            old_string: `const a = 1
const b = 2
const c = 3`,
            new_string: `const abc = [1, 2, 3]`
          },
          {
            old_string: `function foo() {
  return 'bar'
}`,
            new_string: `const foo = () => 'bar'`
          }
        ]
      }
      
      const change = counter.calculateMultiEditChange(input)
      expect(change.linesRemoved).toBe(6)
      expect(change.linesAdded).toBe(2)
      expect(change.netChange).toBe(-4)
    })
  })

  describe('calculateWriteChange', () => {
    it('should count all lines as added', () => {
      const counter = new LocCounter()
      
      const input: WriteInput = {
        file_path: 'new-file.ts',
        content: `export function newFunction() {
  return 'new'
}`
      }
      
      const change = counter.calculateWriteChange(input)
      expect(change.linesAdded).toBe(3)
      expect(change.linesRemoved).toBe(0)
      expect(change.netChange).toBe(3)
    })
  })

  describe('calculateChange', () => {
    it('should handle Edit operations', () => {
      const counter = new LocCounter()
      
      const input: EditInput = {
        file_path: 'test.ts',
        old_string: 'old',
        new_string: 'new'
      }
      
      const change = counter.calculateChange('Edit', input)
      expect(change.netChange).toBe(0)
    })

    it('should throw error for unknown tool', () => {
      const counter = new LocCounter()
      
      expect(() => {
        counter.calculateChange('UnknownTool', {} as any)
      }).toThrow('Unknown tool: UnknownTool')
    })
  })
})