/** The current lesson and its nearest useful context, in manifest order. */
export function homeLessonWindow<T extends { id: number }>(
  items: T[],
  isComplete: (item: T) => boolean,
  currentId?: number,
): T[] {
  const completed = items.map(isComplete);
  let currentIndex = items.findIndex((item) => item.id === currentId);
  if (currentIndex === -1) currentIndex = completed.findIndex((done) => !done);

  if (currentIndex === -1) {
    const lastCompletedIndex = completed.lastIndexOf(true);
    return lastCompletedIndex === -1 ? [] : [items[lastCompletedIndex]];
  }

  const window: T[] = [];
  for (let index = currentIndex - 1; index >= 0; index -= 1) {
    if (completed[index]) {
      window.push(items[index]);
      break;
    }
  }
  window.push(items[currentIndex]);
  if (currentIndex + 1 < items.length) window.push(items[currentIndex + 1]);

  const seen = new Set<number>();
  return window.filter((item) => {
    if (seen.has(item.id)) return false;
    seen.add(item.id);
    return true;
  });
}
