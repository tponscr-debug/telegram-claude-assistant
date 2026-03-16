# Telegram × Claude — Assistant Personnel IA

Un assistant personnel qui tourne sur Telegram, propulsé par **Claude Code CLI** comme cerveau. Pas de fine-tuning, pas de RAG complexe. Juste un bridge intelligent entre Telegram et Claude, avec une mémoire en fichiers Markdown, des intégrations MCP, et un scheduler proactif.

```
Toi → Telegram → Bridge Node.js → Claude Code CLI → Outils MCP (Gmail, Agenda, IMAP, SNCF...)
                                          ↕
                                Fichiers mémoire (Markdown)
```

## Ce qu'il fait

- **Répond à tes messages** via Telegram, avec Claude comme LLM
- **Se souvient de toi** entre les sessions grâce aux fichiers mémoire injectés au démarrage
- **Apprend de ses erreurs** via une réflexion nocturne automatique à 1h du matin
- **T'envoie des briefings proactifs** : matin à 8h, check midi, bilan soir, veille agenda à 22h
- **Gère tes rappels** avec des boutons inline (✅ Fait / ⏰ +1h)
- **Lit tes mails** (Gmail + IMAP), **consulte ton agenda** (Google Calendar), **cherche des trains** (SNCF)
- **Transcrit tes messages vocaux** via Gemini

---

## Ce qu'on peut lui demander

Voici des exemples concrets de ce que tu peux dire à ton assistant :

### Agenda & organisation
```
"C'est quoi mon programme demain ?"
"J'ai une réunion vendredi à 14h avec Paul, note-le"
"Rappelle-moi dans 30 minutes d'appeler le médecin"
"Rappelle-moi demain matin de préparer les docs pour la réunion"
"Quels événements j'ai cette semaine ?"
```

### Mails
```
"J'ai des mails importants non lus ?"
"Résume-moi les mails de ce matin"
"Envoie un mail à paul@exemple.com pour confirmer le rdv de vendredi"
"Y'a eu une réponse de Sophie ?"
```

### Tâches & to-do
```
"Ajoute à ma liste : renouveler l'assurance voiture"
"C'est quoi mes tâches en cours ?"
"J'ai terminé le rapport, tu peux le marquer comme fait"
"Quelles tâches j'ai pas touchées depuis hier ?"
```

### Notes rapides
```
"Note ça : mot de passe wifi invités = maison2024"
"Rappelle-toi que je préfère les réunions le matin"
"Souviens-toi que mon médecin s'appelle Dr Martin, 01 23 45 67 89"
```

### Trains (SNCF)
```
"Prochains trains Paris Lyon ce soir ?"
"Y'a quoi comme TGV demain matin entre Paris et Bordeaux ?"
```

### Gestion de projet / réflexion
```
"J'arrive pas à avancer sur ce projet, aide-moi à décomposer ça en étapes"
"J'hésite entre deux approches pour [problème], qu'est-ce que tu en penses ?"
"Fais-moi un plan pour préparer ma présentation de lundi"
"J'ai 2h devant moi, qu'est-ce que je devrais faire en priorité ?"
```

### Mémoire & contexte personnel
```
"Tu sais ce que je t'avais dit sur [sujet] ?"
"Rappelle-moi tout ce que tu sais sur moi"
"/memory" — résumé complet de ta mémoire
```

### La boucle d'apprentissage
L'assistant apprend aussi de ses erreurs en temps réel. Si tu lui dis :
```
"Tu avais dit que tu allais noter ça et t'as pas le fait"
"Tu m'as déjà posé cette question hier"
"J't'avais demandé de me rappeler ça et t'as rien fait"
```
Il détecte le signal, se corrige, et écrit une règle dans ses fichiers mémoire pour ne pas répéter l'erreur.

---

## Table des matières

1. [Architecture](docs/architecture.md)
2. [Mise en place du serveur](docs/setup-server.md)
3. [Système de mémoire](docs/memory-system.md)
4. [Serveurs MCP](docs/mcp-servers.md)
5. [Scheduler & routines quotidiennes](docs/scheduler.md)
6. [Déploiement & production](docs/deployment.md)

---

## Démarrage rapide

```bash
# 1. Clone & install
git clone https://github.com/YOUR_USERNAME/telegram-claude-assistant
cd telegram-claude-assistant
npm install

# 2. Configure
cp .env.example .env
# Remplis : TELEGRAM_TOKEN, YOUR_CHAT_ID, GEMINI_API_KEY

# 3. Initialise la base de données
node tools/init-db.js

# 4. Configure les serveurs MCP (voir docs/mcp-servers.md)
cp .mcp.example.json .mcp.json
# Édite .mcp.json avec tes credentials

# 5. Lance
npm start
```

---

## Stack technique

| Couche | Techno |
|--------|--------|
| Interface | Telegram (Telegraf) |
| Cerveau | Claude Code CLI (`claude -p`) |
| Base de données | SQLite (better-sqlite3) |
| Scheduler | node-cron |
| Voix | Gemini Flash |
| Outils | Serveurs MCP |
| Process manager | PM2 |
| Serveur | N'importe quel VPS Linux (Hetzner, OVH, etc.) |

---

## Pourquoi Claude Code CLI et pas l'API directement ?

| | API Anthropic directe | Claude Code CLI |
|---|---|---|
| Outils MCP | Setup manuel | Auto-découverts via `.mcp.json` |
| Accès fichiers | Manuel | Natif |
| Persistance session | Gestion manuelle | `--resume <session_id>` |
| Prompt système | Statique dans le code | Fichier `CLAUDE.md` dans le projet |
| Complexité | Élevée | Quasi nulle |

Claude Code CLI est conçu pour opérer de façon autonome. Il sait déjà utiliser des outils, lire/écrire des fichiers, et continuer une conversation. On fait juste passer les messages au travers.
