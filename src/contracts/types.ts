import { z } from 'zod'
import * as s from './schemas'

// Infer types from Zod schemas
export type SessionStats = z.infer<typeof s.SessionStatsSchema>
export type GuardState = z.infer<typeof s.GuardStateSchema>
export type GuardConfig = z.infer<typeof s.GuardConfigSchema>
export type HookData = z.infer<typeof s.HookDataSchema>
export type UserPromptSubmit = z.infer<typeof s.UserPromptSubmitSchema>
export type ToolOperation = z.infer<typeof s.ToolOperationSchema>
export type EditInput = z.infer<typeof s.EditSchema>
export type MultiEditInput = z.infer<typeof s.MultiEditSchema>
export type WriteInput = z.infer<typeof s.WriteSchema>

// All types are now inferred from schemas
export type ValidationResult = z.infer<typeof s.ValidationResultSchema>
export type Context = z.infer<typeof s.ContextSchema>
export type LocChange = z.infer<typeof s.LocChangeSchema>