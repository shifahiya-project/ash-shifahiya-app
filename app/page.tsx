"use client";

import { ChangeEvent, useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { lessonSummaries } from "../content/manifest";
import { READING_SOURCE, readingByLesson } from "../content/reading-manifest";
import { loadLessons } from "../content/lessons";
import { loadReading } from "../content/reading";
import { examSummaries, loadExam } from "../content/exams";
import { part2Summaries } from "../content/part2/manifest";
import { loadPart2Lesson, loadPart2Lessons } from "../content/part2/lessons";
import { BLANK, part2Questions } from "../content/part2/questions";
import { part2CardId, part2LessonIdsInCards, unlockedPart2Ids } from "./part2-access";
import { PART3_AUTHOR, PART3_BOOK, part3Summaries } from "../content/part3/manifest";
import { loadPart3Lesson, loadPart3Lessons } from "../content/part3/lessons";
import { part3Questions } from "../content/part3/questions";
import { isPart3Open, part3CardId, part3LessonIdsInCards, unlockedPart3Ids } from "./part3-access";
import { plural } from "../content/questions";
import type { Exam, Lesson, Part2Lesson, Part3Lesson, ReadingSection } from "../content/types";
import { cardPhaseProgress } from "./lesson-progress";
import {
  examPassMark,
  examReadiness,
  grammarPassMark,
  isExamPassed,
  isLessonComplete,
  unlockedLessonIds,
} from "./lesson-access";
import { lessonParts, partIndexFor } from "../content/lesson-parts";
import {
  GRAMMAR_ENABLED,
  hasVisibleReading,
  visibleDueReadings,
  visibleExamQuestions,
  visibleExamSummary,
  visiblePartCount,
  visibleParts,
} from "./features.ts";
import {
  EMPTY_STATS,
  progressStore,
  type CardProgress,
  type SavedSession,
} from "./progress-store";
import { dueReadingIds, nextReadingProgress } from "./reading-review";
import { signInWithGoogle, signOut, startSync, syncStore } from "./sync";

type ReviewCard = {
  id: string;
  lessonId: number;
  prompt: string;
  answer: string;
  promptLang: "ar" | "ru";
  answerLang: "ar" | "ru";
};

const REVIEW_INTERVALS = [0, 1, 3, 7, 14, 30];
const WORD_ACHIEVEMENTS = [10, 50, 100, 250, 500, 1000, 1500, 2000];
const DAY_ACHIEVEMENTS = [7, 14, 30, 50, 100, 150, 250, 365];

/** Google's mark, inline so the sign-in button pulls in no outside asset. */
function GoogleMark() {
  return (
    <svg viewBox="0 0 48 48" aria-hidden="true" focusable="false">
      <path fill="#4285F4" d="M45.1 24.5c0-1.6-.1-3.2-.4-4.7H24v8.9h11.8c-.5 2.8-2 5.1-4.4 6.7v5.5h7.1c4.1-3.8 6.6-9.4 6.6-16.4z" />
      <path fill="#34A853" d="M24 46c5.9 0 10.9-2 14.5-5.3l-7.1-5.5c-2 1.3-4.5 2.1-7.4 2.1-5.7 0-10.6-3.9-12.3-9.1H4.4v5.7C8 41.1 15.4 46 24 46z" />
      <path fill="#FBBC05" d="M11.7 28.2c-.4-1.3-.7-2.7-.7-4.2s.3-2.9.7-4.2v-5.7H4.4A22 22 0 0 0 2 24c0 3.6.9 6.9 2.4 9.9l7.3-5.7z" />
      <path fill="#EA4335" d="M24 10.7c3.2 0 6.1 1.1 8.4 3.3l6.3-6.3C34.9 4.1 29.9 2 24 2 15.4 2 8 6.9 4.4 14.1l7.3 5.7c1.7-5.2 6.6-9.1 12.3-9.1z" />
    </svg>
  );
}

function localDate(daysFromNow = 0) {
  const date = new Date();
  date.setHours(12, 0, 0, 0);
  date.setDate(date.getDate() + daysFromNow);
  return date.toISOString().slice(0, 10);
}

function streaks(activeDates: string[]) {
  const dates = [...new Set(activeDates)].sort();
  let longest = 0;
  let run = 0;
  let previous = "";
  for (const date of dates) {
    const consecutive = previous &&
      (new Date(`${date}T12:00:00Z`).getTime() - new Date(`${previous}T12:00:00Z`).getTime()) / 86400000 === 1;
    run = consecutive ? run + 1 : 1;
    longest = Math.max(longest, run);
    previous = date;
  }

  const today = localDate();
  const yesterday = localDate(-1);
  if (!dates.length || (dates.at(-1) !== today && dates.at(-1) !== yesterday)) {
    return { current: 0, longest };
  }
  let current = 1;
  for (let index = dates.length - 1; index > 0; index -= 1) {
    const difference =
      (new Date(`${dates[index]}T12:00:00Z`).getTime() - new Date(`${dates[index - 1]}T12:00:00Z`).getTime()) / 86400000;
    if (difference !== 1) break;
    current += 1;
  }
  return { current, longest };
}

function formatStudyTime(totalSeconds: number) {
  if (totalSeconds < 60) return "< 1 мин";
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  return hours ? `${hours} ч ${minutes} мин` : `${minutes} мин`;
}

function wordCardId(lessonId: number, deckIndex: number, wordIndex: number, direction: "ar-ru" | "ru-ar") {
  return `lesson-${lessonId}-deck-${deckIndex}-word-${wordIndex}-${direction}`;
}

function reviewCardsOf(lesson: Lesson): ReviewCard[] {
  return lesson.decks.flatMap((deck, deckIndex) =>
    deck.words.flatMap((word, wordIndex) => [
      {
        id: wordCardId(lesson.id, deckIndex, wordIndex, "ar-ru"),
        lessonId: lesson.id,
        prompt: word.arabic,
        answer: word.russian,
        promptLang: "ar" as const,
        answerLang: "ru" as const,
      },
      {
        id: wordCardId(lesson.id, deckIndex, wordIndex, "ru-ar"),
        lessonId: lesson.id,
        prompt: word.russian,
        answer: word.arabic,
        promptLang: "ru" as const,
        answerLang: "ar" as const,
      },
    ]),
  );
}

/**
 * The second course teaches single words with the sentence they live in, so a
 * card shows the word and keeps that sentence as its example.
 */
function part2ReviewCardsOf(lesson: Part2Lesson): ReviewCard[] {
  return lesson.words.flatMap((word, index) => [
    {
      id: part2CardId(lesson.id, index, "ar-ru"),
      lessonId: lesson.id,
      prompt: word.arabic,
      answer: word.russian,
      promptLang: "ar" as const,
      answerLang: "ru" as const,
    },
    {
      id: part2CardId(lesson.id, index, "ru-ar"),
      lessonId: lesson.id,
      prompt: word.russian,
      answer: word.arabic,
      promptLang: "ru" as const,
      answerLang: "ar" as const,
    },
  ]);
}

/**
 * The third course teaches a word by itself — its glossary carries no example
 * sentences — so its card is the word and its meaning, nothing else.
 */
function part3ReviewCardsOf(lesson: Part3Lesson): ReviewCard[] {
  return lesson.words.flatMap((word, index) => [
    {
      id: part3CardId(lesson.id, index, "ar-ru"),
      lessonId: lesson.id,
      prompt: word.arabic,
      answer: word.russian,
      promptLang: "ar" as const,
      answerLang: "ru" as const,
    },
    {
      id: part3CardId(lesson.id, index, "ru-ar"),
      lessonId: lesson.id,
      prompt: word.russian,
      answer: word.arabic,
      promptLang: "ru" as const,
      answerLang: "ar" as const,
    },
  ]);
}

/** Lesson ids the learner has any card progress in, read off the stored keys. */
function lessonIdsInProgress(progress: Record<string, CardProgress>) {
  const ids = new Set<number>();
  for (const id of Object.keys(progress)) {
    const match = id.match(/^lesson-(\d+)-deck-/);
    if (match) ids.add(Number(match[1]));
  }
  return [...ids];
}

const MASTERED_BOX = REVIEW_INTERVALS.length - 1;

function nextCardProgress(previous: CardProgress | undefined, remembered: boolean): CardProgress {
  const box = remembered ? Math.min((previous?.box ?? 0) + 1, MASTERED_BOX) : 0;
  return {
    box,
    nextReview: localDate(REVIEW_INTERVALS[box]),
    lastReviewed: localDate(),
    correct: (previous?.correct ?? 0) + (remembered ? 1 : 0),
    wrong: (previous?.wrong ?? 0) + (remembered ? 0 : 1),
  };
}

/**
 * Puts a card straight into the last box. Pronouns and the like are known on
 * sight, and walking them up the boxes one review at a time is time the
 * learner would rather spend on forms they actually forget.
 */
function masteredCardProgress(previous: CardProgress | undefined): CardProgress {
  return {
    box: MASTERED_BOX,
    nextReview: localDate(REVIEW_INTERVALS[MASTERED_BOX]),
    lastReviewed: localDate(),
    correct: (previous?.correct ?? 0) + 1,
    wrong: previous?.wrong ?? 0,
  };
}

/** Both halves of a word: the card asked in Arabic and the one asked in Russian. */
function bothDirections(cardId: string) {
  const word = cardId.replace(/-(ar-ru|ru-ar)$/, "");
  return [`${word}-ar-ru`, `${word}-ru-ar`];
}

function speak(text: string) {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = "ar-SA";
  const arabicVoice = window.speechSynthesis
    .getVoices()
    .find((voice) => voice.lang.toLowerCase().startsWith("ar"));
  if (arabicVoice) utterance.voice = arabicVoice;
  utterance.rate = 0.62;
  utterance.pitch = 0.9;
  utterance.volume = 0.88;
  window.speechSynthesis.speak(utterance);
}

/**
 * Which way a question prompt is laid out. A prompt that carries Russian text —
 * «Исправьте: …» before an Arabic sentence — must run left to right even though
 * it asks about Arabic: laid out right to left, the Russian half and its colon
 * jump to the wrong side and cut into the sentence.
 */
function promptDirection(text: string, lang: "ar" | "ru") {
  return lang === "ar" && !/[\u0400-\u04FF]/.test(text) ? "rtl" : "ltr";
}

function shuffle<T>(items: T[]) {
  const result = [...items];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const target = Math.floor(Math.random() * (index + 1));
    [result[index], result[target]] = [result[target], result[index]];
  }
  return result;
}

