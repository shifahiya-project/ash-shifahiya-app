"use client";

import { useEffect, useMemo, useState } from "react";

type Word = { arabic: string; russian: string; note?: string };
type Question = {
  prompt: string;
  promptLang: "ar" | "ru";
  answer: string;
  options: string[];
  explanation: string;
};
type Lesson = {
  id: number;
  arabicTitle: string;
  title: string;
  description: string;
  tags: string[];
  decks: { title: string; words: Word[] }[];
  questions: Question[];
};

const lessonOne: Lesson = {
  id: 1,
  arabicTitle: "الدَّرْسُ الأَوَّلُ",
  title: "Он большой. Мы высокие.",
  description: "14 форм · 2 круга повторения · 12 заданий",
  tags: ["Местоимения", "Число", "Первые фразы"],
  decks: [
    {
      title: "Местоимения мужского рода",
      words: [
        { arabic: "هُوَ", russian: "он", note: "мужской род" },
        { arabic: "هُمْ", russian: "они", note: "мужской род" },
        { arabic: "أَنْتَ", russian: "ты", note: "мужской род" },
        { arabic: "أَنْتُمْ", russian: "вы", note: "мужской род" },
        { arabic: "أَنَا", russian: "я" },
        { arabic: "نَحْنُ", russian: "мы" },
      ],
    },
    {
      title: "Признаки: один и несколько",
      words: [
        { arabic: "كَبِيرٌ", russian: "большой" },
        { arabic: "كِبَارٌ", russian: "большие" },
        { arabic: "صَغِيرٌ", russian: "маленький" },
        { arabic: "صِغَارٌ", russian: "маленькие" },
        { arabic: "طَوِيلٌ", russian: "высокий / длинный" },
        { arabic: "طِوَالٌ", russian: "высокие / длинные" },
        { arabic: "قَصِيرٌ", russian: "невысокий / короткий" },
        { arabic: "قِصَارٌ", russian: "невысокие / короткие" },
      ],
    },
  ],
  questions: [
    { prompt: "هُوَ", promptLang: "ar", answer: "он", options: ["он", "они", "мы"], explanation: "هُوَ — «он», местоимение мужского рода." },
    { prompt: "мы", promptLang: "ru", answer: "نَحْنُ", options: ["نَحْنُ", "أَنَا", "أَنْتُمْ"], explanation: "نَحْنُ означает «мы»." },
    { prompt: "كِبَارٌ", promptLang: "ar", answer: "большие", options: ["большие", "маленькие", "большой"], explanation: "كِبَارٌ — форма множественного числа: «большие»." },
    { prompt: "Ты", promptLang: "ru", answer: "أَنْتَ", options: ["أَنْتَ", "أَنَا", "هُوَ"], explanation: "أَنْتَ — «ты» при обращении к мужчине." },
    { prompt: "هُوَ كَبِيرٌ", promptLang: "ar", answer: "Он большой", options: ["Он большой", "Они большие", "Он маленький"], explanation: "В настоящем времени связка «есть» не ставится." },
    { prompt: "Они маленькие", promptLang: "ru", answer: "هُمْ صِغَارٌ", options: ["هُمْ صِغَارٌ", "هُوَ صَغِيرٌ", "نَحْنُ صِغَارٌ"], explanation: "هُمْ — «они», صِغَارٌ — «маленькие»." },
    { prompt: "أَنْتَ طَوِيلٌ", promptLang: "ar", answer: "Ты высокий", options: ["Ты высокий", "Вы высокие", "Я высокий"], explanation: "أَنْتَ — «ты», طَوِيلٌ — «высокий»." },
    { prompt: "Мы невысокие", promptLang: "ru", answer: "نَحْنُ قِصَارٌ", options: ["نَحْنُ قِصَارٌ", "نَحْنُ طِوَالٌ", "هُمْ قِصَارٌ"], explanation: "نَحْنُ — «мы», قِصَارٌ — множественное число." },
    { prompt: "أَنَا صَغِيرٌ", promptLang: "ar", answer: "Я маленький", options: ["Я маленький", "Мы маленькие", "Он маленький"], explanation: "أَنَا означает «я»." },
    { prompt: "Вы большие", promptLang: "ru", answer: "أَنْتُمْ كِبَارٌ", options: ["أَنْتُمْ كِبَارٌ", "هُمْ كِبَارٌ", "أَنْتَ كَبِيرٌ"], explanation: "أَنْتُمْ — «вы», поэтому нужен признак во множественном числе." },
    { prompt: "هُمْ طِوَالٌ", promptLang: "ar", answer: "Они высокие", options: ["Они высокие", "Они невысокие", "Он высокий"], explanation: "هُمْ — «они», طِوَالٌ — «высокие»." },
    { prompt: "هُمْ كَبِيرٌ", promptLang: "ar", answer: "هُمْ كِبَارٌ", options: ["هُمْ كِبَارٌ", "هُوَ كَبِيرٌ", "هُمْ صِغَارٌ"], explanation: "После هُمْ нужна форма множественного числа كِبَارٌ." },
  ],
};

