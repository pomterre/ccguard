# 🚨 CCGuard

[![npm version](https://badge.fury.io/js/ccguard.svg)](https://www.npmjs.com/package/ccguard)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

**Automated enforcement of net-negative LOC, complexity constraints, and quality standards for Claude code**

> 📌 **New in v0.1.4**: The [Snapshot Strategy](#snapshot-strategy-recommended-as-of-v014) is now the recommended approach for more robust session-wide LOC tracking.

---

## 🎯 Overview

**CCGuard** ensures your codebase stays lean by blocking changes that exceed your configured line count threshold during Claude coding sessions. By default, it enforces net-negative changes (no increase allowed), but can be configured with a positive lines buffer for flexibility. It encourages simplicity, thoughtful refactoring, and a cleaner, maintainable codebase.

<p align="center"><img src="./ccguard-demo.png" alt="CCGuard Blocking Operation"></p>
<p align="center"><i>CCGuard blocking a file edit that would increase total lines of code</i></p>

<br />

---

<br />

<p align="center"><img src="./ccguard-demo-2.png" alt="CCGuard Blocking Complex Refactoring"></p>
<p align="center"><i>CCGuard preventing code bloat during refactoring operations</i></p>

---

## ✅ Key Benefits

* **Flexible Enforcement**: Strict net-negative by default, but configurable with positive line buffer
* **Simplicity Focus**: Keeps your code concise by limiting unnecessary additions
* **Promotes Refactoring**: Encourages rethinking and optimizing existing code
* **Progress Insights**: Provides real-time session statistics
* **Easy Control**: Simple toggling for flexible enforcement

---

## 🛠️ Installation

Ensure you have:

* Node.js 18+
* Claude Code

Install CCGuard CLI globally:

```bash
npm install -g ccguard
```

---

## 🚀 Quick Start

### 1️⃣ Configure Claude Code Hooks

CCGuard requires two hooks to be configured in Claude Code:

#### A. PreToolUse Hook (for LOC enforcement)

> ⚠️ **CRITICAL NOTE**: CCGuard must be the **ONLY** hook configured for PreToolUse events with the `Write|Edit|MultiEdit` matcher. Due to a current Claude Code bug (as of v1.0.58), duplicate hooks for the same tool matcher do not work properly. If you have other hooks for these tools, you must remove them for CCGuard to function correctly.

1. Type `/hooks`
2. Select `PreToolUse - Before tool execution`
3. Click `+ Add new matcher...`
4. Enter: `Write|Edit|MultiEdit`
5. Click `+ Add new hook...`
6. Enter command: `ccguard`
7. Save settings (Project settings recommended)

#### B. UserPromptSubmit Hook (for ccguard commands)

1. Type `/hooks`
2. Select `UserPromptSubmit - When user submits a prompt`
3. Click `+ Add new hook...`
4. Enter command: `ccguard`
5. Save settings (Project settings recommended)

#### C. PostToolUse Hook (required for snapshot feature only)

> **Note**: This hook is ONLY required if you plan to use the snapshot strategy. The default cumulative strategy does NOT need this hook.

1. Type `/hooks`
2. Select `PostToolUse - After tool execution`
3. Click `+ Add new matcher...`
4. Enter: `Write|Edit|MultiEdit`
5. Click `+ Add new hook...`
6. Enter command: `ccguard`
7. Save settings (Project settings recommended)

#### Configuration Reference

```json
{
  "hooks": {
    "PreToolUse": [{
      "matcher": "Write|Edit|MultiEdit",
      "hooks": [{"type": "command", "command": "ccguard"}]
    }],
    "PostToolUse": [{
      "matcher": "Write|Edit|MultiEdit",  // Only needed for snapshot strategy
      "hooks": [{"type": "command", "command": "ccguard"}]
    }],
    "UserPromptSubmit": [{
      "hooks": [{"type": "command", "command": "ccguard"}]
    }]
  }
}
```

> **Note**: The PostToolUse hook is only required if using the `snapshot` strategy. The default `cumulative` strategy only needs PreToolUse.

### 2️⃣ Usage

CCGuard automatically checks file operations. Control using:

```bash
ccguard on      # Enable enforcement (default)
ccguard off     # Disable enforcement
ccguard status  # Show status and LOC statistics
ccguard reset   # Reset session statistics
ccguard version # Show CCGuard version (aliases: v, --version, -v)
```

---

## ⚙️ How CCGuard Works

CCGuard tracks three operations in Claude Code:

* **Edit**: Tracks changed lines
* **MultiEdit**: Cumulative tracking across edits
* **Write**: Counts lines in new files as additions

CCGuard has two enforcement strategies:

### Cumulative Strategy (Default)
* **PreToolUse Only**: Validates changes before they're applied
* **Cumulative Tracking**: Tracks additions/removals per operation
* **Prevention**: Blocks operations that would exceed threshold

### Snapshot Strategy (Recommended as of v0.1.4)
* **Project-Wide Tracking**: Takes baseline snapshot of entire project
* **PostToolUse Validation**: Validates after changes are applied
* **Automatic Reversion**: Reverts changes if threshold is exceeded
* **Git Integration**: Uses git to revert files safely
* **.gitignore Aware**: Respects project's ignore patterns

> **Why Snapshot is Recommended**: The snapshot strategy provides more robust session-wide tracking by monitoring the actual state of your entire codebase. Unlike the cumulative strategy which only tracks Edit/MultiEdit/Write operations, snapshot captures ALL changes including file deletions via bash commands, making it more accurate for enforcing net-negative LOC constraints.

### 📝 Examples

With default settings (`allowedPositiveLines: 0`):

| Operation                                   | Allowed?  |
| ------------------------------------------- | --------- |
| Refactor 10 lines into 5 (-5 net)           | ✅ Allowed |
| Replace 3 functions with 1 concise function | ✅ Allowed |
| Add new 20-line function without removal    | ❌ Blocked |
| Create new file without removals            | ❌ Blocked |

With positive buffer (`allowedPositiveLines: 10`):

| Operation                                   | Allowed?  |
| ------------------------------------------- | --------- |
| Add 8 lines, remove 0 (+8 net)              | ✅ Allowed |
| Add 15 lines, remove 0 (+15 net)            | ❌ Blocked |
| Session total: +5, new operation: +4        | ✅ Allowed |
| Session total: +8, new operation: +5        | ❌ Blocked |

---

## 📌 Configuration

Customize CCGuard with `.ccguard.config.json` in your project root:

```json
{
  "enforcement": {
    "mode": "session-wide",        // or "per-operation"
    "strategy": "cumulative",      // or "snapshot"
    "ignoreEmptyLines": true
  },
  "whitelist": {
    "patterns": [                  
      "**/node_modules/**",
      "**/dist/**",
      "**/*.generated.*"
    ],
    "extensions": [                
      ".md",
      ".json",
      ".lock"
    ]
  },
  "thresholds": {
    "allowedPositiveLines": 0
  }
}
```

### ⚙️ Options

* **Mode**:
  * `session-wide`: Track cumulative LOC (default)
  * `per-operation`: Check each operation individually

* **Strategy** (for session-wide mode):
  * `cumulative`: Traditional counting of changes (default)
  * `snapshot`: Project-wide snapshot tracking with automatic reversion

* **Thresholds**:
  * `allowedPositiveLines`: Buffer for positive changes (default: 0)
    * `0` = Strict net-negative enforcement
    * `10` = Allow up to +10 lines net change
    * Applies to both session-wide and per-operation modes

* **Whitelist**: Skip files by pattern or extension

* **Empty Lines**: Optionally ignore empty lines (default: true)

---

## 💡 Best Practices

* **Start Fresh**: Use `ccguard reset` before new tasks.
* **Refactor First**: Optimize code before additions.
* **Think Modular**: Create reusable components.
* **Question New Code**: Always assess necessity.

---

## ⚠️ Limitations

* Tracks changes only within a Claude Code session.
* Session statistics are not persistent across sessions.
* Changes outside Claude Code are not tracked.

---

## 🤝 Contributing

CCGuard is very new and we welcome any new ideas that would make it better! We're excited to hear your suggestions for new features, better workflows, and creative use cases. Submit issues and pull requests on GitHub.

Inspired by [tdd-guard](https://github.com/nizos/tdd-guard).

---

## 📄 License

[MIT](LICENSE)
