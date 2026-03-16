import 'dotenv/config';
import { Telegraf } from 'telegraf';
import { setupHandlers } from './bot/handler.js';
import { initScheduler } from './services/scheduler.js';
import { getDb } from './services/memory.js';
import { initRemindersChecker } from './services/reminders-checker.js';

// Validate required environment variables
const required = ['TELEGRAM_TOKEN', 'GEMINI_API_KEY', 'YOUR_CHAT_ID'];
for (const key of required) {
  if (!process.env[key]) {
    console.error(`❌ Missing required variable: ${key}`);
    process.exit(1);
  }
}

// Init DB
getDb();
console.log('[DB] SQLite initialized.');

// Init bot
const bot = new Telegraf(process.env.TELEGRAM_TOKEN);

// Setup handlers
setupHandlers(bot);

// Setup scheduler
initScheduler(bot, parseInt(process.env.YOUR_CHAT_ID));
initRemindersChecker(bot, parseInt(process.env.YOUR_CHAT_ID));
console.log('[Reminders] Checker initialized.');

// Error handling
bot.catch((err, ctx) => {
  console.error(`[Bot] Error for ${ctx.updateType}:`, err.message);
});

// Start
bot.launch();
console.log(`[Bot] Assistant started in polling mode. ✅`);
console.log(`[Bot] Authorized chat ID: ${process.env.YOUR_CHAT_ID}`);

// Graceful shutdown
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
