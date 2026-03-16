# Scheduler & Daily Routines

The assistant is proactive — it messages you without being asked. All scheduled jobs use `node-cron` with explicit `Europe/Paris` timezone.

## Daily Schedule

| Time | Job | What it does |
|------|-----|--------------|
| 8h00 (Mon-Fri) | Morning briefing | Checks calendar, emails, pending tasks → sends 4-line briefing |
| 9h00 (Sat-Sun) | Weekend briefing | Same, slightly later |
| 12h30 | Midday check | Reminds you of tasks open for 4+ hours |
| 17h00 (Fri only) | Kids reminder | Weekend with the kids coming up? Checks and reminds |
| 18h00 | Evening summary | Open tasks + what's planned tomorrow + one thing to prepare tonight |
| 22h00 | Agenda watch | Checks 3 next days — sends alert only if something needs prep |
| 01h00 | **Nightly reflection** | Analyzes day's messages, writes feedback, updates CLAUDE.md |
| 03h00 | DB backup | Copies SQLite to backup file |

---

## Morning Briefing (8h)

Prompt sent to Claude:

```
SYSTEM_TASK_MORNING: Start the user's day.
Pending tasks: [task list from DB].
Check their calendar for today and unread emails.
Generate a briefing in max 4 lines: date, today's events, 1 priority task, 1 concrete action.
Plain text, no emoji.
```

Includes a fallback in case Claude fails (network timeout, etc.) — sends a simple plaintext message from the DB directly.

---

## Midday Reminder (12h30)

Only fires if there are tasks that haven't been touched in 4+ hours. Avoids spamming you on busy days.

---

## Evening Summary (18h)

```
SYSTEM_TASK_EVENING: End of day summary.
Unfinished tasks: [list].
Check tomorrow's calendar.
Summary in 3 lines max: what remains, what's planned tomorrow, one thing to prepare tonight.
No emoji.
```

---

## 22h Agenda Watch

This one is conditional — Claude only sends a message if it finds something requiring anticipation:

```
SYSTEM_TASK_WATCH: It's 22h.
Check calendar for the next 3 days and unprocessed emails.
Is there anything requiring advance preparation?
If yes: short actionable message.
If quiet: return empty string.
```

If Claude returns empty or "RAS" (nothing to report), no message is sent.

---

## Nightly Reflection (1h) — The Learning Engine

This is the most important scheduled task.

```
[INTERNAL_TASK — NIGHTLY_REFLECTION — 2024-01-15 — DO NOT NOTIFY USER]

Analyze today's messages. No text response — only bash actions.

REQUIRED STEPS:

1. Read memory/feedback/ files from last 3 days

2. For each error detected (OUBLI / DOUBLON / QUESTION_REPETEE /
   FAUSSE_CONFIRMATION / OUBLI_ACTION):
   Write in memory/feedback/2024-01-15.md (create with header if missing)
   Format:
   ### [HH:MM] [TYPE]: summary
   - User message: "[excerpt]"
   - Error: [description]
   - Root cause: [hypothesis]
   - Rule to remember: [imperative formulation]

3. If same error type appears across multiple days:
   Update "### Documented Errors" section in CLAUDE.md

4. If no errors: write "# Feedback — date\n\nNo errors detected."

5. Add at end of file:
   ## Summary
   - Error count: [N]
   - CLAUDE.md updated: [yes/no]

MESSAGES:
[last 30 messages from DB]
```

**Key design decision:** this uses `chatOneShot()` not `chat()`. It runs in a completely isolated Claude process that does NOT touch the main session. The user never sees any output from this — it's pure internal maintenance.

**Why it works:** Claude Code has file access. It genuinely reads the feedback files, compares patterns, and writes structured rules. After a few weeks, `CLAUDE.md` accumulates very specific rules about your usage patterns.

---

## Reminders Checker (every minute)

Separate from the scheduler, `reminders-checker.js` runs a cron every minute:

1. Fetches due reminders from SQLite (`due_at <= NOW()`, `sent = 0`)
2. Sends them with inline buttons: **✅ Done** / **⏰ +1h**
3. For unacknowledged reminders: sends nudges at increasing intervals (1h, 2h, 4h...)
4. Max 6 nudges, then stops

The user can click ✅ Done or ⏰ +1h directly in Telegram without typing.

**Timezone gotcha:** The server runs in UTC. Times are stored in Paris time. Comparison must be done carefully:

```javascript
// Wrong (compares UTC vs Paris time string)
WHERE due_at <= datetime('now')

// Right
const nowParis = new Date().toLocaleString('sv', { timeZone: 'Europe/Paris' });
// nowParis = "2024-01-15 14:32:00" → Paris local time string
// Compare with stored values which were also formatted as Paris local time
```

---

## Customizing the Schedule

Edit `services/scheduler.js`. Change the cron expressions and the prompts to fit your life.

```javascript
// Format: minute hour day-of-month month day-of-week
cron.schedule('0 8 * * 1-5', handler, { timezone: 'Europe/Paris' });
//             │ │  │   │  └── Mon-Fri (1=Mon, 5=Fri)
//             │ │  │   └───── every month
//             │ │  └───────── every day of month
//             │ └──────────── hour 8
//             └────────────── minute 0
```
