#!/usr/bin/env node

import { processHookData } from '../hooks/processHookData'
import { SnapshotHookProcessor } from '../hooks/snapshotHookProcessor'
import { FileStorage } from '../storage/FileStorage'
import { createValidator } from '../validation/validator'
import { ValidationResult } from '../contracts'
import { ConfigLoader } from '../config/ConfigLoader'
import { appendFileSync, mkdirSync } from 'fs'
import { join } from 'path'
import { homedir } from 'os'

// Debug logging - only enabled when CCGUARD_DEBUG environment variable is set
const DEBUG = process.env.CCGUARD_DEBUG === 'true' || process.env.CCGUARD_DEBUG === '1'
const debugLog = (message: any) => {
  if (!DEBUG) return
  
  const ccguardDir = join(homedir(), '.ccguard')
  const logPath = join(ccguardDir, 'debug.log')
  
  // Ensure directory exists
  mkdirSync(ccguardDir, { recursive: true })
  
  appendFileSync(logPath, `${new Date().toISOString()} - ${JSON.stringify(message)}\n`)
}

export async function run(
  input: string,
  sessionId?: string
): Promise<ValidationResult> {
  const storage = new FileStorage(sessionId)
  const configLoader = new ConfigLoader()
  const config = configLoader.getConfig()
  
  // Use snapshot processor if strategy is 'snapshot'
  if (config.enforcement.strategy === 'snapshot') {
    const processor = new SnapshotHookProcessor({
      storage,
      configLoader,
    })
    return processor.processHookData(input)
  }
  
  // Otherwise use the cumulative processor
  const validator = await createValidator(storage, configLoader)
  return processHookData(input, {
    storage,
    validator,
    configLoader,
  })
}

// Only run if this is the main module
if (require.main === module) {
  ;(async () => {
    // Handle command line arguments
    if (process.argv.length > 2) {
      console.error('ccguard: This tool is designed to be used as a Claude Code hook.')
      console.error('To view status, use "ccguard status" within Claude Code.')
      process.exit(1)
    }

    let inputData = ''
    process.stdin.setEncoding('utf8')
    
    // Start reading immediately
    process.stdin.resume()

    // Set a timeout to prevent hanging
    const timeout = setTimeout(() => {
      console.error('ccguard: timeout waiting for input')
      process.exit(1)
    }, 5000)

    process.stdin.on('data', (chunk) => {
      inputData += chunk
      debugLog({ event: 'data_chunk', chunk })
    })

    process.stdin.on('end', async () => {
      clearTimeout(timeout)
      debugLog({ event: 'stdin_end', inputData })
      try {
        // Extract session ID from input if available
        let sessionId: string | undefined
        try {
          const parsed = JSON.parse(inputData)
          sessionId = parsed.session_id
        } catch {
          // Ignore parse errors
        }
        
        const result = await run(inputData, sessionId)
        debugLog({ event: 'result', result })
        console.log(JSON.stringify(result))
      } catch (error) {
        console.error('Failed to process hook data:', error)
        const errorResult: ValidationResult = {
          decision: 'block',
          reason: 'Error processing request. Please try again.',
        }
        console.log(JSON.stringify(errorResult))
      } finally {
        process.exit(0)
      }
    })
  })()
}