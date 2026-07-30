"use client";

import { ChangeEvent, useEffect, useMemo, useRef, useState } from "react";
import { rawLessons, type Lesson, type Question } from "../content";

type SavedSession = {
  view: "learn" | "practice";
  lessonId: number;
  deckIndex: number;
  round: number;
  cardIndex: number;
  questionIndex: number;
  score: number;
  mistakes: string[];
  updatedAt?: number;
};

type CardProgress = {
  box: number;
  nextReview: string;
  lastReviewed: string;
  correct: number;
  wrong: number;
};

type LearningStats = {
  activeDates: string[];
  totalSeconds: number;
  masteredPhrases: string[];
};

type ReviewCard = {
  id: string;
  lessonId: number;
  prompt: string;
  answer: string;
  promptLang: "ar" | "ru";
  answerLang: "ar" | "ru";
};

const CARD_PROGRESS_KEY = "shifahiya-card-progress-v1";
const LEARNING_STATS_KEY = "shifahiya-learning-stats-v1";
const REVIEW_INTERVALS = [0, 1, 3, 7, 14, 30];
const WORD_ACHIEVEMENTS = [10, 50, 100, 250, 500, 1000, 1500, 2000];
const DAY_ACHIEVEMENTS = [7, 14, 30, 50, 100, 150, 250, 365];
const EMPTY_STATS: LearningStats = { activeDates: [], totalSeconds: 0, masteredPhrases: [] };

function buildOptions(answer: string, candidates: string[]) {
  const alternatives = [...new Set(candidates)].filter((item) => item !== answer);
  return [answer, ...alternatives.slice(0, 2)];
}

function expandLessonQuestions(lesson: Lesson): Lesson {
  const words = lesson.decks.flatMap((deck) => deck.words);
  const targetCount = words.length * 2;
  if (lesson.questions.length >= targetCount) return lesson;

  const arabicAnswers = words.map((word) => word.arabic);
  const russianAnswers = words.map((word) => word.russian);
  const generated = words.flatMap<Question>((word) => [
    {
      prompt: word.arabic,
      promptLang: "ar",
      answer: word.russian,
      options: buildOptions(word.russian, russianAnswers),
      explanation: `${word.arabic} означает «${word.russian}».`,
    },
    {
      prompt: word.russian,
      promptLang: "ru",
      answer: word.arabic,
      options: buildOptions(word.arabic, arabicAnswers),
      explanation: `${word.arabic} — правильная арабская форма для «${word.russian}».`,
    },
  ]);

  const needed = targetCount - lesson.questions.length;
  const finalCorrection = lesson.questions.at(-1);
  const contextualQuestions = lesson.questions.slice(0, -1);
  const expandedQuestions = [
    ...contextualQuestions,
    ...generated.slice(0, needed),
    ...(finalCorrection ? [finalCorrection] : []),
  ];

  return {
    ...lesson,
    description: lesson.description.replace(/\d+ заданий/, `${targetCount} заданий`),
    questions: expandedQuestions,
  };
}

const lessons = rawLessons.map(expandLessonQuestions);

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

const reviewCatalog: ReviewCard[] = lessons.flatMap((lesson) =>
  lesson.decks.flatMap((deck, deckIndex) =>
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
  ),
);

