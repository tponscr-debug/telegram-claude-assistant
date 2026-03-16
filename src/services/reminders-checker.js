/**
 * Reminders Checker
 *
 * Runs every minute. Checks for due reminders in the DB and sends them
 * with inline buttons (✅ Done / ⏰ +1h snooze).
 *
 * Also handles "nudges" — re-sends unacknowledged reminders at increasing intervals.
 */

import cron from 'node-cron';
import { getDueReminders, getDueNudges, markReminderSent, markNudgeSent, acknowledgeReminder, snoozeReminder } from './memory.js';

const TZ = process.env.SCHEDULER_TIMEZONE || 'Europe/Paris';
const NUDGE_LABELS = ['', '2nd reminder', '3rd reminder', '4th reminder', '5th reminder', 'Final reminder!'];

let botInstance = null;
let chatId = null;

function reminderKeyboard(id) {
  return {
    inline_keyboard: [[
      { text: '✅ Done', callback_data: `rdone_${id}` },
      { text: '⏰ +1h', callback_data: `rsnooze_${id}` },
    ]],
  };
}

function buildReminderText(reminder, isNudge) {
  const nudgeLabel = isNudge && reminder.nudge_count >= 1
    ? ` (${NUDGE_LABELS[reminder.nudge_count] || 'follow-up'})`
    : '';
  return `Reminder${nudgeLabel}: ${reminder.message}`;
}

export function initRemindersChecker(bot, userChatId) {
  botInstance = bot;
  chatId = userChatId;

  // Check every minute
  cron.schedule('* * * * *', async () => {
    if (!botInstance || !chatId) return;
    try {
      // 1. Initial reminders (first time)
      const due = getDueReminders();
      for (const reminder of due) {
        await botInstance.telegram.sendMessage(
          chatId,
          buildReminderText(reminder, false),
          { reply_markup: reminderKeyboard(reminder.id) }
        );
        markReminderSent(reminder.id);
        console.log(`[Reminders] Sent [${reminder.id}]: ${reminder.message.slice(0, 50)}`);
      }

      // 2. Nudges (re-sends for unacknowledged reminders)
      const nudges = getDueNudges();
      for (const reminder of nudges) {
        await botInstance.telegram.sendMessage(
          chatId,
          buildReminderText(reminder, true),
          { reply_markup: reminderKeyboard(reminder.id) }
        );
        markNudgeSent(reminder.id, reminder.nudge_count);
        console.log(`[Reminders] Nudge ${reminder.nudge_count} [${reminder.id}]: ${reminder.message.slice(0, 50)}`);
      }
    } catch (err) {
      console.error('[Reminders] Error:', err.message);
    }
  }, { timezone: TZ });

  console.log('[Reminders] Checker started.');
}

export function handleReminderDone(id) {
  acknowledgeReminder(id);
  console.log(`[Reminders] Acknowledged [${id}]`);
}

export async function handleReminderSnooze(id, bot, userChatId) {
  snoozeReminder(id, 60); // +60 minutes
  console.log(`[Reminders] Snoozed 1h [${id}]`);
}
