export * from './types'
export { EnableCommand } from './EnableCommand'
export { DisableCommand } from './DisableCommand'
export { StatusCommand } from './StatusCommand'
export { ResetCommand } from './ResetCommand'
export { VersionCommand } from './VersionCommand'
export { SnapshotCommand } from './SnapshotCommand'
export { ConfigCommand } from './ConfigCommand'
export { LockCommand } from './LockCommand'
export { UnlockCommand } from './UnlockCommand'
export { LocksCommand } from './LocksCommand'

import { EnableCommand } from './EnableCommand'
import { DisableCommand } from './DisableCommand'
import { StatusCommand } from './StatusCommand'
import { ResetCommand } from './ResetCommand'
import { VersionCommand } from './VersionCommand'
import { SnapshotCommand } from './SnapshotCommand'
import { ConfigCommand } from './ConfigCommand'
import { LockCommand } from './LockCommand'
import { UnlockCommand } from './UnlockCommand'
import { LocksCommand } from './LocksCommand'

export const defaultCommands = [
  EnableCommand,
  DisableCommand,
  StatusCommand,
  ResetCommand,
  VersionCommand,
  SnapshotCommand,
  ConfigCommand,
  LockCommand,
  UnlockCommand,
  LocksCommand,
]