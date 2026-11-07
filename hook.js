#!/usr/bin/env node
// Хук Claude Code. Читает событие из stdin, решает, какое у Клода «настроение»,
// и пишет его в ~/.claude/kot-pizdos/state.json. Расширение следит за этим файлом.
//
// Файл самодостаточный: расширение копирует его в ~/.claude/kot-pizdos/, и settings.json
// ссылается на эту копию — путь не меняется при обновлении расширения.
//
// Хук ничего не печатает в stdout: у UserPromptSubmit и SessionStart вывод попадает
// в контекст Клода, а кот там не нужен. Любая ошибка глотается — хук не должен ломать работу.

const fs = require('fs');
const path = require('path');
const os = require('os');

const HOME = path.join(os.homedir(), '.claude', 'kot-pizdos');
const STATE = path.join(HOME, 'state.json');

// Команды, от которых коту страшно ещё до запуска.
const DANGER = [
  /\brm\s+(-\w*\s+)*-\w*(r\w*f|f\w*r)/i,
  /\bgit\s+push\b.*(--force\b|\s-f\b)/i,
  /\bgit\s+reset\s+--hard/i,
  /\bgit\s+clean\s+-\w*f/i,
  /\bdrop\s+(table|database|schema)\b/i,
  /\btruncate\s+table\b/i,
  /\bRemove-Item\b.*-Recurse/i,
  /\bmkfs\b|\bdd\s+if=/i,
  /\bprisma\s+migrate\s+reset\b/i,
];

const SEARCH_TOOLS = new Set(['Read', 'Grep', 'Glob', 'LS', 'WebFetch', 'WebSearch', 'NotebookRead']);
const EDIT_TOOLS = new Set(['Edit', 'Write', 'MultiEdit', 'NotebookEdit']);
const SHELL_TOOLS = new Set(['Bash', 'PowerShell']);

function short(s, n = 120) {
  if (!s) return '';
  s = String(s).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  return s.length > n ? s.slice(0, n - 1) + '…' : s;
}

function describeTool(name, input) {
  input = input || {};
  const file = input.file_path || input.notebook_path || input.path;
  if (SHELL_TOOLS.has(name)) return `${name}: ${short(input.description || input.command, 90)}`;
  if (file) return `${name}: ${path.basename(String(file))}`;
  if (input.pattern) return `${name}: ${short(input.pattern, 60)}`;
  if (input.query) return `${name}: ${short(input.query, 60)}`;
  if (input.url) return `${name}: ${short(input.url, 60)}`;
  if (input.description) return `${name}: ${short(input.description, 60)}`;
  return name;
}

function readState() {
  try { return JSON.parse(fs.readFileSync(STATE, 'utf8')); } catch { return {}; }
}

function writeState(state) {
  fs.mkdirSync(HOME, { recursive: true });
  const tmp = STATE + '.' + process.pid + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(state, null, 2));
  try {
    fs.renameSync(tmp, STATE);
  } catch {
    // На Windows rename может упасть, если файл в этот момент читает расширение.
    fs.writeFileSync(STATE, JSON.stringify(state, null, 2));
    try { fs.unlinkSync(tmp); } catch {}
  }
}

// Счётчики ошибок живут по сессиям: в соседнем окне Клод может чинить своё,
// и чужие ошибки не должны делать этому коту пиздос.
function sessionOf(state, id) {
  state.sessions = state.sessions || {};
  const now = Date.now();
  for (const [k, v] of Object.entries(state.sessions)) {
    if (now - (v.ts || 0) > 24 * 3600 * 1000) delete state.sessions[k];
  }
  const s = state.sessions[id || 'default'] || (state.sessions[id || 'default'] = { streak: 0, turnFailures: 0 });
  s.ts = now;
  return s;
}

