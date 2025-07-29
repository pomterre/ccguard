# Test Plan for Hot Configuration Features

## Manual Testing Steps

### 1. Test Config Commands

```bash
# Enable ccguard first
ccguard on

# Test strategy configuration (soft/hard limits)
ccguard config strategy soft
ccguard config strategy hard

# Test allowed positive lines configuration
ccguard config allowedPositiveLines 10
ccguard config allowedPositiveLines 0

# Test mode configuration (cumulative/snapshot)
ccguard config mode cumulative
ccguard config mode snapshot

# Test limit type configuration (perFile/perSession)
ccguard config limitType perFile
ccguard config limitType perSession
```

### 2. Test Enhanced Status Command

```bash
# Check status to see current configuration and history
ccguard status

# Should display:
# - Current configuration (including hot config overrides)
# - Session statistics
# - Recent operations history (last 10 operations)
```

### 3. Test Operation History Tracking

```bash
# Make some file edits to generate history
# Then check status to see the operations tracked
ccguard status
```

### 4. Test Hot Config Persistence

```bash
# Set some hot config
ccguard config strategy soft
ccguard config allowedPositiveLines 20

# Exit Claude and restart
# Check if hot config persists
ccguard status
```

## Expected Behaviors

1. **Config Commands**: Should update runtime configuration without modifying config files
2. **Status Display**: Should show all configuration values and recent operations
3. **History Tracking**: Should track all Edit, MultiEdit, and Write operations with their results
4. **Hot Config Override**: Runtime config should override file-based config

## Files Created/Modified

### New Files:
- `/src/config/HotConfigLoader.ts` - Manages hot configuration loading and merging
- `/src/history/HistoryManager.ts` - Manages operation history tracking
- `/src/commands/ConfigCommand.ts` - Implements config command handlers

### Modified Files:
- `/src/contracts/types.ts` - Added HotConfig, OperationRecord, OperationHistory types
- `/src/contracts/schemas.ts` - Added validation schemas for new types
- `/src/storage/Storage.ts` - Extended interface with hot config and history methods
- `/src/storage/FileStorage.ts` - Implemented new storage methods
- `/src/ccguard/GuardManager.ts` - Added hot config and history management
- `/src/commands/StatusCommand.ts` - Enhanced to show config and history
- `/src/commands/index.ts` - Added ConfigCommand to registry
- `/src/validation/validator.ts` - Added history tracking for operations
- `/src/hooks/snapshotHookProcessor.ts` - Added history tracking for operations
- `/src/cli/ccguard.ts` - Updated to use hot config through GuardManager