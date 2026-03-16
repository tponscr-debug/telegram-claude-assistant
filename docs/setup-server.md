# Server Setup Guide

A ~5€/month VPS is enough. This guide uses Ubuntu 22.04 LTS.

## 1. Get a VPS

Any provider works: Hetzner (recommended, best price/perf), OVH, DigitalOcean, Vultr.

Minimum specs: **1 vCPU, 2GB RAM, 20GB SSD**, Ubuntu 22.04.

---

## 2. Initial Server Setup

```bash
# Connect as root
ssh root@YOUR_SERVER_IP

# Create a non-root user
adduser yourname
usermod -aG sudo yourname

# Copy SSH keys to new user
rsync --archive --chown=yourname:yourname ~/.ssh /home/yourname/

# Test: open a new terminal and connect as yourname
ssh yourname@YOUR_SERVER_IP

# Disable root SSH login
sudo nano /etc/ssh/sshd_config
# Set: PermitRootLogin no
# Set: PasswordAuthentication no
sudo systemctl restart sshd
```

---

## 3. Install Node.js & Claude Code CLI

```bash
# Install Node.js 20 LTS
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs

# Verify
node -v  # should show v20.x.x

# Install Claude Code CLI globally
npm install -g @anthropic-ai/claude-code

# Verify
claude --version

# Authenticate Claude (run interactively, you need an Anthropic account)
claude login
```

> **Note:** Claude Code CLI requires an Anthropic account. The free plan works, but a Pro subscription (~$20/month) gives much better rate limits for an assistant that messages you multiple times a day.

---

## 4. Install System Dependencies

```bash
# ffmpeg for voice message transcription
sudo apt install -y ffmpeg

# SQLite (usually pre-installed)
sudo apt install -y sqlite3

# PM2 for process management
npm install -g pm2
```

---

## 5. Install & Configure the Bot

```bash
# Clone the repo
git clone https://github.com/YOUR_USERNAME/telegram-claude-assistant /home/yourname/Projects/assistant
cd /home/yourname/Projects/assistant

# Install dependencies
npm install

# Configure environment
cp .env.example .env
nano .env
```

Fill in your `.env`:

```bash
TELEGRAM_TOKEN=your_bot_token_from_botfather
YOUR_CHAT_ID=your_telegram_user_id
GEMINI_API_KEY=your_gemini_api_key
ASSISTANT_DIR=/home/yourname/Projects/assistant
```

**How to get your Telegram chat ID:**
1. Message `@userinfobot` on Telegram
2. It will reply with your user ID

**How to get a bot token:**
1. Message `@BotFather` on Telegram
2. `/newbot`, follow instructions
3. Copy the token

---

## 6. Initialize the Database

```bash
node tools/init-db.js
```

---

## 7. Set Up MCP Servers

See [docs/mcp-servers.md](mcp-servers.md) for the full MCP configuration guide.

Quick version: copy `.mcp.example.json` to `.mcp.json` and fill in your credentials.

---

## 8. Create Your Memory Files

```bash
# Copy templates
cp -r memory-templates/ memory/

# Edit the main file about yourself
nano memory/you.md
```

See [docs/memory-system.md](memory-system.md) for what to put in these files.

---

## 9. Create Your CLAUDE.md

This is the system prompt / personality configuration for Claude:

```bash
cp CLAUDE.example.md CLAUDE.md
nano CLAUDE.md
```

This file tells Claude how to behave, what it knows about you, and what rules to follow.

---

## 10. Start with PM2

```bash
# Start the bot
pm2 start ecosystem.config.cjs

# Save PM2 config (auto-restart on reboot)
pm2 save
pm2 startup
# Run the command it shows you

# Check logs
pm2 logs assistant
```

---

## 11. Firewall

```bash
sudo ufw allow OpenSSH
sudo ufw allow 443
sudo ufw enable
sudo ufw status
```

No need to open any port for the Telegram bot — it uses **polling** (outbound connections only).

---

## Maintenance

```bash
# View logs
pm2 logs assistant --lines 100

# Restart
pm2 restart assistant

# Deploy update
git pull && npm install && pm2 restart assistant
```

---

## Security Checklist

- [ ] Root SSH login disabled
- [ ] Password auth disabled (SSH keys only)
- [ ] UFW firewall active
- [ ] `.env` file not in git (it's in `.gitignore`)
- [ ] Bot only responds to your `YOUR_CHAT_ID` (hardcoded in `bot/handler.js`)
- [ ] `--dangerously-skip-permissions` flag in Claude bridge — this is intentional, Claude needs to read/write memory files. The security boundary is your server, not Claude's sandbox.
