import { describe, it, expect, afterEach, vi } from 'vitest'
import { ConfigLoader } from './ConfigLoader'
import fs from 'fs'
import path from 'path'
import os from 'os'

describe('ConfigLoader', () => {
  const testConfigPath = path.join(os.tmpdir(), 'test-ccguard.config.json')
  
  afterEach(() => {
    // Clean up test config file
    if (fs.existsSync(testConfigPath)) {
      fs.unlinkSync(testConfigPath)
    }
  })

  describe('config loading', () => {
    it('should load default config when no config file exists', () => {
      const loader = new ConfigLoader('/non/existent/path.json')
      const config = loader.getConfig()
      
      expect(config.enforcement.mode).toBe('session-wide')
      expect(config.enforcement.ignoreEmptyLines).toBe(true)
      expect(config.whitelist.patterns).toEqual([])
      expect(config.whitelist.extensions).toEqual([])
      expect(config.thresholds?.allowedPositiveLines).toBe(0)
    })

    it('should load and validate config from file', () => {
      const testConfig = {
        enforcement: {
          mode: 'per-operation',
          ignoreEmptyLines: false,
        },
        whitelist: {
          patterns: ['**/test/**'],
          extensions: ['.md', '.json'],
        },
        thresholds: {
          allowedPositiveLines: 5,
        },
      }
      
      fs.writeFileSync(testConfigPath, JSON.stringify(testConfig))
      const loader = new ConfigLoader(testConfigPath)
      const config = loader.getConfig()
      
      expect(config.enforcement.mode).toBe('per-operation')
      expect(config.enforcement.ignoreEmptyLines).toBe(false)
      expect(config.whitelist.patterns).toEqual(['**/test/**'])
      expect(config.whitelist.extensions).toEqual(['.md', '.json'])
      expect(config.thresholds?.allowedPositiveLines).toBe(5)
    })

    it('should apply defaults for missing config fields', () => {
      const partialConfig = {
        enforcement: {
          mode: 'per-operation',
        },
      }
      
      fs.writeFileSync(testConfigPath, JSON.stringify(partialConfig))
      const loader = new ConfigLoader(testConfigPath)
      const config = loader.getConfig()
      
      expect(config.enforcement.mode).toBe('per-operation')
      expect(config.enforcement.ignoreEmptyLines).toBe(true) // default
      expect(config.whitelist.patterns).toEqual([]) // default
      expect(config.whitelist.extensions).toEqual([]) // default
    })

    it('should handle invalid JSON gracefully', () => {
      vi.spyOn(console, 'error').mockImplementation(() => {})
      fs.writeFileSync(testConfigPath, 'invalid json {')
      const loader = new ConfigLoader(testConfigPath)
      expect(loader.getConfig().enforcement.mode).toBe('session-wide')
      vi.restoreAllMocks()
    })

    it('should handle invalid config schema gracefully', () => {
      vi.spyOn(console, 'error').mockImplementation(() => {})
      fs.writeFileSync(testConfigPath, JSON.stringify({
        enforcement: { mode: 'invalid-mode' }
      }))
      const loader = new ConfigLoader(testConfigPath)
      expect(loader.getConfig().enforcement.mode).toBe('session-wide')
      vi.restoreAllMocks()
    })
  })

  describe('file whitelisting', () => {
    it('should whitelist files by extension', () => {
      const testConfig = {
        whitelist: {
          extensions: ['.md', '.json', '.lock'],
        },
      }
      
      fs.writeFileSync(testConfigPath, JSON.stringify(testConfig))
      const loader = new ConfigLoader(testConfigPath)
      
      expect(loader.isFileWhitelisted('/path/to/README.md')).toBe(true)
      expect(loader.isFileWhitelisted('/path/to/config.json')).toBe(true)
      expect(loader.isFileWhitelisted('/path/to/package-lock.json')).toBe(true)
      expect(loader.isFileWhitelisted('/path/to/script.js')).toBe(false)
    })

    it('should whitelist files by pattern', () => {
      const testConfig = {
        whitelist: {
          patterns: [
            '**/node_modules/**',
            '**/dist/**',
            '**/*.generated.*',
            'src/migrations/*',
          ],
        },
      }
      
      fs.writeFileSync(testConfigPath, JSON.stringify(testConfig))
      const loader = new ConfigLoader(testConfigPath)
      
      expect(loader.isFileWhitelisted('/project/node_modules/lib/index.js')).toBe(true)
      expect(loader.isFileWhitelisted('/project/dist/bundle.js')).toBe(true)
      expect(loader.isFileWhitelisted('/project/src/api.generated.ts')).toBe(true)
      expect(loader.isFileWhitelisted('src/migrations/001_init.sql')).toBe(true)
      expect(loader.isFileWhitelisted('/project/src/index.ts')).toBe(false)
    })

    it('should handle both extension and pattern whitelisting', () => {
      const testConfig = {
        whitelist: {
          extensions: ['.md'],
          patterns: ['**/test/**'],
        },
      }
      
      fs.writeFileSync(testConfigPath, JSON.stringify(testConfig))
      const loader = new ConfigLoader(testConfigPath)
      
      expect(loader.isFileWhitelisted('/project/README.md')).toBe(true)
      expect(loader.isFileWhitelisted('/project/test/setup.js')).toBe(true)
      expect(loader.isFileWhitelisted('/project/src/index.js')).toBe(false)
    })
  })

  describe('config reloading', () => {
    it('should reload config from file', () => {
      const initialConfig = {
        enforcement: {
          mode: 'session-wide',
        },
      }
      
      fs.writeFileSync(testConfigPath, JSON.stringify(initialConfig))
      const loader = new ConfigLoader(testConfigPath)
      
      expect(loader.getConfig().enforcement.mode).toBe('session-wide')
      
      // Update config file
      const updatedConfig = {
        enforcement: {
          mode: 'per-operation',
        },
      }
      fs.writeFileSync(testConfigPath, JSON.stringify(updatedConfig))
      
      // Reload
      loader.reloadConfig()
      expect(loader.getConfig().enforcement.mode).toBe('per-operation')
    })
  })
})