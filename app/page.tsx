"use client";

import { useEffect, useMemo, useState } from "react";

type Word = {
  arabic: string;
  russian: string;
  note?: string;
};

type Question = {
  prompt: string;
  promptLang: "ar" | "ru";
  answer: string;
  options: string[];
  explanation: string;
};

const pronouns: Word[] = [
  { arabic: "هُوَ", russian: "он", note: "мужской род" },
  { arabic: "هُمْ", russian: "они", note: "мужской род" },
  { arabic: "أَنْتَ", russian: "ты", note: "мужской род" },
  { arabic: "أَنْتُمْ", russian: "вы", note: "мужской род" },
  { arabic: "أَنَا", russian: "я" },
  { arabic: "نَحْنُ", russian: "мы" },
];

const adjectives: Word[] = [
  { arabic: "كَبِيرٌ", russian: "большой" },
  { arabic: "كِبَارٌ", russian: "большие" },
  { arabic: "صَغِيرٌ", russian: "маленький" },
  { arabic: "صِغَارٌ", russian: "маленькие" },
  { arabic: "طَوِيلٌ", russian: "высокий / длинный" },
  { arabic: "طِوَالٌ", russian: "высокие / длинные" },
  { arabic: "قَصِيرٌ", russian: "невысокий / короткий" },
  { arabic: "قِصَارٌ", russian: "невысокие / короткие" },
];

const questions: Question[] = [
  {
    prompt: "هُوَ",
    promptLang: "ar",
    answer: "он",
    options: ["он", "они", "мы"],
    explanation: "هُوَ — «он», местоимение мужского рода.",
  },
  {
    prompt: "мы",
    promptLang: "ru",
    answer: "نَحْنُ",
    options: ["نَحْنُ", "أَنَا", "أَنْتُمْ"],
    explanation: "نَحْنُ означает «мы».",
  },
  {
    prompt: "كِبَارٌ",
    promptLang: "ar",
    answer: "большие",
    options: ["большие", "маленькие", "большой"],
    explanation: "كِبَارٌ — форма множественного числа: «большие».",
  },
  {
    prompt: "هُوَ كَبِيرٌ",
    promptLang: "ar",
    answer: "Он большой",
    options: ["Он большой", "Они большие", "Он маленький"],
    explanation: "В настоящем времени арабская фраза обходится без связки «есть».",
  },
  {
    prompt: "Они маленькие",
    promptLang: "ru",
    answer: "هُمْ صِغَارٌ",
    options: ["هُمْ صِغَارٌ", "هُوَ صَغِيرٌ", "نَحْنُ صِغَارٌ"],
    explanation: "هُمْ — «они», صِغَارٌ — «маленькие».",
  },
  {
    prompt: "أَنْتَ طَوِيلٌ",
    promptLang: "ar",
    answer: "Ты высокий",
    options: ["Ты высокий", "Вы высокие", "Я высокий"],
    explanation: "أَنْتَ — «ты» при обращении к мужчине.",
  },
  {
    prompt: "Мы невысокие",
    promptLang: "ru",
    answer: "نَحْنُ قِصَارٌ",
    options: ["نَحْنُ قِصَارٌ", "نَحْنُ طِوَالٌ", "هُمْ قِصَارٌ"],
    explanation: "نَحْنُ — «мы», قِصَارٌ — форма множественного числа.",
  },
  {
    prompt: "هُمْ كَبِيرٌ",
    promptLang: "ar",
    answer: "هُمْ كِبَارٌ",
    options: ["هُمْ كِبَارٌ", "هُوَ كَبِيرٌ", "هُمْ صِغَارٌ"],
    explanation: "После هُمْ нужна форма множественного числа كِبَارٌ.",
  },
];

function speak(text: string) {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = "ar-SA";
  utterance.rate = 0.72;
  window.speechSynthesis.speak(utterance);
}

