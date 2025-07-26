import {
  ValidationResult,
  HookDataSchema,
  ToolOperationSchema,
  HookData,
  Context,
} from '../contracts'
import { Storage } from '../storage/Storage'
import { UserPromptHandler } from './userPromptHandler'
import { GuardManager } from '../ccguard/GuardManager'
import { ConfigLoader } from '../config/ConfigLoader'

export interface ProcessHookDataDeps {
  storage: Storage
  validator?: (context: Context) => Promise<ValidationResult>
  userPromptHandler?: UserPromptHandler
  configLoader?: ConfigLoader
  rootDir?: string
}

const defaultResult: ValidationResult = {
  decision: 'approve',
  reason: 'No validation required',
}

export async function processHookData(
  inputData: string,
  deps: ProcessHookDataDeps
): Promise<ValidationResult> {
  try {
    const parsedData = JSON.parse(inputData)
    
    // Initialize dependencies
    const configLoader = deps.configLoader ?? new ConfigLoader()
    const guardManager = new GuardManager(deps.storage, configLoader, deps.rootDir)
    const userPromptHandler = deps.userPromptHandler ?? new UserPromptHandler(guardManager)
    
    // Process user commands (on/off/status)
    const commandResult = await userPromptHandler.processUserCommand(inputData)
    if (commandResult) {
      return commandResult
    }

    // Check if guard is disabled
    const disabledResult = await userPromptHandler.getDisabledResult()
    if (disabledResult) {
      return disabledResult
    }

    // Parse hook data
    const hookResult = HookDataSchema.safeParse(parsedData)
    if (!hookResult.success) {
      return defaultResult
    }

    // Only process PreToolUse events
    if (hookResult.data.hook_event_name !== 'PreToolUse') {
      return defaultResult
    }

    // Check if this is a file modification operation
    if (!shouldValidateOperation(hookResult.data)) {
      return defaultResult
    }

    // Perform validation
    if (deps.validator) {
      const context = await buildContext(hookResult.data, deps.storage)
      return await deps.validator(context)
    }
    
    return defaultResult
  } catch (error) {
    console.error('Error processing hook data:', error)
    return {
      decision: 'block',
      reason: 'Error processing hook data. Please try again.',
    }
  }
}

function shouldValidateOperation(hookData: HookData): boolean {
  // Only validate Edit, MultiEdit, and Write operations
  const validTools = ['Edit', 'MultiEdit', 'Write']
  if (!validTools.includes(hookData.tool_name)) {
    return false
  }

  // Parse as tool operation
  const operationResult = ToolOperationSchema.safeParse({
    ...hookData,
    tool_input: hookData.tool_input,
  })

  if (!operationResult.success) {
    return false
  }

  return true
}


async function buildContext(hookData: HookData, storage: Storage): Promise<Context> {
  const operation = ToolOperationSchema.parse(hookData)
  const guardState = await storage.getGuardState()
  const sessionStats = await storage.getSessionStats()
  
  return {
    operation,
    sessionStats,
    guardEnabled: guardState?.enabled ?? true,
  }
}