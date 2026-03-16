# Architecture

## Overview

The architecture is intentionally simple. There is no custom LLM, no vector database, no complex orchestration framework. The entire "intelligence" comes from Claude Code CLI — you just need a bridge.

```
┌─────────────────────────────────────────────────────────┐
│                     Telegram App                        │
│              (your phone, any device)                   │
└────────────────────────┬────────────────────────────────┘
                         │ HTTPS (Telegraf polling)
┌────────────────────────▼────────────────────────────────┐
│                  Node.js Process                        │
│                                                         │
│  ┌──────────────┐    ┌──────────────────────────────┐   │
│  │  bot/        │    │  services/                   │   │
│  │  handler.js  │───▶│  claude-bridge.js            │   │
│  │              │    │                              │   │
│  │  Commands:   │    │  - Manages session ID        │   │
│  │  /taches     │    │  - Injects memory on new     │   │
│  │  /agenda     │    │    session                   │   │
│  │  /mails      │    │  - Detects correction signals│   │
│  │  /reset      │    │  - spawn() claude CLI        │   │
│  │  /rappel     │    │  - Parses JSON output        │   │
│  └──────────────┘    └──────────────┬───────────────┘   │
│                                     │                   │
│  ┌──────────────┐    ┌──────────────▼───────────────┐   │
│  │  scheduler.js│    │  Claude Code CLI              │   │
│  │              │    │  (`claude -p "..." --resume`) │   │
│  │  Cron jobs:  │    │                              │   │
│  │  8h briefing │    │  Has access to:              │   │
│  │  12h30 check │    │  - .mcp.json tools           │   │
│  │  18h evening │    │  - CLAUDE.md instructions    │   │
│  │  22h watch   │    │  - memory/ files             │   │
│  │  1h reflection    └──────────────┬───────────────┘   │
│  └──────────────┘                   │                   │
│                                     │ MCP protocol      │
│  ┌──────────────────────────────────▼───────────────┐   │
│  │               MCP Servers                        │   │
│  │  gmail | google-calendar | imap | sncf           │   │
│  └──────────────────────────────────────────────────┘   │
│                                                         │
│  ┌──────────────────────────────────────────────────┐   │
│  │  SQLite DB          memory/ (Markdown files)     │   │
│  │  - tasks            - you.md                     │   │
│  │  - reminders        - family.md                  │   │
│  │  - messages log     - projects.md                │   │
│  │  - notes            - events.md                  │   │
│  │  - facts            - feedback/YYYY-MM-DD.md     │   │
│  └──────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────┘
```

---

## The Core Idea: Claude Code CLI as a Brain

Most Telegram bots call an LLM API directly. Here, we use **Claude Code CLI** (`claude` binary) instead. The difference is significant:

### Why Claude Code CLI, not the API?

| | Direct API | Claude Code CLI |
|---|---|---|
| Tool use | Manual setup | MCP servers auto-discovered via `.mcp.json` |
| File access | Manual | Can read/write files natively |
| Session persistence | Manual session management | `--resume <session_id>` |
| System prompt | Static | `CLAUDE.md` file in project dir |
| Complexity | High | Near-zero |

Claude Code CLI is designed to operate autonomously. It already knows how to use tools, read files, and continue conversations. We just pipe messages through it.

---

## The Bridge

`services/claude-bridge.js` is the heart of the system. It:

1. **Reads the session ID** from `.claude_session_id` file (invalidated after 24h)
2. **On new session**: injects all memory Markdown files into the first message
3. **Detects correction signals**: if you say "you forgot...", it triggers a feedback protocol
4. **Spawns `claude -p "..." --output-format json --dangerously-skip-permissions`**
5. **Parses the JSON output** to extract the response and the new session ID
6. **Saves the new session ID** for continuity

```
New message arrives
       │
       ▼
Is there a valid session? ──No──▶ Inject memory files + message
       │                                    │
      Yes                                   │
       │                                    ▼
       ▼                          spawn claude (no --resume)
Does message contain ◀─────────────────────┘
correction signal?
       │Yes
       ▼
Build correction prompt
(read feedback/, write new entry)
       │
       ▼
spawn claude --resume <session_id>
       │
       ▼
Parse JSON, save session_id, return response
```

---

## Two Modes of Claude Calls

### `chat(message)` — Main conversation
Uses `--resume` to maintain session continuity. All your daily messages go through this.

### `chatOneShot(message)` — Internal tasks
Used by the nightly reflection scheduler. Does NOT use `--resume`, so it doesn't pollute the main conversation context. Claude reflects on the day's messages, writes feedback files, and exits.

---

## Session Management

Claude Code creates a "conversation" that persists in its own internal storage. We just keep track of the `session_id` it returns in JSON output.

- Session ID is saved in `.claude_session_id`
- Auto-invalidated after 24 hours (force new session daily)
- If Claude returns "No conversation found" → automatic fallback to new session

---

## Database Schema

SQLite with 5 tables:

```sql
facts      -- key/value store: things Claude learns about you
tasks      -- to-do items with status and due dates
messages   -- conversation history (for nightly reflection)
notes      -- quick notes saved via /note command
reminders  -- time-based reminders with sent/acknowledged state
```

See `migrations/001_init.sql` for the full schema.
