import { z } from 'zod'

// Base schemas
export const HookContextSchema = z.object({
  session_id: z.string(),
  transcript_path: z.string(),
  hook_event_name: z.string(),
})

export const HookDataSchema = HookContextSchema.extend({
  tool_name: z.string(),
  tool_input: z.unknown(),
})

// UserPromptSubmit Schema
export const UserPromptSubmitSchema = HookContextSchema.extend({
  prompt: z.string(),
  cwd: z.string(),
}).refine((data) => data.hook_event_name === 'UserPromptSubmit')

// Tool input schemas
export const EditSchema = z.object({
  file_path: z.string(),
  old_string: z.string(),
  new_string: z.string(),
  replace_all: z.boolean().optional(),
})

const EditEntrySchema = z.object({
  old_string: z.string(),
  new_string: z.string(),
  replace_all: z.boolean().optional(),
})

export const MultiEditSchema = z.object({
  file_path: z.string(),
  edits: z.array(EditEntrySchema).min(1),
})

export const WriteSchema = z.object({
  file_path: z.string(),
  content: z.string(),
})

// Tool operation schemas
export const EditOperationSchema = HookContextSchema.extend({
  tool_name: z.literal('Edit'),
  tool_input: EditSchema,
})

export const MultiEditOperationSchema = HookContextSchema.extend({
  tool_name: z.literal('MultiEdit'),
  tool_input: MultiEditSchema,
})

export const WriteOperationSchema = HookContextSchema.extend({
  tool_name: z.literal('Write'),
  tool_input: WriteSchema,
})

// Discriminated union for tool operations
export const ToolOperationSchema = z.discriminatedUnion('tool_name', [
  EditOperationSchema,
  MultiEditOperationSchema,
  WriteOperationSchema,
])

// Session stats schema
export const SessionStatsSchema = z.object({
  totalLinesAdded: z.number(),
  totalLinesRemoved: z.number(),
  netChange: z.number(),
  operationCount: z.number(),
  lastUpdated: z.string(),
})

// Guard state schema
export const GuardStateSchema = z.object({
  enabled: z.boolean(),
  lastUpdated: z.string(),
})

// Config schema
export const GuardConfigSchema = z.object({
  enforcement: z.object({
    mode: z.enum(['session-wide', 'per-operation']).default('session-wide'),
    strategy: z.enum(['cumulative', 'snapshot']).default('cumulative'),
    ignoreEmptyLines: z.boolean().default(true),
  }).default({
    mode: 'session-wide',
    strategy: 'cumulative',
    ignoreEmptyLines: true,
  }),
  whitelist: z.object({
    patterns: z.array(z.string()).default([]),
    extensions: z.array(z.string()).default([]),
  }).default({
    patterns: [],
    extensions: [],
  }),
  thresholds: z.object({
    allowedPositiveLines: z.number().default(0),
  }).optional(),
})

// Type guards
export const isEditOperation = (op: { tool_name: string }): boolean =>
  op.tool_name === 'Edit'

export const isMultiEditOperation = (op: { tool_name: string }): boolean =>
  op.tool_name === 'MultiEdit'

export const isWriteOperation = (op: { tool_name: string }): boolean =>
  op.tool_name === 'Write'