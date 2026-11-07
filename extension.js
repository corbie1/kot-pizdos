// Кот пиздос: показывает в VS Code кота под настроение Claude Code.
// Настроение пишет hook.js (через хуки Claude Code) в ~/.claude/kot-pizdos/state.json,
// расширение следит за файлом и меняет стикер в боковой панели и в строке состояния.
const vscode = require('vscode');
const fs = require('fs');
const path = require('path');
const { MOODS } = require('./lib/moods');
const installer = require('./lib/install');
const telegram = require('./lib/telegram');
const hook = require('./hook');

const VIDEO = new Set(['.webm', '.mp4']);
const IMAGE = new Set(['.webp', '.png', '.jpg', '.jpeg', '.gif']);

let ctx;
let statusItem;
let current = { mood: 'sleeping', detail: '', file: null, ts: 0 };
let lastStateTs = 0;
const webviews = new Set();

function cfg() { return vscode.workspace.getConfiguration('kotPizdos'); }

// Откуда брать котов: папка из настроек, затем скачанный своими руками набор,
// затем набор, который едет внутри расширения (тогда токен бота вообще не нужен).
function stickersDir() {
  const custom = cfg().get('stickersDir');
  if (custom && custom.trim()) return custom.trim();
  if (fs.existsSync(path.join(telegram.DEFAULT_DIR, 'moods.json'))) return telegram.DEFAULT_DIR;
  return path.join(ctx.extensionPath, 'stickers');
}

// { mood: [абсолютные пути] } из moods.json; файлы, которых нет на диске, отбрасываем.
function loadLibrary() {
  const dir = stickersDir();
  let map = {};
  try { map = JSON.parse(fs.readFileSync(path.join(dir, 'moods.json'), 'utf8')); } catch {}
  const lib = {};
  for (const [mood, files] of Object.entries(map)) {
    lib[mood] = (files || []).map((f) => path.join(dir, f)).filter((p) => fs.existsSync(p));
  }
  return lib;
}

function pickSticker(mood, avoid) {
  const lib = loadLibrary();
  const order = [mood, ...((MOODS[mood] && MOODS[mood].fallback) || [])];
  for (const m of order) {
    const files = lib[m] || [];
    if (files.length) {
      const pool = files.length > 1 ? files.filter((f) => f !== avoid) : files;
      return pool[Math.floor(Math.random() * pool.length)];
    }
  }
  // Совсем ничего не нашли (набор не скачан) — показываем того самого кота.
  const all = Object.values(lib).flat();
  if (all.length) return all[Math.floor(Math.random() * all.length)];
  return path.join(ctx.extensionPath, 'media', 'default.jpg');
}

function show(mood, detail, { force = false } = {}) {
  const same = mood === current.mood && !force;
  const file = same && current.file ? current.file : pickSticker(mood, current.file);
  current = { mood, detail: detail || '', file };
  render();
}

function render() {
  const m = MOODS[current.mood] || { emoji: '🐱', label: current.mood };
  statusItem.text = `${m.emoji} ${m.label}`;
  statusItem.tooltip = current.detail ? `Кот: ${m.label}\n${current.detail}` : `Кот: ${m.label}`;
  for (const wv of webviews) post(wv);
}

function post(wv) {
  const m = MOODS[current.mood] || { emoji: '🐱', label: current.mood };
  const ext = path.extname(current.file || '').toLowerCase();
  wv.postMessage({
    type: 'show',
    src: current.file ? wv.asWebviewUri(vscode.Uri.file(current.file)).toString() : '',
    kind: VIDEO.has(ext) ? 'video' : 'img',
    label: `${m.emoji} ${m.label}`,
    detail: current.detail,
  });
}

function readStateFile() {
  const st = hook.readState();
  if (!st.mood || !st.ts || st.ts <= lastStateTs) return;
  lastStateTs = st.ts;
  show(st.mood, st.detail);
}

// После «готово» и «жду» кот через какое-то время засыпает.
function idleTick() {
  const minutes = cfg().get('sleepAfterMinutes');
  if (!minutes || minutes <= 0) return;
  if (!['done', 'survived', 'bored', 'bye', 'hello'].includes(current.mood)) return;
  if (Date.now() - lastStateTs > minutes * 60 * 1000) show('sleeping', 'Давно ничего не происходит');
}

