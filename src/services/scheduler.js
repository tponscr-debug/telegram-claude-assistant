/**
 * Scheduler
 *
 * Proactive daily routines. The assistant messages you without being asked.
 * All times use the configured timezone (default: Europe/Paris).
 *
 * Jobs:
 * - 8h00 (weekdays) / 9h00 (weekends) — Morning briefing
 * - 12h30 — Midday check (only if tasks have been open 4+ hours)
 * - 17h00 (Fridays) — Weekend / kids reminder
 * - 18h00 — Evening summary
 * - 22h00 — Agenda watch (silent if nothing to report)
 * - 01h00 — Nightly reflection (internal, no user notification)
 * - 03h00 — DB backup
 */

import cron from 'node-cron';
import { getTasks, getPendingTasksOlderThan, markTaskReminded, backup, getRecentMessages } from './memory.js';
import { chat, chatOneShot } from './claude-bridge.js';

const TZ = process.env.SCHEDULER_TIMEZONE || 'Europe/Paris';

let botInstance = null;
let chatId = null;

export function initScheduler(bot, userChatId) {
  botInstance = bot;
  chatId = userChatId;

  cron.schedule('0 8 * * 1-5', async () => { await sendMorningBriefing(); }, { timezone: TZ });
  cron.schedule('0 9 * * 6,0', async () => { await sendMorningBriefing(); }, { timezone: TZ });
  cron.schedule('30 12 * * *', async () => { await sendMiddayReminder(); }, { timezone: TZ });
  cron.schedule('0 18 * * *', async () => { await sendEveningReminder(); }, { timezone: TZ });
  cron.schedule('0 17 * * 5', async () => { await sendWeekendReminder(); }, { timezone: TZ });
  cron.schedule('0 22 * * *', async () => { await sendEveningWatch(); }, { timezone: TZ });
  cron.schedule('0 1 * * *', async () => { await sendNightReflection(); }, { timezone: TZ });
  cron.schedule('0 3 * * *', () => {
    try { backup(); } catch (e) { console.error('[Scheduler] Backup failed:', e.message); }
  }, { timezone: TZ });

  console.log('[Scheduler] All jobs active.');
}

// --- Scheduled Tasks ---

async function sendMorningBriefing() {
  if (!botInstance || !chatId) return;
  const tasks = getTasks('pending');
  const taskList = tasks.length > 0 ? tasks.map(t => `[${t.id}] ${t.title}`).join('\n') : 'none';
  try {
    const response = await chat(
      `SYSTEM_TASK_MORNING_BRIEFING: Start the user's day.
Pending tasks: ${taskList}.
Check their calendar for today and unread emails.
Generate a briefing in max 4 lines: date, today's events, 1 priority task, 1 concrete action.
Plain text, no emoji.`
    );
    await botInstance.telegram.sendMessage(chatId, response);
  } catch (e) {
    console.error('[Scheduler] sendMorningBriefing failed:', e.message);
    // Fallback: send a simple message without Claude
    const now = new Date();
    await botInstance.telegram.sendMessage(chatId,
      `Good morning!\n\n${now.toLocaleDateString('en-US', { weekday: 'long', day: 'numeric', month: 'long' })}\n\nPending tasks: ${taskList}`
    ).catch(() => {});
  }
}

async function sendMiddayReminder() {
  if (!botInstance || !chatId) return;
  const staleTasks = getPendingTasksOlderThan(4); // tasks open for 4+ hours
  if (staleTasks.length === 0) return; // silent if nothing stale

  const taskList = staleTasks.map(t => `[${t.id}] ${t.title}`).join('\n');
  staleTasks.forEach(t => markTaskReminded(t.id));
  try {
    const response = await chat(
      `SYSTEM_TASK_MIDDAY_CHECK: These tasks have been open for 4+ hours: ${taskList}.
Nudge the user in 2 lines max, direct tone.`
    );
    await botInstance.telegram.sendMessage(chatId, response);
  } catch (e) {
    console.error('[Scheduler] sendMiddayReminder failed:', e.message);
    await botInstance.telegram.sendMessage(chatId, `Midday check\n\n${taskList}`).catch(() => {});
  }
}

