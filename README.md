# Telegram × Claude — Personal AI Assistant

A personal AI assistant running on Telegram, powered by **Claude Code CLI** as the brain. No fine-tuning. No complex RAG. Just a smart bridge between Telegram and Claude, with memory files, MCP tool integrations, and a daily scheduler.

```
You → Telegram → Node.js bridge → Claude Code CLI → MCP tools (Gmail, Calendar, IMAP, SNCF...)
                                         ↕
                               Memory files (Markdown)
```

## What it does

- **Answers your messages** through Telegram using Claude as the LLM
- **Remembers you** across sessions via injected Markdown memory files
- **Learns from its mistakes** via a nightly self-reflection routine at 1am
- **Sends proactive briefings**: morning at 8am, midday check, evening summary, 22h agenda watch
- **Manages reminders** with inline buttons (✅ Done / ⏰ +1h snooze)
- **Reads your emails** (Gmail + IMAP), **checks your calendar** (Google Calendar), **looks up trains** (SNCF)
- **Transcribes voice messages** via Gemini

---

## Table of Contents

1. [Architecture](docs/architecture.md)
2. [Server Setup](docs/setup-server.md)
3. [Memory System](docs/memory-system.md)
4. [MCP Servers](docs/mcp-servers.md)
5. [Scheduler & Daily Routines](docs/scheduler.md)
6. [Running Locally vs Production](docs/deployment.md)

---

## Quick Start

```bash
# 1. Clone & install
git clone https://github.com/YOUR_USERNAME/telegram-claude-assistant
cd telegram-claude-assistant
npm install

# 2. Configure
cp .env.example .env
# Fill in: TELEGRAM_TOKEN, YOUR_CHAT_ID, GEMINI_API_KEY

# 3. Set up the database
node tools/init-db.js

# 4. Configure MCP servers (see docs/mcp-servers.md)
cp .mcp.example.json .mcp.json
# Edit .mcp.json with your credentials

# 5. Run
npm start
```

---

## Tech Stack

| Layer | Tech |
|-------|------|
| Interface | Telegram (Telegraf) |
| Brain | Claude Code CLI (`claude -p`) |
| Database | SQLite (better-sqlite3) |
| Scheduler | node-cron |
| Voice | Gemini Flash |
| Tools | MCP servers |
| Process manager | PM2 |
| Server | Any Linux VPS (Hetzner, OVH, etc.) |