// Возвращает [mood, detail] или null, если настроение не меняется.
function decide(ev, sess) {
  switch (ev.hook_event_name) {
    case 'SessionStart':
      sess.streak = 0; sess.turnFailures = 0;
      return ['hello', ev.source ? `Сессия: ${ev.source}` : ''];

    case 'UserPromptSubmit':
      sess.streak = 0; sess.turnFailures = 0;
      return ['back_to_work', short(ev.prompt, 100)];

    case 'PreToolUse': {
      const name = ev.tool_name || '';
      const input = ev.tool_input || {};
      const detail = describeTool(name, input);
      if (SHELL_TOOLS.has(name) && DANGER.some((re) => re.test(String(input.command || '')))) {
        return ['scared', short(input.command, 120)];
      }
      if (SEARCH_TOOLS.has(name)) return ['searching', detail];
      if (EDIT_TOOLS.has(name)) return ['editing', detail];
      if (SHELL_TOOLS.has(name)) return ['running', detail];
      return ['working', detail];
    }

    case 'PostToolUse':
      // Успех обрывает серию ошибок, но кота не трогаем: следующий PreToolUse сменит его сам,
      // а пиздос после ошибки пусть повисит, пока Клод не возьмётся за следующее.
      sess.streak = 0;
      return null;

    case 'PostToolUseFailure': {
      if (ev.is_interrupt) return null;
      sess.streak = (sess.streak || 0) + 1;
      sess.turnFailures = (sess.turnFailures || 0) + 1;
      // «Exit code 1» ничего не говорит — показываем первую содержательную строку после него.
      const lines = String(ev.error || '').split('\n').map((l) => l.trim()).filter(Boolean);
      const firstLine = lines.find((l) => !/^Exit code \d+$/i.test(l)) || lines[0] || '';
      const detail = `${ev.tool_name || 'Инструмент'}: ${short(firstLine, 100)}`;
      return [sess.streak >= 2 ? 'pizdos' : 'uh_oh', detail];
    }

    case 'Notification':
      if (ev.notification_type === 'permission_prompt') return ['waiting', short(ev.message, 100)];
      if (ev.notification_type === 'idle_prompt') return ['bored', short(ev.message, 100)];
      return null;

    case 'Stop':
      if (ev.stop_hook_active) return null;
      return [(sess.turnFailures || 0) >= 2 ? 'survived' : 'done', short(ev.last_assistant_message, 140)];

    case 'PreCompact':
      return ['overloaded', ev.trigger === 'auto' ? 'Контекст кончился' : 'Сжимаю контекст'];

    case 'SessionEnd':
      return ['bye', ''];

    default:
      return null;
  }
}

function apply(ev) {
  const state = readState();
  const sess = sessionOf(state, ev.session_id);
  const res = decide(ev, sess);
  if (res) {
    state.mood = res[0];
    state.detail = res[1];
    state.event = ev.hook_event_name;
    state.session = ev.session_id || null;
    state.cwd = ev.cwd || null;
    state.ts = Date.now();
  }
  writeState(state);
  return state;
}

// Ручная установка настроения: из расширения или командой `node hook.js --mood pizdos "почему"`.
function setMood(mood, detail) {
  const state = readState();
  Object.assign(state, { mood, detail: detail || '', event: 'manual', ts: Date.now() });
  writeState(state);
  return state;
}

function main() {
  const args = process.argv.slice(2);
  if (args[0] === '--mood' && args[1]) {
    setMood(args[1], args.slice(2).join(' '));
    return;
  }
  let raw = '';
  process.stdin.setEncoding('utf8');
  process.stdin.on('data', (c) => { raw += c; });
  process.stdin.on('end', () => {
    try { apply(JSON.parse(raw)); } catch {}
    process.exit(0);
  });
  // Если stdin так и не закроется, не держим Клода.
  setTimeout(() => process.exit(0), 3000).unref();
}

module.exports = { apply, decide, setMood, readState, STATE, HOME };

if (require.main === module) {
  try { main(); } catch { process.exit(0); }
}