const lessonTwo: Lesson = {
  id: 2,
  arabicTitle: "الدَّرْسُ الثَّانِي",
  title: "Она большая. Они маленькие.",
  description: "14 форм · 2 круга повторения · 12 заданий",
  tags: ["Женский род", "Согласование", "Перевод"],
  decks: [
    {
      title: "Местоимения женского рода",
      words: [
        { arabic: "هِيَ", russian: "она", note: "женский род" },
        { arabic: "هُنَّ", russian: "они", note: "женский род" },
        { arabic: "أَنْتِ", russian: "ты", note: "женский род" },
        { arabic: "أَنْتُنَّ", russian: "вы", note: "женский род" },
        { arabic: "أَنَا", russian: "я" },
        { arabic: "نَحْنُ", russian: "мы" },
      ],
    },
    {
      title: "Женские формы признаков",
      words: [
        { arabic: "كَبِيرَةٌ", russian: "большая" },
        { arabic: "كَبِيرَاتٌ", russian: "большие", note: "женский род" },
        { arabic: "صَغِيرَةٌ", russian: "маленькая" },
        { arabic: "صَغِيرَاتٌ", russian: "маленькие", note: "женский род" },
        { arabic: "طَوِيلَةٌ", russian: "высокая / длинная" },
        { arabic: "طَوِيلَاتٌ", russian: "высокие / длинные", note: "женский род" },
        { arabic: "قَصِيرَةٌ", russian: "невысокая / короткая" },
        { arabic: "قَصِيرَاتٌ", russian: "невысокие / короткие", note: "женский род" },
      ],
    },
  ],
  questions: [
    { prompt: "هِيَ", promptLang: "ar", answer: "она", options: ["она", "они", "ты"], explanation: "هِيَ — «она»." },
    { prompt: "они (женщины)", promptLang: "ru", answer: "هُنَّ", options: ["هُنَّ", "هُمْ", "أَنْتُنَّ"], explanation: "هُنَّ используется, когда речь идёт о женщинах." },
    { prompt: "أَنْتِ", promptLang: "ar", answer: "ты (женщина)", options: ["ты (женщина)", "она", "вы (женщины)"], explanation: "أَنْتِ — обращение к одной женщине." },
    { prompt: "большая", promptLang: "ru", answer: "كَبِيرَةٌ", options: ["كَبِيرَةٌ", "كَبِيرَاتٌ", "صَغِيرَةٌ"], explanation: "Окончание ـة указывает здесь на женский род." },
    { prompt: "هِيَ كَبِيرَةٌ", promptLang: "ar", answer: "Она большая", options: ["Она большая", "Они большие", "Она маленькая"], explanation: "Местоимение и признак согласованы в женском роде." },
    { prompt: "Они большие", promptLang: "ru", answer: "هُنَّ كَبِيرَاتٌ", options: ["هُنَّ كَبِيرَاتٌ", "هِيَ كَبِيرَةٌ", "هُنَّ صَغِيرَاتٌ"], explanation: "Для группы женщин: هُنَّ كَبِيرَاتٌ." },
    { prompt: "أَنْتِ صَغِيرَةٌ", promptLang: "ar", answer: "Ты маленькая", options: ["Ты маленькая", "Вы маленькие", "Она маленькая"], explanation: "أَنْتِ — «ты» при обращении к женщине." },
    { prompt: "Вы высокие", promptLang: "ru", answer: "أَنْتُنَّ طَوِيلَاتٌ", options: ["أَنْتُنَّ طَوِيلَاتٌ", "هُنَّ طَوِيلَاتٌ", "أَنْتِ طَوِيلَةٌ"], explanation: "أَنْتُنَّ — «вы» при обращении к женщинам." },
    { prompt: "هِيَ قَصِيرَةٌ", promptLang: "ar", answer: "Она невысокая", options: ["Она невысокая", "Они невысокие", "Она высокая"], explanation: "قَصِيرَةٌ — женская форма слова «невысокий»." },
    { prompt: "Мы маленькие", promptLang: "ru", answer: "نَحْنُ صَغِيرَاتٌ", options: ["نَحْنُ صَغِيرَاتٌ", "هُنَّ صَغِيرَاتٌ", "نَحْنُ كَبِيرَاتٌ"], explanation: "В контексте женской группы используется صَغِيرَاتٌ." },
    { prompt: "هُنَّ طَوِيلَاتٌ", promptLang: "ar", answer: "Они высокие", options: ["Они высокие", "Они невысокие", "Она высокая"], explanation: "هُنَّ и طَوِيلَاتٌ стоят во множественном числе женского рода." },
    { prompt: "هُنَّ كَبِيرَةٌ", promptLang: "ar", answer: "هُنَّ كَبِيرَاتٌ", options: ["هُنَّ كَبِيرَاتٌ", "هِيَ كَبِيرَةٌ", "هُنَّ صَغِيرَاتٌ"], explanation: "После هُنَّ нужна форма множественного числа كَبِيرَاتٌ." },
  ],
};

