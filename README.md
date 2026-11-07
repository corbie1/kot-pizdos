# Кот пиздос

Расширение VS Code: кот в маленьком окне под файлами проекта (в проводнике) показывает настроение Claude Code.
Работает — кот работает, ловит ошибку за ошибкой — пиздос, собирается сделать `rm -rf` — боится.

## Как устроено

```
Claude Code ──хуки──▶ hook.js ──▶ ~/.claude/kot-pizdos/state.json ──▶ расширение ──▶ кот
```

- `hook.js` получает событие хука в stdin, решает, какое настроение, и пишет его в `state.json`.
  Расширение копирует его в `~/.claude/kot-pizdos/hook.js`, и `settings.json` ссылается на эту копию.
- `extension.js` следит за `state.json` и показывает стикер под настроение: в проводнике и в строке состояния.
- Стикеры лежат в `~/.claude/kot-pizdos/stickers`, раскладка по настроениям — в `moods.json` там же.
  В репозиторий стикеры не входят, только раскладка `moods.backtothework.json`.

| Событие | Настроение |
|---|---|
| `SessionStart` | 👋 я на месте |
| `UserPromptSubmit` | 😮‍💨 опять на работу |
| `PreToolUse` Read/Grep/Glob/Web* | 🔎 ищу, читаю |
| `PreToolUse` Edit/Write | ✍️ правлю код |
| `PreToolUse` Bash/PowerShell | ⚙️ запускаю (😨 если команда опасная) |
| `PostToolUseFailure` | 😟 первая ошибка подряд, 💀 пиздос со второй |
| `Notification` | 🥺 жду разрешения / 😐 жду тебя |
| `Stop` | ✅ готово (🫠 если по пути было 2+ ошибки) |
| `PreCompact` | 🤯 сжимаю контекст |
| `SessionEnd` | 🚪 пока |
| 10 минут тишины | 😴 сплю |

## Установка

```sh
npx @vscode/vsce package --skip-license -o kot-pizdos.vsix
code --install-extension kot-pizdos.vsix --force
```

На Node 22.11 vsce падает на `require()` ESM-модуля — помогает `NODE_OPTIONS=--experimental-require-module`.

Дальше в VS Code (Ctrl+Shift+P):

1. **Кот: поставить хуки Claude Code** — допишет хуки в `~/.claude/settings.json`, остальное не тронет
   (до первой записи кладёт рядом `settings.json.kot-pizdos.bak`).
2. **Кот: скачать стикеры из Telegram** — нужен токен бота от @BotFather; без него набор не получить.
   Или из терминала: `node lib/telegram.js <токен> [имя набора]`.
3. Скопировать `moods.backtothework.json` в `~/.claude/kot-pizdos/stickers/moods.json` — ручная раскладка
   набора `backtothework`. Без неё стикеры разложатся по эмодзи, а это сильно грубее.

## Команды

- **Кот: выставить настроение вручную** (или `node hook.js --mood pizdos "почему"`)
- **Кот: другой кот** — то же настроение, другой стикер (или клик по коту)
- **Кот: открыть во вкладке** / **открыть папку со стикерами**
- **Кот: снять хуки Claude Code**

## Настройки

- `kotPizdos.stickersDir` — своя папка со стикерами
- `kotPizdos.stickerPack` — другой набор Telegram
- `kotPizdos.sleepAfterMinutes` — через сколько минут тишины кот засыпает (0 — никогда)
