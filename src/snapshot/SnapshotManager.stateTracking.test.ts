import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { SnapshotManager } from './SnapshotManager'
import { FileStorage } from '../storage/FileStorage'
import { tmpdir } from 'os'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'fs'
import { join } from 'path'

describe('SnapshotManager - State Tracking Between Instances', () => {
  let tempDir: string
  let storage: FileStorage
  let storageDir: string
  const sessionId = 'test-session-123'

  beforeEach(() => {
    // Create temporary directories
    tempDir = mkdtempSync(join(tmpdir(), 'ccguard-test-'))
    storageDir = mkdtempSync(join(tmpdir(), 'ccguard-storage-'))
    storage = new FileStorage(storageDir)
    
    // Create initial project structure
    mkdirSync(join(tempDir, 'src'), { recursive: true })
    writeFileSync(join(tempDir, 'src', 'index.ts'), 'const x = 1\nconst y = 2\nconst z = 3\n')
    writeFileSync(join(tempDir, 'README.md'), '# Test Project\n\nThis is a test.\n')
  })

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true })
    rmSync(storageDir, { recursive: true, force: true })
  })

  it('should persist and restore current LOC state between instances', async () => {
    // First instance - initialize baseline
    const manager1 = new SnapshotManager(tempDir, storage)
    const baseline = await manager1.initializeBaseline(sessionId)
    expect(baseline.totalLoc).toBe(5) // 3 lines in index.ts + 2 in README.md

    // Simulate first operation 
    // Take pre-operation snapshot BEFORE file changes
    const preOp1 = await manager1.takeOperationSnapshot(sessionId, [])
    expect(preOp1.totalLoc).toBe(5) // Should be 5 before operation
    
    // Now add a new file (simulating tool execution)
    writeFileSync(join(tempDir, 'src', 'utils.ts'), 'export const helper = () => {\n  return true\n}\n')
    
    // Take post-operation snapshot
    const postOp1 = await manager1.takePostOperationSnapshot(sessionId, [join(tempDir, 'src', 'utils.ts')])
    expect(postOp1.totalLoc).toBe(8) // 5 + 3 new lines
    
    // Update last valid snapshot
    await manager1.updateLastValidSnapshot(postOp1)

    // Second instance - simulating new hook invocation
    const manager2 = new SnapshotManager(tempDir, storage)
    
    // Take a pre-operation snapshot with the second instance
    const preOp2 = await manager2.takeOperationSnapshot(sessionId, [])
    
    // CRITICAL: This should be 8, not 5 (the baseline)
    expect(preOp2.totalLoc).toBe(8)
    
    // Verify persisted state was restored
    const currentLoc = await manager2.getCurrentValidLoc(sessionId)
    expect(currentLoc).toBe(8)
  })

  it('should track multiple sequential operations correctly', async () => {
    // Initialize
    const manager1 = new SnapshotManager(tempDir, storage)
    await manager1.initializeBaseline(sessionId)
    
    // Operation 1: Add file1.ts (10 lines)
    writeFileSync(join(tempDir, 'src', 'file1.ts'), Array(10).fill('const line = 1').join('\n'))
    const postOp1 = await manager1.takePostOperationSnapshot(sessionId, [join(tempDir, 'src', 'file1.ts')])
    await manager1.updateLastValidSnapshot(postOp1)
    
    // New instance for operation 2
    const manager2 = new SnapshotManager(tempDir, storage)
    const preOp2 = await manager2.takeOperationSnapshot(sessionId, [])
    expect(preOp2.totalLoc).toBe(15) // 5 initial + 10 from file1
    
    // Operation 2: Add file2.ts (5 lines)
    writeFileSync(join(tempDir, 'src', 'file2.ts'), Array(5).fill('const x = 1').join('\n'))
    const postOp2 = await manager2.takePostOperationSnapshot(sessionId, [join(tempDir, 'src', 'file2.ts')])
    await manager2.updateLastValidSnapshot(postOp2)
    
    // New instance for operation 3
    const manager3 = new SnapshotManager(tempDir, storage)
    const preOp3 = await manager3.takeOperationSnapshot(sessionId, [])
    expect(preOp3.totalLoc).toBe(20) // 5 initial + 10 + 5
    
    // Verify comparison works correctly
    const diff = manager3.compareSnapshots(preOp3, postOp2)
    expect(diff.locDelta).toBe(0) // Should be 0 since they're the same state
  })

  it('should handle file deletions correctly', async () => {
    const manager1 = new SnapshotManager(tempDir, storage)
    await manager1.initializeBaseline(sessionId)
    
    // First add a file
    const preAdd = await manager1.takeOperationSnapshot(sessionId, [])
    expect(preAdd.totalLoc).toBe(5) // Before adding
    
    writeFileSync(join(tempDir, 'src', 'temp.ts'), 'const temp = 1\nconst temp2 = 2\nconst temp3 = 3\n')
    const postAdd = await manager1.takePostOperationSnapshot(sessionId, [join(tempDir, 'src', 'temp.ts')])
    await manager1.updateLastValidSnapshot(postAdd)
    expect(postAdd.totalLoc).toBe(8) // 5 + 3
    
    // New instance for deletion
    const manager2 = new SnapshotManager(tempDir, storage)
    
    // Take pre-delete snapshot
    const preDelete = await manager2.takeOperationSnapshot(sessionId, [])
    expect(preDelete.totalLoc).toBe(8) // Before deletion
    
    // Now delete the file
    rmSync(join(tempDir, 'src', 'temp.ts'))
    
    const postDelete = await manager2.takePostOperationSnapshot(sessionId, [join(tempDir, 'src', 'temp.ts')])
    expect(postDelete.totalLoc).toBe(5) // Back to original
    
    const diff = manager2.compareSnapshots(preDelete, postDelete)
    expect(diff.locDelta).toBe(-3)
    expect(diff.removed).toContain(join(tempDir, 'src', 'temp.ts'))
  })

  it('should correct LOC mismatch and persist corrected state', async () => {
    // Initialize with baseline
    const manager1 = new SnapshotManager(tempDir, storage)
    await manager1.initializeBaseline(sessionId)
    
    // Add a file outside of CCGuard's tracking
    writeFileSync(join(tempDir, 'src', 'untracked.ts'), 'const a = 1\nconst b = 2\n')
    
    // Create new instance - it should detect and correct the mismatch
    const manager2 = new SnapshotManager(tempDir, storage)
    
    // Take snapshot - this should detect mismatch and correct it
    const snapshot1 = await manager2.takeOperationSnapshot(sessionId, [])
    expect(snapshot1.totalLoc).toBe(7) // 5 original + 2 from untracked file
    
    // Verify the corrected state was persisted
    const persistedLoc = await manager2.getCurrentValidLoc(sessionId)
    expect(persistedLoc).toBe(7)
    
    // Create another instance to verify correction persisted
    const manager3 = new SnapshotManager(tempDir, storage)
    const snapshot2 = await manager3.takeOperationSnapshot(sessionId, [])
    
    // Should not have mismatch this time
    expect(snapshot2.totalLoc).toBe(7)
    expect(await manager3.getCurrentValidLoc(sessionId)).toBe(7)
  })

  it('should handle rapid sequential operations without state corruption', async () => {
    const manager1 = new SnapshotManager(tempDir, storage)
    await manager1.initializeBaseline(sessionId)
    
    // Simulate rapid operations
    for (let i = 1; i <= 3; i++) {
      // New instance for each operation (simulating different hook calls)
      const manager = new SnapshotManager(tempDir, storage)
      
      // Take pre-op snapshot
      const preOp = await manager.takeOperationSnapshot(sessionId, [])
      const expectedLoc = 5 + (i - 1) * 2 // Each iteration adds 2 lines
      expect(preOp.totalLoc).toBe(expectedLoc)
      
      // Add file
      const fileName = `file${i}.ts`
      writeFileSync(join(tempDir, 'src', fileName), 'const x = 1\nconst y = 2\n')
      
      // Take post-op snapshot and update state
      const postOp = await manager.takePostOperationSnapshot(sessionId, [join(tempDir, 'src', fileName)])
      await manager.updateLastValidSnapshot(postOp)
      
      expect(postOp.totalLoc).toBe(expectedLoc + 2)
    }
    
    // Final verification with new instance
    const finalManager = new SnapshotManager(tempDir, storage)
    const finalSnapshot = await finalManager.takeOperationSnapshot(sessionId, [])
    expect(finalSnapshot.totalLoc).toBe(11) // 5 + 2*3
  })
})