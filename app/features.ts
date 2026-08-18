// Types only, so this module stays pure and the tests can import it directly.
import type { LessonPart } from "../content/lesson-parts";
import type { Exam, ExamQuestion, ExamSummary } from "../content/types";

/**
 * Whether the course shows its grammar blocks.
 *
 * While the course leans on vocabulary and reading, grammar is hidden — but
 * nothing about it is deleted. The blocks, their rules and their questions stay
 * in the lesson files; the exam papers keep their grammar questions; and every
 * `shifahiya-grammar-{id}` score stays in storage and keeps syncing between
 * devices. Flip this back to `true` and all of it returns exactly as it was,
 * scores included.
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
