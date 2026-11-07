// Настроения кота. Ключ — то, что пишет хук в state.json; fallback — куда смотреть,
// если под это настроение в наборе нет ни одного стикера (стикеров меньше, чем ситуаций).
const MOODS = {
  hello:        { emoji: '👋', label: 'Я на месте',                fallback: ['back_to_work', 'working'] },
  back_to_work: { emoji: '😮‍💨', label: 'Опять на работу',          fallback: ['working'] },
  searching:    { emoji: '🔎', label: 'Ищу, читаю',                fallback: ['working'] },
  editing:      { emoji: '✍️', label: 'Правлю код',                fallback: ['working'] },
  running:      { emoji: '⚙️', label: 'Запускаю',                  fallback: ['working'] },
  working:      { emoji: '💻', label: 'Работаю',                   fallback: ['back_to_work'] },
  scared:       { emoji: '😨', label: 'Опасная команда',           fallback: ['uh_oh', 'pizdos'] },
  uh_oh:        { emoji: '😟', label: 'Что-то пошло не так',       fallback: ['pizdos'] },
  pizdos:       { emoji: '💀', label: 'Пиздос',                    fallback: ['uh_oh'] },
  waiting:      { emoji: '🥺', label: 'Жду разрешения',            fallback: ['bored'] },
  bored:        { emoji: '😐', label: 'Жду тебя',                  fallback: ['waiting', 'done'] },
  done:         { emoji: '✅', label: 'Готово',                    fallback: ['bored'] },
  survived:     { emoji: '🫠', label: 'Готово, но было больно',    fallback: ['done', 'uh_oh'] },
  overloaded:   { emoji: '🤯', label: 'Голова пухнет (сжимаю контекст)', fallback: ['pizdos', 'working'] },
  sleeping:     { emoji: '😴', label: 'Сплю',                      fallback: ['bored'] },
  bye:          { emoji: '🚪', label: 'Пока',                      fallback: ['done'] },
};

module.exports = { MOODS };