export default function Home() {
  const [view, setView] = useState<"home" | "learn" | "practice" | "result">("home");
  const [deck, setDeck] = useState<"pronouns" | "adjectives">("pronouns");
  const [cardIndex, setCardIndex] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const [questionIndex, setQuestionIndex] = useState(0);
  const [selected, setSelected] = useState<string | null>(null);
  const [score, setScore] = useState(0);
  const [mistakes, setMistakes] = useState<string[]>([]);
  const [savedScore, setSavedScore] = useState<number | null>(null);

  useEffect(() => {
    const stored = window.localStorage.getItem("shifahiya-lesson-1");
    if (stored) setSavedScore(Number(stored));
  }, []);

  const words = deck === "pronouns" ? pronouns : adjectives;
  const currentWord = words[cardIndex];
  const currentQuestion = questions[questionIndex];
  const progress =
    view === "practice"
      ? ((questionIndex + (selected ? 1 : 0)) / questions.length) * 100
      : ((cardIndex + (revealed ? 1 : 0)) / words.length) * 100;

  const shuffledOptions = useMemo(
    () => currentQuestion?.options ?? [],
    [currentQuestion],
  );

  function startLesson() {
    setDeck("pronouns");
    setCardIndex(0);
    setRevealed(false);
    setView("learn");
  }

  function nextCard() {
    if (cardIndex < words.length - 1) {
      setCardIndex((value) => value + 1);
      setRevealed(false);
      return;
    }
    if (deck === "pronouns") {
      setDeck("adjectives");
      setCardIndex(0);
      setRevealed(false);
      return;
    }
    setQuestionIndex(0);
    setSelected(null);
    setScore(0);
    setMistakes([]);
    setView("practice");
  }

  function answer(option: string) {
    if (selected) return;
    setSelected(option);
    if (option === currentQuestion.answer) {
      setScore((value) => value + 1);
    } else {
      setMistakes((items) => [...items, currentQuestion.prompt]);
    }
  }

  function nextQuestion() {
    if (questionIndex < questions.length - 1) {
      setQuestionIndex((value) => value + 1);
      setSelected(null);
      return;
    }
    window.localStorage.setItem("shifahiya-lesson-1", String(score));
    setSavedScore(score);
    setView("result");
  }

  function resetLesson() {
    window.localStorage.removeItem("shifahiya-lesson-1");
    setSavedScore(null);
    setView("home");
  }

  return (
    <main className="app-shell">
      <header className="topbar">
        <button className="brand" onClick={() => setView("home")} aria-label="На главную">
          <span className="brand-mark">ش</span>
          <span>
            <strong>Аш-Шифахия</strong>
            <small>арабский шаг за шагом</small>
          </span>
        </button>
        <div className="streak" title="Серия занятий">
          <span>✦</span> 1 день
        </div>
      </header>

      {view !== "home" && view !== "result" && (
        <div className="lesson-progress" aria-label="Прогресс урока">
          <button className="close" onClick={() => setView("home")} aria-label="Закрыть урок">×</button>
          <div className="track"><span style={{ width: `${progress}%` }} /></div>
          <span className="counter">
            {view === "learn" ? `${cardIndex + 1}/${words.length}` : `${questionIndex + 1}/${questions.length}`}
          </span>
        </div>
      )}

      {view === "home" && (
        <section className="home-view">
          <div className="eyebrow">Ваш путь · 100 уроков</div>
          <h1>Начнём говорить<br /><em>простыми фразами</em></h1>
          <p className="lead">
            Первый урок знакомит с местоимениями и учит согласовывать их с признаками.
            Без перегрузки правилами — через понятные примеры.
          </p>

          <div className="lesson-card">
            <div className="lesson-number">01</div>
            <div className="lesson-copy">
              <div className="lesson-label">Урок первый · الدَّرْسُ الأَوَّلُ</div>
              <h2>Он большой. Мы высокие.</h2>
              <p>14 новых форм · 8 заданий · около 7 минут</p>
              <div className="chips">
                <span>Местоимения</span><span>Число</span><span>Первые фразы</span>
              </div>
            </div>
            <button className="primary" onClick={startLesson}>
              {savedScore === null ? "Начать урок" : "Пройти ещё раз"} <span>→</span>
            </button>
          </div>

          {savedScore !== null && (
            <div className="resume">
              <span className="resume-icon">✓</span>
              <div><strong>Урок уже пройден</strong><small>Ваш лучший результат на этом устройстве</small></div>
              <b>{savedScore}/{questions.length}</b>
            </div>
          )}

          <div className="principle">
            <span className="quote">“</span>
            <p>Сначала узнайте слово. Затем вспомните его сами. После — используйте во фразе.</p>
          </div>
        </section>
      )}

      {view === "learn" && (
        <section className="study-view">
          <div className="stage-label">
            <span>{deck === "pronouns" ? "1" : "2"}</span>
            {deck === "pronouns" ? "Знакомимся с местоимениями" : "Добавляем признаки"}
          </div>
          <p className="instruction">
            {revealed ? "Прочитайте перевод и повторите слово вслух" : "Попробуйте вспомнить значение"}
          </p>

          <article className={`word-card ${revealed ? "is-revealed" : ""}`}>
            <div className="card-ornament">•</div>
            <button className="sound" onClick={() => speak(currentWord.arabic)} aria-label="Прослушать произношение">◖))</button>
            <div className="arabic-word" lang="ar" dir="rtl">{currentWord.arabic}</div>
            <div className="divider" />
            {revealed ? (
              <div className="translation">
                <strong>{currentWord.russian}</strong>
                {currentWord.note && <small>{currentWord.note}</small>}
              </div>
            ) : (
              <div className="hidden-translation">перевод скрыт</div>
            )}
          </article>

          <div className="study-actions">
            {!revealed ? (
              <button className="primary wide" onClick={() => setRevealed(true)}>Показать перевод</button>
            ) : (
              <>
                <button className="secondary" onClick={nextCard}>Пока трудно</button>
                <button className="primary" onClick={nextCard}>Запомнил <span>→</span></button>
              </>
            )}
          </div>
          <button className="text-button" onClick={() => speak(currentWord.arabic)}>Прослушать ещё раз</button>
        </section>
      )}

      {view === "practice" && (
        <section className="practice-view">
          <div className="stage-label"><span>3</span>Проверяем себя</div>
          <p className="instruction">
            {questionIndex === questions.length - 1 ? "Найдите и исправьте ошибку" : "Выберите правильный перевод"}
          </p>
          <div className="prompt-card">
            <span>{currentQuestion.promptLang === "ar" ? "Арабский" : "Русский"}</span>
            <strong className={currentQuestion.promptLang === "ar" ? "arabic-prompt" : ""} dir={currentQuestion.promptLang === "ar" ? "rtl" : "ltr"}>
              {currentQuestion.prompt}
            </strong>
            {currentQuestion.promptLang === "ar" && (
              <button className="mini-sound" onClick={() => speak(currentQuestion.prompt)} aria-label="Прослушать">◖))</button>
            )}
          </div>
          <div className="options">
            {shuffledOptions.map((option) => {
              const state = selected
                ? option === currentQuestion.answer
                  ? "correct"
                  : option === selected
                    ? "wrong"
                    : "dimmed"
                : "";
              return (
                <button key={option} className={state} onClick={() => answer(option)} disabled={!!selected}>
                  <span dir={/[\u0600-\u06FF]/.test(option) ? "rtl" : "ltr"}>{option}</span>
                  {state === "correct" && <b>✓</b>}
                  {state === "wrong" && <b>×</b>}
                </button>
              );
            })}
          </div>
          {selected && (
            <div className={`feedback ${selected === currentQuestion.answer ? "good" : "bad"}`}>
              <div>
                <strong>{selected === currentQuestion.answer ? "Верно!" : "Почти получилось"}</strong>
                <p>{currentQuestion.explanation}</p>
              </div>
              <button className="primary" onClick={nextQuestion}>
                {questionIndex === questions.length - 1 ? "Результат" : "Дальше"} <span>→</span>
              </button>
            </div>
          )}
        </section>
      )}

      {view === "result" && (
        <section className="result-view">
          <div className="result-mark">✓</div>
          <div className="eyebrow">Урок завершён</div>
          <h1>{score >= 6 ? "Отличное начало!" : "Хороший первый шаг"}</h1>
          <p>
            {score >= 6
              ? "Вы уверенно узнаёте основные формы. Короткое повторение поможет сохранить их в памяти."
              : "Некоторые формы пока путаются — это нормально. Они вернутся в следующем повторении."}
          </p>
          <div className="result-grid">
            <div><strong>{score}/{questions.length}</strong><span>верных ответов</span></div>
            <div><strong>{Math.round((score / questions.length) * 100)}%</strong><span>точность</span></div>
            <div><strong>{mistakes.length}</strong><span>форм повторить</span></div>
          </div>
          <div className="review-note">
            <span>◷</span>
            <div><strong>Следующее повторение — завтра</strong><small>5 коротких заданий · около 2 минут</small></div>
          </div>
          <div className="result-actions">
            <button className="secondary" onClick={resetLesson}>Сбросить результат</button>
            <button className="primary" onClick={() => setView("home")}>Вернуться к курсу <span>→</span></button>
          </div>
        </section>
      )}

      <footer>
        <span>Учимся осмысленно, повторяем вовремя</span>
        <span lang="ar" dir="rtl">العِلْمُ بِالتَّعَلُّمِ</span>
      </footer>
    </main>
  );
}
