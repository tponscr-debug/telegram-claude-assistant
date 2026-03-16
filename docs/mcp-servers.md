# MCP Servers

MCP (Model Context Protocol) is Anthropic's standard for giving Claude access to external tools. Claude Code CLI auto-discovers MCP servers configured in `.mcp.json` in the project directory.

## How MCP Works Here

When Claude is spawned by the bridge, it reads `.mcp.json` from the `ASSISTANT_DIR`. Each entry is a server process Claude can call. Claude decides **on its own** when to use which tool — you don't need to tell it "use Gmail to check emails", just say "check my emails".

---

## `.mcp.json` Structure

```json
{
  "mcpServers": {
    "gmail": {
      "command": "node",
      "args": ["/path/to/project/mcp-gmail/index.js"],
      "env": {
        "GMAIL_CLIENT_ID": "...",
        "GMAIL_CLIENT_SECRET": "...",
        "GMAIL_REFRESH_TOKEN": "..."
      }
    },
    "google-calendar": {
      "command": "npx",
      "args": ["-y", "@cocal/google-calendar-mcp"],
      "env": {
        "GOOGLE_CLIENT_ID": "...",
        "GOOGLE_CLIENT_SECRET": "...",
        "GOOGLE_REFRESH_TOKEN": "..."
      }
    },
    "imap": {
      "command": "node",
      "args": ["/path/to/project/mcp-imap/index.js"],
      "env": {
        "IMAP_HOST": "mail.example.com",
        "IMAP_USER": "you@example.com",
        "IMAP_PASSWORD": "..."
      }
    },
    "sncf": {
      "command": "node",
      "args": ["/path/to/project/mcp-sncf/index.js"]
    }
  }
}
```

See `.mcp.example.json` for the full template.

---

## MCP Server 1: Gmail

**Purpose:** Read unread emails, search emails, send emails.

**Install:**
```bash
# The mcp-gmail server is included in src/mcp-gmail/
npm install --prefix src/mcp-gmail
```

**Google OAuth Setup:**
1. Go to [Google Cloud Console](https://console.cloud.google.com)
2. Create a project → Enable Gmail API
3. Create OAuth 2.0 credentials (Desktop app)
4. Download the credentials JSON
5. Run the auth script:
   ```bash
   node tools/google-auth.js --scope gmail
   ```
6. Copy the refresh token to `.mcp.json`

**Available tools:**
- `gmail_list_unread` — list unread messages
- `gmail_read` — read a specific email
- `gmail_search` — search emails
- `gmail_send` — send an email

---

## MCP Server 2: Google Calendar

**Purpose:** Read events, create events, check availability.

**Install:**
```bash
npx @cocal/google-calendar-mcp --version  # auto-installs on first use
```

**Google OAuth Setup:**
Same project as Gmail. Enable Calendar API and generate a refresh token with calendar scope:
```bash
node tools/google-auth.js --scope calendar
```

**Available tools:**
- `list_events` — events for a date range
- `create_event` — create a calendar event
- `get_event` — get event details

---

## MCP Server 3: IMAP (Custom mailbox)

**Purpose:** Read emails from any IMAP mailbox (Hostinger, ProtonMail bridge, self-hosted, etc.)

**Install:**
```bash
npm install --prefix src/mcp-imap
```

**Configuration:**
```json
{
  "IMAP_HOST": "mail.yourdomain.com",
  "IMAP_PORT": "993",
  "IMAP_USER": "you@yourdomain.com",
  "IMAP_PASSWORD": "your_password",
  "IMAP_TLS": "true"
}
```

**Available tools:**
- `fetch_emails` — fetch recent emails from a mailbox
- `read_email` — read a specific email by UID

---

## MCP Server 4: SNCF (French trains)

**Purpose:** Look up train schedules between French stations.

**Install:**
```bash
npm install --prefix src/mcp-sncf
```

**No API key required** — uses the public SNCF data.

**Available tools:**
- `search_trains` — find trains between two stations
- `get_next_trains` — next departures from a station

---

## Adding More MCP Servers

The ecosystem is large. Useful additions:

| Server | Use case | Install |
|--------|----------|---------|
| `@modelcontextprotocol/server-filesystem` | Read/write local files | `npx` |
| `@modelcontextprotocol/server-brave-search` | Web search | `npx` + API key |
| `mcp-server-notion` | Notion pages | npm |
| `mcp-todoist` | Todoist tasks | npm |
| `@openbnb/mcp-server-airbnb` | Airbnb search | npm |

Browse the full registry: [github.com/modelcontextprotocol/servers](https://github.com/modelcontextprotocol/servers)

---

## Debugging MCP

If Claude doesn't seem to be using a tool:

```bash
# Run Claude interactively to test MCP
cd /path/to/project
claude  # opens interactive mode
# > list my unread emails

# Check MCP server loads
claude --mcp-debug -p "what tools do you have?"
```

Common issues:
- Wrong path in `args`
- Missing credentials in `env`
- MCP server process crashes on startup (check with `node mcp-xxx/index.js` manually)
