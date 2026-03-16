# Deployment

## Running in Production with PM2

### ecosystem.config.cjs

```javascript
module.exports = {
  apps: [{
    name: 'assistant',
    script: 'index.js',
    cwd: '/home/yourname/Projects/assistant',
    interpreter: 'node',
    interpreter_args: '--experimental-vm-modules',
    env: {
      NODE_ENV: 'production',
    },
    watch: false,
    max_memory_restart: '500M',
    error_file: './data/logs/error.log',
    out_file: './data/logs/out.log',
    log_date_format: 'YYYY-MM-DD HH:mm:ss',
    restart_delay: 5000,
    max_restarts: 10,
  }],
};
```

### Start / stop / restart

```bash
pm2 start ecosystem.config.cjs   # start
pm2 stop assistant                # stop
pm2 restart assistant             # restart
pm2 reload assistant              # zero-downtime reload
pm2 logs assistant --lines 50     # view logs
pm2 monit                         # live monitoring dashboard
```

### Auto-restart on server reboot

```bash
pm2 startup   # generates a systemd command, run it
pm2 save      # saves current process list
```

---

## Environment Variables (.env)

```bash
# Required
TELEGRAM_TOKEN=          # from @BotFather
YOUR_CHAT_ID=            # your Telegram user ID (integer)
GEMINI_API_KEY=          # from Google AI Studio (for voice transcription)
ASSISTANT_DIR=           # absolute path to project dir

# Optional - if you use Gmail MCP directly via env instead of .mcp.json
GMAIL_CLIENT_ID=
GMAIL_CLIENT_SECRET=
GMAIL_REFRESH_TOKEN=
```

---

## Local Development

```bash
# Run with hot reload
npm run dev  # uses node --watch

# Test the Claude bridge manually
node -e "
import('./services/claude-bridge.js').then(m =>
  m.chat('What time is it?').then(console.log)
)
"

# Run in a Docker container (optional)
docker build -t assistant .
docker run -d --name assistant \
  --env-file .env \
  -v $(pwd)/data:/app/data \
  -v $(pwd)/memory:/app/memory \
  assistant
```

---

## Logs

```
data/logs/
├── out.log       ← stdout (PM2)
├── error.log     ← stderr (PM2)
└── audit.log     ← structured JSON: every Claude call (session, tools used, correction signals)
```

**audit.log format:**
```json
{"ts":"2024-01-15T14:32:00Z","session":"a1b2c3d4","message_preview":"check my emails","correction_signal":null,"new_session":false,"tool_calls":[{"name":"gmail_list_unread","input":"{}"}]}
```

Useful for debugging: which tools are being called, which messages trigger corrections, session patterns.

---

## Backup

The scheduler runs a DB backup at 3am daily:

```javascript
// services/memory.js
export function backup() {
  const src = `${ASSISTANT_DIR}/data/assistant.db`;
  const dst = `${ASSISTANT_DIR}/data/assistant.backup.${new Date().toISOString().split('T')[0]}.db`;
  fs.copyFileSync(src, dst);
}
```

For off-server backup, add a cron on your local machine:

```bash
# In your local crontab (crontab -e)
0 4 * * * rsync -az yourname@YOUR_SERVER_IP:/home/yourname/Projects/assistant/data/assistant.db ~/backups/assistant/
```

---

## Updating

```bash
ssh yourname@YOUR_SERVER_IP
cd /home/yourname/Projects/assistant
git pull
npm install
pm2 restart assistant
```
