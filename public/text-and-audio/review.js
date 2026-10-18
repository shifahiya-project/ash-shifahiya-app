/** Pure calendar rules shared by the course and the downloadable player. */
export function createListeningReview() {
  const KEY = 'shifahiya-listening-reviews-v1';
  const OFFSETS = [1, 3, 7, 21, 60, 180, 365];
  const INTERVALS = OFFSETS.map((day, index) => day - (OFFSETS[index - 1] || 0));

  function localDay(date = new Date()) {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  }
  function validDay(value) {
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
    const date = new Date(`${value}T12:00:00Z`);
    return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
  }
  function addDays(day, days) {
    if (!validDay(day)) throw new TypeError('Invalid calendar date');
    const date = new Date(`${day}T12:00:00Z`);
    date.setUTCDate(date.getUTCDate() + days);
    const result = date.toISOString().slice(0, 10);
    if (!validDay(result)) throw new RangeError('Calendar date out of range');
    return result;
  }
  function reviewKey(course, lesson) { return `${course}:${lesson}`; }
  function normalizeRecord(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
    if (typeof value.active !== 'boolean' || !validDay(value.studiedOn)) return undefined;
    if (!Array.isArray(value.repeatedOn) || value.repeatedOn.length > INTERVALS.length) return undefined;
    if (typeof value.updatedAt !== 'number' || !Number.isFinite(value.updatedAt) || value.updatedAt < 0) return undefined;
    try {
      let previous = value.studiedOn;
      for (let index = 0; index < value.repeatedOn.length; index++) {
        const day = value.repeatedOn[index];
        if (!validDay(day) || day < addDays(previous, INTERVALS[index])) return undefined;
        previous = day;
      }
      for (let index = value.repeatedOn.length; index < INTERVALS.length; index++) previous = addDays(previous, INTERVALS[index]);
    } catch { return undefined; }
    return { active: value.active, studiedOn: value.studiedOn, repeatedOn: [...value.repeatedOn], updatedAt: value.updatedAt };
  }
  function normalize(value) {
    const records = {};
    if (!value || typeof value !== 'object' || Array.isArray(value)) return records;
    for (const [key, item] of Object.entries(value)) {
      const match = /^([1-9]\d*):([1-9]\d*)$/.exec(key);
      if (!match || Number(match[1]) < 2 || !Number.isSafeInteger(Number(match[1])) || !Number.isSafeInteger(Number(match[2]))) continue;
      const record = normalizeRecord(item);
      if (record) records[key] = record;
    }
    return records;
  }
  function merge(mine, theirs) {
    const result = normalize(mine);
    for (const [key, record] of Object.entries(normalize(theirs))) {
      const previous = result[key];
      if (!previous) { result[key] = record; continue; }
      // A fresh cancellation changes activity, but cannot erase earned stages.
      const active = record.updatedAt === previous.updatedAt ? record.active || previous.active
        : record.updatedAt > previous.updatedAt ? record.active : previous.active;
      // Keep a complete valid timeline; concurrent attempts count as one stage.
      // With equal counts, compare actual dates from the latest stage backwards.
      const history = record.repeatedOn.length > previous.repeatedOn.length
        || (record.repeatedOn.length === previous.repeatedOn.length
          && [...record.repeatedOn].reverse().join(',') > [...previous.repeatedOn].reverse().join(',')) ? record : previous;
      result[key] = {
        active,
        studiedOn: record.studiedOn < previous.studiedOn ? record.studiedOn : previous.studiedOn,
        repeatedOn: [...history.repeatedOn],
        updatedAt: Math.max(record.updatedAt, previous.updatedAt),
      };
    }
    return result;
  }
  /** Old completion marks supply the original study day until a review is saved. */
  function resolve(saved, completion) {
    const record = normalizeRecord(saved);
    if (completion && typeof completion.completed === 'boolean' && typeof completion.updatedAt === 'number'
      && Number.isFinite(completion.updatedAt) && completion.updatedAt >= 0
      && (!record || completion.updatedAt > record.updatedAt
        || (completion.updatedAt === record.updatedAt && completion.completed && !record.active))) {
      const studiedOn = record?.studiedOn || localDay(new Date(completion.updatedAt));
      if (!validDay(studiedOn)) return record;
      return normalizeRecord({ active: completion.completed, studiedOn, repeatedOn: record?.repeatedOn || [], updatedAt: completion.updatedAt });
    }
    return record;
  }
  function setStudied(previous, active, today = localDay(), now = Date.now()) {
    if (!validDay(today)) throw new TypeError('Invalid study date');
    const record = normalizeRecord(previous);
    return { active, studiedOn: record?.studiedOn || today, repeatedOn: record?.repeatedOn || [],
      updatedAt: Math.max(now, (record?.updatedAt || 0) + 1) };
  }
  function nextDate(record) {
    if (!record?.active || record.repeatedOn.length >= INTERVALS.length) return null;
    return addDays(record.repeatedOn.at(-1) || record.studiedOn, INTERVALS[record.repeatedOn.length]);
  }
  function complete(previous, today = localDay(), now = Date.now()) {
    const record = normalizeRecord(previous);
    const due = nextDate(record);
    if (!record || !validDay(today) || !due || due > today) return record;
    return { ...record, repeatedOn: [...record.repeatedOn, today], updatedAt: Math.max(now, record.updatedAt + 1) };
  }
  function plan(record) {
    const dates = [{ stage: 0, date: record.studiedOn, done: record.active }];
    let previous = record.studiedOn;
    for (let index = 0; index < INTERVALS.length; index++) {
      const date = record.repeatedOn[index] || addDays(previous, INTERVALS[index]);
      dates.push({ stage: index + 1, date, done: index < record.repeatedOn.length });
      previous = date;
    }
    return dates;
  }
  function queue(catalog, progress, completions = {}, today = localDay()) {
    const records = normalize(progress);
    return catalog.flatMap(entry => {
      const course = entry.courseId || 1;
      if (!Number.isSafeInteger(course) || course < 2) return [];
      const review = resolve(records[reviewKey(course, entry.lessonId)], course === 2 ? completions[entry.lessonId] : undefined);
      const nextReview = nextDate(review);
      return nextReview && nextReview <= today ? [{ ...entry, review, nextReview }] : [];
    }).sort((a, b) => a.nextReview.localeCompare(b.nextReview)
      || a.courseId - b.courseId || a.lessonId - b.lessonId);
  }
  return { KEY, OFFSETS, INTERVALS, localDay, addDays, reviewKey, normalize, merge, resolve, setStudied, nextDate, complete, plan, queue };
}
