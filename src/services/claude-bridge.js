/**
 * Claude Bridge
 *
 * The core of the assistant. Spawns Claude Code CLI as a subprocess,
 * manages session persistence, injects memory files on new sessions,
 * and detects correction signals from user messages.
 */

import { spawn } from 'child_process';
import { readFileSync, writeFileSync, existsSync, statSync, unlinkSync, appendFileSync, readdirSync } from 'fs';
import { saveMessage, getActiveReminders } from './memory.js';

const ASSISTANT_DIR = process.env.ASSISTANT_DIR || process.cwd();
const SESSION_FILE = `${ASSISTANT_DIR}/.claude_session_id`;
const AUDIT_LOG = `${ASSISTANT_DIR}/data/logs/audit.log`;
const SESSION_MAX_AGE_MS = 24 * 60 * 60 * 1000; // 24 hours

// --- Correction Signal Detection ---
// When the user says one of these phrases, we know Claude made an error.
// Trigger a special protocol: log the error, write feedback, acknowledge.

const CORRECTION_SIGNALS = [
  { pattern: /you (didn't|did not|haven't) (do|done|made)/i, type: 'OUBLI_ACTION' },
  { pattern: /you said you would/i, type: 'FAUSSE_CONFIRMATION' },
  { pattern: /why (didn't|did not) you/i, type: 'OUBLI_ACTION' },
  { pattern: /you forgot/i, type: 'OUBLI' },
  { pattern: /I (already|told you|said)/i, type: 'OUBLI' },
  { pattern: /you (don't|do not) remember/i, type: 'MEMOIRE_PERDUE' },
  { pattern: /again! you/i, type: 'ERREUR_REPETEE' },
  { pattern: /you promised/i, type: 'FAUSSE_CONFIRMATION' },
  { pattern: /I asked you to/i, type: 'OUBLI_ACTION' },
];

function detectCorrectionSignals(message) {
  for (const { pattern, type } of CORRECTION_SIGNALS) {
    if (pattern.test(message)) return { detected: true, type };
  }
  return { detected: false, type: null };
}

function buildCorrectionPrefix(signalType, userMessage) {
  const date = new Date().toISOString().split('T')[0];
  const time = new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
  return `[CORRECTION_SIGNAL — type: ${signalType} — ${time}]
User is flagging an error. BEFORE responding, execute in order:
1. Read memory/feedback/ (last 3 files) to detect if this is a repeated error
2. Write an entry in memory/feedback/${date}.md (create if missing)
3. If same error type in previous files: update "Documented Errors" section in CLAUDE.md
4. Respond: 1 acknowledgement sentence, then handle the request

User message: ${userMessage}`;
}

function getRecentFeedbackContext() {
  const feedbackDir = `${ASSISTANT_DIR}/memory/feedback`;
  if (!existsSync(feedbackDir)) return '';
  try {
    const files = readdirSync(feedbackDir)
      .filter(f => f.match(/^\d{4}-\d{2}-\d{2}\.md$/))
      .sort()
      .slice(-3);
    if (files.length === 0) return '';
    const rules = [];
    for (const f of files) {
      const raw = readFileSync(`${feedbackDir}/${f}`, 'utf8');
      raw.split('\n')
        .filter(l => l.includes('Rule to remember') || l.includes('Regle a retenir'))
        .forEach(l => {
          const rule = l.replace(/.*[Rr]ule to remember\s*:\s*/, '').trim();
          if (rule) rules.push(rule);
        });
    }
    if (rules.length === 0) return '';
    return `[REMINDER_ERRORS_NOT_TO_REPEAT]\n${rules.map(r => '- ' + r).join('\n')}\n[END_REMINDER]`;
  } catch {
    return '';
  }
}

function buildRemindersContext() {
  try {
    const active = getActiveReminders();
    if (active.length === 0) return '';
    return '[ACTIVE_REMINDERS — sent to user, awaiting acknowledgement]\n' +
      active.map(r => `- [${r.id}] ${r.message}`).join('\n') +
      '\n[END_REMINDERS]';
  } catch {
    return '';
  }
}

// --- Session Management ---

function getSessionId() {
  if (!existsSync(SESSION_FILE)) return null;
  try {
    const stat = statSync(SESSION_FILE);
    if (Date.now() - stat.mtimeMs > SESSION_MAX_AGE_MS) {
      unlinkSync(SESSION_FILE);
      console.log('[Bridge] Session expired, forcing new session');
      return null;
    }
    return readFileSync(SESSION_FILE, 'utf8').trim() || null;
  } catch {
    return null;
  }
}

export function resetSession() {
  if (existsSync(SESSION_FILE)) {
    unlinkSync(SESSION_FILE);
    console.log('[Bridge] Session reset');
  }
}

function saveSessionId(id) {
  writeFileSync(SESSION_FILE, id, 'utf8');
}

// --- Logging ---

function auditLog(entry) {
  try {
    appendFileSync(AUDIT_LOG, JSON.stringify({ ts: new Date().toISOString(), ...entry }) + '\n');
  } catch {}
}

// --- Claude Output Parsing ---

function parseClaudeOutput(stdout) {
  const lines = stdout.split('\n').filter(l => l.trim().startsWith('{'));
  for (const line of [...lines].reverse()) {
    try {
      const data = JSON.parse(line.trim());
      if (data.type === 'result' || data.result !== undefined) return data;
    } catch {}
  }
  throw new Error(`No JSON result found in output: ${stdout.slice(0, 300)}`);
}

function extractToolCalls(stdout) {
  const tools = [];
  const lines = stdout.split('\n').filter(l => l.trim().startsWith('{'));
  for (const line of lines) {
    try {
      const data = JSON.parse(line.trim());
      if (data.type === 'tool_use' && data.name) {
        tools.push({ name: data.name, input: JSON.stringify(data.input || {}).slice(0, 100) });
      }
    } catch {}
  }
  return tools;
}

// --- Core Claude Spawner ---

async function runClaude(message, sessionId) {
  const args = ['-p', message, '--output-format', 'json', '--dangerously-skip-permissions'];
  if (sessionId) args.push('--resume', sessionId);

  return new Promise((resolve, reject) => {
    const child = spawn('claude', args, {
      cwd: ASSISTANT_DIR,
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env, NO_COLOR: '1', CI: '1' },
    });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', d => { stdout += d; });
    child.stderr.on('data', d => {
      stderr += d;
      console.error('[Bridge] stderr:', d.toString().slice(0, 200));
    });
    // 5 minute timeout — allows for web searches and long tasks
    const timer = setTimeout(() => { child.kill(); reject(new Error('Timeout 300s')); }, 300000);
    child.on('close', () => { clearTimeout(timer); resolve({ stdout, stderr }); });
  });
}

// --- Main Chat Function ---

export async function chat(userMessage) {
  const sessionId = getSessionId();
  const isNewSession = !sessionId;
  const correctionSignal = detectCorrectionSignals(userMessage);

  let enrichedMessage = userMessage;

  if (correctionSignal.detected) {
    // Correction mode: structured protocol to log and acknowledge errors
    enrichedMessage = buildCorrectionPrefix(correctionSignal.type, userMessage);
    console.log(`[Bridge] Correction signal: ${correctionSignal.type}`);
  } else if (isNewSession) {
    // New session: inject all memory files as context
    // This is how the assistant "remembers" you after a session expires
    let ctx = 'MEMORY CONTEXT (new session):\n\n';

    // List your memory files here — these are injected at session start
    const memFiles = ['you.md', 'family.md', 'projects.md', 'events.md', 'feedback_rules.md'];
    for (const f of memFiles) {
      try {
        ctx += `=== ${f} ===\n${readFileSync(`${ASSISTANT_DIR}/memory/${f}`, 'utf8')}\n\n`;
      } catch {}
    }
    ctx += '=== END MEMORY CONTEXT ===';

    const feedbackCtx = getRecentFeedbackContext();
    const parts = [ctx];
    if (feedbackCtx) parts.push(feedbackCtx);
    parts.push(`User message: ${userMessage}`);
    enrichedMessage = parts.join('\n\n');
  }

  // Always inject active reminders — Claude uses this to acknowledge them naturally
  const remindersCtx = buildRemindersContext();
  if (remindersCtx) {
    enrichedMessage = remindersCtx + '\n\n' + enrichedMessage;
  }

  console.log(`[Bridge] Sending (session: ${sessionId ? sessionId.slice(0, 8) : 'NEW'}, correction: ${correctionSignal.detected}, reminders: ${remindersCtx ? 'yes' : 'no'})`);

  let result = await runClaude(enrichedMessage, sessionId);

  // Fallback: if session is invalid, retry without --resume
  if (result.stderr.includes('No conversation found') || (result.stderr.includes('session') && result.stdout.trim() === '')) {
    console.warn('[Bridge] Invalid session — falling back to new session');
    resetSession();
    result = await runClaude(enrichedMessage, null);
  }

  const data = parseClaudeOutput(result.stdout);
  if (data.session_id) saveSessionId(data.session_id);
  const response = data.result || 'Got it.';
  const toolCalls = extractToolCalls(result.stdout);

  saveMessage('user', userMessage);
  saveMessage('assistant', response);

  auditLog({
    session: data.session_id?.slice(0, 8),
    message_preview: userMessage.slice(0, 80),
    correction_signal: correctionSignal.detected ? correctionSignal.type : null,
    new_session: isNewSession,
    tool_calls: toolCalls,
  });

  // Security alert if email sending is detected
  const hasSendEmail = toolCalls.some(t => ['send_email', 'gmail_send'].includes(t.name));
  if (hasSendEmail) console.warn('[SECURITY] Email send detected — verify audit.log');

  console.log(`[Bridge] OK — session ${data.session_id?.slice(0, 8)}, ${response.length} chars`);
  return response;
}

// --- Isolated One-Shot for Internal Tasks (nightly reflection) ---
// Does NOT touch the main session. Used by the scheduler for background tasks.

export async function chatOneShot(message) {
  const args = ['-p', message, '--output-format', 'json', '--dangerously-skip-permissions'];
  return new Promise((resolve, reject) => {
    const child = spawn('claude', args, {
      cwd: ASSISTANT_DIR,
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env, NO_COLOR: '1', CI: '1' },
    });
    let stdout = '';
    child.stdout.on('data', d => { stdout += d; });
    child.stderr.on('data', d => { console.error('[Bridge] oneshot stderr:', d.toString().slice(0, 100)); });
    const timer = setTimeout(() => { child.kill(); reject(new Error('OneShot timeout 120s')); }, 120000);
    child.on('close', () => {
      clearTimeout(timer);
      try { resolve(parseClaudeOutput(stdout).result || ''); } catch (e) { reject(e); }
    });
  });
}
