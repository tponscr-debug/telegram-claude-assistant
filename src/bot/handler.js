/**
 * Bot Handler
 *
 * Telegraf middleware and command handlers.
 * All messages are filtered to YOUR_CHAT_ID only — this bot is for you alone.
 */

import { chat, resetSession } from '../services/claude-bridge.js';
import { handleVoice } from './voice.js';
import {
  getTasks, markTaskDone, saveNote, getNotes,
  createReminder, getActiveReminders,
} from '../services/memory.js';
import { handleReminderDone, handleReminderSnooze } from '../services/reminders-checker.js';

// Rate limiting: max 10 messages per minute
const rateLimitWindow = 60 * 1000;
const rateLimitMax = 10;
const messageTimestamps = [];

// --- Reminder Parsing ---

function parseReminderArgs(text) {
  const now = new Date();

  // YYYY-MM-DD HH:MM message
  const dateTimeMatch = text.match(/^(\d{4}-\d{2}-\d{2})\s+(\d{2}:\d{2})\s+([\s\S]+)$/);
  if (dateTimeMatch) {
    const dueAt = new Date(`${dateTimeMatch[1]}T${dateTimeMatch[2]}:00`);
    return { dueAt, message: dateTimeMatch[3].trim() };
  }

  // 30min message
  const minMatch = text.match(/^(\d+)min\s+([\s\S]+)$/i);
  if (minMatch) {
    const dueAt = new Date(now.getTime() + parseInt(minMatch[1]) * 60 * 1000);
    return { dueAt, message: minMatch[2].trim() };
  }

  // 2h message
  const hourMatch = text.match(/^(\d+)h\s+([\s\S]+)$/i);
  if (hourMatch) {
    const dueAt = new Date(now.getTime() + parseInt(hourMatch[1]) * 60 * 60 * 1000);
    return { dueAt, message: hourMatch[2].trim() };
  }

  // tomorrow message
  const tomorrowMatch = text.match(/^tomorrow\s+([\s\S]+)$/i);
  if (tomorrowMatch) {
    const dueAt = new Date(now.getTime() + 24 * 60 * 60 * 1000);
    return { dueAt, message: tomorrowMatch[1].trim() };
  }

  return null;
}

// --- Typing Indicator ---

function startTyping(ctx) {
  ctx.sendChatAction('typing').catch(() => {});
  const interval = setInterval(() => {
    ctx.sendChatAction('typing').catch(() => {});
  }, 4000);
  return interval;
}

// --- Handlers ---

