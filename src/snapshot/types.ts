export interface FileSnapshot {
  path: string
  locCount: number
  hash: string
  lastModified: number
}

export interface ProjectSnapshot {
  id: string
  sessionId: string
  timestamp: string
  files: Map<string, FileSnapshot>
  totalLoc: number
  isBaseline: boolean
}

export interface SnapshotDiff {
  added: string[]
  removed: string[]
  modified: string[]
  locDelta: number
  details: Map<string, {
    before: number
    after: number
    delta: number
  }>
}