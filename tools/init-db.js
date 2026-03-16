/**
 * Database initialization script
 * Run once: node tools/init-db.js
 */

import 'dotenv/config';
import Database from 'better-sqlite3';
import { mkdirSync, existsSync } from 'fs';
import { join } from 'path';

const ASSISTANT_DIR = process.env.ASSISTANT_DIR || process.cwd();
const DB_DIR = join(ASSISTANT_DIR, 'data');
const DB_PATH = join(DB_DIR, 'assistant.db');
const LOGS_DIR = join(DB_DIR, 'logs');

// Create directories
[DB_DIR, LOGS_DIR, join(ASSISTANT_DIR, 'memory', 'feedback')].forEach(dir => {
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
    console.log(`Created: ${dir}`);
  }
});

// Initialize database
const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');

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

console.log(`✅ Database initialized: ${DB_PATH}`);
console.log('\nNext steps:');
console.log('1. Copy memory templates: cp -r memory-templates/* memory/');
console.log('2. Edit memory/you.md with your personal context');
console.log('3. Copy CLAUDE.md template: cp CLAUDE.example.md CLAUDE.md');
console.log('4. Configure .mcp.json (see docs/mcp-servers.md)');
console.log('5. Run: npm start');

db.close();
