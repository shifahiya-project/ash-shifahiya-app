// Types only, so this module stays pure and the tests can import it directly.
import type { LessonPart } from "../content/lesson-parts";
import type { Exam, ExamQuestion, ExamSummary, ReadingSummary } from "../content/types";

/**
 * Whether the course shows its grammar blocks.
 *
 * It does not, and that is the author's decision rather than pending work:
 * grammar as written here is not part of what the course teaches. Do not turn
 * this on, and do not read the blocks below as a feature waiting to be
 * finished.
 *
 * Nothing about it is deleted, though. The blocks, their rules and their
 * questions stay in the lesson files; the exam papers keep their grammar
 * questions; and every `shifahiya-grammar-{id}` score stays in storage and
 * keeps syncing between devices — kept in case the material is ever revisited
 * in some other shape. The switch itself stays reversible.
 *
 * What the flag does while it is off:
 *  - a lesson has no grammar part, so it ends with its own words;
 *  - a lesson counts as finished on its own score alone, which means nobody is
 *    held at a block they cannot see;
 *  - the exams drop their grammar questions, because an exam must not ask about
 *    what the course is not teaching;
 *  - a lesson left unfinished inside a grammar block counts as finished, since
 *    its cards and questions are behind the learner.
 */
export const GRAMMAR_ENABLED = false;

/** The parts a lesson is actually taught in. */
export function visibleParts(parts: LessonPart[], enabled = GRAMMAR_ENABLED) {
  return enabled ? parts : parts.filter((part) => part.kind !== "grammar");
}

/** How many parts the lesson card should claim. */
export function visiblePartCount(
  summary: { partCount: number; grammarQuestionCount: number },
  enabled = GRAMMAR_ENABLED,
) {
  if (enabled || !summary.grammarQuestionCount) return summary.partCount;
  return summary.partCount - 1;
}

export function visibleExamQuestions(exam: Exam, enabled = GRAMMAR_ENABLED): ExamQuestion[] {
  return enabled ? exam.questions : exam.questions.filter((question) => question.area !== "grammar");
}

/** The paper as the learner meets it: shorter, and with a lower pass mark. */
export function visibleExamSummary(summary: ExamSummary, enabled = GRAMMAR_ENABLED): ExamSummary {
  if (enabled) return summary;
  return {
    ...summary,
    questionCount: summary.questionCount - summary.grammarCount,
    grammarCount: 0,
  };
}

/**
 * Whether the course offers its reading texts.
 *
 * It does not. The twenty-five texts from «Мабдауль кыраат» carry too many
 * errors in their translations, and the author decided the layer is not shown
 * in this shape — not that it waits on proofreading. The first course is
 * Shifahiya alone. The second course is untouched — its texts come from other
 * books and are not affected.
 *
 * Nothing is deleted. `content/reading/section-*.ts`, the manifest, the reading
 * screen and its schedule all stay, and every `shifahiya-reading-v1` entry stays
 * in storage, so a learner who had read texts keeps that history — kept in case
 * the material is ever revisited in some other shape. The switch itself stays
 * reversible.
 *
 * The course never depended on it, which is what makes hiding it this cheap:
 * reading fed no cards, no scores and no unlocking, so removing it takes nothing
 * else with it.
 */
export const READING_ENABLED = false;

/** The lessons whose text is due, as the learner actually meets them. */
export function visibleDueReadings(dueIds: number[], enabled = READING_ENABLED): number[] {
  return enabled ? dueIds : [];
}

/** Whether a lesson card offers its text at all. */
export function hasVisibleReading(
  lessonId: number,
  byLesson: ReadonlyMap<number, ReadingSummary>,
  enabled = READING_ENABLED,
): boolean {
  return enabled && byLesson.has(lessonId);
}
