# Serveurs MCP

MCP (Model Context Protocol) est le standard d'Anthropic pour donner à Claude accès à des outils externes. Claude Code CLI auto-découvre les serveurs MCP configurés dans `.mcp.json` à la racine du projet.

---

## Claude choisit ses outils tout seul

C'est l'un des aspects les plus puissants du système. Quand Claude est lancé par le bridge, il lit `.mcp.json` et découvre automatiquement tous les outils disponibles. Il décide **de lui-même** quand utiliser lequel — sans que tu aies besoin de lui dire.

**Exemples :**
```
"Check mes mails" → Claude appelle gmail_list_unread sans qu'on lui dise
"C'est quoi mon agenda demain ?" → Claude appelle list_events
"Trouve-moi un Airbnb à Lyon pour ce week-end" → Claude appelle airbnb_search
"Prochain train Paris-Bordeaux ?" → Claude appelle search_trains
```

**Il peut aussi suggérer d'ajouter de nouveaux MCP.** Si tu lui demandes quelque chose qu'il ne peut pas faire (ex: "consulte mes notes Notion"), il peut répondre : *"Je n'ai pas accès à Notion pour l'instant. Tu veux que j'installe le MCP Notion ?"* — et si tu dis oui, il peut modifier `.mcp.json` lui-même et te demander de redémarrer le process.

C'est ça la vraie différence avec un bot classique : il n'y a pas de `if message.contains("mail") then checkEmail()`. Claude comprend l'intention et choisit l'outil.

---

## Structure du `.mcp.json`

```json
{
  "mcpServers": {
    "gmail": {
      "command": "node",
      "args": ["./mcp-gmail/index.js"]
    },
    "google-calendar": {
      "command": "npx",
      "args": ["-y", "@cocal/google-calendar-mcp"],
      "env": {
        "GOOGLE_OAUTH_CREDENTIALS": "/path/to/gcp-oauth.keys.json",
        "GOOGLE_CALENDAR_MCP_TOKEN_PATH": "/path/to/tokens.json"
      }
    },
    "sncf": {
      "command": "node",
      "args": ["./mcp-sncf/index.js"],
      "env": {
        "SNCF_API_KEY": "..."
      }
    },
    "airbnb": {
      "command": "node",
      "args": ["./node_modules/@openbnb/mcp-server-airbnb/dist/index.js"]
    }
  }
}
```

Voir `.mcp.example.json` pour le template complet.

---

## MCP 1 : Gmail

**Usage :** lire les mails non lus, chercher, envoyer.

**Install :**
```bash
npm install --prefix mcp-gmail
```

**Google OAuth :**
1. [Google Cloud Console](https://console.cloud.google.com) → créer un projet
2. Activer l'API Gmail
3. Créer des credentials OAuth 2.0 (application Desktop)
4. Télécharger le JSON credentials
5. Générer le refresh token :
   ```bash
   node tools/google-auth.js --scope gmail
   ```
6. Coller le refresh token dans `.mcp.json`

**Outils disponibles :** `gmail_list_unread`, `gmail_read`, `gmail_search`, `gmail_send`

---

## MCP 2 : Google Calendar

**Usage :** lire les événements, créer des RDV, vérifier les disponibilités.

**Install :** auto via `npx` au premier lancement.

**OAuth :** même projet Google que Gmail. Activer l'API Calendar :
```bash
node tools/google-auth.js --scope calendar
```

**Outils disponibles :** `list_events`, `create_event`, `get_event`

---

## MCP 3 : IMAP (boîte mail custom)

**Usage :** lire les emails de n'importe quelle boîte IMAP (Hostinger, OVH, auto-hébergé...).

**Install :**
```bash
npm install --prefix mcp-imap
```

**Config dans `.mcp.json` :**
```json
{
  "IMAP_HOST": "mail.tondomaine.com",
  "IMAP_PORT": "993",
  "IMAP_USER": "toi@tondomaine.com",
  "IMAP_PASSWORD": "...",
  "IMAP_TLS": "true"
}
```

**Outils disponibles :** `fetch_emails`, `read_email`

---

## MCP 4 : SNCF (trains français)

**Usage :** chercher des horaires de train entre gares françaises.

**Install :**
```bash
npm install --prefix mcp-sncf
```

**Clé API SNCF :** disponible gratuitement sur [data.sncf.com](https://data.sncf.com)

**Outils disponibles :** `search_trains`, `get_next_trains`

```
"Prochain train Paris Gare de Lyon → Bordeaux Saint-Jean demain matin ?"
"Y'a quoi comme TGV entre Lyon et Paris ce soir ?"
```

---

## MCP 5 : Airbnb

**Usage :** chercher des logements Airbnb directement depuis Telegram.

**Install :**
```bash
npm install @openbnb/mcp-server-airbnb
```

**Aucune clé API requise** — utilise les données publiques Airbnb.

**Config dans `.mcp.json` :**
```json
{
  "airbnb": {
    "command": "node",
    "args": ["./node_modules/@openbnb/mcp-server-airbnb/dist/index.js"]
  }
}
```

**Exemples d'utilisation :**
```
"Trouve-moi un Airbnb à Lyon pour 2 personnes ce week-end"
"Airbnb moins de 80€/nuit à Bordeaux en juillet ?"
"C'est quoi les options à Amsterdam pour 4 jours en mai ?"
```

---

## Ajouter d'autres MCP

L'écosystème est large. Quelques ajouts utiles :

| Serveur | Usage | Install |
|---------|-------|---------|
| `@modelcontextprotocol/server-brave-search` | Recherche web | `npx` + clé API |
| `mcp-server-notion` | Pages Notion | `npm` |
| `mcp-todoist` | Tâches Todoist | `npm` |
| `@modelcontextprotocol/server-filesystem` | Fichiers locaux | `npx` |
| `mcp-weather` | Météo | `npm` |
| `mcp-spotify` | Contrôle Spotify | `npm` |

Registre complet : [github.com/modelcontextprotocol/servers](https://github.com/modelcontextprotocol/servers)

**Workflow pour ajouter un MCP :**
1. `npm install <package>`
2. Ajouter l'entrée dans `.mcp.json`
3. Redémarrer le process : `pm2 restart assistant`
4. Claude le découvre automatiquement au prochain appel

---

## Debug MCP

Si Claude n'utilise pas un outil :

```bash
# Tester interactivement
cd /path/to/project
claude
# > list my unread emails

# Vérifier que le serveur MCP démarre
node mcp-gmail/index.js   # doit rester en écoute sans crash

# Voir les outils disponibles
claude --mcp-debug -p "what tools do you have?"
```

Problèmes courants :
- Mauvais chemin dans `args`
- Credentials manquants dans `env`
- Le process MCP crashe au démarrage (tester à la main)