const lessons = [lessonOne, lessonTwo];

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

  const lesson = lessons.find((item) => item.id === lessonId) ?? lessonOne;
  const deck = lesson.decks[deckIndex];
  const words = deck.words;
  const currentWord = words[cardIndex];
  const currentQuestion = lesson.questions[questionIndex];

  useEffect(() => {
    const scores: Record<number, number> = {};
    lessons.forEach((item) => {
      const stored = window.localStorage.getItem(`shifahiya-lesson-${item.id}`);
      if (stored !== null) scores[item.id] = Number(stored);
    });
    setSavedScores(scores);
  }, []);

  const progress =
    view === "practice"
      ? ((questionIndex + (selected ? 1 : 0)) / lesson.questions.length) * 100
      : (((deckIndex * 2 + round - 1) * words.length + cardIndex + (revealed ? 1 : 0)) /
          (lesson.decks.length * 2 * words.length)) *
        100;

  const options = useMemo(() => currentQuestion?.options ?? [], [currentQuestion]);

  function startLesson(id: number) {
    setLessonId(id);
    setDeckIndex(0);
    setRound(1);
    setCardIndex(0);
    setRevealed(false);
    setView("learn");
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
    if (option === currentQuestion.answer) setScore((value) => value + 1);
    else setMistakes((items) => [...items, currentQuestion.prompt]);
  }

  function nextQuestion() {
    if (questionIndex < lesson.questions.length - 1) {
      setQuestionIndex((value) => value + 1);
      setSelected(null);
      return;
    }
    window.localStorage.setItem(`shifahiya-lesson-${lesson.id}`, String(score));
    setSavedScores((items) => ({ ...items, [lesson.id]: score }));
    setView("result");
  }

  function resetLesson() {
    window.localStorage.removeItem(`shifahiya-lesson-${lesson.id}`);
    setSavedScores((items) => {
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
        <div className="streak" title="Серия занятий"><span>✦</span> 1 день</div>
      </header>

      {view !== "home" && view !== "result" && (
        <div className="lesson-progress" aria-label="Прогресс урока">
          <button className="close" onClick={() => setView("home")} aria-label="Закрыть урок">×</button>
          <div className="track"><span style={{ width: `${Math.min(progress, 100)}%` }} /></div>
          <span className="counter">
            {view === "learn" ? `${cardIndex + 1}/${words.length}` : `${questionIndex + 1}/${lesson.questions.length}`}
          </span>
        </div>
      )}

      {view === "home" && (
        <section className="home-view">
          <div className="eyebrow">Ваш путь · 2 из 100 уроков готовы</div>
          <h1>Учимся через<br /><em>повторение и практику</em></h1>
          <p className="lead">Каждая форма встречается дважды в карточках, затем возвращается в переводах и предложениях. Второй урок продолжает первый и вводит женский род.</p>

          <div className="lesson-list">
            {lessons.map((item) => {
              const saved = savedScores[item.id];
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
                    {saved === undefined ? "Начать урок" : "Повторить"} <span>→</span>
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
              <><button className="secondary" onClick={nextCard}>Пока трудно</button><button className="primary" onClick={nextCard}>Запомнил <span>→</span></button></>
            )}
          </div>
          <button className="text-button" onClick={() => speak(currentWord.arabic)}>Прослушать ещё раз</button>
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
          <h1>{score >= 9 ? "Материал закреплён!" : "Хороший результат"}</h1>
          <p>{score >= 9 ? "Вы дважды повторили формы и применили их в предложениях. Завтра они вернутся в коротком повторении." : "Ошибочные формы стоит пройти ещё раз — повторение займёт всего несколько минут."}</p>
          <div className="result-grid">
            <div><strong>{score}/{lesson.questions.length}</strong><span>верных ответов</span></div>
            <div><strong>{Math.round((score / lesson.questions.length) * 100)}%</strong><span>точность</span></div>
            <div><strong>{mistakes.length}</strong><span>форм повторить</span></div>
          </div>
          <div className="review-note"><span>◷</span><div><strong>Следующее повторение — завтра</strong><small>Слова, фразы и ваши ошибки · около 3 минут</small></div></div>
          <div className="result-actions">
            <button className="secondary" onClick={resetLesson}>Сбросить результат</button>
            {lesson.id === 1
              ? <button className="primary" onClick={() => startLesson(2)}>Перейти к уроку 2 <span>→</span></button>
              : <button className="primary" onClick={() => setView("home")}>Вернуться к курсу <span>→</span></button>}
          </div>
        </section>
      )}

      <footer><span>Учимся осмысленно, повторяем вовремя</span><span lang="ar" dir="rtl">العِلْمُ بِالتَّعَلُّمِ</span></footer>
    </main>
  );
}
