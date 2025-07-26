export * from './types'
export { EnableCommand } from './EnableCommand'
export { DisableCommand } from './DisableCommand'
export { StatusCommand } from './StatusCommand'
export { ResetCommand } from './ResetCommand'
export { VersionCommand } from './VersionCommand'
export { SnapshotCommand } from './SnapshotCommand'

import { EnableCommand } from './EnableCommand'
import { DisableCommand } from './DisableCommand'
import { StatusCommand } from './StatusCommand'
import { ResetCommand } from './ResetCommand'
import { VersionCommand } from './VersionCommand'
import { SnapshotCommand } from './SnapshotCommand'

export const defaultCommands = [
  EnableCommand,
  DisableCommand,
  StatusCommand,
  ResetCommand,
  VersionCommand,
  SnapshotCommand,
]