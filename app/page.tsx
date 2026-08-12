"use client";

import { ChangeEvent, useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { lessonSummaries } from "../content/manifest";
import { loadLessons } from "../content/lessons";
import { plural } from "../content/questions";
import type { Lesson } from "../content/types";
import { cardPhaseProgress } from "./lesson-progress";
import { isLessonComplete, unlockedLessonIds } from "./lesson-access";
import { lessonParts } from "../content/lesson-parts";
import {
  EMPTY_STATS,
  progressStore,
  type CardProgress,
  type SavedSession,
} from "./progress-store";
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

function shuffle<T>(items: T[]) {
  const result = [...items];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const target = Math.floor(Math.random() * (index + 1));
    [result[index], result[target]] = [result[target], result[index]];
  }
  return result;
}

export default function Home() {
  const [view, setView] = useState<"home" | "learn" | "practice" | "grammar" | "review" | "result">("home");
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
  const importInput = useRef<HTMLInputElement>(null);

  const stored = useSyncExternalStore(
    progressStore.subscribe,
    progressStore.getSnapshot,
    progressStore.getServerSnapshot,
  );
  const savedScores = stored.scores;
  const savedGrammarScores = stored.grammarScores;
  const savedSessions = stored.sessions;
  const cardProgress = stored.cards;
  const learningStats = stored.stats;

  const sync = useSyncExternalStore(syncStore.subscribe, syncStore.getSnapshot, syncStore.getServerSnapshot);

  const lesson = openLessons[lessonId];
  const parts = useMemo(() => (lesson ? lessonParts(lesson) : []), [lesson]);
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

  /** Pulls lessons into memory and hands them to the render. */
  const openLessonsById = useCallback(
    async (ids: number[]) => {
      const wanted = ids.filter(Boolean);
      if (wanted.length) mergeLessons(await loadLessons(wanted));
    },
    [mergeLessons],
  );

  // Only lessons the learner has actually touched are in memory, so the review
  // queue is built from those rather than from the whole course.
  const reviewCatalog = useMemo(
    () => Object.values(openLessons).flatMap(reviewCardsOf),
    [openLessons],
  );
  const dueCards = useMemo(() => {
    const today = localDate();
    return reviewCatalog.filter((card) => {
      const progressItem = cardProgress[card.id];
      return progressItem && progressItem.nextReview <= today;
    });
  }, [reviewCatalog, cardProgress]);
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
    await openLessonsById([session.lessonId]);
    setLessonId(session.lessonId);
    setPartIndex(session.partIndex ?? 0);
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
    if (!["learn", "practice", "grammar", "review"].includes(view)) return;
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
  const progress = !lesson || !part
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

  async function startLesson(id: number) {
    if (!unlockedLessons.has(id)) return;
    const storedSession = savedSessions[id];
    if (storedSession) {
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
      grammarScores: savedGrammarScores,
      sessions: savedSessions,
      cards: cardProgress,
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
      // Backups written before the grammar block simply have none of it.
      const grammarScores = payload.grammarScores ?? {};
      const sessions = payload.sessions ?? {};
      const cards = payload.cards ?? {};
      const stats = { ...EMPTY_STATS, ...(payload.stats ?? {}) };
      progressStore.replaceAll({ scores, grammarScores, sessions, cards, stats });
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
      progressStore.finishLesson(lesson.id, score);
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

      {view !== "home" && view !== "result" && (
        <div className="lesson-progress" aria-label="Прогресс урока">
          <button className="close" onClick={() => setView("home")} aria-label="Закрыть урок">×</button>
          {parts.length > 1 && view !== "review" && (
            <span className="part-badge">
              {grammarPart ? "Грамматика" : `Часть ${partIndex + 1} из ${parts.length}`}
            </span>
          )}
          <div className="track"><span style={{ width: `${Math.min(progress, 100)}%` }} /></div>
          <span className="counter">
            {view === "learn"
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

          <div className="lesson-list">
            {lessonSummaries.map((item, index) => {
              const saved = savedScores[item.id];
              const unfinished = savedSessions[item.id];
              const completed = isLessonComplete(item, stored);
              // The words are done but the grammar block still owes an answer.
              const grammarLeft = saved !== undefined && !completed;
              const locked = !unlockedLessons.has(item.id);
              const opensAfter = lessonSummaries[index - 1];
              return (
                <div className={`lesson-card ${completed ? "is-done" : ""} ${locked ? "is-locked" : ""}`} key={item.id}>
                  <div className="lesson-number">{String(item.id).padStart(2, "0")}</div>
                  <div className="lesson-copy">
                    <div className="lesson-label">Урок {item.id} · <span dir="rtl">{item.arabicTitle}</span></div>
                    <h2>{item.title}</h2>
                    <p>{item.description}{item.partCount > 1 ? ` · в ${item.partCount} части` : ""}</p>
                    <div className="chips">{item.tags.map((tag) => <span key={tag}>{tag}</span>)}</div>
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
                      ✓ {saved}/{item.questionCount}
                      {item.grammarQuestionCount > 0 &&
                        ` · грамматика ${savedGrammarScores[item.id]}/${item.grammarQuestionCount}`}
                    </div>
                  )}
                  {grammarLeft && <div className="card-lock">Осталась грамматика</div>}
                  {locked && opensAfter && <div className="card-lock">Сначала урок {opensAfter.id}</div>}
                </div>
              );
            })}
          </div>

          <div className="principle">
            <span className="quote">“</span>
            <p>Увидели слово. Вспомнили его ещё раз. Затем использовали в предложении.</p>
          </div>
        </section>
      )}

      {!lesson && view !== "home" && view !== "review" && (
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
            <strong className={currentQuestion.promptLang === "ar" ? "arabic-prompt" : ""} dir={currentQuestion.promptLang === "ar" ? "rtl" : "ltr"}>{currentQuestion.prompt}</strong>
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
        const strong = grammarScore >= Math.ceil(answered * 0.75);
        return (
          <section className="result-view">
            <div className="result-mark">✓</div>
            <div className="eyebrow">Урок {lesson.id} · грамматика пройдена</div>
            <h1>{strong ? "Правило усвоено!" : "Правило стоит перечитать"}</h1>
            <p>
              {strong
                ? "Теперь за формами урока стоит понятное правило — следующие уроки будут опираться на него."
                : "Разбор можно открыть ещё раз: правила остаются на месте, а задания к ним повторяются."}
            </p>
            <div className="result-grid">
              <div><strong>{grammarScore}/{answered}</strong><span>верных ответов</span></div>
              <div><strong>{Math.round((grammarScore / answered) * 100)}%</strong><span>точность</span></div>
              <div><strong>{grammarRules.length}</strong><span>разобрано правил</span></div>
            </div>
            <div className="result-actions">
              <button className="secondary" onClick={() => startPart(part.index)}>Пройти ещё раз</button>
              {nextLesson
                ? <button className="primary" onClick={() => startLesson(nextLesson.id)}>Перейти к уроку {nextLesson.id} <span>→</span></button>
                : <button className="primary" onClick={() => setView("home")}>Вернуться к курсу <span>→</span></button>}
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
