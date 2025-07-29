export interface ValidationResult {
  decision: 'block' | 'approve' | undefined
  reason: string
}

export interface Context {
  operation: ToolOperation
  sessionStats?: SessionStats | null
  guardEnabled: boolean
}

export interface SessionStats {
  totalLinesAdded: number
  totalLinesRemoved: number
  netChange: number
  operationCount: number
  lastUpdated: string
}

export interface LocChange {
  linesAdded: number
  linesRemoved: number
  netChange: number
}

export interface ToolOperation {
  session_id: string
  hook_event_name: string
  tool_name: 'Edit' | 'MultiEdit' | 'Write'
  tool_input: EditInput | MultiEditInput | WriteInput
}

export interface EditInput {
  file_path: string
  old_string: string
  new_string: string
  replace_all?: boolean
}

export interface MultiEditInput {
  file_path: string
  edits: Array<{
    old_string: string
    new_string: string
    replace_all?: boolean
  }>
}

export interface WriteInput {
  file_path: string
  content: string
}

export interface HookData {
  session_id: string
  transcript_path: string
  hook_event_name: string
  tool_name: string
  tool_input?: unknown
}

export interface UserPromptSubmit {
  session_id: string
  transcript_path: string
  hook_event_name: 'UserPromptSubmit'
  prompt: string
  cwd: string
}

export interface GuardState {
  enabled: boolean
  lastUpdated: string
}

export interface GuardConfig {
  enforcement: {
    mode: 'session-wide' | 'per-operation'
    strategy: 'cumulative' | 'snapshot'
    ignoreEmptyLines: boolean
    limitType?: 'hard' | 'soft' // New field for limit type
  }
  whitelist: {
    patterns: string[]
    extensions: string[]
  }
  thresholds?: {
    allowedPositiveLines: number
  }
}

export interface HotConfig {
  // Overrides for GuardConfig
  enforcement?: {
    mode?: 'session-wide' | 'per-operation'
    strategy?: 'cumulative' | 'snapshot'
    limitType?: 'hard' | 'soft'
  }
  thresholds?: {
    allowedPositiveLines?: number
  }
  // Metadata
  lastUpdated: string
  sessionId?: string
}

export interface OperationRecord {
  timestamp: string
  toolName: 'Edit' | 'MultiEdit' | 'Write'
  filePath: string
  linesAdded: number
  linesRemoved: number
  netChange: number
  decision: 'approve' | 'block'
  reason?: string
}

export interface OperationHistory {
  records: OperationRecord[]
  maxRecords: number
  lastUpdated: string
}