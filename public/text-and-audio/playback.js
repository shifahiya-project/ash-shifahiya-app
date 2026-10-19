/** Device-local continuation shared by both players and the downloaded lesson. */
export function createListeningPlayback() {
  const KEY = 'shifahiya-listening-active-v1';
  const rates = [0.5, 0.75, 0.9, 1, 1.25, 1.5, 2];
  const studyKey = (course, lesson) => `shifahiya-${course === 1 ? '' : `p${course}-`}listening-${lesson}-v1`;
  function validContext(value) {
    if (!value || !Number.isSafeInteger(value.courseId) || value.courseId < 1 ||
      !Number.isSafeInteger(value.lessonId) || value.lessonId < 1) return false;
    return value.key === studyKey(value.courseId, value.lessonId) ||
      new RegExp(`^shifahiya-p${value.courseId}-listening-review-${value.lessonId}-\\d{4}-\\d{2}-\\d{2}-[1-7]-v1$`).test(value.key);
  }
  function normalize(value) {
    if (!validContext(value) || !Number.isFinite(value.position) || value.position < 0 ||
      !Number.isFinite(value.duration) || value.duration <= 0 || value.position > value.duration) return null;
    return { courseId: value.courseId, lessonId: value.lessonId, key: value.key,
      position: value.position, duration: value.duration,
      rate: rates.includes(value.rate) ? value.rate : 1, loop: value.loop === true,
      updatedAt: Number.isFinite(value.updatedAt) && value.updatedAt >= 0 ? value.updatedAt : 0,
      dismissed: value.dismissed === true, finished: value.finished === true };
  }
  function read(storage, key) {
    try { return JSON.parse(storage.getItem(key)); } catch { return null; }
  }
  const active = storage => normalize(read(storage, KEY));
  function latest(storage, catalog) {
    const saved = active(storage);
    if (saved && catalog.some(entry => (entry.courseId ?? 1) === saved.courseId && entry.lessonId === saved.lessonId)) return saved;
    // Older versions only saved per-lesson positions. Keep them accessible;
    // all new playback gets an exact last-used timestamp in the active key.
    let candidate = null;
    for (const entry of catalog) {
      const courseId = entry.courseId ?? 1;
      const key = studyKey(courseId, entry.lessonId);
      const state = read(storage, key);
      const record = normalize({ ...state, courseId, lessonId: entry.lessonId, key, duration: entry.duration });
      if (record && record.position > 0 && record.position < record.duration &&
        (!candidate || record.updatedAt >= candidate.updatedAt)) candidate = record;
    }
    return candidate;
  }
  function checkpoint(storage, context, values, activate = false, now = Date.now()) {
    const previous = active(storage);
    if (previous && previous.key !== context.key && !activate) return previous;
    if (previous?.key === context.key && previous.finished && !values.finished && !activate) return previous;
    const next = normalize({ ...context, ...values, updatedAt: now,
      dismissed: !activate && previous?.key === context.key && previous.dismissed });
    if (!next) return previous;
    storage.setItem(KEY, JSON.stringify(next));
    return next;
  }
  function dismiss(storage, key) {
    const record = active(storage);
    if (record?.key === key) storage.setItem(KEY, JSON.stringify({ ...record, dismissed: true }));
  }
  function savePosition(storage, context, position, preferences) {
    if (!validContext(context) || !Number.isFinite(position) || position < 0) return;
    const previous = read(storage, context.key) || {};
    storage.setItem(context.key, JSON.stringify({ ...previous, ...preferences, position }));
    const study = studyKey(context.courseId, context.lessonId);
    if (context.key !== study) {
      const original = read(storage, study) || {};
      storage.setItem(study, JSON.stringify({ ...original, ...preferences,
        position: Number.isFinite(original.position) && original.position >= 0 ? original.position : 0 }));
    }
  }
  /** Do not let an initial zero timeupdate overwrite a saved position. */
  function restore(audio, position) {
    let ready = false, requested = false;
    const desired = Number.isFinite(position) && position > 0 ? position : 0;
    function attempt() {
      if (ready || audio.readyState < 1 || !Number.isFinite(audio.duration) || audio.duration <= 0) return;
      const target = desired < audio.duration ? desired : 0;
      if (!requested || (!audio.seeking && Math.abs(audio.currentTime - target) >= 0.5)) {
        try { audio.currentTime = target; requested = true; } catch { return; }
      }
      if (!audio.seeking && Math.abs(audio.currentTime - target) < 0.5) ready = true;
    }
    const events = ['loadedmetadata', 'durationchange', 'canplay', 'seeked'];
    for (const event of events) audio.addEventListener(event, attempt);
    attempt();
    return { ready: () => ready, dispose: () => {
      for (const event of events) audio.removeEventListener(event, attempt);
    } };
  }
  return { KEY, studyKey, normalize, active, latest, checkpoint, dismiss, savePosition, restore };
}
