export * from './types'
export { EnableCommand } from './EnableCommand'
export { DisableCommand } from './DisableCommand'
export { StatusCommand } from './StatusCommand'
export { ResetCommand } from './ResetCommand'
export { VersionCommand } from './VersionCommand'

import { EnableCommand } from './EnableCommand'
import { DisableCommand } from './DisableCommand'
import { StatusCommand } from './StatusCommand'
import { ResetCommand } from './ResetCommand'
import { VersionCommand } from './VersionCommand'

export const defaultCommands = [
  EnableCommand,
  DisableCommand,
  StatusCommand,
  ResetCommand,
  VersionCommand,
]