async function sendEveningReminder() {
  if (!botInstance || !chatId) return;
  const tasks = getTasks('pending');
  const taskList = tasks.length > 0 ? tasks.map(t => `[${t.id}] ${t.title}`).join('\n') : 'none';
  try {
    const response = await chat(
      `SYSTEM_TASK_EVENING_SUMMARY: End of day.
Unfinished tasks: ${taskList}.
Check tomorrow's calendar.
Summary in 3 lines max: what remains, what's planned tomorrow, one thing to prepare tonight.
No emoji.`
    );
    await botInstance.telegram.sendMessage(chatId, response);
  } catch (e) {
    console.error('[Scheduler] sendEveningReminder failed:', e.message);
    await botInstance.telegram.sendMessage(chatId,
      tasks.length === 0 ? 'End of day — all tasks done.' : `Evening summary\n\n${taskList}`
    ).catch(() => {});
  }
}

async function sendWeekendReminder() {
  if (!botInstance || !chatId) return;
  // Customize this for your own recurring Friday reminder
  try {
    const response = await chat(
      "SYSTEM_TASK_WEEKEND_REMINDER: Friday afternoon. Check if there's anything to prepare for the weekend. 2 lines max."
    );
    await botInstance.telegram.sendMessage(chatId, response);
  } catch (e) {
    console.error('[Scheduler] sendWeekendReminder failed:', e.message);
  }
}

async function sendEveningWatch() {
  if (!botInstance || !chatId) return;
  try {
    const response = await chat(
      `SYSTEM_TASK_22H_WATCH: It's 22h.
Check calendar for the next 3 days and unprocessed emails.
Is there anything requiring advance preparation?
If yes: short actionable message.
If nothing: return empty string or "RAS".`
    );
    // Only send if Claude found something noteworthy
    if (response && response.trim() && !['RAS', 'OK', ''].includes(response.trim())) {
      await botInstance.telegram.sendMessage(chatId, response);
    }
  } catch (e) {
    console.error('[Scheduler] sendEveningWatch failed:', e.message);
  }
}

// --- Nightly Reflection (1am) ---
// The "learning" engine. Claude analyzes the day, documents errors, updates rules.
// Uses chatOneShot() — does NOT touch the main session.

async function sendNightReflection() {
  const recentMessages = getRecentMessages(30);
  if (recentMessages.length < 4) {
    console.log('[Scheduler] Night reflection skipped — not enough messages.');
    return;
  }

  const date = new Date().toISOString().split('T')[0];
  const messagesFormatted = recentMessages
    .map(m => `[${m.role.toUpperCase()}] ${m.content.slice(0, 300)}`)
    .join('\n');

  const prompt = `[INTERNAL_TASK — NIGHTLY_REFLECTION — ${date} — DO NOT NOTIFY USER]

Analyze today's messages. No text response — only file actions.

REQUIRED STEPS:

1. Read memory/feedback/ files from the last 3 days (if they exist)

2. For each error detected (FORGOTTEN / DUPLICATE / REPEATED_QUESTION /
   FALSE_CONFIRMATION / MISSED_ACTION):
   Write in memory/feedback/${date}.md (create with header if missing):
   ### [HH:MM] [TYPE]: summary
   - User message: "[excerpt]"
   - Error: [description]
   - Root cause: [hypothesis]
   - Rule to remember: [imperative formulation]

3. If same error type appears in multiple days' files:
   Update "### Documented Errors" section in CLAUDE.md with permanent rule

4. If no errors found: write "# Feedback — ${date}\n\nNo errors detected."

5. Add at end of file:
   ## Summary
   - Error count: [N]
   - CLAUDE.md updated: [yes/no]

MESSAGES TO ANALYZE:
${messagesFormatted}`;

  try {
    await chatOneShot(prompt);
    console.log('[Scheduler] Night reflection complete.');
  } catch (e) {
    console.error('[Scheduler] Night reflection failed:', e.message);
  }
}
