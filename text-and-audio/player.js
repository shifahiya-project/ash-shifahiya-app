import { createListeningReview } from './review.js?v=1';
import { createListeningTime } from './time.js?v=1';
import { createListeningPlayback } from './playback.js?v=1';
/* A standalone player: fetch only the selected recording and transcript. */
(async function () {
  'use strict';
  const get = (id) => document.getElementById(id);
  const audio = document.querySelector('audio');
  const defaults = { position: 0, rate: 1, loop: false, showText: true, vocalized: true, fontSize: 30 };
  let lesson;
  let state;
  let lastSave = 0;
  let allCatalog = [];
  let reviewMode = false;
  let playbackKey;
  let reviewTimer;
  let listeningClock;
  let positionRestore;
  let resumedKey;
  let pendingActivation = false;
  const reviews = createListeningReview();
  const listeningTime = createListeningTime();
  const playback = createListeningPlayback();
  const courseId = () => lesson.courseId ?? 1;
  const prefix = (id = courseId()) => id === 1 ? '' : `p${id}-`;
  const studyKey = () => `shifahiya-${prefix()}listening-${lesson.lessonId}-v1`;
  const key = () => playbackKey || studyKey();
  const context = () => ({ courseId: courseId(), lessonId: lesson.lessonId, key: key() });
  const status = get('status');
  const embedded = window.LISTENING_LESSON;
  const rates = [0.5, 0.75, 0.9, 1, 1.25, 1.5, 2];
  const progressKey = (id = courseId()) => `shifahiya-${prefix(id)}listening-progress-v1`;
  async function fetchText(url) {
    const response = await fetch(url, { cache: 'no-store' });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return response.text();
  }
  function save() {
    if (!lesson || !state) return;
    listeningClock?.flush();
    const restored = positionRestore?.ready() === true && audio.readyState > 0;
    if (restored) state.position = audio.ended ? 0 : audio.currentTime;
    try {
      playback.savePosition(localStorage, context(), state.position, state);
      if (restored) {
        playback.checkpoint(localStorage, context(), { position: state.position, duration: audio.duration,
          rate: state.rate, loop: state.loop, finished: audio.ended }, pendingActivation);
        pendingActivation = false;
      }
    } catch { /* Playback still works without storage. */ }
    lastSave = Date.now();
  }
  function readState() {
    let saved = {};
    try {
      const study = JSON.parse(localStorage.getItem(studyKey())) || {};
      saved = JSON.parse(localStorage.getItem(key())) || (playbackKey ? { ...study, position: 0 } : study);
    } catch { /* Use defaults. */ }
    return { ...defaults,
      position: Number.isFinite(saved.position) && saved.position >= 0 ? saved.position : 0,
      rate: rates.includes(saved.rate) ? saved.rate : 1,
      loop: saved.loop === true,
      showText: typeof saved.showText === 'boolean' ? saved.showText : true,
      vocalized: typeof saved.vocalized === 'boolean' ? saved.vocalized : true,
      fontSize: [24, 27, 30, 33, 36, 39, 42].includes(saved.fontSize) ? saved.fontSize : 30,
    };
  }
  function readProgress(course = courseId()) {
    if (!lesson) return {};
    try {
      const saved = JSON.parse(localStorage.getItem(progressKey(course)));
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
    const completed = courseId() >= 2 ? reviewRecord()?.active === true : readProgress()[lesson.lessonId]?.completed === true;
    get('complete').textContent = completed ? 'Пройдено · Отменить отметку' : 'Текст и аудио пройдены';
    get('complete').setAttribute('aria-pressed', String(completed));
    get('complete').disabled = false;
    get('completion-status').textContent = completed
      ? 'Текст и аудио этого урока отмечены как пройденные.'
      : 'После занятия отметьте текст и аудио как пройденные.';
    renderReview();
  }
  function readReviews() {
    try { return reviews.normalize(JSON.parse(localStorage.getItem(reviews.KEY))); } catch { return {}; }
  }
  function reviewRecord() {
    return reviews.resolve(readReviews()[reviews.reviewKey(courseId(), lesson.lessonId)],
      courseId() === 2 ? readProgress()[lesson.lessonId] : undefined);
  }
  const formatDate = day => new Date(`${day}T12:00:00`).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' });
  function renderReview() {
    get('audio-review').hidden = courseId() < 2;
    if (courseId() < 2) return;
    const record = reviewRecord();
    const date = reviews.nextDate(record);
    const today = reviews.localDay();
    const count = record?.repeatedOn.length || 0;
    get('review-context').hidden = !reviewMode;
    get('review-context').textContent = record?.repeatedOn.at(-1) === today
      ? `${count}-е повторение из 7 учтено`
      : date && date <= today ? `${count + 1}-е повторение из 7 · слушайте и повторяйте вслух`
        : record?.active ? 'Повторение аудио · график ниже' : 'Повторение аудио · сначала пройдите урок';
    get('review-count').textContent = record?.active ? `Повторено ${count} из 7` : 'Первое повторение — на следующий день после изучения';
    get('review-complete').hidden = !record?.active;
    get('review-complete').disabled = !date || date > today;
    get('review-complete').textContent = record?.repeatedOn.at(-1) === today ? 'Повторение учтено ✓' : 'Повторение пройдено';
    get('review-status').textContent = !record?.active
      ? 'Сначала отметьте текст и аудио как пройденные. Затем начнётся расписание из семи повторений.'
      : !date ? 'Все семь повторений завершены. Запись можно слушать в любое время.'
        : date <= today ? `Пора повторить: ${count + 1}-е повторение из 7 · ${formatDate(date)}`
          : `Следующее, ${count + 1}-е повторение — ${formatDate(date)}`;
    get('review-dates').hidden = !record?.active;
    get('review-schedule').replaceChildren(...(record?.active ? reviews.plan(record).map(item => {
      const row = document.createElement('li');
      if (item.done) row.className = 'is-complete';
      const label = document.createElement('span');
      label.textContent = `${item.done ? '✓ ' : ''}${item.stage ? `Повторение ${item.stage}` : 'Изучение'}`;
      const time = document.createElement('time');
      time.dateTime = item.date;
      time.textContent = formatDate(item.date);
      row.append(label, time);
      return row;
    }) : []));
    const next = reviews.queue(allCatalog, readReviews(), readProgress(2), today)
      .find(entry => (entry.courseId || 1) !== courseId() || entry.lessonId !== lesson.lessonId);
    get('review-next').hidden = !reviewMode || !next;
    if (next) {
      get('review-next').href = `./text-and-audio.html?v=9&lesson=${next.lessonId}&course=${next.courseId}&review=1`;
      get('review-next').textContent = `Следующее аудио: ${next.courseTitle || `Часть ${next.courseId}`} · Урок ${next.lessonId}`;
    }
  }
  function reviewPlaybackKey() {
    if (resumedKey) return resumedKey;
    if (!reviewMode || !lesson) return undefined;
    const record = reviewRecord();
    const date = reviews.nextDate(record);
    const stage = (record?.repeatedOn.length || 0) + (date && date <= reviews.localDay() ? 1 : 0);
    return record?.active && stage > 0
      ? `shifahiya-p${courseId()}-listening-review-${lesson.lessonId}-${record.studiedOn}-${stage}-v1` : undefined;
  }
  function refreshReviews() {
    if (lesson) {
      const nextKey = reviewPlaybackKey();
      if (state && nextKey && nextKey !== playbackKey) {
        const playing = !audio.paused;
        pendingActivation ||= playing;
        const position = audio.currentTime;
        save();
        playbackKey = nextKey;
        state = readState();
        if (playing) state.position = position;
        render();
        positionRestore?.dispose();
        positionRestore = playback.restore(audio, state.position);
      }
      renderCompletion();
    }
    clearTimeout(reviewTimer);
    const midnight = new Date();
    midnight.setHours(24, 0, 0, 0);
    reviewTimer = setTimeout(refreshReviews, Math.max(1, midnight.getTime() - Date.now()));
  }
  /** Keep the old completion key compatible; review histories have their own key. */
  function writeReview(record) {
    const beforeReviews = localStorage.getItem(reviews.KEY);
    const beforeCompletion = courseId() === 2 ? localStorage.getItem(progressKey()) : null;
    const progress = readReviews();
    progress[reviews.reviewKey(courseId(), lesson.lessonId)] = record;
    try {
      localStorage.setItem(reviews.KEY, JSON.stringify(progress));
      if (courseId() === 2) {
        const completions = readProgress();
        completions[lesson.lessonId] = { completed: record.active, updatedAt: record.updatedAt };
        localStorage.setItem(progressKey(), JSON.stringify(completions));
      }
    } catch (error) {
      try {
        if (beforeReviews === null) localStorage.removeItem(reviews.KEY);
        else localStorage.setItem(reviews.KEY, beforeReviews);
        if (courseId() === 2) {
          if (beforeCompletion === null) localStorage.removeItem(progressKey());
          else localStorage.setItem(progressKey(), beforeCompletion);
        }
      } catch { /* Report the original storage failure. */ }
      throw error;
    }
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
    audio.playbackRate = state.rate;
    get('audio-error').hidden = true;
  });
  audio.addEventListener('error', () => { get('audio-error').hidden = false; });
  audio.addEventListener('emptied', () => {
    positionRestore?.dispose();
    positionRestore = playback.restore(audio, state?.position || 0);
  });
  audio.addEventListener('playing', () => {
    if (!audio.paused) { pendingActivation = true; listeningClock?.start(); save(); }
  });
  function resumeListeningClock() {
    if (!audio.paused && !audio.seeking && !audio.ended && audio.readyState >= 3) listeningClock?.start();
  }
  for (const event of ['pause', 'waiting', 'seeking', 'ended', 'error', 'emptied']) {
    audio.addEventListener(event, () => listeningClock?.stop());
  }
  audio.addEventListener('seeked', resumeListeningClock);
  for (const event of ['pause', 'seeked', 'ended']) audio.addEventListener(event, save);
  audio.addEventListener('timeupdate', () => { if (Date.now() - lastSave > 1000) save(); });
  window.addEventListener('pagehide', () => { listeningClock?.stop(); save(); clearTimeout(reviewTimer); });
  document.addEventListener('visibilitychange', () => { if (document.hidden) save(); else refreshReviews(); });
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
    if (courseId() >= 2) {
      const resolved = reviewRecord();
      const previous = readReviews()[reviews.reviewKey(courseId(), lesson.lessonId)] || (resolved?.active ? resolved : undefined);
      const next = reviews.setStudied(previous, !resolved?.active, reviews.localDay(), Math.max(Date.now(), (resolved?.updatedAt || 0) + 1));
      try { writeReview(next); renderCompletion(); }
      catch { get('completion-status').textContent = 'Не удалось сохранить отметку. Проверьте, разрешено ли браузеру сохранять данные.'; }
      return;
    }
    const progress = readProgress();
    const previous = progress[lesson.lessonId];
    progress[lesson.lessonId] = {
      completed: previous?.completed !== true,
      updatedAt: Math.max(Date.now(), (previous?.updatedAt || 0) + 1),
    };
    try {
      localStorage.setItem(progressKey(), JSON.stringify(progress));
      renderCompletion();
    } catch {
      get('completion-status').textContent = 'Не удалось сохранить отметку. Проверьте, разрешено ли браузеру сохранять данные.';
    }
  };
  get('review-complete').onclick = () => {
    const previous = reviewRecord();
    const next = reviews.complete(previous);
    if (!next || next.repeatedOn.length === previous?.repeatedOn.length) return;
    try { writeReview(next); renderCompletion(); }
    catch { get('review-status').textContent = 'Не удалось сохранить повторение. Попробуйте ещё раз.'; }
  };
  window.addEventListener('storage', (event) => {
    if (lesson && (event.key === progressKey() || event.key === progressKey(2) || event.key === reviews.KEY || event.key === null)) renderCompletion();
  });
  window.addEventListener('pageshow', refreshReviews);
  window.addEventListener('pageshow', resumeListeningClock);
  window.addEventListener('focus', refreshReviews);
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
        fetchText('./text-and-audio.html?v=9'), fetchText('./text-and-audio/player.css?v=8'), fetchText('./text-and-audio/player.js?v=9'),
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
      player.type = 'module';
      // The factory is self-contained, so the saved lesson needs no module fetch.
      player.textContent = `const createListeningReview = ${createListeningReview.toString()};\n`
        + `const createListeningTime = ${createListeningTime.toString()};\n`
        + `const createListeningPlayback = ${createListeningPlayback.toString()};\n`
        + script.replace(/^import \{ createListening(?:Review|Time|Playback) \} from ['"].+['"];\s*/gm, '');
      doc.body.append(data, player);
      const href = URL.createObjectURL(new Blob(['<!doctype html>\n' + doc.documentElement.outerHTML], { type: 'text/html;charset=utf-8' }));
      const link = document.createElement('a');
      link.href = href;
      link.download = `${courseId() === 1 ? 'shifahiya' : courseId() === 2 ? 'reading' : `course-${courseId()}`}-lesson-${lesson.lessonId}.html`;
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
      allCatalog = catalog;
      get('download').hidden = true;
      get('offline-progress-note').hidden = false;
      const courseLink = document.querySelector('nav a');
      courseLink.href = 'https://shifahiya-project.github.io/ash-shifahiya-app/';
    } else {
      const params = new URLSearchParams(location.search);
      const requestedCourse = params.get('course') ?? '1';
      if (!/^[1-9]\d*$/.test(requestedCourse) || !Number.isSafeInteger(Number(requestedCourse))) throw new Error('Course unavailable');
      reviewMode = Number(requestedCourse) >= 2 && params.get('review') === '1';
      allCatalog = JSON.parse(await fetchText('./text-and-audio/catalog.json'));
      catalog = allCatalog.filter(entry => String(entry.courseId ?? 1) === requestedCourse);
      const requested = new URLSearchParams(location.search).get('lesson');
      const entry = requested === null ? catalog[0] : catalog.find(item => String(item.lessonId) === requested);
      if (!entry) throw new Error('Lesson unavailable');
      lesson = { ...entry, ...JSON.parse(await fetchText(entry.textSrc)) };
      if (params.get('resume') === '1') {
        try {
          const previous = playback.active(localStorage);
          if (previous?.courseId === courseId() && previous.lessonId === lesson.lessonId && previous.key !== studyKey()) {
            resumedKey = previous.key;
            reviewMode = true;
          }
        } catch { /* Saved playback is optional. */ }
      }
    }
    if (courseId() >= 2) {
      document.querySelector('nav a').href = embedded
        ? `https://shifahiya-project.github.io/ash-shifahiya-app/?course=${courseId()}` : `./?course=${courseId()}`;
    }
    for (const entry of catalog) {
      const option = document.createElement('option');
      option.value = entry.lessonId;
      option.textContent = `Урок ${entry.lessonId}`;
      get('lesson').append(option);
    }
    get('lesson').value = String(lesson.lessonId);
    const courseTitle = lesson.courseTitle || 'Шифахия';
    const heading = `${courseTitle} · Урок ${lesson.lessonId}`;
    document.title = heading;
    get('lesson-label').textContent = heading;
    audio.setAttribute('aria-label', `Аудио урока ${lesson.lessonId}`);
    playbackKey = reviewPlaybackKey();
    state = readState();
    positionRestore = playback.restore(audio, state.position);
    listeningClock = listeningTime.tracker({
      course: courseId(),
      read: () => {
        try { return JSON.parse(localStorage.getItem(listeningTime.KEY) || '{}'); }
        catch { return {}; }
      },
      write: value => localStorage.setItem(listeningTime.KEY, JSON.stringify(value)),
      now: () => performance.now(),
      makeId: () => crypto.randomUUID?.() || `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`,
    });
    render();
    refreshReviews();
    audio.src = lesson.audioSrc;
    get('audio-download').href = lesson.audioSrc;
    get('audio-download').setAttribute('download', `${courseId() === 1 ? '' : courseId() === 2 ? 'reading-' : `course-${courseId()}-`}lesson-${lesson.lessonId}.mp3`);
    document.querySelector('.listening-player').hidden = false;
    document.querySelector('.listening-completion').hidden = false;
    document.querySelector('footer').hidden = false;
    status.hidden = true;
  } catch {
    status.textContent = 'Не удалось открыть урок. Проверьте соединение или вернитесь к курсу.';
  }
})();
