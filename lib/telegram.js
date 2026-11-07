// Скачивание набора стикеров через Telegram Bot API.
// Без токена бота набор не получить: t.me отдаёт только название, а зеркала этот набор не держат.
// Токен даёт @BotFather за минуту; боту ничего не нужно, кроме самого токена.
const fs = require('fs');
const path = require('path');
const os = require('os');

const DEFAULT_DIR = path.join(os.homedir(), '.claude', 'kot-pizdos', 'stickers');

// Первый прикид по эмодзи, который Telegram хранит у каждого стикера.
// Дальше moods.json можно поправить руками — повторное скачивание его не перезапишет.
const EMOJI_TO_MOOD = [
  [/[😱🙀😨😰😧😦]/u, 'scared'],
  [/[💀☠😭😢😿🤬😡😤🤯]/u, 'pizdos'],
  [/[😟😕🙁☹😬🥲]/u, 'uh_oh'],
  [/[🤔🧐👀🔍🔎]/u, 'searching'],
  [/[😴💤🛌]/u, 'sleeping'],
  [/[🥱😐😑🙄😒]/u, 'bored'],
  [/[🥺🙏🥹]/u, 'waiting'],
  [/[🎉🥳😎👍✅👌😌😊😁😄😃💪]/u, 'done'],
  [/[👋🙋🤗]/u, 'hello'],
  [/[💻⌨🛠🔧✍📝]/u, 'working'],
];

function guessMood(emoji) {
  for (const [re, mood] of EMOJI_TO_MOOD) if (re.test(emoji || '')) return mood;
  return 'working';
}

async function api(token, method, params) {
  const url = `https://api.telegram.org/bot${token}/${method}?` + new URLSearchParams(params);
  const res = await fetch(url);
  const body = await res.json();
  if (!body.ok) throw new Error(`${method}: ${body.description || res.status}`);
  return body.result;
}

async function fetchStickers(token, pack = 'backtothework', dir = DEFAULT_DIR, log = console.log) {
  fs.mkdirSync(dir, { recursive: true });
  const set = await api(token, 'getStickerSet', { name: pack });
  log(`Набор «${set.title}»: ${set.stickers.length} стикеров`);

  const list = [];
  for (let i = 0; i < set.stickers.length; i++) {
    const st = set.stickers[i];
    const file = await api(token, 'getFile', { file_id: st.file_id });
    const ext = path.extname(file.file_path) || (st.is_video ? '.webm' : st.is_animated ? '.tgs' : '.webp');
    const name = String(i + 1).padStart(2, '0') + ext;
    const res = await fetch(`https://api.telegram.org/file/bot${token}/${file.file_path}`);
    if (!res.ok) throw new Error(`Не скачался стикер ${i + 1}: ${res.status}`);
    fs.writeFileSync(path.join(dir, name), Buffer.from(await res.arrayBuffer()));
    list.push({ file: name, emoji: st.emoji || '', guess: guessMood(st.emoji) });
    log(`  ${name} ${st.emoji || ''}`);
  }
  fs.writeFileSync(path.join(dir, 'stickers.json'), JSON.stringify({ pack, title: set.title, stickers: list }, null, 2));

  const auto = {};
  for (const s of list) (auto[s.guess] = auto[s.guess] || []).push(s.file);
  fs.writeFileSync(path.join(dir, 'moods.auto.json'), JSON.stringify(auto, null, 2));
  const moodsPath = path.join(dir, 'moods.json');
  if (!fs.existsSync(moodsPath)) fs.writeFileSync(moodsPath, JSON.stringify(auto, null, 2));
  return { dir, count: list.length, title: set.title };
}

module.exports = { fetchStickers, DEFAULT_DIR };

if (require.main === module) {
  const token = process.argv[2] || process.env.TELEGRAM_BOT_TOKEN;
  if (!token) {
    console.log('node lib/telegram.js <токен бота> [имя набора]');
    process.exit(1);
  }
  fetchStickers(token, process.argv[3] || 'backtothework')
    .then((r) => console.log(`Готово: ${r.count} шт. в ${r.dir}`))
    .catch((e) => { console.error(e.message); process.exit(1); });
}