function watchState() {
  fs.mkdirSync(hook.HOME, { recursive: true });
  let timer;
  const kick = () => { clearTimeout(timer); timer = setTimeout(readStateFile, 40); };
  try {
    // Следим за папкой, а не за файлом: хук подменяет state.json через rename.
    const w = fs.watch(hook.HOME, (_e, name) => { if (!name || name === 'state.json') kick(); });
    ctx.subscriptions.push({ dispose: () => w.close() });
  } catch {}
  // Страховка на случай, если fs.watch пропустит событие (на Windows такое бывает).
  const poll = setInterval(readStateFile, 1500);
  const idle = setInterval(idleTick, 30 * 1000);
  ctx.subscriptions.push({ dispose: () => { clearInterval(poll); clearInterval(idle); } });
}

function html(wv) {
  const nonce = Math.random().toString(36).slice(2);
  const csp = [
    "default-src 'none'",
    `img-src ${wv.cspSource} data:`,
    `media-src ${wv.cspSource}`,
    `style-src ${wv.cspSource} 'unsafe-inline'`,
    `script-src 'nonce-${nonce}'`,
  ].join('; ');
  return `<!doctype html>
<html lang="ru"><head><meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="${csp}">
<meta name="viewport" content="width=device-width, initial-scale=1">
<style>
  html, body { height: 100%; margin: 0; }
  /* Окно маленькое (секция проводника), поэтому кот занимает всё место, а подписи — по строке. */
  body { display: flex; flex-direction: column; align-items: center; justify-content: center;
         gap: 4px; padding: 6px 8px; box-sizing: border-box; font-family: var(--vscode-font-family);
         font-size: var(--vscode-font-size); color: var(--vscode-foreground); overflow: hidden; }
  #media { flex: 1 1 auto; min-height: 0; width: 100%; display: flex; align-items: center; justify-content: center; cursor: pointer; }
  #media img, #media video { max-width: 100%; max-height: 100%; object-fit: contain; border-radius: 4px;
                             animation: pop .18s ease-out; }
  @keyframes pop { from { opacity: 0; transform: scale(.94); } to { opacity: 1; transform: none; } }
  #label, #detail { width: 100%; text-align: center; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; flex: none; }
  #label { font-weight: 600; }
  #detail { font-size: .85em; opacity: .65; }
  /* Совсем низкое окно — оставляем только кота. */
  @media (max-height: 140px) { #detail { display: none; } }
  @media (max-height: 100px) { #label { display: none; } }
</style></head>
<body>
  <div id="media" title="Клик — другой кот"></div>
  <div id="label"></div>
  <div id="detail"></div>
<script nonce="${nonce}">
  const vscode = acquireVsCodeApi();
  const media = document.getElementById('media');
  let lastSrc = '';
  window.addEventListener('message', (e) => {
    const m = e.data;
    if (m.type !== 'show') return;
    document.getElementById('label').textContent = m.label;
    document.getElementById('detail').textContent = m.detail || '';
    document.getElementById('detail').title = m.detail || '';
    if (m.src === lastSrc) return;
    lastSrc = m.src;
    media.replaceChildren();
    const el = document.createElement(m.kind === 'video' ? 'video' : 'img');
    el.src = m.src;
    if (m.kind === 'video') { el.autoplay = true; el.loop = true; el.muted = true; el.playsInline = true; }
    media.appendChild(el);
  });
  media.addEventListener('click', () => vscode.postMessage({ type: 'next' }));
  vscode.postMessage({ type: 'ready' });
</script>
</body></html>`;
}

function attach(wv) {
  wv.options = {
    enableScripts: true,
    localResourceRoots: [vscode.Uri.file(stickersDir()), vscode.Uri.joinPath(ctx.extensionUri, 'media')],
  };
  wv.html = html(wv);
  webviews.add(wv);
  return wv.onDidReceiveMessage((msg) => {
    if (msg.type === 'ready') post(wv);
    if (msg.type === 'next') show(current.mood, current.detail, { force: true });
  });
}

class CatViewProvider {
  resolveWebviewView(view) {
    const sub = attach(view.webview);
    view.onDidDispose(() => { webviews.delete(view.webview); sub.dispose(); });
  }
}

function openPanel() {
  const panel = vscode.window.createWebviewPanel('kotPizdos.panel', 'Кот', vscode.ViewColumn.Beside, {
    retainContextWhenHidden: true,
  });
  const sub = attach(panel.webview);
  panel.onDidDispose(() => { webviews.delete(panel.webview); sub.dispose(); });
}