function nextCardProgress(previous: CardProgress | undefined, remembered: boolean): CardProgress {
  const box = remembered ? Math.min((previous?.box ?? 0) + 1, REVIEW_INTERVALS.length - 1) : 0;
  return {
    box,
    nextReview: localDate(REVIEW_INTERVALS[box]),
    lastReviewed: localDate(),
    correct: (previous?.correct ?? 0) + (remembered ? 1 : 0),
    wrong: (previous?.wrong ?? 0) + (remembered ? 0 : 1),
  };
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
  const [view, setView] = useState<"home" | "learn" | "practice" | "review" | "result">("home");
  const [lessonId, setLessonId] = useState(1);
  const [deckIndex, setDeckIndex] = useState(0);
  const [round, setRound] = useState(1);
  const [cardIndex, setCardIndex] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const [questionIndex, setQuestionIndex] = useState(0);
  const [selected, setSelected] = useState<string | null>(null);
  const [score, setScore] = useState(0);
  const [mistakes, setMistakes] = useState<string[]>([]);
  const [savedScores, setSavedScores] = useState<Record<number, number>>({});
  const [savedSessions, setSavedSessions] = useState<Record<number, SavedSession>>({});
  const [cardProgress, setCardProgress] = useState<Record<string, CardProgress>>({});
  const [learningStats, setLearningStats] = useState<LearningStats>(EMPTY_STATS);
  const [reviewQueue, setReviewQueue] = useState<ReviewCard[]>([]);
  const [reviewIndex, setReviewIndex] = useState(0);
  const [reviewRevealed, setReviewRevealed] = useState(false);
  const [backupMessage, setBackupMessage] = useState("");
  const [storageReady, setStorageReady] = useState(false);
  const importInput = useRef<HTMLInputElement>(null);

  const lesson = lessons.find((item) => item.id === lessonId) ?? lessons[0];
  const deck = lesson.decks[deckIndex];
  const words = deck.words;
  const currentWord = words[cardIndex];
  const currentQuestion = lesson.questions[questionIndex];
  const currentReviewCard = reviewQueue[reviewIndex];
  const dueCards = useMemo(() => {
    const today = localDate();
    return reviewCatalog.filter((card) => {
      const progressItem = cardProgress[card.id];
      return progressItem && progressItem.nextReview <= today;
    });
  }, [cardProgress]);
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
  const latestSession = useMemo(
    () => Object.values(savedSessions).sort((a, b) =>
      (b.updatedAt ?? b.lessonId) - (a.updatedAt ?? a.lessonId),
    )[0],
    [savedSessions],
  );
  const latestSessionLesson = latestSession
    ? lessons.find((item) => item.id === latestSession.lessonId)
    : undefined;
  const recommendedLesson = latestSessionLesson ??
    lessons.find((item) => savedScores[item.id] === undefined) ??
    lessons.at(-1);
  const latestSessionPosition = latestSession && latestSessionLesson
    ? latestSession.view === "practice"
      ? `Упражнение ${latestSession.questionIndex + 1} из ${latestSessionLesson.questions.length}`
      : `${latestSessionLesson.decks[latestSession.deckIndex]?.title ?? "Новые слова"} · круг ${latestSession.round} · карточка ${latestSession.cardIndex + 1}`
    : "";
  const latestSessionProgress = latestSession && latestSessionLesson
    ? latestSession.view === "practice"
      ? 70 + ((latestSession.questionIndex + 1) / latestSessionLesson.questions.length) * 30
      : (() => {
          const completedWords = latestSessionLesson.decks
            .slice(0, latestSession.deckIndex)
            .reduce((sum, item) => sum + item.words.length * 2, 0);
          const currentDeckWords = latestSessionLesson.decks[latestSession.deckIndex]?.words.length ?? 1;
          const position = completedWords + (latestSession.round - 1) * currentDeckWords + latestSession.cardIndex + 1;
          const total = latestSessionLesson.decks.reduce((sum, item) => sum + item.words.length * 2, 0);
          return (position / total) * 70;
        })()
    : 0;

  function restoreSession(session: SavedSession) {
    setLessonId(session.lessonId);
    setDeckIndex(session.deckIndex);
    setRound(session.round);
    setCardIndex(session.cardIndex);
    setQuestionIndex(session.questionIndex);
    setScore(session.score);
    setMistakes(session.mistakes);
    setSelected(null);
    setRevealed(false);
    setView(session.view);
  }

  useEffect(() => {
    const scores: Record<number, number> = {};
    const sessions: Record<number, SavedSession> = {};
    lessons.forEach((item) => {
      const stored = window.localStorage.getItem(`shifahiya-lesson-${item.id}`);
      if (stored !== null) scores[item.id] = Number(stored);
      const storedLessonSession = window.localStorage.getItem(`shifahiya-session-${item.id}`);
      if (storedLessonSession) {
        try {
          const session = JSON.parse(storedLessonSession) as SavedSession;
          if (session.lessonId === item.id) sessions[item.id] = session;
        } catch {
          window.localStorage.removeItem(`shifahiya-session-${item.id}`);
        }
      }
    });
    setSavedScores(scores);
    setSavedSessions(sessions);
    const storedCardProgress = window.localStorage.getItem(CARD_PROGRESS_KEY);
    if (storedCardProgress) {
      try {
        setCardProgress(JSON.parse(storedCardProgress) as Record<string, CardProgress>);
      } catch {
        window.localStorage.removeItem(CARD_PROGRESS_KEY);
      }
    }
    const storedLearningStats = window.localStorage.getItem(LEARNING_STATS_KEY);
    if (storedLearningStats) {
      try {
        setLearningStats({ ...EMPTY_STATS, ...JSON.parse(storedLearningStats) });
      } catch {
        window.localStorage.removeItem(LEARNING_STATS_KEY);
      }
    }
    const storedSession = window.localStorage.getItem("shifahiya-active-session");
    if (storedSession) {
      try {
        const session = JSON.parse(storedSession) as SavedSession;
        if (lessons.some((item) => item.id === session.lessonId)) {
          sessions[session.lessonId] = session;
          window.localStorage.setItem(`shifahiya-session-${session.lessonId}`, JSON.stringify(session));
          setSavedSessions({ ...sessions });
        }
      } catch {
        window.localStorage.removeItem("shifahiya-active-session");
      }
    }
    setStorageReady(true);
  }, []);

  useEffect(() => {
    if (!storageReady || (view !== "learn" && view !== "practice")) return;
    const session: SavedSession = {
      view,
      lessonId,
      deckIndex,
      round,
      cardIndex,
      questionIndex,
      score,
      mistakes,
      updatedAt: Date.now(),
    };
    window.localStorage.setItem("shifahiya-active-session", JSON.stringify(session));
    window.localStorage.setItem(`shifahiya-session-${lessonId}`, JSON.stringify(session));
    setSavedSessions((items) => ({ ...items, [lessonId]: session }));
  }, [storageReady, view, lessonId, deckIndex, round, cardIndex, questionIndex, score, mistakes]);

  useEffect(() => {
    if (!storageReady || !["learn", "practice", "review"].includes(view)) return;
    const recordActivity = (seconds: number) => {
      if (document.visibilityState !== "visible") return;
      setLearningStats((items) => {
        const next = {
          ...items,
          activeDates: items.activeDates.includes(localDate()) ? items.activeDates : [...items.activeDates, localDate()],
          totalSeconds: items.totalSeconds + seconds,
        };
        window.localStorage.setItem(LEARNING_STATS_KEY, JSON.stringify(next));
        return next;
      });
    };
    recordActivity(0);
    const timer = window.setInterval(() => recordActivity(10), 10000);
    return () => window.clearInterval(timer);
  }, [storageReady, view]);

  const progress =
    view === "practice"
      ? ((questionIndex + (selected ? 1 : 0)) / lesson.questions.length) * 100
      : (((deckIndex * 2 + round - 1) * words.length + cardIndex + (revealed ? 1 : 0)) /
          (lesson.decks.length * 2 * words.length)) *
        100;

  const options = useMemo(
    () => shuffle(currentQuestion?.options ?? []),
    [lessonId, questionIndex, currentQuestion],
  );

  function startLesson(id: number) {
    const storedSession = savedSessions[id];
    if (storedSession) {
      restoreSession(storedSession);
      return;
    }
    setLessonId(id);
    setDeckIndex(0);
    setRound(1);
    setCardIndex(0);
    setQuestionIndex(0);
    setScore(0);
    setMistakes([]);
    setSelected(null);
    setRevealed(false);
    setView("learn");
  }

  function storeCardProgress(updater: (items: Record<string, CardProgress>) => Record<string, CardProgress>) {
    setCardProgress((items) => {
      const next = updater(items);
      window.localStorage.setItem(CARD_PROGRESS_KEY, JSON.stringify(next));
      return next;
    });
  }

  function storeLearningStats(updater: (items: LearningStats) => LearningStats) {
    setLearningStats((items) => {
      const next = updater(items);
      window.localStorage.setItem(LEARNING_STATS_KEY, JSON.stringify(next));
      return next;
    });
  }

  function rateLearningCard(remembered: boolean) {
    const forwardId = wordCardId(lesson.id, deckIndex, cardIndex, "ar-ru");
    const reverseId = wordCardId(lesson.id, deckIndex, cardIndex, "ru-ar");
    storeCardProgress((items) => ({
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
    storeCardProgress((items) => ({
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

  function exportProgress() {
    const payload = {
      format: "shifahiya-progress",
      version: 1,
      exportedAt: new Date().toISOString(),
      scores: savedScores,
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
      const sessions = payload.sessions ?? {};
      const cards = payload.cards ?? {};
      const stats = { ...EMPTY_STATS, ...(payload.stats ?? {}) };
      Object.entries(scores).forEach(([id, value]) =>
        window.localStorage.setItem(`shifahiya-lesson-${id}`, String(value)),
      );
      Object.entries(sessions).forEach(([id, value]) =>
        window.localStorage.setItem(`shifahiya-session-${id}`, JSON.stringify(value)),
      );
      window.localStorage.setItem(CARD_PROGRESS_KEY, JSON.stringify(cards));
      window.localStorage.setItem(LEARNING_STATS_KEY, JSON.stringify(stats));
      setSavedScores(scores);
      setSavedSessions(sessions);
      setCardProgress(cards);
      setLearningStats(stats);
      setBackupMessage("Прогресс восстановлен.");
    } catch {
      setBackupMessage("Не удалось прочитать файл прогресса.");
    }
  }

  function nextCard() {
    if (cardIndex < words.length - 1) {
      setCardIndex((value) => value + 1);
    } else if (round === 1) {
      setRound(2);
      setCardIndex(0);
    } else if (deckIndex < lesson.decks.length - 1) {
      setDeckIndex((value) => value + 1);
      setRound(1);
      setCardIndex(0);
    } else {
      setQuestionIndex(0);
      setSelected(null);
      setScore(0);
      setMistakes([]);
      setView("practice");
    }
    setRevealed(false);
  }

  function answer(option: string) {
    if (selected) return;
    setSelected(option);
    if (option === currentQuestion.answer) {
      setScore((value) => value + 1);
      const isPhrase = currentQuestion.prompt.trim().split(/\s+/).length > 1 ||
        currentQuestion.answer.trim().split(/\s+/).length > 1;
      if (isPhrase) {
        const phraseId = `lesson-${lesson.id}-question-${questionIndex}`;
        storeLearningStats((items) => ({
          ...items,
          masteredPhrases: items.masteredPhrases.includes(phraseId)
            ? items.masteredPhrases
            : [...items.masteredPhrases, phraseId],
        }));
      }
    } else setMistakes((items) => [...items, currentQuestion.prompt]);
  }

  function nextQuestion() {
    if (questionIndex < lesson.questions.length - 1) {
      setQuestionIndex((value) => value + 1);
      setSelected(null);
      return;
    }
    window.localStorage.setItem(`shifahiya-lesson-${lesson.id}`, String(score));
    window.localStorage.removeItem("shifahiya-active-session");
    window.localStorage.removeItem(`shifahiya-session-${lesson.id}`);
    setSavedScores((items) => ({ ...items, [lesson.id]: score }));
    setSavedSessions((items) => {
      const next = { ...items };
      delete next[lesson.id];
      return next;
    });
    setView("result");
  }

  function resetLesson() {
    window.localStorage.removeItem(`shifahiya-lesson-${lesson.id}`);
    window.localStorage.removeItem("shifahiya-active-session");
    window.localStorage.removeItem(`shifahiya-session-${lesson.id}`);
    setSavedScores((items) => {
      const next = { ...items };
      delete next[lesson.id];
      return next;
    });
    setSavedSessions((items) => {
      const next = { ...items };
      delete next[lesson.id];
      return next;
    });
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
          <div className="track"><span style={{ width: `${Math.min(progress, 100)}%` }} /></div>
          <span className="counter">
            {view === "learn"
              ? `${cardIndex + 1}/${words.length}`
              : view === "review"
                ? `${Math.min(reviewIndex + 1, reviewQueue.length)}/${reviewQueue.length}`
                : `${questionIndex + 1}/${lesson.questions.length}`}
          </span>
        </div>
      )}

      {view === "home" && (
        <section className="home-view">
          <div className="eyebrow">Ваш путь · 44 из 100 уроков готовы</div>
          <h1>Учимся через<br /><em>повторение и практику</em></h1>
          <p className="lead">Каждая форма встречается дважды в карточках, затем возвращается в переводах и предложениях. Второй урок продолжает первый и вводит женский род.</p>

          <div className="daily-review">
            <div>
              <span className="daily-icon">◷</span>
              <div>
                <strong>{dueCards.length ? `${dueCards.length} карточек на сегодня` : "Всё повторено на сегодня"}</strong>
                <small>{dueCards.length ? `Около ${Math.max(1, Math.ceil(dueCards.length / 4))} мин · трудные формы вернутся в очередь` : `${learnedCards} направлений уже в памяти`}</small>
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
            <span>Прогресс хранится на этом устройстве</span>
            <div>
              <button className="text-button" onClick={exportProgress}>Сохранить копию</button>
              <button className="text-button" onClick={() => importInput.current?.click()}>Восстановить</button>
              <input ref={importInput} type="file" accept="application/json" onChange={importProgress} hidden />
            </div>
            {backupMessage && <small>{backupMessage}</small>}
          </div>

          <div className="lesson-list">
            {lessons.map((item) => {
              const saved = savedScores[item.id];
              const unfinished = savedSessions[item.id];
              return (
                <div className="lesson-card" key={item.id}>
                  <div className="lesson-number">{String(item.id).padStart(2, "0")}</div>
                  <div className="lesson-copy">
                    <div className="lesson-label">Урок {item.id} · <span dir="rtl">{item.arabicTitle}</span></div>
                    <h2>{item.title}</h2>
                    <p>{item.description}</p>
                    <div className="chips">{item.tags.map((tag) => <span key={tag}>{tag}</span>)}</div>
                  </div>
                  <button className="primary" onClick={() => startLesson(item.id)}>
                    {unfinished ? "Продолжить" : saved === undefined ? "Начать урок" : "Повторить"} <span>→</span>
                  </button>
                  {saved !== undefined && <div className="card-score">✓ {saved}/{item.questions.length}</div>}
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

      {view === "learn" && (
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
          <div className="study-actions">
            {!reviewRevealed ? (
              <button className="primary wide" onClick={() => setReviewRevealed(true)}>Показать ответ</button>
            ) : (
              <>
                <button className="secondary" onClick={() => rateReviewCard(false)}>Не вспомнил</button>
                <button className="primary" onClick={() => rateReviewCard(true)}>Вспомнил <span>→</span></button>
              </>
            )}
          </div>
        </section>
      )}

      {view === "practice" && (
        <section className="practice-view">
          <div className="stage-label"><span>3</span>Закрепляем в заданиях</div>
          <div className="repeat-badge active">Слова возвращаются в обе стороны перевода</div>
          <p className="instruction">{questionIndex === lesson.questions.length - 1 ? "Найдите и исправьте ошибку" : "Выберите правильный ответ"}</p>
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
                  <span dir={/[\u0600-\u06FF]/.test(option) ? "rtl" : "ltr"}>{option}</span>
                  {state === "correct" && <b>✓</b>}{state === "wrong" && <b>×</b>}
                </button>
              );
            })}
          </div>
          {selected && (
            <div className={`feedback ${selected === currentQuestion.answer ? "good" : "bad"}`}>
              <div><strong>{selected === currentQuestion.answer ? "Верно!" : "Почти получилось"}</strong><p>{currentQuestion.explanation}</p></div>
              <button className="primary" onClick={nextQuestion}>{questionIndex === lesson.questions.length - 1 ? "Результат" : "Дальше"} <span>→</span></button>
            </div>
          )}
        </section>
      )}

      {view === "result" && (
        <section className="result-view">
          <div className="result-mark">✓</div>
          <div className="eyebrow">Урок {lesson.id} завершён</div>
          <h1>{score >= Math.ceil(lesson.questions.length * 0.75) ? "Материал закреплён!" : "Хороший результат"}</h1>
          <p>{score >= Math.ceil(lesson.questions.length * 0.75) ? "Вы дважды повторили формы и применили их в предложениях. Завтра они вернутся в коротком повторении." : "Ошибочные формы стоит пройти ещё раз — повторение займёт всего несколько минут."}</p>
          <div className="result-grid">
            <div><strong>{score}/{lesson.questions.length}</strong><span>верных ответов</span></div>
            <div><strong>{Math.round((score / lesson.questions.length) * 100)}%</strong><span>точность</span></div>
            <div><strong>{mistakes.length}</strong><span>форм повторить</span></div>
          </div>
          <div className="review-note"><span>◷</span><div><strong>Следующее повторение — завтра</strong><small>Слова, фразы и ваши ошибки · около 3 минут</small></div></div>
          <div className="result-actions">
            <button className="secondary" onClick={resetLesson}>Сбросить результат</button>
            {lesson.id < lessons.length
              ? <button className="primary" onClick={() => startLesson(lesson.id + 1)}>Перейти к уроку {lesson.id + 1} <span>→</span></button>
              : <button className="primary" onClick={() => setView("home")}>Вернуться к курсу <span>→</span></button>}
          </div>
        </section>
      )}

      <footer><span>Учимся осмысленно, повторяем вовремя</span><span lang="ar" dir="rtl">العِلْمُ بِالتَّعَلُّمِ</span></footer>
    </main>
  );
}
