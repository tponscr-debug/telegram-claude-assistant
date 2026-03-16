/**
 * Memory Service
 *
 * SQLite-backed persistence for tasks, reminders, notes, facts, and message history.
 * Uses better-sqlite3 (synchronous, much simpler than async drivers).
 */

import Database from 'better-sqlite3';
import { existsSync, copyFileSync } from 'fs';
import { join } from 'path';

const ASSISTANT_DIR = process.env.ASSISTANT_DIR || process.cwd();
const DB_PATH = join(ASSISTANT_DIR, 'data', 'assistant.db');

let db = null;

export function getDb() {
  if (!db) {
    db = new Database(DB_PATH);
    db.pragma('journal_mode = WAL');
    initSchema(db);
  }
  return db;
}

function initSchema(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS facts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      category TEXT NOT NULL,
      key TEXT NOT NULL,
      value TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(category, key)
    );

    CREATE TABLE IF NOT EXISTS tasks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      description TEXT,
      status TEXT DEFAULT 'pending',
      due_date DATETIME,
      reminded_at DATETIME,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      role TEXT NOT NULL,
      content TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS notes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      content TEXT NOT NULL,
      tags TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS reminders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      message TEXT NOT NULL,
      due_at DATETIME NOT NULL,
      sent INTEGER DEFAULT 0,
      acknowledged INTEGER DEFAULT 0,
      nudge_count INTEGER DEFAULT 0,
      next_nudge_at DATETIME,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);
}

// --- Facts ---

export function getFacts() {
  return getDb().prepare('SELECT * FROM facts ORDER BY category, key').all();
}

export function upsertFact(category, key, value) {
  return getDb().prepare(`
    INSERT INTO facts (category, key, value) VALUES (?, ?, ?)
    ON CONFLICT(category, key) DO UPDATE SET value = excluded.value, updated_at = CURRENT_TIMESTAMP
  `).run(category, key, value);
}

// --- Tasks ---

export function getTasks(status = 'pending') {
  return getDb().prepare('SELECT * FROM tasks WHERE status = ? ORDER BY created_at').all(status);
}

export function getPendingTasksOlderThan(hours) {
  return getDb().prepare(`
    SELECT * FROM tasks
    WHERE status = 'pending'
    AND (reminded_at IS NULL OR datetime(reminded_at) < datetime('now', '-${hours} hours'))
    AND datetime(created_at) < datetime('now', '-${hours} hours')
  `).all();
}

export function markTaskDone(id) {
  return getDb().prepare("UPDATE tasks SET status = 'done' WHERE id = ?").run(id);
}

export function markTaskReminded(id) {
  return getDb().prepare('UPDATE tasks SET reminded_at = CURRENT_TIMESTAMP WHERE id = ?').run(id);
}

// --- Messages (for nightly reflection) ---

export function saveMessage(role, content) {
  getDb().prepare('INSERT INTO messages (role, content) VALUES (?, ?)').run(role, content);
  // Keep only last 500 messages
  getDb().prepare('DELETE FROM messages WHERE id NOT IN (SELECT id FROM messages ORDER BY id DESC LIMIT 500)').run();
}

export function getRecentMessages(limit = 30) {
  return getDb().prepare('SELECT * FROM messages ORDER BY id DESC LIMIT ?').all(limit).reverse();
}

// --- Notes ---

export function saveNote(content, tags = null) {
  const result = getDb().prepare('INSERT INTO notes (content, tags) VALUES (?, ?)').run(content, tags);
  return result.lastInsertRowid;
}

export function getNotes(limit = 10) {
  return getDb().prepare('SELECT * FROM notes ORDER BY created_at DESC LIMIT ?').all(limit);
}

// --- Reminders ---

export function createReminder(message, dueAt) {
  const result = getDb().prepare('INSERT INTO reminders (message, due_at) VALUES (?, ?)').run(message, dueAt);
  return result.lastInsertRowid;
}

export function getActiveReminders() {
  return getDb().prepare(`
    SELECT * FROM reminders
    WHERE acknowledged = 0
    AND sent = 1
    ORDER BY due_at
  `).all();
}

// Reminders that are due and haven't been sent yet
export function getDueReminders() {
  // Compare using Paris timezone string to avoid UTC/local mismatch
  const nowParis = new Date().toLocaleString('sv', { timeZone: process.env.SCHEDULER_TIMEZONE || 'Europe/Paris' });
  return getDb().prepare(`
    SELECT * FROM reminders
    WHERE sent = 0
    AND acknowledged = 0
    AND due_at <= ?
  `).all(nowParis);
}

// Reminders sent but not acknowledged, where nudge time has passed
export function getDueNudges() {
  const nowParis = new Date().toLocaleString('sv', { timeZone: process.env.SCHEDULER_TIMEZONE || 'Europe/Paris' });
  return getDb().prepare(`
    SELECT * FROM reminders
    WHERE sent = 1
    AND acknowledged = 0
    AND nudge_count < 6
    AND (next_nudge_at IS NULL OR next_nudge_at <= ?)
  `).all(nowParis);
}

export function markReminderSent(id) {
  // Schedule first nudge in 1 hour
  const nextNudge = new Date(Date.now() + 60 * 60 * 1000)
    .toLocaleString('sv', { timeZone: process.env.SCHEDULER_TIMEZONE || 'Europe/Paris' });
  getDb().prepare('UPDATE reminders SET sent = 1, next_nudge_at = ? WHERE id = ?').run(nextNudge, id);
}

export function markNudgeSent(id, currentNudgeCount) {
  const nextCount = currentNudgeCount + 1;
  // Exponential backoff: 1h, 2h, 4h, 4h, 4h...
  const hours = Math.min(Math.pow(2, nextCount - 1), 4);
  const nextNudge = new Date(Date.now() + hours * 60 * 60 * 1000)
    .toLocaleString('sv', { timeZone: process.env.SCHEDULER_TIMEZONE || 'Europe/Paris' });
  getDb().prepare('UPDATE reminders SET nudge_count = ?, next_nudge_at = ? WHERE id = ?').run(nextCount, nextNudge, id);
}

export function acknowledgeReminder(id) {
  getDb().prepare('UPDATE reminders SET acknowledged = 1 WHERE id = ?').run(id);
}

export function snoozeReminder(id, minutes) {
  const newTime = new Date(Date.now() + minutes * 60 * 1000)
    .toLocaleString('sv', { timeZone: process.env.SCHEDULER_TIMEZONE || 'Europe/Paris' });
  getDb().prepare('UPDATE reminders SET due_at = ?, sent = 0, nudge_count = 0 WHERE id = ?').run(newTime, id);
}

// --- Backup ---

export function backup() {
  const date = new Date().toISOString().split('T')[0];
  const dst = join(ASSISTANT_DIR, 'data', `assistant.backup.${date}.db`);
  copyFileSync(DB_PATH, dst);
  console.log(`[DB] Backup created: ${dst}`);
}