// Хук живёт в постоянном месте, чтобы путь в settings.json не зависел от версии расширения.
function deployHook() {
  fs.mkdirSync(hook.HOME, { recursive: true });
  fs.copyFileSync(path.join(ctx.extensionPath, 'hook.js'), path.join(hook.HOME, 'hook.js'));
}

async function cmdInstall() {
  deployHook();
  installer.install(path.join(hook.HOME, 'hook.js'));
  vscode.window.showInformationMessage(
    `Хуки кота добавлены в ${installer.SETTINGS}. Уже открытые сессии Claude Code подхватят их после перезапуска.`
  );
}

async function cmdUninstall() {
  installer.uninstall();
  vscode.window.showInformationMessage('Хуки кота сняты. Остальные хуки не тронуты.');
}

async function cmdSetMood() {
  const pick = await vscode.window.showQuickPick(
    Object.entries(MOODS).map(([key, m]) => ({ label: `${m.emoji} ${m.label}`, description: key, key })),
    { placeHolder: 'Какое настроение показать' }
  );
  if (pick) hook.setMood(pick.key, 'Вручную');
}

async function cmdFetch() {
  const token = await vscode.window.showInputBox({
    prompt: 'Токен Telegram-бота (получить у @BotFather командой /newbot). Он нигде не сохраняется.',
    password: true,
    ignoreFocusOut: true,
  });
  if (!token) return;
  const pack = cfg().get('stickerPack') || 'backtothework';
  await vscode.window.withProgress(
    { location: vscode.ProgressLocation.Notification, title: `Качаю стикеры ${pack}` },
    async (progress) => {
      try {
        // Качаем всегда в папку пользователя: папка расширения перезаписывается при обновлении.
        const custom = cfg().get('stickersDir');
        const dir = custom && custom.trim() ? custom.trim() : telegram.DEFAULT_DIR;
        const r = await telegram.fetchStickers(token.trim(), pack, dir, (line) => progress.report({ message: line.trim() }));
        vscode.window.showInformationMessage(`Скачано ${r.count} котов из «${r.title}». Раскладка по настроениям — в moods.json.`);
        show(current.mood, current.detail, { force: true });
      } catch (e) {
        vscode.window.showErrorMessage(`Не скачалось: ${e.message}`);
      }
    }
  );
}

function activate(context) {
  ctx = context;
  try { deployHook(); } catch {}

  statusItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
  statusItem.command = 'kotPizdos.focus';
  statusItem.show();
  context.subscriptions.push(statusItem);

  context.subscriptions.push(
    // Секция внизу проводника, под деревом файлов — как у питомцев VS Code.
    vscode.window.registerWebviewViewProvider('kotPizdos.explorerView', new CatViewProvider(), {
      webviewOptions: { retainContextWhenHidden: true },
    }),
    vscode.commands.registerCommand('kotPizdos.focus', () => vscode.commands.executeCommand('kotPizdos.explorerView.focus')),
    vscode.commands.registerCommand('kotPizdos.openPanel', openPanel),
    vscode.commands.registerCommand('kotPizdos.installHooks', cmdInstall),
    vscode.commands.registerCommand('kotPizdos.uninstallHooks', cmdUninstall),
    vscode.commands.registerCommand('kotPizdos.setMood', cmdSetMood),
    vscode.commands.registerCommand('kotPizdos.fetchStickers', cmdFetch),
    vscode.commands.registerCommand('kotPizdos.nextCat', () => show(current.mood, current.detail, { force: true })),
    vscode.commands.registerCommand('kotPizdos.openStickers', () => {
      fs.mkdirSync(stickersDir(), { recursive: true });
      vscode.env.openExternal(vscode.Uri.file(stickersDir()));
    })
  );

  const st = hook.readState();
  if (st.mood) { lastStateTs = st.ts || 0; show(st.mood, st.detail); } else show('sleeping', '');
  watchState();

  if (!installer.isInstalled()) {
    vscode.window
      .showInformationMessage('Кот пока не знает, что делает Claude Code. Поставить хуки?', 'Поставить')
      .then((a) => { if (a) cmdInstall(); });
  }
}

function deactivate() {}

module.exports = { activate, deactivate };
