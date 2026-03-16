# Memory System

This is how the assistant "learns" and "remembers" across conversations.

## The Core Problem

Claude Code CLI maintains conversation context within a session (`--resume <session_id>`). But sessions expire. When you start a new session, Claude has zero context about who you are.

**The solution:** Markdown files that get injected at the start of each new session.

---

## How It Works

### 1. Memory Files (Long-term)

Plain Markdown files in `memory/`. Claude reads and writes them freely.

```
memory/
├── MEMORY.md          ← index of all memory files
├── you.md             ← who you are, preferences, context
├── family.md          ← partner, kids, important relationships
├── projects.md        ← ongoing projects and their status
├── events.md          ← upcoming important dates
├── feedback/
│   ├── 2024-01-15.md  ← errors logged by nightly reflection
│   ├── 2024-01-16.md
│   └── ...
├── feedback_rules.md  ← persistent rules derived from errors
└── ...
```

**What goes in `you.md`:**
```markdown
# About Me

## Context
- Name: [your name]
- Location: [city]
- Occupation: [what you do]
- Key constraint: [e.g., ADHD — I tend to hyperfocus and forget tasks]

## Preferences
- Communication style: direct, no fluff
- Response length: short by default, detail on demand
- Language: French (or English, or both)

## Current priorities
- [project A]
- [goal B]
```

### 2. Session Injection

When a new Claude session starts, the bridge reads all key memory files and prepends them to the first message:

```
MEMORY CONTEXT (new session):

=== you.md ===
[full content]

=== family.md ===
[full content]

=== projects.md ===
[full content]

=== feedback_rules.md ===
[full content]

=== END MEMORY CONTEXT ===

Your actual message here...
```

Claude receives all this context before your message. It immediately knows who you are.

### 3. Claude Writes Back

When you tell Claude something important ("remember that my meeting on Friday moved to Thursday"), it writes or updates the relevant memory file directly. It has full file access via Claude Code's native capabilities.

You can also tell it explicitly: "note that..." or "remember..." and it will save it.

### 4. SQLite Facts Table

For structured, frequently-accessed data, Claude can also use the `facts` table in SQLite:

```sql
INSERT INTO facts (category, key, value)
VALUES ('preferences', 'response_language', 'French');
```

The system prompt loads all facts at startup.

---

## The Feedback Loop (Self-Correction)

The nightly reflection at 1am is the "learning" mechanism.

### What happens at 1am

1. Scheduler grabs the last 30 messages from the DB
2. Calls `chatOneShot()` (isolated, doesn't touch main session) with a structured prompt
3. Claude analyzes messages for error patterns:
   - `OUBLI` — forgot something
   - `DOUBLON` — said the same thing twice
   - `FAUSSE_CONFIRMATION` — claimed to have done something it didn't
   - `QUESTION_REPETEE` — asked the same question again
   - `OUBLI_ACTION` — failed to execute something it promised
4. Each error gets documented in `memory/feedback/YYYY-MM-DD.md`
5. If the same error type appears multiple days in a row → updates `CLAUDE.md` with a permanent rule

### Correction Signal Detection

The bridge watches for correction phrases in real-time:

```
"you forgot..."
"you said you would..."
"why didn't you..."
"I already told you..."
"you promised..."
```

When detected, it immediately:
1. Reads the last 3 feedback files
2. Writes a new entry in today's feedback file
3. Triggers Claude to acknowledge and act accordingly

### The Feedback File Format

```markdown
# Feedback — 2024-01-15

### [14:32] [OUBLI_ACTION] : Did not follow up on dentist appointment
- User message: "you didn't call the dentist like I asked"
- Error: Claude confirmed it would remind but did not create reminder
- Root cause: Task created internally but not saved to DB
- Rule: Always use createReminder() when promising to follow up

## Summary
- Error count: 1
- CLAUDE.md updated: no
```

---

## MEMORY.md — The Index

`memory/MEMORY.md` is a table of contents that Claude reads first to know what files exist:

```markdown
# Memory Index

- you.md — personal context, preferences, constraints
- family.md — partner, children, key relationships
- projects.md — active projects and goals
- events.md — upcoming dates and deadlines
- feedback_rules.md — permanent rules from past errors
- feedback/ — daily error logs
```

---

## Tips

**Keep memory files concise.** Claude has a context window. 10 files × 200 lines each = context bloat. Aim for dense, structured notes, not prose.

**Prune regularly.** Old project files, past events — delete or archive them. Claude will re-inject them every session otherwise.

**Use categories.** `[URGENT]`, `[RECURRING]`, `[ARCHIVED]` tags help Claude prioritize.

**The feedback loop compounds.** After a few weeks, Claude accumulates specific rules about your patterns. It gets noticeably better at anticipating your needs.
