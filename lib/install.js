// Установка и снятие хуков в ~/.claude/settings.json.
// Наши записи узнаём по пути к hook.js — чужие хуки не трогаем.
const fs = require('fs');
const path = require('path');
const os = require('os');

const SETTINGS = path.join(os.homedir(), '.claude', 'settings.json');
const MARK = 'kot-pizdos/hook.js';

const TOOL_EVENTS = ['PreToolUse', 'PostToolUse', 'PostToolUseFailure'];
const OTHER_EVENTS = ['SessionStart', 'UserPromptSubmit', 'Notification', 'Stop', 'PreCompact', 'SessionEnd'];

function hookCommand(hookPath) {
  // Прямые слэши и кавычки: хуки на Windows идут через Git Bash, а путь может содержать пробелы.
  return `node "${hookPath.replace(/\\/g, '/')}"`;
}

function readSettings() {
  if (!fs.existsSync(SETTINGS)) return {};
  return JSON.parse(fs.readFileSync(SETTINGS, 'utf8'));
}

function writeSettings(settings) {
  const backup = SETTINGS + '.kot-pizdos.bak';
  if (fs.existsSync(SETTINGS) && !fs.existsSync(backup)) fs.copyFileSync(SETTINGS, backup);
  fs.mkdirSync(path.dirname(SETTINGS), { recursive: true });
  fs.writeFileSync(SETTINGS, JSON.stringify(settings, null, 2) + '\n');
}

function isOurs(group) {
  return (group.hooks || []).some((h) => String(h.command || '').replace(/\\/g, '/').includes(MARK));
}

function strip(settings) {
  if (!settings.hooks) return settings;
  for (const ev of Object.keys(settings.hooks)) {
    settings.hooks[ev] = (settings.hooks[ev] || []).filter((g) => !isOurs(g));
    if (settings.hooks[ev].length === 0) delete settings.hooks[ev];
  }
  if (Object.keys(settings.hooks).length === 0) delete settings.hooks;
  return settings;
}

function install(hookPath) {
  const settings = strip(readSettings());
  settings.hooks = settings.hooks || {};
  const hook = { type: 'command', command: hookCommand(hookPath), timeout: 5 };
  for (const ev of TOOL_EVENTS) {
    (settings.hooks[ev] = settings.hooks[ev] || []).push({ matcher: '*', hooks: [hook] });
  }
  for (const ev of OTHER_EVENTS) {
    (settings.hooks[ev] = settings.hooks[ev] || []).push({ hooks: [hook] });
  }
  writeSettings(settings);
}

function uninstall() {
  writeSettings(strip(readSettings()));
}

function isInstalled() {
  try {
    const s = readSettings();
    return !!s.hooks && Object.values(s.hooks).some((groups) => (groups || []).some(isOurs));
  } catch { return false; }
}

module.exports = { install, uninstall, isInstalled, SETTINGS };

if (require.main === module) {
  const cmd = process.argv[2];
  const hookPath = path.join(os.homedir(), '.claude', 'kot-pizdos', 'hook.js');
  if (cmd === 'install') { install(hookPath); console.log('Хуки поставлены в', SETTINGS); }
  else if (cmd === 'uninstall') { uninstall(); console.log('Хуки сняты из', SETTINGS); }
  else console.log('node lib/install.js install|uninstall');
}