export default function Home() {
  const [view, setView] = useState<
    | "home" | "learn" | "practice" | "grammar" | "reading" | "review" | "result"
    | "exam" | "exam-result"
    | "p2-learn" | "p2-practice" | "p2-reading" | "p2-result"
    | "p3-learn" | "p3-practice" | "p3-reading" | "p3-result"
  >("home");
  const [lessonId, setLessonId] = useState(1);
  const [partIndex, setPartIndex] = useState(0);
  const [deckIndex, setDeckIndex] = useState(0);
  const [round, setRound] = useState(1);
  const [cardIndex, setCardIndex] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const [questionIndex, setQuestionIndex] = useState(0);
  const [ruleIndex, setRuleIndex] = useState(0);
  const [selected, setSelected] = useState<string | null>(null);
  const [score, setScore] = useState(0);
  const [grammarScore, setGrammarScore] = useState(0);
  const [mistakes, setMistakes] = useState<string[]>([]);
  const [reviewQueue, setReviewQueue] = useState<ReviewCard[]>([]);
  const [reviewIndex, setReviewIndex] = useState(0);
  const [reviewRevealed, setReviewRevealed] = useState(false);
  const [backupMessage, setBackupMessage] = useState("");
  const [openLessons, setOpenLessons] = useState<Record<number, Lesson>>({});
  const [openPart2, setOpenPart2] = useState<Record<number, Part2Lesson>>({});
  const [openPart3, setOpenPart3] = useState<Record<number, Part3Lesson>>({});
  const [reading, setReading] = useState<ReadingSection | null>(null);
  const [openLines, setOpenLines] = useState<string[]>([]);
  const [course, setCourse] = useState<1 | 2 | 3>(1);
  const [part2, setPart2] = useState<Part2Lesson | null>(null);
  const [part3, setPart3] = useState<Part3Lesson | null>(null);
  const [stepIndex, setStepIndex] = useState(0);
  const [stepScore, setStepScore] = useState(0);
  const [stepMistakes, setStepMistakes] = useState<string[]>([]);
  const [stepOpen, setStepOpen] = useState<string[]>([]);
  const [exam, setExam] = useState<Exam | null>(null);
  const [examOrder, setExamOrder] = useState<number[]>([]);
  const [examIndex, setExamIndex] = useState(0);
  const [examScore, setExamScore] = useState(0);
  const [examMistakes, setExamMistakes] = useState<string[]>([]);
  const importInput = useRef<HTMLInputElement>(null);

  const stored = useSyncExternalStore(
    progressStore.subscribe,
    progressStore.getSnapshot,
    progressStore.getServerSnapshot,
  );
  const savedScores = stored.scores;
  const savedScoreTotals = stored.scoreTotals;
  const savedGrammarScores = stored.grammarScores;
  const savedSessions = stored.sessions;
  const cardProgress = stored.cards;
  const learningStats = stored.stats;

  const sync = useSyncExternalStore(syncStore.subscribe, syncStore.getSnapshot, syncStore.getServerSnapshot);

  const lesson = openLessons[lessonId];
  const parts = useMemo(() => (lesson ? visibleParts(lessonParts(lesson)) : []), [lesson]);
  const part = parts[partIndex] ?? parts[0];
  const deck = lesson?.decks[deckIndex];
  const words = deck?.words ?? [];
  const currentWord = words[cardIndex];
  // The grammar part drills its own authored questions, not the lesson's.
  const grammarPart = part?.kind === "grammar";
  const activeQuestions = (grammarPart ? lesson?.grammar?.questions : lesson?.questions) ?? [];
  const currentQuestion = activeQuestions[questionIndex];
  const currentRule = lesson?.grammar?.rules[ruleIndex];
  const currentReviewCard = reviewQueue[reviewIndex];

  const mergeLessons = useCallback((loaded: Lesson[]) => {
    setOpenLessons((items) => ({
      ...items,
      ...Object.fromEntries(loaded.map((item) => [item.id, item])),
    }));
  }, []);

  /** Pulls lessons into memory, hands them to the render, and returns them. */
  const openLessonsById = useCallback(
    async (ids: number[]) => {
      const wanted = ids.filter(Boolean);
      if (!wanted.length) return [];
      const loaded = await loadLessons(wanted);
      mergeLessons(loaded);
      return loaded;
    },
    [mergeLessons],
  );

  // Only lessons the learner has actually touched are in memory, so the review
  // queue is built from those rather than from the whole course.
  const reviewCatalog = useMemo(
    () => [
      ...Object.values(openLessons).flatMap(reviewCardsOf),
      ...Object.values(openPart2).flatMap(part2ReviewCardsOf),
      ...Object.values(openPart3).flatMap(part3ReviewCardsOf),
    ],
    [openLessons, openPart2, openPart3],
  );
  const dueCards = useMemo(() => {
    const today = localDate();
    return reviewCatalog.filter((card) => {
      const progressItem = cardProgress[card.id];
      return progressItem && progressItem.nextReview <= today;
    });
  }, [reviewCatalog, cardProgress]);
  const savedReadings = stored.readings;
  const savedExams = stored.exams;
  const examSession = stored.examSession;
  const examQuestion = exam?.questions[examOrder[examIndex]];
  const part2Scores = stored.part2Scores;
  const part2Sessions = stored.part2Sessions;
  const finalExam = examSummaries.find((item) => item.id === "final");
  const part2Ready = finalExam
    ? isExamPassed(visibleExamSummary(finalExam), savedExams[finalExam.id]?.best)
    : false;
  const unlockedPart2 = useMemo(
    () => unlockedPart2Ids(part2Summaries, stored, part2Ready),
    [stored, part2Ready],
  );
  const p2Words = part2?.words ?? [];
  const p2Tasks = useMemo(() => (part2 ? part2Questions(part2) : []), [part2]);
  const p2Word = p2Words[stepIndex];
  const p2Task = p2Tasks[stepIndex];
  const part3Scores = stored.part3Scores;
  const part3Sessions = stored.part3Sessions;
  // The third course waits for the second one whole, not for a paper: a
  // treatise is what the hundred and five lessons of stories were reading for.
  const part3Ready = isPart3Open(part2Summaries, part2Scores);
  const unlockedPart3 = useMemo(
    () => unlockedPart3Ids(part3Summaries, stored, part3Ready),
    [stored, part3Ready],
  );
  const p3Words = part3?.words ?? [];
  const p3Tasks = useMemo(() => (part3 ? part3Questions(part3) : []), [part3]);
  const p3Word = p3Words[stepIndex];
  const p3Task = p3Tasks[stepIndex];
  // The texts are read on their own schedule, so today's reading is counted
  // apart from the cards and shown as its own line on the home screen.
  const dueReadings = useMemo(
    () => visibleDueReadings(dueReadingIds(savedReadings, localDate())),
    [savedReadings],
  );
  const learnedCards = useMemo(
    () => Object.values(cardProgress).filter((item) => item.box > 0).length,
    [cardProgress],
  );
  const wordProgress = useMemo(() => {
    const wordIds = [...new Set(Object.keys(cardProgress).map((id) => id.replace(/-(ar-ru|ru-ar)$/, "")))];
    const mastered = wordIds.filter((id) =>
      cardProgress[`${id}-ar-ru`]?.box === REVIEW_INTERVALS.length - 1 &&
      cardProgress[`${id}-ru-ar`]?.box === REVIEW_INTERVALS.length - 1,
    ).length;
    return { encountered: wordIds.length, mastered };
  }, [cardProgress]);
  const studyStreaks = useMemo(() => streaks(learningStats.activeDates), [learningStats.activeDates]);
  const achievements = useMemo(() => [
    ...WORD_ACHIEVEMENTS.map((target) => ({
      id: `words-${target}`,
      label: `${target} слов`,
      unlocked: wordProgress.mastered >= target,
      progress: Math.min(wordProgress.mastered / target, 1),
    })),
    ...DAY_ACHIEVEMENTS.map((target) => ({
      id: `days-${target}`,
      label: `${target} дней`,
      unlocked: learningStats.activeDates.length >= target,
      progress: Math.min(learningStats.activeDates.length / target, 1),
    })),
  ], [learningStats.activeDates.length, wordProgress.mastered]);
  const unlockedLessons = useMemo(() => unlockedLessonIds(lessonSummaries, stored), [stored]);
  // Repeats of finished lessons resume from their own card, not from the hero
  // prompt, which is there to carry the learner forward through the course.
  const latestSession = useMemo(
    () => Object.values(savedSessions)
      .filter((session) => savedScores[session.lessonId] === undefined)
      .sort((a, b) => (b.updatedAt ?? b.lessonId) - (a.updatedAt ?? a.lessonId))[0],
    [savedSessions, savedScores],
  );
  // The course order is the manifest order, which need not be a run of 1..N.
  const nextLesson = lessonSummaries[lessonSummaries.findIndex((item) => item.id === lessonId) + 1];
  const latestSessionLesson = latestSession ? openLessons[latestSession.lessonId] : undefined;
  const latestSessionSummary = latestSession
    ? lessonSummaries.find((item) => item.id === latestSession.lessonId)
    : undefined;
  const recommendedLesson = latestSessionSummary ??
    lessonSummaries.find((item) => savedScores[item.id] === undefined) ??
    lessonSummaries.at(-1);
  const latestSessionPosition = latestSession && latestSessionLesson
    ? latestSession.view === "practice"
      ? `Упражнение ${latestSession.questionIndex + 1} из ${latestSessionLesson.questions.length}`
      : `${latestSessionLesson.decks[latestSession.deckIndex]?.title ?? "Новые слова"} · круг ${latestSession.round} · карточка ${latestSession.cardIndex + 1}`
    : "";
  const latestSessionProgress = latestSession && latestSessionLesson
    ? latestSession.view === "practice"
      ? 70 + ((latestSession.questionIndex + 1) / latestSessionLesson.questions.length) * 30
      : cardPhaseProgress(
          latestSessionLesson.decks,
          latestSession.deckIndex,
          latestSession.round,
          latestSession.cardIndex,
          1,
        ) * 70
    : 0;

  async function restoreSession(session: SavedSession) {
    const [restored] = await openLessonsById([session.lessonId]);
    setLessonId(session.lessonId);
    // The lesson may have grown since the session was parked, which splits it
    // in two and moves the part boundaries. Resume where the position actually
    // sits now, not where it sat then.
    setPartIndex(
      restored
        ? partIndexFor(lessonParts(restored), session, session.partIndex ?? 0)
        : session.partIndex ?? 0,
    );
    setRuleIndex(session.ruleIndex ?? 0);
    setDeckIndex(session.deckIndex);
    setRound(session.round);
    setCardIndex(session.cardIndex);
    setQuestionIndex(session.questionIndex);
    setScore(session.score);
    setGrammarScore(session.grammarScore ?? 0);
    setMistakes(session.mistakes);
    setSelected(null);
    setRevealed(false);
    setView(session.view);
  }

  // Connects the progress store to Supabase when a project is configured, and
  // does nothing otherwise. A pull after sign-in can add lessons to load, so
  // this runs before the loader below.
  useEffect(startSync, []);

  // Only what the home screen actually needs: the lesson the learner stopped
  // in, and the lessons their review cards belong to. Signing in can pull a
  // history from another device, so this is derived from the store rather than
  // read once on mount.
  const wantedLessonIds = useMemo(() => {
    const resume = Object.values(savedSessions).sort(
      (a, b) => (b.updatedAt ?? b.lessonId) - (a.updatedAt ?? a.lessonId),
    )[0];
    return [...new Set([...lessonIdsInProgress(cardProgress), ...(resume ? [resume.lessonId] : [])])]
      .sort((a, b) => a - b)
      .join(",");
  }, [cardProgress, savedSessions]);

  // The daily queue holds words from both courses, so the second course's
  // lessons are pulled in by exactly the same rule as the first one's.
  const wantedPart2Ids = useMemo(() => {
    const resume = Object.values(part2Sessions).sort(
      (a, b) => (b.updatedAt ?? b.lessonId) - (a.updatedAt ?? a.lessonId),
    )[0];
    return [...new Set([...part2LessonIdsInCards(cardProgress), ...(resume ? [resume.lessonId] : [])])]
      .sort((a, b) => a - b)
      .join(",");
  }, [cardProgress, part2Sessions]);

  const wantedPart3Ids = useMemo(() => {
    const resume = Object.values(part3Sessions).sort(
      (a, b) => (b.updatedAt ?? b.lessonId) - (a.updatedAt ?? a.lessonId),
    )[0];
    return [...new Set([...part3LessonIdsInCards(cardProgress), ...(resume ? [resume.lessonId] : [])])]
      .sort((a, b) => a - b)
      .join(",");
  }, [cardProgress, part3Sessions]);

  useEffect(() => {
    if (!wantedPart2Ids) return;

    let cancelled = false;
    loadPart2Lessons(wantedPart2Ids.split(",").map(Number)).then((loaded) => {
      if (cancelled) return;
      setOpenPart2((items) => ({ ...items, ...Object.fromEntries(loaded.map((item) => [item.id, item])) }));
    });
    return () => {
      cancelled = true;
    };
  }, [wantedPart2Ids]);

  useEffect(() => {
    if (!wantedPart3Ids) return;

    let cancelled = false;
    loadPart3Lessons(wantedPart3Ids.split(",").map(Number)).then((loaded) => {
      if (cancelled) return;
      setOpenPart3((items) => ({ ...items, ...Object.fromEntries(loaded.map((item) => [item.id, item])) }));
    });
    return () => {
      cancelled = true;
    };
  }, [wantedPart3Ids]);

  useEffect(() => {
    if (!wantedLessonIds) return;

    let cancelled = false;
    loadLessons(wantedLessonIds.split(",").map(Number)).then((loaded) => {
      if (!cancelled) mergeLessons(loaded);
    });
    return () => {
      cancelled = true;
    };
  }, [wantedLessonIds, mergeLessons]);

  useEffect(() => {
    if (view !== "learn" && view !== "practice" && view !== "grammar") return;
    progressStore.saveSession({
      view,
      lessonId,
      partIndex,
      ruleIndex,
      deckIndex,
      round,
      cardIndex,
      questionIndex,
      score,
      grammarScore,
      mistakes,
      updatedAt: Date.now(),
    });
  }, [view, lessonId, partIndex, ruleIndex, deckIndex, round, cardIndex, questionIndex, score, grammarScore, mistakes]);

  useEffect(() => {
    if (!["learn", "practice", "grammar", "reading", "review", "exam", "p2-learn", "p2-practice", "p2-reading", "p3-learn", "p3-practice", "p3-reading"].includes(view)) return;
    const recordActivity = (seconds: number) => {
      if (document.visibilityState !== "visible") return;
      progressStore.updateStats((items) => ({
        ...items,
        activeDates: items.activeDates.includes(localDate())
          ? items.activeDates
          : [...items.activeDates, localDate()],
        totalSeconds: items.totalSeconds + seconds,
      }));
    };
    recordActivity(0);
    const timer = window.setInterval(() => recordActivity(10), 10000);
    return () => window.clearInterval(timer);
  }, [view]);

  const grammarRules = lesson?.grammar?.rules ?? [];
  const progress = view === "p2-learn"
    ? (stepIndex / Math.max(p2Words.length, 1)) * 100
    : view === "p2-practice"
    ? ((stepIndex + (selected ? 1 : 0)) / Math.max(p2Tasks.length, 1)) * 100
    : view === "p3-learn"
    ? (stepIndex / Math.max(p3Words.length, 1)) * 100
    : view === "p3-practice"
    ? ((stepIndex + (selected ? 1 : 0)) / Math.max(p3Tasks.length, 1)) * 100
    : view === "exam"
    ? (examIndex / Math.max(examOrder.length, 1)) * 100
    : !lesson || !part
    ? 0
    : grammarPart
      // Reading the rules and drilling them are one run through the block.
      ? ((view === "grammar" ? ruleIndex : grammarRules.length + questionIndex + (selected ? 1 : 0)) /
          (grammarRules.length + part.questionEnd)) * 100
      : view === "practice"
      ? ((questionIndex - part.questionStart + (selected ? 1 : 0)) /
          (part.questionEnd - part.questionStart)) * 100
      : cardPhaseProgress(
          lesson.decks.slice(part.deckStart, part.deckEnd),
          deckIndex - part.deckStart,
          round,
          cardIndex,
          revealed ? 1 : 0,
        ) * 100;

  // Re-shuffles whenever the question changes, which is the only thing it reads.
  const options = useMemo(() => shuffle(currentQuestion?.options ?? []), [currentQuestion]);
  const examOptions = useMemo(() => shuffle(examQuestion?.options ?? []), [examQuestion]);
  const p2Options = useMemo(() => shuffle(p2Task?.options ?? []), [p2Task]);
  const p3Options = useMemo(() => shuffle(p3Task?.options ?? []), [p3Task]);

  async function startLesson(id: number) {
    if (!unlockedLessons.has(id)) return;
    const storedSession = savedSessions[id];
    if (storedSession && (GRAMMAR_ENABLED || storedSession.view !== "grammar")) {
      restoreSession(storedSession);
      return;
    }
    await openLessonsById([id]);
    setLessonId(id);
    setPartIndex(0);
    setRuleIndex(0);
    setDeckIndex(0);
    setRound(1);
    setCardIndex(0);
    setQuestionIndex(0);
    setScore(0);
    setGrammarScore(0);
    setMistakes([]);
    setSelected(null);
    setRevealed(false);
    setView("learn");
  }

  /**
   * Opens the grammar block on its own. The words and the questions are behind
   * the learner — a lesson only offers this once its own result is stored — so
   * the block starts at the rules. A session left inside the block resumes
   * where it stopped; one left anywhere else is from an abandoned repeat of the
   * cards and must not drag the learner back through them.
   */
  async function startGrammar(id: number) {
    if (!unlockedLessons.has(id)) return;
    const [loaded] = await loadLessons([id]);
    if (!loaded?.grammar) return;
    mergeLessons([loaded]);
    const loadedParts = lessonParts(loaded);
    const parked = savedSessions[id];
    if (parked && loadedParts[parked.partIndex ?? 0]?.kind === "grammar") {
      restoreSession(parked);
      return;
    }
    setLessonId(id);
    setPartIndex(loadedParts.length - 1);
    setRuleIndex(0);
    setQuestionIndex(0);
    setGrammarScore(0);
    setMistakes([]);
    setSelected(null);
    setRevealed(false);
    setView("grammar");
  }

  function rateLearningCard(remembered: boolean) {
    if (!lesson) return;
    const forwardId = wordCardId(lesson.id, deckIndex, cardIndex, "ar-ru");
    const reverseId = wordCardId(lesson.id, deckIndex, cardIndex, "ru-ar");
    progressStore.updateCards((items) => ({
      ...items,
      [forwardId]: nextCardProgress(items[forwardId], remembered),
      [reverseId]: items[reverseId] ?? {
        box: 0,
        nextReview: localDate(),
        lastReviewed: "",
        correct: 0,
        wrong: 0,
      },
    }));
    nextCard();
  }

  /**
   * Opens the text a lesson carries. Nothing is scored here: the learner reads,
   * taps a sentence when it does not come together, and says when they are
   * through — that is what puts the text on the repeat schedule.
   */
  async function startReading(id: number) {
    const summary = readingByLesson.get(id);
    if (!summary || !unlockedLessons.has(id)) return;
    setReading(await loadReading(id, summary.id));
    setLessonId(id);
    setOpenLines([]);
    setView("reading");
  }

  function finishReading() {
    if (!reading) return;
    progressStore.updateReadings((items) => ({
      ...items,
      [reading.lessonId]: nextReadingProgress(items[reading.lessonId]),
    }));
    setView("home");
    setBackupMessage("Текст прочитан — вернётся на повторение.");
  }

  /**
   * Opens a lesson of the second course. It runs in three passes — the new
   * words, one question on each, then the text they were taken from — and the
   * position is remembered after every step.
   */
  async function startPart2(id: number, from: "start" | "resume" = "resume") {
    if (!unlockedPart2.has(id)) return;
    const lesson = await loadPart2Lesson(id);
    setOpenPart2((items) => ({ ...items, [id]: lesson }));
    setPart2(lesson);
    setSelected(null);
    setRevealed(false);
    setStepOpen([]);

    const parked = from === "resume" ? part2Sessions[id] : undefined;
    setStepIndex(parked?.index ?? 0);
    setStepScore(parked?.score ?? 0);
    setStepMistakes(parked?.mistakes ?? []);
    setView(parked ? `p2-${parked.view}` as "p2-learn" | "p2-practice" | "p2-reading" : "p2-learn");
  }

  function savePart2(view: "learn" | "practice" | "reading", index: number, score = stepScore, mistakes = stepMistakes) {
    if (!part2) return;
    progressStore.savePart2Session({ lessonId: part2.id, view, index, score, mistakes });
  }

  /** A word of the second course enters the same boxes the first course uses. */
  function ratePart2Card(remembered: boolean) {
    if (!part2) return;
    const forward = part2CardId(part2.id, stepIndex, "ar-ru");
    const reverse = part2CardId(part2.id, stepIndex, "ru-ar");
    progressStore.updateCards((items) => ({
      ...items,
      [forward]: nextCardProgress(items[forward], remembered),
      [reverse]: items[reverse] ?? {
        box: 0,
        nextReview: localDate(),
        lastReviewed: "",
        correct: 0,
        wrong: 0,
      },
    }));

    setRevealed(false);
    if (stepIndex < p2Words.length - 1) {
      setStepIndex(stepIndex + 1);
      savePart2("learn", stepIndex + 1);
      return;
    }
    setStepIndex(0);
    savePart2("practice", 0);
    setView("p2-practice");
  }

  function answerPart2(option: string) {
    if (!p2Task || selected) return;
    setSelected(option);
    if (option === p2Task.answer) setStepScore((value) => value + 1);
    else setStepMistakes((items) => [...items, p2Task.prompt]);
  }

  function nextPart2Task() {
    if (!p2Task) return;
    const right = selected === p2Task.answer;
    const score = stepScore;
    const mistakes = stepMistakes;
    setSelected(null);

    if (stepIndex < p2Tasks.length - 1) {
      setStepIndex(stepIndex + 1);
      savePart2("practice", stepIndex + 1, score, mistakes);
      return;
    }
    setStepOpen([]);
    savePart2("reading", 0, score, mistakes);
    setView("p2-reading");
    void right;
  }

  /** The text is the point of the lesson, so finishing it finishes the lesson. */
  function finishPart2() {
    if (!part2) return;
    progressStore.finishPart2Lesson(part2.id, stepScore);
    setView("p2-result");
  }

  /**
   * Opens a lesson of the third course. It runs the same three passes as the
   * second — the new words, one question on each, then the text — and the
   * position is remembered after every step. What differs is the middle one:
   * this book's glossary has no example sentences, so the question asks the
   * word's meaning rather than hiding it inside a phrase.
   */
  async function startPart3(id: number, from: "start" | "resume" = "resume") {
    if (!unlockedPart3.has(id)) return;
    const lesson = await loadPart3Lesson(id);
    setOpenPart3((items) => ({ ...items, [id]: lesson }));
    setPart3(lesson);
    setSelected(null);
    setRevealed(false);
    setStepOpen([]);

    const parked = from === "resume" ? part3Sessions[id] : undefined;
    setStepIndex(parked?.index ?? 0);
    setStepScore(parked?.score ?? 0);
    setStepMistakes(parked?.mistakes ?? []);
    setView(parked ? `p3-${parked.view}` as "p3-learn" | "p3-practice" | "p3-reading" : "p3-learn");
  }

  function savePart3(view: "learn" | "practice" | "reading", index: number, score = stepScore, mistakes = stepMistakes) {
    if (!part3) return;
    progressStore.savePart3Session({ lessonId: part3.id, view, index, score, mistakes });
  }

  /** A word of the third course enters the same boxes the first two courses use. */
  function ratePart3Card(remembered: boolean) {
    if (!part3) return;
    const forward = part3CardId(part3.id, stepIndex, "ar-ru");
    const reverse = part3CardId(part3.id, stepIndex, "ru-ar");
    progressStore.updateCards((items) => ({
      ...items,
      [forward]: nextCardProgress(items[forward], remembered),
      [reverse]: items[reverse] ?? {
        box: 0,
        nextReview: localDate(),
        lastReviewed: "",
        correct: 0,
        wrong: 0,
      },
    }));

    setRevealed(false);
    if (stepIndex < p3Words.length - 1) {
      setStepIndex(stepIndex + 1);
      savePart3("learn", stepIndex + 1);
      return;
    }
    setStepIndex(0);
    savePart3("practice", 0);
    setView("p3-practice");
  }

  function answerPart3(option: string) {
    if (!p3Task || selected) return;
    setSelected(option);
    if (option === p3Task.answer) setStepScore((value) => value + 1);
    else setStepMistakes((items) => [...items, p3Task.prompt]);
  }

  function nextPart3Task() {
    if (!p3Task) return;
    const score = stepScore;
    const mistakes = stepMistakes;
    setSelected(null);

    if (stepIndex < p3Tasks.length - 1) {
      setStepIndex(stepIndex + 1);
      savePart3("practice", stepIndex + 1, score, mistakes);
      return;
    }
    setStepOpen([]);
    savePart3("reading", 0, score, mistakes);
    setView("p3-reading");
  }

  /** The text is the point of the lesson here too, so reading it finishes it. */
  function finishPart3() {
    if (!part3) return;
    progressStore.finishPart3Lesson(part3.id, stepScore);
    setView("p3-result");
  }

  /**
   * Опens the paper. An exam is a checkpoint, not a gate: it may be written
   * again, and a weaker attempt never lowers what is already stored.
   */
  async function startExam(id: Exam["id"]) {
    const summary = examSummaries.find((item) => item.id === id);
    if (!summary || !examReadiness(summary, lessonSummaries, stored).open) return;
    const loaded = await loadExam(id);
    const paper = { ...loaded, questions: visibleExamQuestions(loaded) };
    // A paper parked before the shape changed indexes questions that are no
    // longer served, so it is started again rather than resumed into nothing.
    const saved = examSession?.examId === id ? examSession : null;
    const parked = saved && saved.order.length === paper.questions.length ? saved : null;
    setExam(paper);
    setExamOrder(parked?.order ?? shuffle(paper.questions.map((_, index) => index)));
    setExamIndex(parked?.index ?? 0);
    setExamScore(parked?.score ?? 0);
    setExamMistakes(parked?.mistakes ?? []);
    setSelected(null);
    setView("exam");
  }

  /**
   * An exam does not teach while it is being written: the answer is taken and
   * the next question comes up. What was missed is shown at the end.
   */
  function answerExam(option: string) {
    if (!exam || !examQuestion) return;
    const right = option === examQuestion.answer;
    const score = examScore + (right ? 1 : 0);
    const mistakes = right ? examMistakes : [...examMistakes, examQuestion.prompt];
    const next = examIndex + 1;
    setExamScore(score);
    setExamMistakes(mistakes);

    if (next < examOrder.length) {
      setExamIndex(next);
      progressStore.saveExamSession({ examId: exam.id, order: examOrder, index: next, score, mistakes });
      return;
    }

    progressStore.finishExam(exam.id, score, score >= examPassMark(exam.questions.length));
    setExamIndex(next);
    setView("exam-result");
  }

  function startDailyReview() {
    if (!dueCards.length) {
      setBackupMessage("На сегодня всё повторено.");
      return;
    }
    setReviewQueue(shuffle(dueCards));
    setReviewIndex(0);
    setReviewRevealed(false);
    setView("review");
  }

  function rateReviewCard(remembered: boolean) {
    if (!currentReviewCard) return;
    progressStore.updateCards((items) => ({
      ...items,
      [currentReviewCard.id]: nextCardProgress(items[currentReviewCard.id], remembered),
    }));
    if (!remembered) {
      setReviewQueue((items) => [...items, currentReviewCard]);
    }
    if (reviewIndex < reviewQueue.length - 1 || !remembered) {
      setReviewIndex((value) => value + 1);
      setReviewRevealed(false);
    } else {
      setView("home");
      setBackupMessage("Повторение на сегодня завершено.");
    }
  }

  function masterReviewCard() {
    if (!currentReviewCard) return;
    const ids = bothDirections(currentReviewCard.id);
    progressStore.updateCards((items) => ({
      ...items,
      ...Object.fromEntries(ids.map((id) => [id, masteredCardProgress(items[id])])),
    }));
    // The reverse direction is retired too, so it must not be left waiting
    // further down today's queue.
    const queue = reviewQueue.filter((card, index) => index <= reviewIndex || !ids.includes(card.id));
    setReviewQueue(queue);
    if (reviewIndex < queue.length - 1) {
      setReviewIndex((value) => value + 1);
      setReviewRevealed(false);
    } else {
      setView("home");
      setBackupMessage("Повторение на сегодня завершено.");
    }
  }

  function exportProgress() {
    const payload = {
      format: "shifahiya-progress",
      version: 1,
      exportedAt: new Date().toISOString(),
      scores: savedScores,
      scoreTotals: savedScoreTotals,
      grammarScores: savedGrammarScores,
      sessions: savedSessions,
      cards: cardProgress,
      readings: savedReadings,
      exams: savedExams,
      part2Scores,
      part2Sessions,
      part3Scores,
      part3Sessions,
      stats: learningStats,
    };
    const url = URL.createObjectURL(new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = `shifahiya-progress-${localDate()}.json`;
    link.click();
    URL.revokeObjectURL(url);
    setBackupMessage("Резервная копия сохранена.");
  }

  async function importProgress(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    try {
      const payload = JSON.parse(await file.text());
      if (payload.format !== "shifahiya-progress" || payload.version !== 1) throw new Error("Invalid backup");
      const scores = payload.scores ?? {};
      // Backups written before the totals were kept simply have none of them,
      // and the card then shows the result without a denominator.
      const scoreTotals = payload.scoreTotals ?? {};
      // Backups written before the grammar block simply have none of it.
      const grammarScores = payload.grammarScores ?? {};
      const sessions = payload.sessions ?? {};
      const cards = payload.cards ?? {};
      // Backups written before the reading texts simply have none of them.
      const readings = payload.readings ?? {};
      const stats = { ...EMPTY_STATS, ...(payload.stats ?? {}) };
      progressStore.replaceAll({
        scores,
        scoreTotals,
        grammarScores,
        sessions,
        cards,
        readings,
        exams: payload.exams ?? {},
        examSession: payload.examSession ?? null,
        part2Scores: payload.part2Scores ?? {},
        part2Sessions: payload.part2Sessions ?? {},
        // Backups written before the third course simply have none of it.
        part3Scores: payload.part3Scores ?? {},
        part3Sessions: payload.part3Sessions ?? {},
        stats,
      });
      setBackupMessage("Прогресс восстановлен.");
    } catch {
      setBackupMessage("Не удалось прочитать файл прогресса.");
    }
  }

  function nextCard() {
    if (!lesson || !part) return;
    if (cardIndex < words.length - 1) {
      setCardIndex((value) => value + 1);
    } else if (round === 1) {
      setRound(2);
      setCardIndex(0);
    } else if (deckIndex < part.deckEnd - 1) {
      setDeckIndex((value) => value + 1);
      setRound(1);
      setCardIndex(0);
    } else {
      setQuestionIndex(part.questionStart);
      setSelected(null);
      setView("practice");
    }
    setRevealed(false);
  }

  function answer(option: string) {
    if (selected || !lesson || !currentQuestion) return;
    setSelected(option);
    if (option === currentQuestion.answer) {
      if (grammarPart) {
        setGrammarScore((value) => value + 1);
        return;
      }
      setScore((value) => value + 1);
      const isPhrase = currentQuestion.prompt.trim().split(/\s+/).length > 1 ||
        currentQuestion.answer.trim().split(/\s+/).length > 1;
      if (isPhrase) {
        const phraseId = `lesson-${lesson.id}-question-${questionIndex}`;
        progressStore.updateStats((items) => ({
          ...items,
          masteredPhrases: items.masteredPhrases.includes(phraseId)
            ? items.masteredPhrases
            : [...items.masteredPhrases, phraseId],
        }));
      }
    } else setMistakes((items) => [...items, currentQuestion.prompt]);
  }

  function nextQuestion() {
    if (!lesson || !part) return;
    if (questionIndex < part.questionEnd - 1) {
      setQuestionIndex((value) => value + 1);
      setSelected(null);
      return;
    }

    if (part.kind === "grammar") {
      progressStore.finishGrammar(lesson.id, grammarScore);
      setView("result");
      return;
    }

    const following = parts[partIndex + 1];
    // The lesson itself is done once the last cards part is answered. A grammar
    // block after it is a part of the same lesson but keeps its own result, so
    // adding one to a finished lesson never rewrites what was earned.
    if (!following || following.kind === "grammar") {
      progressStore.finishLesson(lesson.id, score, lesson.questions.length);
    }
    if (following) {
      // Leaving from the result screen must not lose the part just finished, so
      // the next part is parked as a resumable session right away.
      progressStore.saveSession({
        view: following.kind === "grammar" ? "grammar" : "learn",
        lessonId: lesson.id,
        partIndex: following.index,
        ruleIndex: 0,
        deckIndex: following.deckStart,
        round: 1,
        cardIndex: 0,
        questionIndex: following.questionStart,
        score,
        grammarScore: 0,
        mistakes: following.kind === "grammar" ? [] : mistakes,
        updatedAt: Date.now(),
      });
    }
    setView("result");
  }

  function startPart(index: number) {
    const following = parts[index];
    if (!following) return;
    setPartIndex(index);
    setSelected(null);
    setRevealed(false);
    if (following.kind === "grammar") {
      setRuleIndex(0);
      setQuestionIndex(0);
      setGrammarScore(0);
      setMistakes([]);
      setView("grammar");
      return;
    }
    setDeckIndex(following.deckStart);
    setRound(1);
    setCardIndex(0);
    setQuestionIndex(following.questionStart);
    setView("learn");
  }

  /** Walks the rules, then hands over to the questions that drill them. */
  function nextRule() {
    if (ruleIndex < grammarRules.length - 1) {
      setRuleIndex((value) => value + 1);
      return;
    }
    setQuestionIndex(0);
    setSelected(null);
    setView("practice");
  }

  function resetLesson() {
    if (!lesson) return;
    progressStore.resetLesson(lesson.id);
    setView("home");
  }

  return (
    <main className="app-shell">
      <header className="topbar">
        <button className="brand" onClick={() => setView("home")} aria-label="На главную">
          <span className="brand-mark">ش</span>
          <span><strong>Аш-Шифахия</strong><small>арабский шаг за шагом</small></span>
        </button>
        <div className="streak" title="Текущая серия занятий"><span>✦</span> {studyStreaks.current} дн.</div>
      </header>

      {!["home", "result", "exam-result", "p2-result", "p3-result"].includes(view) && (
        <div className="lesson-progress" aria-label="Прогресс урока">
          <button className="close" onClick={() => setView("home")} aria-label="Закрыть урок">×</button>
          {parts.length > 1 && view !== "review" && view !== "reading" && (
            <span className="part-badge">
              {grammarPart ? "Грамматика" : `Часть ${partIndex + 1} из ${parts.length}`}
            </span>
          )}
          {view === "reading" && <span className="part-badge">Чтение</span>}
          {view === "exam" && <span className="part-badge">Экзамен</span>}
          {(view.startsWith("p2-") || view.startsWith("p3-")) && (
            <span className="part-badge">
              {view.endsWith("-learn") ? "Слова" : view.endsWith("-practice") ? "Задания" : "Чтение"}
            </span>
          )}
          {view !== "reading" && view !== "p2-reading" && view !== "p3-reading" && (
          <div className="track"><span style={{ width: `${Math.min(progress, 100)}%` }} /></div>
          )}
          <span className="counter">
            {view === "p2-reading"
              ? `${plural(part2?.stories.length ?? 0, "рассказ", "рассказа", "рассказов")}`
              : view === "p3-reading"
                ? `${plural(part3?.fragments.length ?? 0, "фрагмент", "фрагмента", "фрагментов")}`
              : view === "p2-learn"
                ? `${stepIndex + 1}/${p2Words.length}`
                : view === "p2-practice"
                  ? `${stepIndex + 1}/${p2Tasks.length}`
                  : view === "p3-learn"
                    ? `${stepIndex + 1}/${p3Words.length}`
                    : view === "p3-practice"
                      ? `${stepIndex + 1}/${p3Tasks.length}`
                  : view === "exam"
              ? `${Math.min(examIndex + 1, examOrder.length)}/${examOrder.length}`
              : view === "reading"
              ? `${plural(reading?.texts.length ?? 0, "текст", "текста", "текстов")}`
              : view === "learn"
              ? `${cardIndex + 1}/${words.length}`
              : view === "grammar"
                ? `Правило ${ruleIndex + 1}/${grammarRules.length}`
                : view === "review"
                  ? `${Math.min(reviewIndex + 1, reviewQueue.length)}/${reviewQueue.length}`
                  : `${questionIndex - (part?.questionStart ?? 0) + 1}/${(part?.questionEnd ?? 0) - (part?.questionStart ?? 0)}`}
          </span>
        </div>
      )}

      {view === "home" && (
        <section className="home-view">
          <h1>Учимся через<br /><em>повторение и практику</em></h1>
          <p className="lead">Каждая форма встречается дважды в карточках, затем возвращается в переводах и предложениях. Второй урок продолжает первый и вводит женский род.</p>

          <div className="daily-review">
            <div>
              <span className="daily-icon">◷</span>
              <div>
                <strong>{dueCards.length ? `${plural(dueCards.length, "карточка", "карточки", "карточек")} на сегодня` : "Всё повторено на сегодня"}</strong>
                <small>{dueCards.length ? `Около ${Math.max(1, Math.ceil(dueCards.length / 4))} мин · трудные формы вернутся в очередь` : `${plural(learnedCards, "направление", "направления", "направлений")} уже в памяти`}</small>
              </div>
            </div>
            <button className="primary" onClick={startDailyReview} disabled={!dueCards.length}>
              {dueCards.length ? "Повторить сейчас" : "Готово ✓"}
            </button>
          </div>

          {/* A separate habit, kept on its own screen: watching a podcast is
              not a lesson, and it must not compete with the review queue.
              A plain link rather than next/link — the deployed site is static
              files under a subdirectory, and the static build rewrites this
              href to a relative one. */}
          <a className="podcast-link" href="/podcasts/">
            <span className="daily-icon">▶</span>
            <div>
              <strong>Подкаст дня</strong>
              <small>Один выпуск на арабском в день — своя серия и свой календарь</small>
            </div>
            <span>→</span>
          </a>

          {dueReadings.length > 0 && (
            <div className="daily-review reading-due">
              <div>
                <span className="daily-icon">◫</span>
                <div>
                  <strong>{plural(dueReadings.length, "текст", "текста", "текстов")} на повторное чтение</strong>
                  <small>{READING_SOURCE} · перевод открывается по нажатию</small>
                </div>
              </div>
              <button className="primary" onClick={() => startReading(dueReadings[0])}>
                Читать <span>→</span>
              </button>
            </div>
          )}

          {recommendedLesson && (
            <button
              className="continue-learning"
              onClick={() => latestSession && latestSessionLesson
                ? restoreSession(latestSession)
                : startLesson(recommendedLesson.id)}
            >
              <span className="continue-mark">▶</span>
              <span className="continue-copy">
                <small>{latestSession ? "Продолжить обучение" : "Следующий шаг"}</small>
                <strong>Урок {recommendedLesson.id}. {recommendedLesson.title}</strong>
                <em>{latestSession ? latestSessionPosition : "Начните урок — прогресс будет сохранён автоматически"}</em>
                <i><b style={{ width: `${latestSession ? Math.min(latestSessionProgress, 100) : 0}%` }} /></i>
              </span>
              <span className="continue-action">{latestSession ? "Продолжить" : "Начать урок"} <b>→</b></span>
            </button>
          )}

          {/* Once signed in the panel has nothing left to say, so it goes away
              and the account lives in the quiet line under the lesson list. */}
          {sync.status !== "off" && !sync.email && (
            <div className="account-panel">
              <div className="account-copy">
                <strong>Занимаетесь с нескольких устройств?</strong>
                <span>Войдите через Google — пароль не нужен. Прогресс объединится с тем, что уже пройдено здесь, ничего не потеряется.</span>
              </div>
              <div className="account-actions">
                <button className="secondary google-button" onClick={() => void signInWithGoogle()} disabled={sync.status === "working"}>
                  <GoogleMark />
                  {sync.status === "working" ? "Открываем…" : "Войти через Google"}
                </button>
              </div>
              {sync.message && <small>{sync.message}</small>}
            </div>
          )}

          <section className="student-progress" aria-labelledby="student-progress-title">
            <div className="progress-heading">
              <div>
                <span className="eyebrow">Личный прогресс</span>
                <h2 id="student-progress-title">Ваш путь в цифрах</h2>
              </div>
              <small>Статистика обновляется во время занятий</small>
            </div>
            <div className="stats-grid">
              <div><strong>{learningStats.activeDates.length}</strong><span>дней занятий</span></div>
              <div><strong>{Object.keys(savedScores).length}</strong><span>уроков завершено</span></div>
              <div><strong>{formatStudyTime(learningStats.totalSeconds)}</strong><span>времени в учёбе</span></div>
              <div><strong>{wordProgress.encountered}</strong><span>новых слов пройдено</span></div>
              <div><strong>{wordProgress.mastered}</strong><span>слов выучено</span></div>
              <div><strong>{learningStats.masteredPhrases.length}</strong><span>фраз освоено</span></div>
              <div><strong>{studyStreaks.longest}</strong><span>рекорд без перерыва</span></div>
            </div>
            <div className="achievements">
              <div className="achievements-title">
                <strong>Достижения</strong>
                <span>{achievements.filter((item) => item.unlocked).length}/{achievements.length} открыто</span>
              </div>
              <div className="achievement-list">
                {achievements.map((item) => (
                  <div className={`achievement ${item.unlocked ? "unlocked" : ""}`} key={item.id} title={`${Math.round(item.progress * 100)}%`}>
                    <span>{item.unlocked ? "✓" : "◇"}</span>
                    <strong>{item.label}</strong>
                    <i><b style={{ width: `${item.progress * 100}%` }} /></i>
                  </div>
                ))}
              </div>
            </div>
          </section>

          <div className="backup-tools">
            <span>{sync.email ? `Прогресс синхронизируется · ${sync.email}` : "Прогресс хранится на этом устройстве"}</span>
            <div>
              <button className="text-button" onClick={exportProgress}>Сохранить копию</button>
              <button className="text-button" onClick={() => importInput.current?.click()}>Восстановить</button>
              <input ref={importInput} type="file" accept="application/json" onChange={importProgress} hidden />
              {sync.email && <button className="text-button" onClick={() => void signOut()}>Выйти</button>}
            </div>
            {(backupMessage || sync.message) && <small>{backupMessage || sync.message}</small>}
          </div>

          <div className="course-switch" role="tablist" aria-label="Части курса">
            <button
              role="tab"
              aria-selected={course === 1}
              className={course === 1 ? "is-active" : ""}
              onClick={() => setCourse(1)}
            >
              Часть 1 · Шифахия
            </button>
            <button
              role="tab"
              aria-selected={course === 2}
              className={course === 2 ? "is-active" : ""}
              onClick={() => setCourse(2)}
            >
              Часть 2 · Чтение {part2Ready ? "" : "🔒"}
            </button>
            <button
              role="tab"
              aria-selected={course === 3}
              className={course === 3 ? "is-active" : ""}
              onClick={() => setCourse(3)}
            >
              Часть 3 · Акыда {part3Ready ? "" : "🔒"}
            </button>
          </div>

          {course === 2 && (
            <div className="lesson-list">
              {!part2Ready && (
                <div className="part2-gate">
                  <strong>Вторая часть открывается по итоговому экзамену</strong>
                  <span>
                    Напишите итоговую работу первой части на проходной балл — и уроки второй части
                    станут доступны. Пересдавать можно сколько угодно раз.
                  </span>
                </div>
              )}
              {part2Summaries.flatMap((item, index) => {
                const score = part2Scores[item.id];
                const done = score !== undefined;
                const parked = part2Sessions[item.id];
                const locked = !unlockedPart2.has(item.id);
                // The course runs through one book after another, so the list
                // says where each one starts.
                const opensBook = part2Summaries[index - 1]?.book !== item.book;
                const shelf = part2Summaries.filter((other) => other.book === item.book);
                const card = (
                  <div className={`lesson-card ${done ? "is-done" : ""} ${locked ? "is-locked" : ""}`} key={`p2-${item.id}`}>
                    <div className="lesson-number">{String(item.id).padStart(2, "0")}</div>
                    <div className="lesson-copy">
                      {/* The book stands over the whole run of its lessons, so the card names only its own place. */}
                      <div className="lesson-label">Часть 2 · урок {item.id}</div>
                      <h2>{item.title}</h2>
                      <p>
                        {plural(item.wordCount, "новое слово", "новых слова", "новых слов")} ·{" "}
                        {plural(item.sentenceCount, "фраза", "фразы", "фраз")} для чтения
                      </p>
                      <div className="chips">{item.storyTitles.map((title) => <span key={title}>{title}</span>)}</div>
                    </div>
                    {locked ? (
                      <button className="locked" disabled>Закрыто <span>🔒</span></button>
                    ) : done ? (
                      <div className="lesson-actions">
                        <button className="done" disabled>Пройден <span>✓</span></button>
                        <button className="repeat" onClick={() => startPart2(item.id, "start")}>
                          Повторить <span>→</span>
                        </button>
                      </div>
                    ) : (
                      <button className="primary" onClick={() => startPart2(item.id)}>
                        {parked ? "Продолжить" : "Начать урок"} <span>→</span>
                      </button>
                    )}
                    {done && <div className="card-score">✓ {score}/{item.wordCount}</div>}
                  </div>
                );
                if (!opensBook) return [card];
                return [
                  <div className="book-divider" key={`book-${item.book}`}>
                    <strong>{item.book}</strong>
                    <span>
                      уроки {shelf[0].id}–{shelf[shelf.length - 1].id} ·{" "}
                      {plural(shelf.length, "урок", "урока", "уроков")}
                    </span>
                  </div>,
                  card,
                ];
              })}
            </div>
          )}

          {course === 3 && (
            <div className="lesson-list">
              <div className="book-divider">
                <strong>{PART3_BOOK}</strong>
                <span>
                  {PART3_AUTHOR} · {plural(part3Summaries.length, "урок", "урока", "уроков")}
                </span>
              </div>
              {!part3Ready && (
                <div className="part2-gate">
                  <strong>Третья часть открывается по второй</strong>
                  <span>
                    Пройдите все уроки второй части — и книга по акыде станет доступна.
                    Научный текст читают после того, как рассказы читаются свободно.
                  </span>
                </div>
              )}
              {part3Summaries.flatMap((item, index) => {
                const score = part3Scores[item.id];
                const done = score !== undefined;
                const parked = part3Sessions[item.id];
                const locked = !unlockedPart3.has(item.id);
                // Книга делится на бабы, и список говорит, где начинается каждый.
                const opensSection = part3Summaries[index - 1]?.section !== item.section;
                const chapter = part3Summaries.filter((other) => other.section === item.section);
                const card = (
                  <div className={`lesson-card ${done ? "is-done" : ""} ${locked ? "is-locked" : ""}`} key={`p3-${item.id}`}>
                    <div className="lesson-number">{String(item.id).padStart(2, "0")}</div>
                    <div className="lesson-copy">
                      <div className="lesson-label">Часть 3 · урок {item.id}</div>
                      <h2>{item.title}</h2>
                      <p className="lesson-arabic-title" lang="ar" dir="rtl">{item.arabicTitle}</p>
                      <p>
                        {plural(item.wordCount, "новое слово", "новых слова", "новых слов")} ·{" "}
                        {plural(item.fragmentCount, "фрагмент", "фрагмента", "фрагментов")} текста
                      </p>
                    </div>
                    {locked ? (
                      <button className="locked" disabled>Закрыто <span>🔒</span></button>
                    ) : done ? (
                      <div className="lesson-actions">
                        <button className="done" disabled>Пройден <span>✓</span></button>
                        <button className="repeat" onClick={() => startPart3(item.id, "start")}>
                          Повторить <span>→</span>
                        </button>
                      </div>
                    ) : (
                      <button className="primary" onClick={() => startPart3(item.id)}>
                        {parked ? "Продолжить" : "Начать урок"} <span>→</span>
                      </button>
                    )}
                    {done && <div className="card-score">✓ {score}/{item.wordCount}</div>}
                  </div>
                );
                if (!opensSection) return [card];
                return [
                  <div className="book-divider is-section" key={`section-${item.section}`}>
                    <strong>{item.section}</strong>
                    <span>
                      {chapter.length > 1
                        ? `уроки ${chapter[0].id}–${chapter[chapter.length - 1].id} · ${plural(chapter.length, "урок", "урока", "уроков")}`
                        : `урок ${chapter[0].id}`}
                    </span>
                  </div>,
                  card,
                ];
              })}
            </div>
          )}

          {course === 1 && (
          <div className="lesson-list">
            {lessonSummaries.flatMap((item, index) => {
              const saved = savedScores[item.id];
              const unfinished = savedSessions[item.id];
              const completed = isLessonComplete(item, stored);
              // The words are done but the grammar block still owes an answer.
              const grammarLeft = saved !== undefined && !completed;
              const locked = !unlockedLessons.has(item.id);
              const opensAfter = lessonSummaries[index - 1];
              const card = (
                <div className={`lesson-card ${completed ? "is-done" : ""} ${locked ? "is-locked" : ""}`} key={item.id}>
                  <div className="lesson-number">{String(item.id).padStart(2, "0")}</div>
                  <div className="lesson-copy">
                    <div className="lesson-label">Урок {item.id} · <span dir="rtl">{item.arabicTitle}</span></div>
                    <h2>{item.title}</h2>
                    <p>{item.description}{visiblePartCount(item) > 1 ? ` · в ${visiblePartCount(item)} части` : ""}</p>
                    <div className="chips">{item.tags.map((tag) => <span key={tag}>{tag}</span>)}</div>
                    {hasVisibleReading(item.id, readingByLesson) && !locked && (() => {
                      const read = savedReadings[item.id];
                      const due = read && read.nextReview <= localDate();
                      return (
                        <button className={`reading-link ${due ? "is-due" : ""}`} onClick={() => startReading(item.id)}>
                          ◫ Чтение
                          {read ? (due ? " · сегодня повтор" : ` · следующее чтение ${read.nextReview}`) : ""}
                        </button>
                      );
                    })()}
                  </div>
                  {locked ? (
                    <button className="locked" disabled title={`Откроется после урока ${opensAfter?.id}`}>
                      Закрыто <span>🔒</span>
                    </button>
                  ) : grammarLeft ? (
                    <button className="repeat" onClick={() => startGrammar(item.id)}>
                      Грамматика <span>→</span>
                    </button>
                  ) : completed ? (
                    <div className="lesson-actions">
                      <button className="done" disabled>Пройден <span>✓</span></button>
                      {/* A repeat resumes silently where it stopped, so the
                          label stays a repeat rather than turning into a
                          "continue" the learner never asked for. */}
                      <button className="repeat" onClick={() => startLesson(item.id)}>
                        Повторить <span>→</span>
                      </button>
                    </div>
                  ) : (
                    <button className="primary" onClick={() => startLesson(item.id)}>
                      {unfinished ? "Продолжить" : "Начать урок"} <span>→</span>
                    </button>
                  )}
                  {completed && (
                    <div className="card-score">
                      {/* A result earned before the lesson grew is shown on its
                          own: printing it over today's larger total would read
                          as a loss the learner never suffered. */}
                      ✓ {saved}{savedScoreTotals[item.id] === undefined ? " верных" : `/${savedScoreTotals[item.id]}`}
                      {GRAMMAR_ENABLED && item.grammarQuestionCount > 0 &&
                        ` · грамматика ${savedGrammarScores[item.id]}/${item.grammarQuestionCount}`}
                    </div>
                  )}
                  {grammarLeft && (
                    <div className="card-lock">
                      {savedGrammarScores[item.id] === undefined
                        ? "Осталась грамматика"
                        : `Грамматика ${savedGrammarScores[item.id]}/${item.grammarQuestionCount} · нужно ${grammarPassMark(item.grammarQuestionCount)}`}
                    </div>
                  )}
                  {locked && opensAfter && <div className="card-lock">Сначала урок {opensAfter.id}</div>}
                </div>
              );

              const declared = examSummaries.find((summary) => summary.afterLesson === item.id);
              if (!declared) return [card];
              // While grammar is hidden the paper is shorter, and its pass mark
              // moves with it.
              const paper = visibleExamSummary(declared);

              const ready = examReadiness(paper, lessonSummaries, stored);
              const result = savedExams[paper.id];
              const passed = isExamPassed(paper, result?.best);
              // A paper parked before grammar was hidden no longer fits the
              // shorter one, so the card must not promise to continue it.
              const written = examSession?.examId === paper.id ? examSession : null;
              const parked = written && written.order.length === paper.questionCount ? written : null;
              return [
                card,
                <div
                  className={`lesson-card exam-card ${passed ? "is-done" : ""} ${ready.open ? "" : "is-locked"}`}
                  key={`exam-${paper.id}`}
                >
                  <div className="lesson-number">✦</div>
                  <div className="lesson-copy">
                    <div className="lesson-label">Экзамен · после урока {paper.afterLesson}</div>
                    <h2>{paper.title}</h2>
                    <p>
                      {plural(paper.questionCount, "вопрос", "вопроса", "вопросов")}
                      {paper.grammarCount > 0 ? ` · грамматики ${paper.grammarCount}` : ""} · проходной
                      балл {examPassMark(paper.questionCount)}
                    </p>
                    <div className="chips">
                      <span>Лексика</span>
                      {paper.grammarCount > 0 && <span>Грамматика</span>}
                    </div>
                  </div>
                  {ready.open ? (
                    <button className={passed ? "repeat" : "primary"} onClick={() => startExam(paper.id)}>
                      {parked ? "Продолжить" : passed || result ? "Пересдать" : "Начать"} <span>→</span>
                    </button>
                  ) : (
                    <button className="locked" disabled>Закрыто <span>🔒</span></button>
                  )}
                  {result && (
                    <div className="card-score">
                      {passed ? "✓" : "•"} {result.best}/{paper.questionCount}
                    </div>
                  )}
                  {!ready.open && (
                    <div className="card-lock">Пройдено {ready.done} из {ready.total} уроков</div>
                  )}
                </div>,
              ];
            })}
          </div>

          )}

          <div className="principle">
            <span className="quote">“</span>
            <p>Увидели слово. Вспомнили его ещё раз. Затем использовали в предложении.</p>
          </div>
        </section>
      )}

      {!lesson && !view.startsWith("p2-") && !view.startsWith("p3-") && !["home", "review", "reading", "exam", "exam-result"].includes(view) && (
        <section className="study-view">
          <p className="instruction">Загружаем урок…</p>
        </section>
      )}

      {view === "learn" && lesson && deck && currentWord && (
        <section className="study-view">
          <div className="stage-label"><span>{deckIndex + 1}</span>{deck.title}</div>
          <div className={`repeat-badge ${round === 2 ? "active" : ""}`}>
            {round === 1 ? "Первое знакомство" : "Повторение без спешки"} · круг {round} из 2
          </div>
          <p className="instruction">{revealed ? "Прочитайте перевод и повторите слово вслух" : round === 1 ? "Познакомьтесь со словом и попробуйте его произнести" : "Попробуйте вспомнить значение до открытия ответа"}</p>
          <article className={`word-card ${revealed ? "is-revealed" : ""}`}>
            <div className="card-ornament">•</div>
            <button className="sound" onClick={() => speak(currentWord.arabic)} aria-label="Прослушать произношение">◖))</button>
            <div className="arabic-word" lang="ar" dir="rtl">{currentWord.arabic}</div>
            <div className="divider" />
            {revealed ? (
              <div className="translation"><strong>{currentWord.russian}</strong>{currentWord.note && <small>{currentWord.note}</small>}</div>
            ) : <div className="hidden-translation">перевод скрыт</div>}
          </article>
          <div className="study-actions">
            {!revealed ? (
              <button className="primary wide" onClick={() => setRevealed(true)}>Показать перевод</button>
            ) : (
              <><button className="secondary" onClick={() => rateLearningCard(false)}>Пока трудно</button><button className="primary" onClick={() => rateLearningCard(true)}>Запомнил <span>→</span></button></>
            )}
          </div>
          <button className="text-button" onClick={() => speak(currentWord.arabic)}>Прослушать ещё раз</button>
        </section>
      )}

      {view === "grammar" && lesson?.grammar && currentRule && (
        <section className="study-view grammar-view">
          <div className="stage-label"><span>{currentRule.kind === "nahw" ? "ن" : "ص"}</span>
            {currentRule.kind === "nahw" ? "Нахв · строение предложения" : "Сарф · строение слова"}
          </div>
          <div className="repeat-badge active">{lesson.grammar.title}</div>
          <p className="instruction">{ruleIndex === 0 ? lesson.grammar.intro : "Прочитайте правило и разберите примеры"}</p>
          <article className="rule-card">
            <header>
              <h2>{currentRule.title}</h2>
              {currentRule.term && <span className="rule-term" lang="ar" dir="rtl">{currentRule.term}</span>}
              {currentRule.termSound && <span className="rule-sound">{currentRule.termSound}</span>}
              {currentRule.pattern && <span className="rule-pattern" lang="ar" dir="rtl">{currentRule.pattern}</span>}
            </header>
            <p className="rule-text">{currentRule.explanation}</p>
            <ul className="rule-examples">
              {currentRule.examples.map((example) => (
                <li key={example.arabic}>
                  <b lang="ar" dir="rtl">{example.arabic}</b>
                  <span>{example.russian}</span>
                  {example.note && <small lang="ar" dir="rtl">{example.note}</small>}
                  <button className="mini-inline-sound" onClick={() => speak(example.arabic)} aria-label="Прослушать">◖))</button>
                </li>
              ))}
            </ul>
          </article>
          <div className="study-actions">
            {ruleIndex > 0 && (
              <button className="secondary" onClick={() => setRuleIndex((value) => value - 1)}>Назад</button>
            )}
            <button
              className={`primary ${ruleIndex > 0 ? "" : "wide"}`}
              onClick={nextRule}
            >
              {ruleIndex < grammarRules.length - 1 ? "Дальше" : "К заданиям"} <span>→</span>
            </button>
          </div>
        </section>
      )}

      {view === "reading" && reading && (
        <section className="study-view reading-view">
          <div className="stage-label"><span>◫</span>Чтение · {reading.source}</div>
          <p className="instruction">
            Читайте вслух целиком. Если предложение не сложилось — нажмите на него, и появится перевод.
          </p>
          {reading.texts.map((text, textIndex) => (
            <article className="reading-text" key={text.title}>
              <h3>{text.title}</h3>
              {text.sentences.map((line, lineIndex) => {
                const id = `${textIndex}-${lineIndex}`;
                const open = openLines.includes(id);
                return (
                  <div className={`reading-line ${open ? "is-open" : ""}`} key={id}>
                    <div className="reading-row">
                      <button
                        className="reading-arabic"
                        lang="ar"
                        dir="rtl"
                        onClick={() => setOpenLines((items) =>
                          open ? items.filter((value) => value !== id) : [...items, id])}
                        aria-expanded={open}
                      >
                        {line.arabic}
                      </button>
                      <button className="reading-sound" onClick={() => speak(line.arabic)} aria-label="Прослушать предложение">◖))</button>
                    </div>
                    {open && <p className="reading-russian">{line.russian}</p>}
                  </div>
                );
              })}
            </article>
          ))}
          <div className="study-actions">
            <button className="secondary" onClick={() => setView("home")}>Вернуться позже</button>
            <button className="primary" onClick={finishReading}>Прочитал <span>✓</span></button>
          </div>
          <p className="reading-note">
            Слова этих текстов не попадают в карточки — это чтение, а не новый список для заучивания.
          </p>
        </section>
      )}

      {view === "p2-learn" && part2 && p2Word && (
        <section className="study-view">
          <div className="stage-label"><span>1</span>Новые слова урока</div>
          <div className="repeat-badge active">{part2.title} · слово {stepIndex + 1} из {p2Words.length}</div>
          <p className="instruction">
            {revealed
              ? "Прочитайте фразу — в ней это слово вам и встретится"
              : "Познакомьтесь со словом и попробуйте его произнести"}
          </p>
          <article className={`word-card ${revealed ? "is-revealed" : ""}`}>
            <div className="card-ornament">•</div>
            <button className="sound" onClick={() => speak(p2Word.arabic)} aria-label="Прослушать произношение">◖))</button>
            <div className="arabic-word" lang="ar" dir="rtl">{p2Word.arabic}</div>
            <div className="divider" />
            {revealed ? (
              <div className="translation">
                <strong>{p2Word.russian}</strong>
                <div className="word-context">
                  <span lang="ar" dir="rtl">{p2Word.contextArabic}</span>
                  <small>{p2Word.contextRussian}</small>
                </div>
              </div>
            ) : <div className="hidden-translation">перевод скрыт</div>}
          </article>
          <div className="study-actions">
            {!revealed ? (
              <button className="primary wide" onClick={() => setRevealed(true)}>Показать перевод</button>
            ) : (
              <>
                <button className="secondary" onClick={() => ratePart2Card(false)}>Пока трудно</button>
                <button className="primary" onClick={() => ratePart2Card(true)}>Запомнил <span>→</span></button>
              </>
            )}
          </div>
        </section>
      )}

      {view === "p2-practice" && part2 && p2Task && (
        <section className="practice-view">
          <div className="stage-label"><span>2</span>Узнаём слово в тексте</div>
          <div className="repeat-badge active">{part2.title} · задание {stepIndex + 1} из {p2Tasks.length}</div>
          <p className="instruction">
            {p2Task.prompt.includes(BLANK)
              ? "Какое слово стояло на месте пропуска"
              : "Что говорит эта фраза"}
          </p>
          <div className="prompt-card">
            <span>Арабский</span>
            <strong className="arabic-prompt" dir={promptDirection(p2Task.prompt, p2Task.promptLang)}>
              {p2Task.prompt}
            </strong>
          </div>
          <div className="options">
            {p2Options.map((option) => {
              const state = selected
                ? option === p2Task.answer ? "correct" : option === selected ? "wrong" : "dimmed"
                : "";
              return (
                <button key={option} className={state} onClick={() => answerPart2(option)} disabled={!!selected}>
                  <span dir={/[\u0400-\u04FF]/.test(option) || !/[\u0600-\u06FF]/.test(option) ? "ltr" : "rtl"}>{option}</span>
                  {state === "correct" && <b>✓</b>}{state === "wrong" && <b>×</b>}
                </button>
              );
            })}
          </div>
          {selected && (
            <div className={`feedback ${selected === p2Task.answer ? "good" : "bad"}`}>
              <div>
                <strong>{selected === p2Task.answer ? "Верно!" : "Почти получилось"}</strong>
                <p>{p2Task.explanation}</p>
              </div>
              <button className="primary" onClick={nextPart2Task}>
                {stepIndex === p2Tasks.length - 1 ? "К чтению" : "Дальше"} <span>→</span>
              </button>
            </div>
          )}
        </section>
      )}

      {view === "p2-reading" && part2 && (
        <section className="study-view reading-view">
          <div className="stage-label"><span>3</span>Чтение · {part2.book}</div>
          <p className="instruction">
            Читайте вслух целиком. Если предложение не сложилось — нажмите на него, и появится перевод.
          </p>
          {part2.stories.map((story, storyIndex) => (
            <article className="reading-text" key={`${story.title}-${storyIndex}`}>
              <h3 lang="ar" dir="rtl">{story.arabicTitle || story.title}</h3>
              <p className="story-title">{story.title}</p>
              {story.sentences.map((line, lineIndex) => {
                const id = `${storyIndex}-${lineIndex}`;
                const open = stepOpen.includes(id);
                return (
                  <div className={`reading-line ${open ? "is-open" : ""}`} key={id}>
                    <div className="reading-row">
                      <button
                        className="reading-arabic"
                        lang="ar"
                        dir="rtl"
                        aria-expanded={open}
                        onClick={() => setStepOpen((items) => open ? items.filter((value) => value !== id) : [...items, id])}
                      >
                        {line.arabic}
                      </button>
                      <button className="reading-sound" onClick={() => speak(line.arabic)} aria-label="Прослушать предложение">◖))</button>
                    </div>
                    {open && <p className="reading-russian">{line.russian}</p>}
                  </div>
                );
              })}
            </article>
          ))}
          <div className="study-actions">
            <button className="secondary" onClick={() => setView("home")}>Вернуться позже</button>
            <button className="primary" onClick={finishPart2}>Урок пройден <span>✓</span></button>
          </div>
        </section>
      )}

      {view === "p2-result" && part2 && (
        <section className="study-view result-view">
          <div className="result-mark">✓</div>
          <h2>Урок {part2.id} пройден</h2>
          <p className="result-score">{stepScore} из {p2Tasks.length}</p>
          <p className="instruction">
            {plural(p2Words.length, "новое слово", "новых слова", "новых слов")} ушли в повторение —
            они вернутся вместе со словами первой части.
          </p>
          <div className="study-actions">
            <button className="secondary" onClick={() => setView("home")}>Вернуться к курсу</button>
            {part2Summaries.some((item) => item.id === part2.id + 1) && (
              <button className="primary" onClick={() => startPart2(part2.id + 1, "start")}>
                Следующий урок <span>→</span>
              </button>
            )}
          </div>
        </section>
      )}

      {view === "p3-learn" && part3 && p3Word && (
        <section className="study-view">
          <div className="stage-label"><span>1</span>Новые слова урока</div>
          <div className="repeat-badge active">{part3.title} · слово {stepIndex + 1} из {p3Words.length}</div>
          <p className="instruction">
            {revealed
              ? "Это слово встретится вам в тексте урока"
              : "Познакомьтесь со словом и попробуйте его произнести"}
          </p>
          <article className={`word-card ${revealed ? "is-revealed" : ""}`}>
            <div className="card-ornament">•</div>
            <button className="sound" onClick={() => speak(p3Word.arabic)} aria-label="Прослушать произношение">◖))</button>
            <div className="arabic-word" lang="ar" dir="rtl">{p3Word.arabic}</div>
            <div className="divider" />
            {revealed ? (
              <div className="translation">
                <strong>{p3Word.russian}</strong>
              </div>
            ) : <div className="hidden-translation">перевод скрыт</div>}
          </article>
          <div className="study-actions">
            {!revealed ? (
              <button className="primary wide" onClick={() => setRevealed(true)}>Показать перевод</button>
            ) : (
              <>
                <button className="secondary" onClick={() => ratePart3Card(false)}>Пока трудно</button>
                <button className="primary" onClick={() => ratePart3Card(true)}>Запомнил <span>→</span></button>
              </>
            )}
          </div>
        </section>
      )}

      {view === "p3-practice" && part3 && p3Task && (
        <section className="practice-view">
          <div className="stage-label"><span>2</span>Проверяем слова урока</div>
          <div className="repeat-badge active">{part3.title} · задание {stepIndex + 1} из {p3Tasks.length}</div>
          <p className="instruction">Что означает это слово</p>
          <div className="prompt-card">
            <span>Арабский</span>
            <strong className="arabic-prompt" dir={promptDirection(p3Task.prompt, p3Task.promptLang)}>
              {p3Task.prompt}
            </strong>
          </div>
          <div className="options">
            {p3Options.map((option) => {
              const state = selected
                ? option === p3Task.answer ? "correct" : option === selected ? "wrong" : "dimmed"
                : "";
              return (
                <button key={option} className={state} onClick={() => answerPart3(option)} disabled={!!selected}>
                  <span dir="ltr">{option}</span>
                  {state === "correct" && <b>✓</b>}{state === "wrong" && <b>×</b>}
                </button>
              );
            })}
          </div>
          {selected && (
            <div className={`feedback ${selected === p3Task.answer ? "good" : "bad"}`}>
              <div>
                <strong>{selected === p3Task.answer ? "Верно!" : "Почти получилось"}</strong>
                <p>{p3Task.explanation}</p>
              </div>
              <button className="primary" onClick={nextPart3Task}>
                {stepIndex === p3Tasks.length - 1 ? "К чтению" : "Дальше"} <span>→</span>
              </button>
            </div>
          )}
        </section>
      )}

      {view === "p3-reading" && part3 && (
        <section className="study-view reading-view">
          <div className="stage-label"><span>3</span>Чтение · {PART3_BOOK}</div>
          <p className="instruction">
            Читайте вслух целиком. Если фрагмент не сложился — нажмите на него, и появится перевод.
          </p>
          <article className="reading-text">
            <h3 lang="ar" dir="rtl">{part3.arabicTitle || part3.title}</h3>
            <p className="story-title">{part3.title}</p>
            {part3.fragments.map((line, lineIndex) => {
              const id = `p3-${lineIndex}`;
              const open = stepOpen.includes(id);
              return (
                <div className={`reading-line ${open ? "is-open" : ""}`} key={id}>
                  <div className="reading-row">
                    <button
                      className="reading-arabic"
                      lang="ar"
                      dir="rtl"
                      aria-expanded={open}
                      onClick={() => setStepOpen((items) => open ? items.filter((value) => value !== id) : [...items, id])}
                    >
                      {line.arabic}
                    </button>
                    <button className="reading-sound" onClick={() => speak(line.arabic)} aria-label="Прослушать фрагмент">◖))</button>
                  </div>
                  {open && <p className="reading-russian">{line.russian}</p>}
                </div>
              );
            })}
          </article>
          <div className="study-actions">
            <button className="secondary" onClick={() => setView("home")}>Вернуться позже</button>
            <button className="primary" onClick={finishPart3}>Урок пройден <span>✓</span></button>
          </div>
        </section>
      )}

      {view === "p3-result" && part3 && (
        <section className="study-view result-view">
          <div className="result-mark">✓</div>
          <h2>Урок {part3.id} пройден</h2>
          <p className="result-score">{stepScore} из {p3Tasks.length}</p>
          <p className="instruction">
            {plural(p3Words.length, "новое слово", "новых слова", "новых слов")} ушли в повторение —
            они вернутся вместе со словами первых двух частей.
          </p>
          <div className="study-actions">
            <button className="secondary" onClick={() => setView("home")}>Вернуться к курсу</button>
            {part3Summaries.some((item) => item.id === part3.id + 1) && (
              <button className="primary" onClick={() => startPart3(part3.id + 1, "start")}>
                Следующий урок <span>→</span>
              </button>
            )}
          </div>
        </section>
      )}

      {view === "exam" && exam && examQuestion && (
        <section className="practice-view exam-view">
          <div className="stage-label"><span>✦</span>{exam.title}</div>
          <div className="repeat-badge active">
            {examQuestion.area === "grammar" ? "Грамматика" : "Лексика"} · вопрос {examIndex + 1} из {examOrder.length}
          </div>
          <p className="instruction">Ответы не разбираются по ходу — разбор будет в конце.</p>
          <div className="prompt-card">
            <span>{examQuestion.promptLang === "ar" ? "Арабский" : "Русский"}</span>
            <strong
              className={examQuestion.promptLang === "ar" ? "arabic-prompt" : ""}
              dir={promptDirection(examQuestion.prompt, examQuestion.promptLang)}
            >
              {examQuestion.prompt}
            </strong>
            {examQuestion.promptLang === "ar" && (
              <button className="mini-sound" onClick={() => speak(examQuestion.prompt)} aria-label="Прослушать">◖))</button>
            )}
          </div>
          <div className="options">
            {examOptions.map((option) => (
              <button key={option} onClick={() => answerExam(option)}>
                <span dir={/[\u0400-\u04FF]/.test(option) || !/[\u0600-\u06FF]/.test(option) ? "ltr" : "rtl"}>{option}</span>
              </button>
            ))}
          </div>
          <p className="exam-note">Работа сохраняется после каждого ответа — можно закрыть и вернуться.</p>
        </section>
      )}

      {view === "exam-result" && exam && (() => {
        const total = exam.questions.length;
        const mark = examPassMark(total);
        const passed = examScore >= mark;
        const missed = exam.questions.filter((question) => examMistakes.includes(question.prompt));
        return (
          <section className="study-view result-view">
            <div className={`result-mark ${passed ? "" : "is-short"}`}>{passed ? "✓" : "•"}</div>
            <h2>{passed ? "Экзамен сдан" : "Экзамен не сдан"}</h2>
            <p className="result-score">{examScore} из {total}</p>
            <p className="instruction">
              {passed
                ? `Проходной балл — ${mark}. Результат сохранён.`
                : `Нужно ${mark} верных. Пересдать можно сколько угодно раз, прежний результат не пропадёт.`}
            </p>
            {missed.length > 0 && (
              <div className="mistake-list">
                <strong>{plural(missed.length, "ошибка", "ошибки", "ошибок")}</strong>
                <ul>
                  {missed.slice(0, 20).map((question) => (
                    <li key={question.prompt}>
                      <span dir="auto">{question.prompt}</span>
                      <b dir="auto">{question.answer}</b>
                      <small>{question.explanation}</small>
                    </li>
                  ))}
                </ul>
                {missed.length > 20 && <small>…и ещё {missed.length - 20}</small>}
              </div>
            )}
            <div className="study-actions">
              <button className="secondary" onClick={() => setView("home")}>Вернуться к курсу</button>
              <button className="primary" onClick={() => startExam(exam.id)}>Пересдать <span>→</span></button>
            </div>
          </section>
        );
      })()}

      {view === "review" && currentReviewCard && (
        <section className="study-view">
          <div className="stage-label"><span>◷</span>Повторение на сегодня</div>
          <div className="repeat-badge active">
            Урок {currentReviewCard.lessonId} · {currentReviewCard.promptLang === "ar" ? "арабский → русский" : "русский → арабский"}
          </div>
          <p className="instruction">Сначала произнесите ответ самостоятельно, затем откройте его и оцените себя честно</p>
          <article className={`word-card ${reviewRevealed ? "is-revealed" : ""}`}>
            <div className="card-ornament">•</div>
            {currentReviewCard.promptLang === "ar" && (
              <button className="sound" onClick={() => speak(currentReviewCard.prompt)} aria-label="Прослушать произношение">◖))</button>
            )}
            <div
              className={currentReviewCard.promptLang === "ar" ? "arabic-word" : "review-russian"}
              lang={currentReviewCard.promptLang === "ar" ? "ar" : "ru"}
              dir={currentReviewCard.promptLang === "ar" ? "rtl" : "ltr"}
            >
              {currentReviewCard.prompt}
            </div>
            <div className="divider" />
            {reviewRevealed ? (
              <div className={currentReviewCard.answerLang === "ar" ? "review-arabic-answer" : "translation"} dir={currentReviewCard.answerLang === "ar" ? "rtl" : "ltr"}>
                <strong>{currentReviewCard.answer}</strong>
                {currentReviewCard.answerLang === "ar" && <button className="mini-inline-sound" onClick={() => speak(currentReviewCard.answer)}>◖))</button>}
              </div>
            ) : <div className="hidden-translation">ответ скрыт</div>}
          </article>
          <div className={`study-actions ${reviewRevealed ? "three" : ""}`}>
            {!reviewRevealed ? (
              <button className="primary wide" onClick={() => setReviewRevealed(true)}>Показать ответ</button>
            ) : (
              <>
                <button className="secondary" onClick={() => rateReviewCard(false)}>Не вспомнил</button>
                <button className="primary" onClick={() => rateReviewCard(true)}>Вспомнил <span>→</span></button>
                <button className="mastered" onClick={masterReviewCard} title="Больше не показывать в повторении">
                  Выучил <span>✓</span>
                </button>
              </>
            )}
          </div>
        </section>
      )}

      {view === "practice" && lesson && currentQuestion && (
        <section className="practice-view">
          <div className="stage-label"><span>{grammarPart ? "ن" : "3"}</span>{grammarPart ? "Проверяем правило" : "Закрепляем в заданиях"}</div>
          <div className="repeat-badge active">
            {grammarPart ? lesson.grammar?.title : "Слова возвращаются в обе стороны перевода"}
          </div>
          <p className="instruction">
            {grammarPart
              ? "Опирайтесь на правило, а не на память о переводе"
              : questionIndex === lesson.questions.length - 1
                ? "Найдите и исправьте ошибку"
                : "Выберите правильный ответ"}
          </p>
          {parts.length > 1 && !grammarPart && <div className="repeat-badge">Задания части {partIndex + 1} из {parts.length}</div>}
          <div className="prompt-card">
            <span>{currentQuestion.promptLang === "ar" ? "Арабский" : "Русский"}</span>
            <strong className={currentQuestion.promptLang === "ar" ? "arabic-prompt" : ""} dir={promptDirection(currentQuestion.prompt, currentQuestion.promptLang)}>{currentQuestion.prompt}</strong>
            {currentQuestion.promptLang === "ar" && <button className="mini-sound" onClick={() => speak(currentQuestion.prompt)} aria-label="Прослушать">◖))</button>}
          </div>
          <div className="options">
            {options.map((option) => {
              const state = selected ? option === currentQuestion.answer ? "correct" : option === selected ? "wrong" : "dimmed" : "";
              return (
                <button key={option} className={state} onClick={() => answer(option)} disabled={!!selected}>
                  {/* An option that mixes the two scripts is a Russian phrase with
                      Arabic inside it, so it stays left-to-right. */}
                  <span dir={/[\u0400-\u04FF]/.test(option) || !/[\u0600-\u06FF]/.test(option) ? "ltr" : "rtl"}>{option}</span>
                  {state === "correct" && <b>✓</b>}{state === "wrong" && <b>×</b>}
                </button>
              );
            })}
          </div>
          {selected && (
            <div className={`feedback ${selected === currentQuestion.answer ? "good" : "bad"}`}>
              <div><strong>{selected === currentQuestion.answer ? "Верно!" : "Почти получилось"}</strong><p>{currentQuestion.explanation}</p></div>
              <button className="primary" onClick={nextQuestion}>{questionIndex === (part?.questionEnd ?? 0) - 1 ? "Результат" : "Дальше"} <span>→</span></button>
            </div>
          )}
        </section>
      )}

      {view === "result" && lesson && part && part.kind === "grammar" && (() => {
        const answered = part.questionEnd;
        const needed = grammarPassMark(answered);
        const passed = grammarScore >= needed;
        return (
          <section className="result-view">
            <div className={`result-mark ${passed ? "" : "is-short"}`}>{passed ? "✓" : "↻"}</div>
            <div className="eyebrow">
              {passed ? `Урок ${lesson.id} · грамматика пройдена` : `Урок ${lesson.id} · грамматика не сдана`}
            </div>
            <h1>{passed ? "Правило усвоено!" : "Правило стоит перечитать"}</h1>
            <p>
              {passed
                ? "Теперь за формами урока стоит понятное правило — следующие уроки будут опираться на него."
                : `Чтобы блок засчитался, нужно ответить верно хотя бы на ${plural(needed, "задание", "задания", "заданий")} из ${answered}. Правила остаются на месте — откройте разбор ещё раз.`}
            </p>
            <div className="result-grid">
              <div><strong>{grammarScore}/{answered}</strong><span>верных ответов</span></div>
              <div><strong>{Math.round((grammarScore / answered) * 100)}%</strong><span>точность</span></div>
              <div><strong>{passed ? grammarRules.length : needed}</strong><span>{passed ? "разобрано правил" : "нужно верных"}</span></div>
            </div>
            <div className="result-actions">
              {passed ? (
                <>
                  <button className="secondary" onClick={() => startPart(part.index)}>Пройти ещё раз</button>
                  {nextLesson
                    ? <button className="primary" onClick={() => startLesson(nextLesson.id)}>Перейти к уроку {nextLesson.id} <span>→</span></button>
                    : <button className="primary" onClick={() => setView("home")}>Вернуться к курсу <span>→</span></button>}
                </>
              ) : (
                <>
                  <button className="secondary" onClick={() => setView("home")}>Вернуться позже</button>
                  <button className="primary" onClick={() => startPart(part.index)}>Разобрать заново <span>→</span></button>
                </>
              )}
            </div>
          </section>
        );
      })()}

      {view === "result" && lesson && part && part.kind === "cards" && (() => {
        // A part's result counts everything answered in the lesson so far, so the
        // halves add up instead of restarting the score.
        const answered = part.questionEnd;
        const remaining = parts[partIndex + 1];
        const grammarNext = remaining?.kind === "grammar";
        const strong = score >= Math.ceil(answered * 0.75);
        return (
          <section className="result-view">
            <div className="result-mark">✓</div>
            <div className="eyebrow">
              {grammarNext
                ? `Урок ${lesson.id} · слова пройдены`
                : remaining
                  ? `Урок ${lesson.id} · часть ${partIndex + 1} из ${parts.length} пройдена`
                  : `Урок ${lesson.id} завершён`}
            </div>
            <h1>{strong ? "Материал закреплён!" : "Хороший результат"}</h1>
            <p>
              {grammarNext
                ? "Осталась грамматика урока: правило, по которому построены эти формы, и задания к нему. Урок засчитывается вместе с ней."
                : remaining
                  ? "Вторая часть вводит остальные формы урока. Можно продолжить сейчас или вернуться позже — место сохранено."
                  : strong
                    ? "Вы дважды повторили формы и применили их в предложениях. Завтра они вернутся в коротком повторении."
                    : "Ошибочные формы стоит пройти ещё раз — повторение займёт всего несколько минут."}
            </p>
            <div className="result-grid">
              <div><strong>{score}/{answered}</strong><span>верных ответов</span></div>
              <div><strong>{Math.round((score / answered) * 100)}%</strong><span>точность</span></div>
              <div><strong>{mistakes.length}</strong><span>форм повторить</span></div>
            </div>
            <div className="review-note"><span>◷</span><div><strong>Следующее повторение — завтра</strong><small>Слова, фразы и ваши ошибки · около 3 минут</small></div></div>
            <div className="result-actions">
              {remaining ? (
                <>
                  <button className="secondary" onClick={() => setView("home")}>Вернуться позже</button>
                  <button className="primary" onClick={() => startPart(remaining.index)}>
                    {grammarNext ? "Грамматика" : `Часть ${remaining.index + 1}`} <span>→</span>
                  </button>
                </>
              ) : (
                <>
                  <button className="secondary" onClick={resetLesson}>Сбросить результат</button>
                  {nextLesson
                    ? <button className="primary" onClick={() => startLesson(nextLesson.id)}>Перейти к уроку {nextLesson.id} <span>→</span></button>
                    : <button className="primary" onClick={() => setView("home")}>Вернуться к курсу <span>→</span></button>}
                </>
              )}
            </div>
          </section>
        );
      })()}

      <footer><span>Учимся осмысленно, повторяем вовремя</span><span lang="ar" dir="rtl">العِلْمُ بِالتَّعَلُّمِ</span></footer>
    </main>
  );
}
