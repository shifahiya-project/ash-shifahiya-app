/** Monotonic playback-session counters shared by the course and offline player. */
export function createListeningTime() {
  const KEY = 'shifahiya-listening-time-v1';
  function normalize(value) {
    const result = {};
    if (!value || typeof value !== 'object' || Array.isArray(value)) return result;
    for (const [id, milliseconds] of Object.entries(value)) {
      const course = Number(id.split(':')[0]);
      if (!/^[1-9]\d*:[\w-]+$/.test(id) || !Number.isSafeInteger(course) || course < 1) continue;
      if (typeof milliseconds !== 'number' || !Number.isSafeInteger(milliseconds) || milliseconds <= 0) continue;
      result[id] = milliseconds;
    }
    return result;
  }
  function merge(mine, theirs) {
    const result = normalize(mine);
    for (const [id, milliseconds] of Object.entries(normalize(theirs))) {
      result[id] = Math.max(result[id] || 0, milliseconds);
    }
    return result;
  }
  function seconds(value) {
    return Math.floor(Object.values(normalize(value)).reduce((sum, ms) => sum + ms, 0) / 1000);
  }
  function tracker({ course, read, write, now, makeId }) {
    let id;
    let since;
    let elapsed = 0;
    let known = {};
    const enabled = Number.isSafeInteger(course) && course >= 1;
    function flush() {
      if (!enabled || !id) return;
      if (since !== undefined) {
        const current = now();
        elapsed += Math.max(0, current - since);
        since = current;
      }
      const milliseconds = Math.floor(elapsed);
      if (milliseconds <= 0) return;
      try {
        known = merge(merge(known, read()), { [id]: milliseconds });
        write(known);
      } catch { /* Retain this session in memory and retry at the next checkpoint. */ }
    }
    return {
      start() {
        if (!enabled || since !== undefined) return;
        id ||= `${course}:${makeId()}`;
        since = now();
      },
      stop() {
        flush();
        since = undefined;
      },
      flush,
    };
  }
  return { KEY, normalize, merge, seconds, tracker };
}
