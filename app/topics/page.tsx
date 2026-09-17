"use client";

import { Fragment, useMemo, useState, useSyncExternalStore } from "react";
import { plural, seededShuffle } from "../../content/questions";
import { TOPIC_BOOKS, TOPIC_SUMMARIES, topicById } from "../../content/topics/catalog";
import { isDrill, stepUnits, type Atom, type Topic, type TopicStep, type TopicUnit } from "../../content/topics/types";
import { examPassMark } from "../lesson-access";
import { todayStore } from "../podcast-store";
import { buildTask, taskSeed } from "../topic-drills";
import {
  LAST_TOPIC_BOX,
  TOPIC_INTERVALS,
  cardKey,
  dueUnitIds,
  gradeFromRecall,
  modeFor,
  topicProgress,
  type TopicCard,
  type TopicGrade,
} from "../topic-schedule";
import { stepKey, topicStore } from "../topic-store";

/** The three answers the learner gives about their own recall. */
const GRADES: { grade: TopicGrade; label: string; className: string }[] = [
  { grade: "again", label: "Не вспомнил", className: "again" },
  { grade: "hard", label: "С трудом", className: "hard" },
  { grade: "good", label: "Вспомнил", className: "good" },
];

/** The colour a grade is shown in: half a list is neither a win nor a loss. */
/**
 * A place where the book did not add up, kept out of the way until asked for:
 * the answer stays the book's, and the remark waits behind a «?».
 */
function CheckMark({ text }: { text: string }) {
  const [open, setOpen] = useState(false);
  return (
    <span className="topic-check">
      <button type="button" aria-expanded={open} onClick={() => setOpen(!open)} title="Расхождение в книге">
        ?
      </button>
      {open && <span className="topic-check-text">{text}</span>}
    </span>
  );
}

function toneOf(grade: TopicGrade) {
  return grade === "good" ? "good" : grade === "hard" ? "plain" : "bad";
}

type SessionStats = { good: number; hard: number; again: number };

type Session = {
  topicId: string;
  mode: "learn" | "review";
  /** The step being worked through, when this is a first pass. */
  stepId?: string;
  queue: string[];
  index: number;
  stats: SessionStats;
};

type ExamMark = "full" | "part" | "none";

type ExamRun = { topicId: string; index: number; marks: Record<string, ExamMark> };

type ExamOutcome = { topicId: string; score: number; total: number; passed: boolean; missed: string[]; returned: number };

function unitsOf(topic: Topic) {
  return topic.steps.flatMap(stepUnits);
}

function atomById(topic: Topic, id: string) {
  for (const step of topic.steps) {
    const found = step.atoms.find((atom) => atom.id === id);
    if (found) return found;
  }
  return undefined;
}

/** «через 3 дня», as the schedule promises it after this answer. */
function nextIn(box: number) {
  const days = TOPIC_INTERVALS[Math.min(box, LAST_TOPIC_BOX)];
  if (days === 0) return "сегодня же";
  return `через ${plural(days, "день", "дня", "дней")}`;
}

