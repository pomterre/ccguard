import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { GitIgnoreParser } from './GitIgnoreParser'
import fs from 'fs'
import path from 'path'
import os from 'os'

describe('GitIgnoreParser', () => {
  let tempDir: string
  let parser: GitIgnoreParser

  beforeEach(() => {
    // Create temp directory
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gitignore-test-'))
  })

  afterEach(() => {
    // Clean up temp directory
    fs.rmSync(tempDir, { recursive: true, force: true })
  })

  it('should ignore default patterns', () => {
    parser = new GitIgnoreParser(tempDir)
    
    expect(parser.isIgnored(path.join(tempDir, 'node_modules'))).toBe(true)
    expect(parser.isIgnored(path.join(tempDir, 'node_modules', 'package', 'index.js'))).toBe(true)
    expect(parser.isIgnored(path.join(tempDir, '.git'))).toBe(true)
    expect(parser.isIgnored(path.join(tempDir, 'dist'))).toBe(true)
    expect(parser.isIgnored(path.join(tempDir, 'build'))).toBe(true)
  })

  it('should respect .gitignore patterns', () => {
    // Create .gitignore
    const gitignorePath = path.join(tempDir, '.gitignore')
    fs.writeFileSync(gitignorePath, `
# Custom patterns
*.log
temp/
!important.log
/src/generated/
`)

    parser = new GitIgnoreParser(tempDir)
    
    expect(parser.isIgnored(path.join(tempDir, 'debug.log'))).toBe(true)
    expect(parser.isIgnored(path.join(tempDir, 'temp'))).toBe(true)
    expect(parser.isIgnored(path.join(tempDir, 'temp', 'file.txt'))).toBe(true)
    
    // Debug negation
    console.log('Checking important.log:', path.join(tempDir, 'important.log'))
    console.log('Is ignored:', parser.isIgnored(path.join(tempDir, 'important.log')))
    
    expect(parser.isIgnored(path.join(tempDir, 'important.log'))).toBe(false) // Negated
    expect(parser.isIgnored(path.join(tempDir, 'src', 'generated', 'code.ts'))).toBe(true)
  })

  it('should handle glob patterns', () => {
    const gitignorePath = path.join(tempDir, '.gitignore')
    fs.writeFileSync(gitignorePath, `
*.test.ts
**/*.spec.js
src/**/temp
`)

    parser = new GitIgnoreParser(tempDir)
    
    expect(parser.isIgnored(path.join(tempDir, 'file.test.ts'))).toBe(true)
    expect(parser.isIgnored(path.join(tempDir, 'src', 'file.test.ts'))).toBe(true)
    expect(parser.isIgnored(path.join(tempDir, 'deep', 'nested', 'file.spec.js'))).toBe(true)
    expect(parser.isIgnored(path.join(tempDir, 'src', 'module', 'temp'))).toBe(true)
  })

  it('should get all files', () => {
    // Create some files
    fs.writeFileSync(path.join(tempDir, 'index.ts'), 'console.log("test")')
    fs.mkdirSync(path.join(tempDir, 'src'))
    fs.writeFileSync(path.join(tempDir, 'src', 'main.ts'), 'export {}')
    fs.mkdirSync(path.join(tempDir, 'node_modules'))
    fs.writeFileSync(path.join(tempDir, 'node_modules', 'package.json'), '{}')
    
    // Create .gitignore
    fs.writeFileSync(path.join(tempDir, '.gitignore'), 'node_modules/')
    
    parser = new GitIgnoreParser(tempDir)
    const allFiles = parser.getAllFiles()
    
    expect(allFiles).toContain(path.join(tempDir, 'index.ts'))
    expect(allFiles).toContain(path.join(tempDir, 'src', 'main.ts'))
    expect(allFiles).not.toContain(path.join(tempDir, 'node_modules', 'package.json'))
  })

  it('should not include files outside root directory', () => {
    parser = new GitIgnoreParser(tempDir)
    
    const outsidePath = path.join(tempDir, '..', 'outside.txt')
    expect(parser.isIgnored(outsidePath)).toBe(true)
  })
})