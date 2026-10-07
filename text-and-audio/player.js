/* A standalone player: fetch only the selected recording and transcript. */
(async function () {
  'use strict';
  const get = (id) => document.getElementById(id);
  const audio = document.querySelector('audio');
  const defaults = { position: 0, rate: 1, loop: false, showText: true, vocalized: true, fontSize: 30 };
  let lesson;
  let state;
  let lastSave = 0;
  const key = () => `shifahiya-listening-${lesson.lessonId}-v1`;
  const status = get('status');
  const embedded = window.LISTENING_LESSON;
  const rates = [0.5, 0.75, 0.9, 1, 1.25, 1.5, 2];
  const progressKey = 'shifahiya-listening-progress-v1';
  async function fetchText(url) {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return response.text();
  }
  function save() {
    if (!lesson || !state) return;
    if (audio.readyState > 0) state.position = audio.ended ? 0 : audio.currentTime;
    try { localStorage.setItem(key(), JSON.stringify(state)); } catch { /* Playback still works without storage. */ }
    lastSave = Date.now();
  }
  function readState() {
    let saved = {};
    try { saved = JSON.parse(localStorage.getItem(key())) || {}; } catch { /* Use defaults. */ }
    return { ...defaults,
      position: Number.isFinite(saved.position) && saved.position >= 0 ? saved.position : 0,
      rate: rates.includes(saved.rate) ? saved.rate : 1,
      loop: saved.loop === true,
      showText: typeof saved.showText === 'boolean' ? saved.showText : true,
      vocalized: typeof saved.vocalized === 'boolean' ? saved.vocalized : true,
      fontSize: [24, 27, 30, 33, 36, 39, 42].includes(saved.fontSize) ? saved.fontSize : 30,
    };
  }
  function readProgress() {
    try {
      const saved = JSON.parse(localStorage.getItem(progressKey));
      if (!saved || typeof saved !== 'object' || Array.isArray(saved)) return {};
      // Match app/listening-progress.ts, including records for future lessons.
      const normalized = {};
      for (const [id, value] of Object.entries(saved)) {
        const lessonId = Number(id);
        if (!/^\d+$/.test(id) || !Number.isSafeInteger(lessonId) || lessonId <= 0) continue;
        if (!value || typeof value !== 'object' || Array.isArray(value)) continue;
        if (typeof value.completed !== 'boolean' || typeof value.updatedAt !== 'number') continue;
        if (!Number.isFinite(value.updatedAt) || value.updatedAt < 0) continue;
        const previous = normalized[lessonId];
        if (!previous || value.updatedAt > previous.updatedAt ||
          (value.updatedAt === previous.updatedAt && value.completed)) {
          normalized[lessonId] = { completed: value.completed, updatedAt: value.updatedAt };
        }
      }
      return normalized;
    } catch { return {}; }
  }
  function renderCompletion() {
    if (!lesson) return;
    const completed = readProgress()[lesson.lessonId]?.completed === true;
    get('complete').textContent = completed ? 'Пройдено · Отменить отметку' : 'Текст и аудио пройдены';
    get('complete').setAttribute('aria-pressed', String(completed));
    get('complete').disabled = false;
    get('completion-status').textContent = completed
      ? 'Текст и аудио этого урока отмечены как пройденные.'
      : 'После занятия отметьте текст и аудио как пройденные.';
  }
  function render() {
    const transcript = get('listening-transcript');
    const nodes = lesson.paragraphs.map((text, index) => {
      const node = document.createElement(index === 0 ? 'h2' : 'p');
      // Remove only optional marks for display; never normalise the stored text.
      node.textContent = state.vocalized ? text : text.replace(/[\u064B-\u0652\u0670]/g, '');
      if (index > 1 && lesson.paragraphNumbers && lesson.paragraphNumbers[index - 1] !== lesson.paragraphNumbers[index]) {
        node.className = 'starts-paragraph';
      }
      return node;
    });
    transcript.replaceChildren(...nodes);
    transcript.hidden = !state.showText;
    transcript.style.fontSize = `${state.fontSize}px`;
    get('hidden-note').hidden = state.showText;
    get('text-toggle').textContent = state.showText ? 'Скрыть текст' : 'Показать текст';
    get('text-toggle').setAttribute('aria-expanded', String(state.showText));
    get('vowels').setAttribute('aria-pressed', String(state.vocalized));
    get('loop').setAttribute('aria-pressed', String(state.loop));
    get('smaller').disabled = state.fontSize <= 24;
    get('larger').disabled = state.fontSize >= 42;
    for (const id of ['vowels', 'smaller', 'larger']) get(id).hidden = !state.showText;
    get('rate').value = String(state.rate);
    audio.loop = state.loop;
    audio.playbackRate = state.rate;
  }
  function update(values) { Object.assign(state, values); render(); save(); }
  function seek(seconds) {
    if (audio.readyState > 0 && Number.isFinite(audio.duration)) {
      audio.currentTime = Math.max(0, Math.min(audio.currentTime + seconds, audio.duration));
      save();
    }
  }
  audio.addEventListener('loadedmetadata', () => {
    audio.currentTime = state.position < audio.duration ? state.position : 0;
    audio.playbackRate = state.rate;
    get('audio-error').hidden = true;
  });
  audio.addEventListener('error', () => { get('audio-error').hidden = false; });
  for (const event of ['pause', 'seeked', 'ended']) audio.addEventListener(event, save);
  audio.addEventListener('timeupdate', () => { if (Date.now() - lastSave > 5000) save(); });
  window.addEventListener('pagehide', save);
  document.addEventListener('visibilitychange', () => { if (document.hidden) save(); });
  get('settings-toggle').onclick = () => {
    const settings = get('player-settings');
    settings.hidden = !settings.hidden;
    get('settings-toggle').setAttribute('aria-expanded', String(!settings.hidden));
  };
  get('rewind').onclick = () => seek(-10);
  get('forward').onclick = () => seek(10);
  get('retry').onclick = () => { save(); get('audio-error').hidden = true; audio.load(); };
  get('rate').onchange = (event) => update({ rate: Number(event.target.value) });
  get('loop').onclick = () => update({ loop: !state.loop });
  get('text-toggle').onclick = () => update({ showText: !state.showText });
  get('vowels').onclick = () => update({ vocalized: !state.vocalized });
  get('smaller').onclick = () => update({ fontSize: Math.max(24, state.fontSize - 3) });
  get('larger').onclick = () => update({ fontSize: Math.min(42, state.fontSize + 3) });
  get('complete').onclick = () => {
    if (!lesson) return;
    const progress = readProgress();
    const previous = progress[lesson.lessonId];
    progress[lesson.lessonId] = {
      completed: previous?.completed !== true,
      updatedAt: Math.max(Date.now(), (previous?.updatedAt || 0) + 1),
    };
    try {
      localStorage.setItem(progressKey, JSON.stringify(progress));
      renderCompletion();
    } catch {
      get('completion-status').textContent = 'Не удалось сохранить отметку. Проверьте, разрешено ли браузеру сохранять данные.';
    }
  };
  window.addEventListener('storage', (event) => {
    if (event.key === progressKey || event.key === null) renderCompletion();
  });
  window.addEventListener('pageshow', renderCompletion);
  get('lesson').onchange = (event) => {
    save();
    const url = new URL(location.href);
    url.searchParams.set('lesson', event.target.value);
    location.href = url.href;
  };
  get('download').onclick = async () => {
    const button = get('download');
    button.disabled = true;
    get('download-status').textContent = 'Подготовка файла с текстом и записью…';
    try {
      const response = await fetch(lesson.audioSrc);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const blob = await response.blob();
      const dataURL = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = reject;
        reader.readAsDataURL(blob);
      });
      const [html, css, script] = await Promise.all([
        fetchText('./text-and-audio.html'), fetchText('./text-and-audio/player.css'), fetchText('./text-and-audio/player.js'),
      ]);
      const doc = new DOMParser().parseFromString(html, 'text/html');
      doc.querySelector('link[rel="stylesheet"]').remove();
      doc.querySelector('script[src]').remove();
      const style = doc.createElement('style');
      style.textContent = css;
      doc.head.append(style);
      const data = doc.createElement('script');
      data.textContent = 'window.LISTENING_LESSON=' + JSON.stringify({ ...lesson, audioSrc: dataURL }).replace(/</g, '\\u003c') + ';';
      const player = doc.createElement('script');
      player.textContent = script;
      doc.body.append(data, player);
      const href = URL.createObjectURL(new Blob(['<!doctype html>\n' + doc.documentElement.outerHTML], { type: 'text/html;charset=utf-8' }));
      const link = document.createElement('a');
      link.href = href;
      link.download = `shifahiya-lesson-${lesson.lessonId}.html`;
      link.click();
      setTimeout(() => URL.revokeObjectURL(href), 60000);
      get('download-status').textContent = 'Файл готов. Откройте скачанный HTML для занятий без интернета.';
    } catch {
      get('download-status').textContent = 'Не удалось подготовить файл. Проверьте соединение и попробуйте снова.';
    } finally { button.disabled = false; }
  };
  try {
    let catalog;
    if (embedded) {
      lesson = embedded;
      catalog = [lesson];
      get('download').hidden = true;
      get('offline-progress-note').hidden = false;
      const courseLink = document.querySelector('nav a');
      courseLink.href = 'https://shifahiya-project.github.io/ash-shifahiya-app/';
    } else {
      catalog = JSON.parse(await fetchText('./text-and-audio/catalog.json'));
      const requested = new URLSearchParams(location.search).get('lesson');
      const entry = requested === null ? catalog[0] : catalog.find(item => String(item.lessonId) === requested);
      if (!entry) throw new Error('Lesson unavailable');
      lesson = { ...entry, ...JSON.parse(await fetchText(entry.textSrc)) };
    }
    for (const entry of catalog) {
      const option = document.createElement('option');
      option.value = entry.lessonId;
      option.textContent = `Урок ${entry.lessonId}`;
      get('lesson').append(option);
    }
    get('lesson').value = String(lesson.lessonId);
    document.title = `Аш-Шифахия — текст и аудио урока ${lesson.lessonId}`;
    get('lesson-label').textContent = `Первая часть · Урок ${lesson.lessonId}`;
    get('audio-label').textContent = `Аудио урока ${lesson.lessonId}`;
    audio.setAttribute('aria-label', `Аудио урока ${lesson.lessonId}`);
    state = readState();
    render();
    renderCompletion();
    audio.src = lesson.audioSrc;
    get('audio-download').href = lesson.audioSrc;
    get('audio-download').setAttribute('download', `lesson-${lesson.lessonId}.mp3`);
    document.querySelector('.listening-player').hidden = false;
    document.querySelector('.listening-completion').hidden = false;
    document.querySelector('footer').hidden = false;
    status.hidden = true;
  } catch {
    status.textContent = 'Не удалось открыть урок. Проверьте соединение или вернитесь к курсу.';
  }
})();