export default function TopicsPage() {
  const state = useSyncExternalStore(
    topicStore.subscribe,
    topicStore.getSnapshot,
    topicStore.getServerSnapshot,
  );
  // The date is a shared external store: the server does not know the learner's
  // timezone, and a tab left open overnight has to roll over on its own. A
  // second store of the same kind would drift from the first at midnight.
  const today = useSyncExternalStore(
    todayStore.subscribe,
    todayStore.getSnapshot,
    todayStore.getServerSnapshot,
  );

  const [openId, setOpenId] = useState<string | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [finished, setFinished] = useState<(Session & { units: number }) | null>(null);
  const [exam, setExam] = useState<ExamRun | null>(null);
  const [examOutcome, setExamOutcome] = useState<ExamOutcome | null>(null);

  const topic = openId ? topicById(openId) : undefined;
  const summary = TOPIC_SUMMARIES.find((item) => item.id === openId);

  const units = useMemo(() => (topic ? unitsOf(topic) : []), [topic]);
  const unitById = useMemo(() => new Map(units.map((unit) => [unit.id, unit])), [units]);

  const progress = topic && summary
    ? topicProgress(state.cards, topic.id, summary.unitIds, today)
    : undefined;

  function startStep(item: Topic, step: TopicStep) {
    setSession({
      topicId: item.id,
      mode: "learn",
      stepId: step.id,
      queue: stepUnits(step).map((unit) => unit.id),
      index: 0,
      stats: { good: 0, hard: 0, again: 0 },
    });
  }

  function startReview(item: Topic, ids: string[]) {
    // Shuffled by the day, so the queue is not asked in the same order every
    // time — an answer remembered by its position in a list is not remembered.
    setSession({
      topicId: item.id,
      mode: "review",
      queue: seededShuffle(ids, ids.length + today.length + Number(today.replaceAll("-", ""))),
      index: 0,
      stats: { good: 0, hard: 0, again: 0 },
    });
  }

  function grade(unitId: string, value: TopicGrade) {
    if (!session) return;
    topicStore.grade(session.topicId, unitId, value);

    // A unit that did not come back is asked again before the session ends:
    // leaving today with it still unrecalled is how a topic quietly rots.
    const queue = value === "again" ? [...session.queue, unitId] : session.queue;
    const next: Session = {
      ...session,
      queue,
      index: session.index + 1,
      stats: { ...session.stats, [value]: session.stats[value] + 1 },
    };

    if (next.index >= next.queue.length) {
      if (next.mode === "learn" && next.stepId) topicStore.markStep(next.topicId, next.stepId);
      setSession(null);
      setFinished({ ...next, units: new Set(next.queue).size });
      return;
    }
    setSession(next);
  }

  function markExam(item: Topic, mark: ExamMark) {
    if (!exam) return;
    const question = item.exam.questions[exam.index];
    // The effect on the cards is applied as the question is answered rather
    // than at the end: an exam abandoned halfway has still done its work.
    if (mark === "none") topicStore.resetUnits(item.id, question.atoms);
    if (mark === "part") topicStore.demoteUnits(item.id, question.atoms);

    const marks = { ...exam.marks, [question.id]: mark };
    const index = exam.index + 1;
    if (index >= item.exam.questions.length) {
      const score = Object.values(marks).filter((value) => value === "full").length;
      const total = item.exam.questions.length;
      const passed = score >= examPassMark(total);
      const missed = item.exam.questions.filter((q) => marks[q.id] !== "full").map((q) => q.id);
      const returned = new Set(
        item.exam.questions.filter((q) => marks[q.id] === "none").flatMap((q) => q.atoms),
      ).size;
      topicStore.saveExam(item.id, score, total, passed);
      setExam(null);
      setExamOutcome({ topicId: item.id, score, total, passed, missed, returned });
      return;
    }
    setExam({ ...exam, index, marks });
  }

  const dueIds = topic && summary ? dueUnitIds(state.cards, topic.id, summary.unitIds, today) : [];

  return (
    <main className="app-shell">
      <header className="topbar">
        {/* A plain link, not next/link, and deliberately so: the site is static
            files under a subdirectory, where client-side navigation would fetch
            an RSC payload that nothing serves. The static build rewrites this
            href to a relative one. */}
        {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
        <a className="brand" href="/">
          <span className="brand-mark">ح</span>
          <span>
            <strong>Темы наизусть</strong>
            <small>разбор и повторение по книге</small>
          </span>
        </a>
        {progress && (
          <div className="streak" title="Фактов в памяти">
            <span>◆</span> {progress.seen} / {progress.total}
          </div>
        )}
      </header>

      {/* ——— Список тем ——— */}
      {!topic && (
        <section className="home-view topic-view">
          <p className="eyebrow">Отдельно от курса</p>
          <h1>Темы, которые нужно знать наизусть</h1>
          <p className="lead">
            Текст вы читаете по своей книге. Здесь — то, чего чтение не даёт: вопросы, которые
            заставляют вспомнить, расчёты по таблицам темы и расписание, по которому всё это
            возвращается, пока не останется в памяти.
          </p>

          <div className="lesson-list">
            {TOPIC_BOOKS.map((shelf) => (
              <Fragment key={shelf.book}>
                {/* Один заголовок на книгу вместо её названия на каждой карточке:
                    книга, разобранная по разделам, приходит сюда несколькими темами. */}
                <div className="book-divider">
                  <strong>{shelf.book}</strong>
                  <span>{plural(shelf.topics.length, "раздел", "раздела", "разделов")}</span>
                </div>
                {shelf.topics.map((item) => {
              const stats = topicProgress(state.cards, item.id, item.unitIds, today);
              const exists = topicById(item.id);
              return (
                <article key={item.id} className={`lesson-card topic-card${stats.seen ? " is-done" : ""}`}>
                  <div className="lesson-number">{stats.total ? Math.round((stats.seen / stats.total) * 100) : 0}%</div>
                  <div className="lesson-copy">
                    <h2>{item.title}</h2>
                    <p>{item.subtitle}</p>
                    <p className="topic-source">
                      {item.source.section} · с. {item.source.pages}
                    </p>
                    <div className="chips">
                      <span>{plural(item.steps, "занятие", "занятия", "занятий")}</span>
                      <span>{plural(item.facts, "факт", "факта", "фактов")}</span>
                      <span>{plural(item.drills, "расчёт", "расчёта", "расчётов")}</span>
                      {stats.due > 0 && <span className="is-due">к повторению: {stats.due}</span>}
                    </div>
                  </div>
                  <div className="lesson-actions">
                    <button className="primary" onClick={() => exists && setOpenId(item.id)}>
                      {stats.seen ? "Продолжить" : "Начать"} <span>→</span>
                    </button>
                  </div>
                </article>
              );
                })}
              </Fragment>
            ))}
          </div>

          <div className="principle">
            <span className="quote">“</span>
            <p>
              Новая тема — это новый файл в <code>content/topics/</code>: те же занятия, те же
              вопросы, то же расписание. Пришлите текст — и он станет темой рядом с этой.
            </p>
          </div>
        </section>
      )}

      {/* ——— Тема: занятия, повторение, зачёт ——— */}
      {topic && summary && progress && !session && !finished && !exam && !examOutcome && (() => {
        const stepsDone = topic.steps.filter((step) => state.steps[stepKey(topic.id, step.id)]).length;
        const examOpen = stepsDone === topic.steps.length;
        const result = state.exams[topic.id];
        return (
          <section className="home-view topic-view">
            <button className="text-button back" onClick={() => setOpenId(null)}>
              ← Все темы
            </button>
            <p className="eyebrow">
              {topic.source.section} · с. {topic.source.pages}
            </p>
            <h1>{topic.title}</h1>
            <p className="lead">{topic.intro}</p>
            {/* Книга, издание и то, чем эта тема не является: строка стоит здесь,
                а не на карточке списка, где нужно только имя книги. */}
            {topic.source.note && <p className="topic-note topic-imprint">{topic.source.note}</p>}

            <div className="stats-grid topic-stats">
              <div>
                <strong>{progress.seen}</strong>
                <span>разобрано из {progress.total}</span>
              </div>
              <div>
                <strong>{progress.due}</strong>
                <span>ждут повторения сегодня</span>
              </div>
              <div>
                <strong>{progress.mastered}</strong>
                <span>дошли до последней коробки</span>
              </div>
              <div>
                <strong>{progress.shaky}</strong>
                <span>терялись хотя бы раз</span>
              </div>
            </div>

            <div className="daily-review topic-due">
              <div>
                <span className="daily-icon">↻</span>
                <div>
                  <strong>
                    {dueIds.length
                      ? `${plural(dueIds.length, "вопрос", "вопроса", "вопросов")} на сегодня`
                      : "На сегодня всё повторено"}
                  </strong>
                  <small>
                    {dueIds.length
                      ? "Отвечайте вслух, потом сверяйтесь — оценка ставится по тому, что вспомнилось"
                      : progress.seen
                        ? "Следующие вернутся сами, когда придёт их день"
                        : "Начните с первого занятия — повторять пока нечего"}
                  </small>
                </div>
              </div>
              <button className="primary" onClick={() => startReview(topic, dueIds)} disabled={!dueIds.length}>
                {dueIds.length ? "Повторить" : "Готово ✓"}
              </button>
            </div>

            <div className="lesson-list">
              {topic.steps.map((step, index) => {
                const done = state.steps[stepKey(topic.id, step.id)];
                const stepIds = stepUnits(step).map((unit) => unit.id);
                const stepStats = topicProgress(state.cards, topic.id, stepIds, today);
                return (
                  <article key={step.id} className={`lesson-card${done ? " is-done" : ""}`}>
                    <div className="lesson-number">{index + 1}</div>
                    <div className="lesson-copy">
                      <h2>{step.title}</h2>
                      <p>
                        Книга, с. {step.pages} · {plural(step.atoms.length, "факт", "факта", "фактов")}
                        {step.drills?.length ? ` · ${plural(step.drills.length, "расчёт", "расчёта", "расчётов")}` : ""}
                      </p>
                      {stepStats.due > 0 && <p className="topic-source">К повторению: {stepStats.due}</p>}
                    </div>
                    <div className="lesson-actions">
                      {done && <div className="card-score">✓ {done}</div>}
                      <button className={done ? "secondary" : "primary"} onClick={() => startStep(topic, step)}>
                        {done ? "Пройти заново" : "Разобрать"} <span>→</span>
                      </button>
                    </div>
                  </article>
                );
              })}

              {/* Зачёт — вопросы самой книги, и ни одного своего. Раздел, по
                  которому книга их не даёт, карточки зачёта не получает: иначе
                  она предлагала бы работу из нуля вопросов с проходным баллом,
                  выведенным из нуля. */}
              {topic.exam.questions.length > 0 && (
              <article className={`lesson-card topic-exam${examOpen ? "" : " is-locked"}`}>
                <div className="lesson-number">✓</div>
                <div className="lesson-copy">
                  <h2>{topic.exam.title}</h2>
                  <p>
                    {plural(topic.exam.questions.length, "вопрос", "вопроса", "вопросов")} самой книги ·
                    проходной балл {examPassMark(topic.exam.questions.length)}
                  </p>
                  {result && (
                    <p className="topic-source">
                      Лучший результат: {result.best} из {result.total} ·{" "}
                      {plural(result.attempts, "попытка", "попытки", "попыток")}
                      {result.passedAt ? ` · сдан ${result.passedAt}` : ""}
                    </p>
                  )}
                </div>
                <div className="lesson-actions">
                  {examOpen ? (
                    <button
                      className="primary"
                      onClick={() => setExam({ topicId: topic.id, index: 0, marks: {} })}
                    >
                      {result ? "Пересдать" : "Начать зачёт"} <span>→</span>
                    </button>
                  ) : (
                    <button className="locked" disabled>
                      Разберите все занятия <span>{stepsDone} / {topic.steps.length}</span>
                    </button>
                  )}
                </div>
              </article>
              )}
            </div>
          </section>
        );
      })()}

      {/* ——— Прохождение: занятие или повторение ——— */}
      {topic && session && (() => {
        const unitId = session.queue[session.index];
        const unit = unitById.get(unitId);
        if (!unit) return null;
        const step = session.stepId ? topic.steps.find((item) => item.id === session.stepId) : undefined;
        const card = state.cards[cardKey(topic.id, unitId)];
        return (
          <section className="study-view topic-run">
            <div className="lesson-progress">
              <button className="close" onClick={() => setSession(null)} aria-label="Выйти">
                ×
              </button>
              <div className="track">
                <span style={{ width: `${((session.index + 1) / session.queue.length) * 100}%` }} />
              </div>
              <div className="counter">
                {session.index + 1} / {session.queue.length}
              </div>
            </div>
            <div className="stage-label">
              <span>{session.mode === "learn" ? "1" : "↻"}</span>
              {step ? `${step.title} · с. ${step.pages}` : "Повторение по расписанию"}
            </div>
            <UnitRunner
              key={`${unitId}-${session.index}`}
              unit={unit}
              card={card}
              today={today}
              onGrade={(value) => grade(unitId, value)}
            />
          </section>
        );
      })()}

      {/* ——— Итог занятия или повторения ——— */}
      {topic && finished && (
        <section className="result-view">
          <div className="result-mark">{finished.stats.again ? "↻" : "✓"}</div>
          <div className="eyebrow">
            {finished.mode === "learn" ? "Занятие разобрано" : "Повторение закончено"}
          </div>
          <h1>{finished.units}</h1>
          <p>
            {finished.mode === "learn"
              ? "Всё, что сейчас прошло через припоминание, вернётся завтра и дальше по расписанию. Это и есть работа: не перечитать, а вспомнить."
              : "Вспомненное ушло дальше по расписанию, а то, что не далось, вернётся уже завтра."}
          </p>
          <div className="result-grid">
            <div>
              <strong>{finished.stats.good}</strong>
              <span>ВСПОМНИЛ</span>
            </div>
            <div>
              <strong>{finished.stats.hard}</strong>
              <span>С ТРУДОМ</span>
            </div>
            <div>
              <strong>{finished.stats.again}</strong>
              <span>НЕ ВСПОМНИЛ</span>
            </div>
          </div>
          <button className="primary wide" onClick={() => setFinished(null)}>
            К теме <span>→</span>
          </button>
        </section>
      )}

      {/* ——— Зачёт по вопросам книги ——— */}
      {topic && exam && (() => {
        const question = topic.exam.questions[exam.index];
        return (
          <section className="study-view topic-run">
            <div className="lesson-progress">
              <button className="close" onClick={() => setExam(null)} aria-label="Выйти">
                ×
              </button>
              <div className="track">
                <span style={{ width: `${((exam.index + 1) / topic.exam.questions.length) * 100}%` }} />
              </div>
              <div className="counter">
                {exam.index + 1} / {topic.exam.questions.length}
              </div>
            </div>
            <div className="stage-label">
              <span>?</span> {topic.exam.title}
            </div>
            <p className="instruction">{topic.exam.intro}</p>
            <ExamQuestionCard
              key={question.id}
              number={exam.index + 1}
              prompt={question.prompt}
              atoms={question.atoms.map((id) => atomById(topic, id)).filter((atom): atom is Atom => !!atom)}
              extra={question.extra}
              check={question.check}
              onMark={(mark) => markExam(topic, mark)}
            />
          </section>
        );
      })()}

      {/* ——— Итог зачёта ——— */}
      {topic && examOutcome && (
        <section className="result-view">
          <div className={`result-mark${examOutcome.passed ? "" : " is-short"}`}>
            {examOutcome.passed ? "✓" : "↻"}
          </div>
          <div className="eyebrow">{examOutcome.passed ? "Зачёт сдан" : "Зачёт не сдан"}</div>
          <h1>
            {examOutcome.score} / {examOutcome.total}
          </h1>
          <p>
            {examOutcome.passed
              ? "Раздел держится в памяти целиком. Повторение продолжит приходить — теперь уже редко."
              : `Проходной балл — ${examPassMark(examOutcome.total)}. Это не потеря: то, что не ответилось, уже вернулось в очередь и придёт снова.`}
          </p>
          {examOutcome.missed.length > 0 && (
            <div className="review-note">
              <span>↻</span>
              <div>
                <strong>Вопросы без полного ответа: {examOutcome.missed.join(", ")}</strong>
                <p>
                  {examOutcome.returned
                    ? `${plural(examOutcome.returned, "факт", "факта", "фактов")} вернулись в начало расписания`
                    : "Частичные ответы опустились на коробку ниже"}
                </p>
              </div>
            </div>
          )}
          <button className="primary wide" onClick={() => setExamOutcome(null)}>
            К теме <span>→</span>
          </button>
        </section>
      )}
    </main>
  );
}

/**
 * One unit, asked in the form its box calls for.
 *
 * Every form ends the same way — with a grade the schedule can use — but they
 * differ in what the learner has to produce first, and that difference is the
 * whole method: a list is checked item by item, a drill is calculated, and a
 * plain fact is recalled before anything appears on screen.
 */
function UnitRunner({
  unit,
  card,
  today,
  onGrade,
}: {
  unit: TopicUnit;
  card: TopicCard | undefined;
  today: string;
  onGrade: (grade: TopicGrade) => void;
}) {
  const mode = modeFor(unit, card);
  const [revealed, setRevealed] = useState(false);
  const [chosen, setChosen] = useState<string | null>(null);
  const [checked, setChecked] = useState<number[]>([]);
  const [typed, setTyped] = useState("");
  const [sorted, setSorted] = useState<Record<number, number>>({});
  const [picked, setPicked] = useState<number[]>([]);

  const seed = taskSeed(unit.id, today, card?.reps ?? 0);
  const task = useMemo(() => (isDrill(unit) ? buildTask(unit, seed) : null), [unit, seed]);
  // Prepared for every unit rather than inside the branch that uses it: a hook
  // behind a condition is a hook that runs a different number of times.
  const options = useMemo(
    () => (!isDrill(unit) && unit.options ? seededShuffle([unit.answer, ...unit.options], seed) : []),
    [unit, seed],
  );

  const box = card?.box ?? 0;

  if (mode === "drill" && task) {
    if (task.kind === "choice") {
      return (
        <>
          <p className="instruction">{task.title}</p>
          <div className="prompt-card topic-prompt">
            <span>Расчёт</span>
            <strong>{task.prompt}</strong>
          </div>
          <div className="options">
            {task.options.map((option) => {
              const status = chosen
                ? option === task.answer
                  ? "correct"
                  : option === chosen
                    ? "wrong"
                    : "dimmed"
                : "";
              return (
                <button key={option} className={status} disabled={!!chosen} onClick={() => setChosen(option)}>
                  <span dir="ltr">{option}</span>
                  {status === "correct" && <b>✓</b>}
                  {status === "wrong" && <b>×</b>}
                </button>
              );
            })}
          </div>
          {chosen && (
            <div className={`feedback ${chosen === task.answer ? "good" : "bad"}`}>
              <div>
                <strong>{chosen === task.answer ? "Верно" : task.answer}</strong>
                <p>Книга, с. {task.page}</p>
              </div>
              <button className="primary" onClick={() => onGrade(chosen === task.answer ? "good" : "again")}>
                Дальше <span>→</span>
              </button>
            </div>
          )}
        </>
      );
    }

    if (task.kind === "number") {
      const value = Number(typed.replace(",", ".").replaceAll(" ", ""));
      const correct = revealed && Number.isFinite(value) && value === task.answer;
      return (
        <>
          <p className="instruction">{task.title}</p>
          <div className="prompt-card topic-prompt">
            <span>Расчёт</span>
            <strong>{task.prompt}</strong>
          </div>
          <form
            className="topic-answer"
            onSubmit={(event) => {
              event.preventDefault();
              setRevealed(true);
            }}
          >
            <input
              inputMode="decimal"
              value={typed}
              disabled={revealed}
              onChange={(event) => setTyped(event.target.value)}
              placeholder="Число"
              aria-label="Ответ"
            />
            {!revealed && (
              <button className="primary" type="submit" disabled={typed.trim() === ""}>
                Проверить
              </button>
            )}
          </form>
          {revealed && (
            <div className={`feedback ${correct ? "good" : "bad"}`}>
              <div>
                <strong>{correct ? `Верно — ${task.answerLabel}` : task.answerLabel}</strong>
                <p>
                  {task.note} Книга, с. {task.page}
                </p>
              </div>
              <button className="primary" onClick={() => onGrade(correct ? "good" : "again")}>
                Дальше <span>→</span>
              </button>
            </div>
          )}
        </>
      );
    }

    if (task.kind === "order") {
      const chosen = picked.map((index) => task.items[index]);
      const right = chosen.filter((item, index) => item === task.answer[index]).length;
      return (
        <>
          <p className="instruction">{task.prompt}</p>
          <div className="topic-order">
            {task.items.map((item, index) => {
              const place = picked.indexOf(index);
              const state = revealed
                ? place >= 0 && task.answer[place] === item
                  ? " is-right"
                  : " is-wrong"
                : place >= 0
                  ? " picked"
                  : "";
              return (
                <button
                  key={item}
                  className={`order-row${state}`}
                  disabled={revealed}
                  onClick={() =>
                    setPicked(
                      place >= 0
                        ? picked.filter((value) => value !== index)
                        : [...picked, index],
                    )
                  }
                >
                  <b>{place >= 0 ? place + 1 : "·"}</b>
                  <span>{item}</span>
                </button>
              );
            })}
          </div>
          {!revealed ? (
            <button
              className="primary wide"
              disabled={picked.length !== task.items.length}
              onClick={() => setRevealed(true)}
            >
              Проверить
            </button>
          ) : (
            <>
              <ol className="topic-answer-card topic-order-answer">
                {task.answer.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ol>
              <div className={`feedback ${toneOf(gradeFromRecall(right, task.answer.length))}`}>
                <div>
                  <strong>
                    {right} из {task.answer.length} на своём месте
                  </strong>
                  <p>Книга, с. {task.page}</p>
                </div>
                <button
                  className="primary"
                  onClick={() => onGrade(gradeFromRecall(right, task.answer.length))}
                >
                  Дальше <span>→</span>
                </button>
              </div>
            </>
          )}
        </>
      );
    }

    const answered = Object.keys(sorted).length === task.items.length;
    const right = task.items.filter((item, index) => sorted[index] === item.bucket).length;
    return (
      <>
        <p className="instruction">{task.prompt}</p>
        <div className="topic-sort">
          {task.items.map((item, index) => {
            const picked = sorted[index];
            const done = revealed;
            const ok = picked === item.bucket;
            return (
              <div key={item.label} className={`sort-row${done ? (ok ? " is-right" : " is-wrong") : ""}`}>
                <span>{item.label}</span>
                <div>
                  {task.buckets.map((bucket, bucketIndex) => (
                    <button
                      key={bucket}
                      className={picked === bucketIndex ? "picked" : ""}
                      disabled={revealed}
                      onClick={() => setSorted({ ...sorted, [index]: bucketIndex })}
                    >
                      {bucket}
                    </button>
                  ))}
                </div>
                {done && !ok && <small>{task.buckets[item.bucket]}{item.note ? ` — ${item.note}` : ""}</small>}
              </div>
            );
          })}
        </div>
        {!revealed ? (
          <button className="primary wide" disabled={!answered} onClick={() => setRevealed(true)}>
            Проверить
          </button>
        ) : (
          <div className={`feedback ${toneOf(gradeFromRecall(right, task.items.length))}`}>
            <div>
              <strong>
                {right} из {task.items.length}
              </strong>
              <p>Книга, с. {task.page}</p>
            </div>
            <button className="primary" onClick={() => onGrade(gradeFromRecall(right, task.items.length))}>
              Дальше <span>→</span>
            </button>
          </div>
        )}
      </>
    );
  }

  const atom = unit as Atom;

  if (mode === "choice" && atom.options) {
    return (
      <>
        <p className="instruction">Выберите ответ — а потом проверьте себя по книге</p>
        <div className="prompt-card topic-prompt">
          <span>с. {atom.page}</span>
          <strong>{atom.question}</strong>
        </div>
        <div className="options">
          {options.map((option) => {
            const status = chosen
              ? option === atom.answer
                ? "correct"
                : option === chosen
                  ? "wrong"
                  : "dimmed"
              : "";
            return (
              <button key={option} className={status} disabled={!!chosen} onClick={() => setChosen(option)}>
                <span dir="ltr">{option}</span>
                {status === "correct" && <b>✓</b>}
                {status === "wrong" && <b>×</b>}
              </button>
            );
          })}
        </div>
        {chosen && (
          <div className={`feedback ${chosen === atom.answer ? "good" : "bad"}`}>
            <div>
              <strong>
                {chosen === atom.answer ? "Верно" : atom.answer}
                {atom.check && <CheckMark text={atom.check} />}
              </strong>
              {atom.note && <p>{atom.note}</p>}
              {atom.evidence && (
                <p>
                  {atom.evidence.text} — <i>{atom.evidence.source}</i>
                </p>
              )}
            </div>
            <button className="primary" onClick={() => onGrade(chosen === atom.answer ? "good" : "again")}>
              Дальше <span>→</span>
            </button>
          </div>
        )}
      </>
    );
  }

  if (mode === "list" && atom.items) {
    // Bound once, so the narrowing survives into the callbacks below.
    const items = atom.items;
    const listGrade = gradeFromRecall(checked.length, items.length);
    return (
      <>
        <p className="instruction">
          Перечислите вслух или на бумаге — и только потом открывайте список
        </p>
        <div className="prompt-card topic-prompt">
          <span>с. {atom.page}</span>
          <strong>{atom.question}</strong>
          <em>{atom.answer}</em>
        </div>
        {!revealed ? (
          <button className="primary wide" onClick={() => setRevealed(true)}>
            Открыть список
          </button>
        ) : (
          <>
            <p className="instruction">Отметьте то, что действительно назвали</p>
            <div className="topic-list">
              {items.map((item, index) => (
                <button
                  key={item}
                  className={checked.includes(index) ? "checked" : ""}
                  onClick={() =>
                    setChecked(
                      checked.includes(index)
                        ? checked.filter((value) => value !== index)
                        : [...checked, index],
                    )
                  }
                >
                  <b>{checked.includes(index) ? "✓" : "○"}</b>
                  <span>{item}</span>
                </button>
              ))}
            </div>
            {atom.check && <CheckMark text={atom.check} />}
            {atom.note && <p className="topic-note">{atom.note}</p>}
            {atom.evidence && (
              <p className="topic-note">
                {atom.evidence.text} — <i>{atom.evidence.source}</i>
              </p>
            )}
            <div className={`feedback ${toneOf(listGrade)}`}>
              <div>
                <strong>
                  {checked.length} из {items.length} ·{" "}
                  {GRADES.find((item) => item.grade === listGrade)?.label.toLowerCase()}
                </strong>
                <p>Оценка ставится по отмеченному: всё — вспомнил, половина и больше — с трудом.</p>
              </div>
              <button
                className="primary"
                onClick={() => onGrade(listGrade)}
              >
                Дальше <span>→</span>
              </button>
            </div>
          </>
        )}
      </>
    );
  }

  return (
    <>
      <p className="instruction">Вспомните ответ целиком, прежде чем открыть</p>
      <div className="prompt-card topic-prompt">
        <span>с. {atom.page}</span>
        <strong>{atom.question}</strong>
      </div>
      {!revealed ? (
        <button className="primary wide" onClick={() => setRevealed(true)}>
          Показать ответ
        </button>
      ) : (
        <>
          <div className="topic-answer-card">
            <p>{atom.answer}</p>
            {atom.items && (
              <ul>
                {atom.items.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            )}
            {atom.check && <CheckMark text={atom.check} />}
            {atom.note && <p className="topic-note">{atom.note}</p>}
            {atom.evidence && (
              <p className="topic-note">
                {atom.evidence.text} — <i>{atom.evidence.source}</i>
              </p>
            )}
          </div>
          <div className="topic-grades">
            {GRADES.map((item) => (
              <button key={item.grade} className={item.className} onClick={() => onGrade(item.grade)}>
                {item.label}
                <small>
                  {item.grade === "again"
                    ? "спросим ещё раз сейчас"
                    : item.grade === "hard"
                      ? nextIn(box)
                      : nextIn(box + 1)}
                </small>
              </button>
            ))}
          </div>
        </>
      )}
    </>
  );
}

/** One question of the book's own review list, with the reference beneath it. */
function ExamQuestionCard({
  number,
  prompt,
  atoms,
  extra,
  check,
  onMark,
}: {
  number: number;
  prompt: string;
  atoms: Atom[];
  extra?: string;
  check?: string;
  onMark: (mark: ExamMark) => void;
}) {
  const [revealed, setRevealed] = useState(false);
  return (
    <>
      <div className="prompt-card topic-prompt">
        <span>Вопрос {number}</span>
        <strong>{prompt}</strong>
      </div>
      {!revealed ? (
        <button className="primary wide" onClick={() => setRevealed(true)}>
          Показать эталон
        </button>
      ) : (
        <>
          <div className="topic-answer-card">
            {atoms.map((atom) => (
              <div key={atom.id} className="topic-reference">
                <p>
                  {atom.answer}
                  {atom.check && <CheckMark text={atom.check} />}
                </p>
                {atom.items && (
                  <ul>
                    {atom.items.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                )}
                {atom.evidence && (
                  <p className="topic-note">
                    {atom.evidence.text} — <i>{atom.evidence.source}</i>
                  </p>
                )}
              </div>
            ))}
            {extra && <p className="topic-extra">{extra}</p>}
            {check && <p className="topic-extra">Сверка с книгой <CheckMark text={check} /></p>}
          </div>
          <div className="topic-grades">
            <button className="again" onClick={() => onMark("none")}>
              Не ответил
              <small>факты вернутся в начало</small>
            </button>
            <button className="hard" onClick={() => onMark("part")}>
              Частично
              <small>на коробку назад</small>
            </button>
            <button className="good" onClick={() => onMark("full")}>
              Ответил
              <small>расписание не трогаем</small>
            </button>
          </div>
        </>
      )}
    </>
  );
}