export function setupHandlers(bot) {

  // Auth middleware — only respond to the configured chat ID
  bot.use(async (ctx, next) => {
    const fromId = ctx.from?.id;
    const allowed = parseInt(process.env.YOUR_CHAT_ID);
    if (fromId !== allowed) return;

    // Rate limiting
    const now = Date.now();
    while (messageTimestamps.length && messageTimestamps[0] < now - rateLimitWindow) {
      messageTimestamps.shift();
    }
    if (messageTimestamps.length >= rateLimitMax) {
      return ctx.reply('Too many messages! Slow down a bit.');
    }
    messageTimestamps.push(now);

    return next();
  });

  // Inline buttons — reminder ✅ Done and ⏰ +1h
  bot.on('callback_query', async (ctx) => {
    const data = ctx.callbackQuery?.data;
    if (!data) return;

    if (data.startsWith('rdone_')) {
      const id = parseInt(data.replace('rdone_', ''));
      handleReminderDone(id);
      await ctx.answerCbQuery('Done!');
      await ctx.editMessageReplyMarkup({ inline_keyboard: [] }).catch(() => {});
    } else if (data.startsWith('rsnooze_')) {
      const id = parseInt(data.replace('rsnooze_', ''));
      await handleReminderSnooze(id, bot, process.env.YOUR_CHAT_ID);
      await ctx.answerCbQuery('Snoozed for 1 hour.');
      await ctx.editMessageReplyMarkup({ inline_keyboard: [] }).catch(() => {});
    }
  });

  bot.start(async (ctx) => {
    await ctx.reply(
      'Hello! I\'m ready.\n\nYou can talk to me freely, send voice messages, or use these commands:\n\n' +
      '/tasks — your pending tasks\n' +
      '/agenda — your calendar\n' +
      '/emails — your recent emails\n' +
      '/note — save a quick note\n' +
      '/reminder — set a reminder\n' +
      '/reminders — list active reminders\n' +
      '/memory — what I know about you\n' +
      '/reset — reset the conversation session\n\n' +
      'What do you need to do today?'
    );
  });

  bot.command('tasks', async (ctx) => {
    const tasks = getTasks('pending');
    if (tasks.length === 0) return ctx.reply('No pending tasks. Enjoy!');
    const list = tasks.map(t => `[${t.id}] ${t.title}${t.due_date ? ` — ${t.due_date}` : ''}`).join('\n');
    await ctx.reply(`Pending tasks:\n\n${list}\n\nMark done: /done [id]`);
  });

  bot.command('done', async (ctx) => {
    const args = ctx.message.text.split(' ');
    const id = parseInt(args[1]);
    if (!id) return ctx.reply('Usage: /done [id] — e.g. /done 3');
    const result = markTaskDone(id);
    await ctx.reply(result.changes > 0 ? `Task [${id}] marked as done.` : `Task [${id}] not found.`);
  });

  bot.command('note', async (ctx) => {
    const text = ctx.message.text.replace('/note', '').trim();
    if (!text) return ctx.reply('Usage: /note [text] — e.g. /note call dentist tomorrow');
    const id = saveNote(text);
    await ctx.reply(`Note saved [${id}]: "${text}"`);
  });

  bot.command('notes', async (ctx) => {
    const notes = getNotes(10);
    if (notes.length === 0) return ctx.reply('No notes saved.');
    const list = notes.map(n => `[${n.id}] ${n.content}`).join('\n');
    await ctx.reply(`Recent notes:\n\n${list}`);
  });

  bot.command('memory', async (ctx) => {
    const typingInterval = startTyping(ctx);
    try {
      const response = await chat(
        'MEMORY_COMMAND: Read memory/MEMORY.md to get the list of all memory files. Then read each file. ' +
        'Give me a structured summary of everything you know about me, organized by category. Max 30 lines. ' +
        'End with: "To correct or add something, just tell me."'
      );
      clearInterval(typingInterval);
      await ctx.reply(response);
    } catch (err) {
      clearInterval(typingInterval);
      await ctx.reply('Could not read memory right now.');
    }
  });

  bot.command('reset', async (ctx) => {
    resetSession();
    await ctx.reply('Session reset. New conversation started.');
  });

  bot.command('reminders', async (ctx) => {
    const active = getActiveReminders();
    if (active.length === 0) return ctx.reply('No active reminders.');
    const list = active.map(r => `[${r.id}] ${r.message}`).join('\n');
    await ctx.reply(`Active reminders:\n\n${list}`);
  });

  bot.command('reminder', async (ctx) => {
    const text = ctx.message.text.replace('/reminder', '').trim();
    if (!text) return ctx.reply(
      'Usage: /reminder [time] [message]\n\nExamples:\n' +
      '  /reminder 30min check the oven\n' +
      '  /reminder 2h call back John\n' +
      '  /reminder tomorrow submit report\n' +
      '  /reminder 2024-12-25 09:00 Christmas gift for Sarah'
    );

    const parsed = parseReminderArgs(text);
    if (!parsed) return ctx.reply('Format not recognized. Examples:\n  /reminder 30min text\n  /reminder 2h text\n  /reminder tomorrow text\n  /reminder 2024-12-25 09:00 text');

    createReminder(parsed.message, parsed.dueAt.toISOString());

    const formattedTime = parsed.dueAt.toLocaleString('en-US', {
      day: '2-digit', month: '2-digit', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
      timeZone: process.env.SCHEDULER_TIMEZONE || 'Europe/Paris',
    });
    await ctx.reply(`Reminder set for ${formattedTime}: "${parsed.message}"`);
  });

  bot.command('agenda', async (ctx) => {
    const typingInterval = startTyping(ctx);
    try {
      const response = await chat('AGENDA_COMMAND: Check my Google Calendar and list my events for the next 2 days.');
      clearInterval(typingInterval);
      await ctx.reply(response);
    } catch (err) {
      clearInterval(typingInterval);
      await ctx.reply('Could not check the calendar right now.');
    }
  });

  bot.command('emails', async (ctx) => {
    const typingInterval = startTyping(ctx);
    try {
      const response = await chat('EMAIL_COMMAND: Check my unread emails from the last 24 hours and give me a summary.');
      clearInterval(typingInterval);
      await ctx.reply(response);
    } catch (err) {
      clearInterval(typingInterval);
      await ctx.reply('Could not check emails right now.');
    }
  });

  // Voice messages — transcribed via Gemini, then passed to Claude
  bot.on(['voice', 'audio'], async (ctx) => {
    const typingInterval = startTyping(ctx);
    try {
      const transcription = await handleVoice(ctx);
      if (!transcription) {
        clearInterval(typingInterval);
        return ctx.reply('Could not read this voice message.');
      }

      await ctx.reply(`"${transcription}"`); // Show transcription

      const response = await chat(transcription);
      clearInterval(typingInterval);

      // Handle reminder acknowledgement in response
      const doneMatch = response.match(/\bDONE:(\d+)\b/);
      let displayResponse = response;
      if (doneMatch) {
        handleReminderDone(parseInt(doneMatch[1]));
        displayResponse = response.replace(/\n?DONE:\d+\n?/g, '').trim();
      }

      await ctx.reply(displayResponse);
    } catch (err) {
      clearInterval(typingInterval);
      await ctx.reply('Sorry, problem with the voice message. Try typing it?');
    }
  });

  // Text messages — main conversation handler
  bot.on('text', async (ctx) => {
    if (ctx.message.text.startsWith('/')) return;

    const text = ctx.message.text;
    const typingInterval = startTyping(ctx);

    try {
      const response = await chat(text);
      clearInterval(typingInterval);

      // Claude can acknowledge reminders by including DONE:[id] in response
      const doneMatch = response.match(/\bDONE:(\d+)\b/);
      let displayResponse = response;

      if (doneMatch) {
        handleReminderDone(parseInt(doneMatch[1]));
        displayResponse = response.replace(/\n?DONE:\d+\n?/g, '').trim();
      } else {
        // Fallback: if there's exactly 1 active reminder and user clearly says it's done
        const DONE_KEYWORDS = [/\bit'?s done\b/i, /\bi did it\b/i, /\ball done\b/i, /\bfinished\b/i, /\bcompleted\b/i];
        if (DONE_KEYWORDS.some(re => re.test(text))) {
          const active = getActiveReminders();
          if (active.length === 1) {
            handleReminderDone(active[0].id);
          }
        }
      }

      await ctx.reply(displayResponse);
    } catch (err) {
      clearInterval(typingInterval);
      console.error('[Chat] Error:', err.message);
      await ctx.reply('Oops, something went wrong. Try again in a moment.');
    }
  });
}
