"use client";

import { useState } from "react";
import {
  baynaYadaykSections,
  type BaynaYadaykLesson,
} from "../../content/audio-courses/bayna-yadayk";

function lessonLabel(lesson: BaynaYadaykLesson) {
  return `Урок ${lesson.number}${lesson.part ? ` · часть ${lesson.part}` : ""}`;
}

export default function BaynaYadaykCourse() {
  const [open, setOpen] = useState(false);
  const [sectionIndex, setSectionIndex] = useState(0);
  const [selected, setSelected] = useState(0);
  const [playing, setPlaying] = useState(false);
  const { lessons, playlistId, totalLessons, title } = baynaYadaykSections[sectionIndex];
  const lesson = lessons[selected];
  const watchUrl = `https://www.youtube.com/watch?v=${lesson.videoId}&list=${playlistId}`;
  const lastNumber = lessons[lessons.length - 1].number;
  const lessonRange = `${lessons[0].number}–${lastNumber}${lastNumber < totalLessons ? ` из ${totalLessons}` : ""}`;
  const playableIndices = lessons.flatMap((item, index) => item.videoId ? [index] : []);
  const playablePosition = playableIndices.indexOf(selected);
  const missingNumbers = lessons.filter((item) => !item.videoId).map((item) => item.number);
  const currentTitle = `${title} · ${lessonLabel(lesson)}`;

  function chooseLesson(index: number) {
    if (!lessons[index]?.videoId) return;
    setSelected(index);
    setPlaying(false);
  }

  function stepLesson(direction: -1 | 1) {
    const index = playableIndices[playablePosition + direction];
    if (index !== undefined) chooseLesson(index);
  }

  return (
    <section className="home-disclosure audio-course" id="bayna-yadayk" aria-label="Аудиокурс «Байна ядайк»">
      <button
        className="home-disclosure-toggle"
        aria-expanded={open}
        aria-controls="bayna-yadayk-content"
        onClick={() => {
          setOpen(!open);
          setPlaying(false);
        }}
      >
        <span>
          <strong>Аудиокурс «Байна ядайк»</strong>
          <small>Том 2 · Том 3, части 1 и 2</small>
        </span>
        <span className="disclosure-mark" aria-hidden="true">{open ? "−" : "+"}</span>
      </button>

      <div className="home-disclosure-content audio-course-content" id="bayna-yadayk-content" hidden={!open}>
        <div className="window-chips audio-course-sections" role="group" aria-label="Тома и части аудиокурса">
          {baynaYadaykSections.map((section, index) => (
            <button
              key={section.title}
              className={sectionIndex === index ? "is-active" : ""}
              aria-pressed={sectionIndex === index}
              onClick={() => {
                setSectionIndex(index);
                setSelected(0);
                setPlaying(false);
              }}
            >
              {section.title}
            </button>
          ))}
        </div>

        <div>
          <h2>{title}</h2>
          <p className="podcast-hint">
            Уроки {lessonRange} · слушайте по порядку
          </p>
        </div>

        <ol className="audio-course-lessons" start={lessons[0].number} aria-label={`Уроки: ${title}`}>
          {lessons.map((item, index) => (
            <li key={`${item.number}-${item.part ?? 0}`} value={item.number}>
              <button
                aria-pressed={selected === index}
                disabled={!item.videoId}
                aria-describedby={!item.videoId ? "bayna-yadayk-missing" : undefined}
                onClick={() => chooseLesson(index)}
              >
                {lessonLabel(item)}{!item.videoId && " · нет записи"}
              </button>
            </li>
          ))}
        </ol>

        {missingNumbers.length > 0 && (
          <p className="podcast-hint" id="bayna-yadayk-missing">
            Пока нет записей для уроков: {missingNumbers.join(", ")}. Нумерация сохранена.
          </p>
        )}

        <div className="audio-course-current" aria-live="polite">
          {currentTitle}
        </div>

        {open && playing && lesson.videoId && (
          <div className="podcast-player">
            <div className="podcast-frame">
              <iframe
                key={lesson.videoId}
                title={`Байна ядайк · ${currentTitle}`}
                src={`https://www.youtube.com/embed/${lesson.videoId}?autoplay=1&rel=0&playsinline=1`}
                allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
                referrerPolicy="strict-origin-when-cross-origin"
                allowFullScreen
              />
            </div>
            <p className="podcast-hint">Если запись не воспроизводится, откройте урок в YouTube.</p>
          </div>
        )}

        <div className="podcast-actions">
          <button className="primary" onClick={() => setPlaying(!playing)}>
            {playing ? "Закрыть плеер" : "▶ Слушать урок"}
          </button>
          <a className="secondary" href={watchUrl} target="_blank" rel="noopener noreferrer">
            Открыть урок в YouTube
          </a>
        </div>

        <nav className="audio-course-navigation" aria-label="Переход между уроками аудиокурса">
          <button className="secondary" disabled={playablePosition <= 0} onClick={() => stepLesson(-1)}>
            ← Предыдущий урок
          </button>
          <button className="secondary" disabled={playablePosition === playableIndices.length - 1} onClick={() => stepLesson(1)}>
            Следующий урок →
          </button>
        </nav>

        <div className="audio-course-volume">
          <a href={`https://www.youtube.com/playlist?list=${playlistId}`} target="_blank" rel="noopener noreferrer">
            Открыть плейлист в YouTube
          </a>
        </div>
      </div>
    </section>
  );
}
