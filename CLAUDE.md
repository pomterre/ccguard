# ccguard

## Project Goal

CCGuard is a Claude Code hook that enforces net-negative lines of code (LOC) changes. When Claude Code attempts to edit or write files, CCGuard:

1. **Captures**: Intercepts Edit, MultiEdit, and Write operations
2. **Calculates**: Counts lines added vs removed
3. **Validates**: Checks if changes would result in net positive LOC
4. **Blocks**: Prevents operations that increase total LOC
5. **Guides**: Provides suggestions for reducing code

This automated enforcement encourages code simplicity and thoughtful refactoring without manual reminders.

## Architecture

The project follows a clean, modular architecture:

```
src/
├── cli/                    # CLI entry point
│   └── ccguard.ts           # Main executable
├── contracts/              # TypeScript types and Zod schemas
│   ├── types.ts           # Core interfaces
│   └── schemas.ts         # Validation schemas
├── hooks/                  # Claude Code hook processing
│   ├── processHookData.ts # Main hook processor
│   └── userPromptHandler.ts # Handle on/off commands
├── storage/               # Persistence layer
│   ├── Storage.ts        # Storage interface
│   ├── FileStorage.ts    # File-based implementation
│   └── MemoryStorage.ts  # In-memory for testing
├── validation/            # LOC validation logic
│   ├── locCounter.ts     # Line counting algorithms
│   └── validator.ts      # Main validation logic
└── ccguard/                 # State management
    └── GuardManager.ts    # Enable/disable and stats
```

## Key Design Decisions

### 1. Session-Based Tracking
- Each Claude session gets its own statistics
- Cumulative tracking across all operations
- Resets don't affect other sessions

### 2. Line Counting Strategy
- Ignores empty lines by default (configurable)
- Counts actual code content, not whitespace
- Simple split-by-newline approach

### 3. Storage Abstraction
- Interface-based design for flexibility
- File storage for persistence
- Memory storage for testing

### 4. Validation Flow
- Pre-tool validation only (before changes applied)
- Immediate feedback on violations
- Clear, actionable error messages

## Development Workflow

### Testing
```bash
npm test              # Run all tests
npm run test:unit     # Unit tests only
npm run lint          # Check code style
npm run typecheck     # Type checking
```

### Building
```bash
npm run build         # Compile TypeScript
npm run dev          # Watch mode
```

### Key Test Scenarios
- Net positive changes (should block)
- Net negative changes (should allow)
- Cumulative session tracking
- Edge cases (empty files, whitespace)
- User commands (on/off/status/reset)

## Implementation Notes

### Hook Data Structure
Claude provides:
- `tool_name`: Edit, MultiEdit, or Write
- `tool_input`: Contains file paths and content
- `session_id`: Unique session identifier
- `hook_event_name`: PreToolUse or PostToolUse

### Validation Logic
1. Parse incoming hook data
2. Check if ccguard is enabled
3. Calculate LOC change for operation
4. Update session statistics
5. Block if total would be positive
6. Return structured response

### User Commands
Handled via UserPromptSubmit events:
- `ccguard on/off`: Toggle enforcement
- `ccguard status`: Show statistics
- `ccguard reset`: Clear session data

## Future Enhancements

### Planned Features
- Configurable thresholds (e.g., allow up to +10 lines)
- File-type specific rules
- Exclude patterns for generated code
- Weekly/monthly statistics
- Integration with CI/CD

### Potential Improvements
- Smart detection of moved code (not counted as add/remove)
- Consider code complexity, not just LOC
- Team-wide statistics and leaderboards
- Export statistics for analysis

## Common Issues

### CCGuard Not Triggering
- Ensure hook is configured for Edit, MultiEdit, Write
- Check if ccguard is enabled (`ccguard status`)
- Verify file type isn't excluded

### Incorrect Counts
- Empty lines may affect counts
- Check if file has mixed line endings
- MultiEdit counts are cumulative

### Performance
- File storage is fast for normal use
- Large files may slow counting
- Session data cleaned periodically
