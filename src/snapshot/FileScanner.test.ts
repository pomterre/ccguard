import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { FileScanner } from './FileScanner'
import fs from 'fs'
import path from 'path'
import os from 'os'

describe('FileScanner', () => {
  let tempDir: string
  let scanner: FileScanner

  beforeEach(() => {
    // Create temp directory
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'scanner-test-'))
  })

  afterEach(() => {
    // Clean up temp directory
    fs.rmSync(tempDir, { recursive: true, force: true })
  })

  it('should scan project files', async () => {
    // Create test files
    fs.writeFileSync(path.join(tempDir, 'file1.ts'), 'line 1\nline 2\nline 3')
    fs.mkdirSync(path.join(tempDir, 'src'))
    fs.writeFileSync(path.join(tempDir, 'src', 'file2.ts'), 'export const x = 1\n\nexport const y = 2')
    
    scanner = new FileScanner(tempDir)
    const files = await scanner.scanProject()
    
    expect(files.size).toBe(2)
    expect(files.has(path.join(tempDir, 'file1.ts'))).toBe(true)
    expect(files.has(path.join(tempDir, 'src', 'file2.ts'))).toBe(true)
    
    const file1 = files.get(path.join(tempDir, 'file1.ts'))!
    expect(file1.locCount).toBe(3)
    expect(file1.hash).toBeTruthy()
    expect(file1.lastModified).toBeGreaterThan(0)
  })

  it('should count lines correctly with ignoreEmptyLines', async () => {
    const content = `line 1

line 3

line 5`
    fs.writeFileSync(path.join(tempDir, 'test.ts'), content)
    
    // With ignoreEmptyLines = true (default)
    scanner = new FileScanner(tempDir, true)
    let files = await scanner.scanFiles([path.join(tempDir, 'test.ts')])
    expect(files.get(path.join(tempDir, 'test.ts'))!.locCount).toBe(3)
    
    // With ignoreEmptyLines = false
    scanner = new FileScanner(tempDir, false)
    files = await scanner.scanFiles([path.join(tempDir, 'test.ts')])
    expect(files.get(path.join(tempDir, 'test.ts'))!.locCount).toBe(5)
  })

  it('should skip binary files', async () => {
    // Create various files
    fs.writeFileSync(path.join(tempDir, 'code.ts'), 'const x = 1')
    fs.writeFileSync(path.join(tempDir, 'image.png'), Buffer.from([0x89, 0x50, 0x4E, 0x47]))
    fs.writeFileSync(path.join(tempDir, 'binary.exe'), Buffer.from([0x4D, 0x5A]))
    
    scanner = new FileScanner(tempDir)
    const files = await scanner.scanProject()
    
    expect(files.has(path.join(tempDir, 'code.ts'))).toBe(true)
    expect(files.has(path.join(tempDir, 'image.png'))).toBe(false)
    expect(files.has(path.join(tempDir, 'binary.exe'))).toBe(false)
  })

  it('should get affected files from operations', () => {
    scanner = new FileScanner(tempDir)
    
    // Edit operation
    const editOp = {
      tool_name: 'Edit',
      tool_input: { file_path: '/src/file.ts' }
    }
    expect(scanner.getAffectedFiles(editOp)).toEqual(['/src/file.ts'])
    
    // MultiEdit operation
    const multiEditOp = {
      tool_name: 'MultiEdit',
      tool_input: { file_path: '/src/multi.ts' }
    }
    expect(scanner.getAffectedFiles(multiEditOp)).toEqual(['/src/multi.ts'])
    
    // Write operation
    const writeOp = {
      tool_name: 'Write',
      tool_input: { file_path: '/new/file.ts' }
    }
    expect(scanner.getAffectedFiles(writeOp)).toEqual(['/new/file.ts'])
  })

  it('should handle non-existent files gracefully', async () => {
    scanner = new FileScanner(tempDir)
    const files = await scanner.scanFiles([
      path.join(tempDir, 'non-existent.ts')
    ])
    
    expect(files.size).toBe(0)
  })

  it('should respect .gitignore', async () => {
    // Create files and .gitignore
    fs.writeFileSync(path.join(tempDir, 'keep.ts'), 'const x = 1')
    fs.mkdirSync(path.join(tempDir, 'node_modules'))
    fs.writeFileSync(path.join(tempDir, 'node_modules', 'pkg.js'), 'module.exports = {}')
    fs.writeFileSync(path.join(tempDir, '.gitignore'), 'node_modules/')
    
    scanner = new FileScanner(tempDir)
    const files = await scanner.scanProject()
    
    expect(files.has(path.join(tempDir, 'keep.ts'))).toBe(true)
    expect(files.has(path.join(tempDir, 'node_modules', 'pkg.js'))).toBe(false)
  })
})