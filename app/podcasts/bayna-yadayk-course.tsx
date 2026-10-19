"use client";

import { useState } from "react";
import {
  baynaYadaykVolumeThreeUrl,
  baynaYadaykVolumeTwo,
} from "../../content/audio-courses/bayna-yadayk";

export default function BaynaYadaykCourse() {
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState(0);
  const [playing, setPlaying] = useState(false);
  const { lessons, playlistId, totalLessons } = baynaYadaykVolumeTwo;
  const lesson = lessons[selected];
  const watchUrl = `https://www.youtube.com/watch?v=${lesson.videoId}&list=${playlistId}`;
  const lessonRange = `${lessons[0].number}–${lessons[lessons.length - 1].number} из ${totalLessons}`;

  function chooseLesson(index: number) {
    if (index < 0 || index >= lessons.length) return;
    setSelected(index);
    setPlaying(false);
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
          <small>Том 2 · уроки {lessonRange} · Том 3</small>
        </span>
        <span className="disclosure-mark" aria-hidden="true">{open ? "−" : "+"}</span>
      </button>

      <div className="home-disclosure-content audio-course-content" id="bayna-yadayk-content" hidden={!open}>
        <div>
          <h2>Том 2</h2>
          <p className="podcast-hint">
            Уроки {lessonRange} · слушайте по порядку
          </p>
        </div>

        <ol className="audio-course-lessons" start={lessons[0].number} aria-label="Уроки второго тома">
          {lessons.map((item, index) => (
            <li key={item.videoId}>
              <button
                aria-pressed={selected === index}
                onClick={() => chooseLesson(index)}
              >
                Урок {item.number}
              </button>
            </li>
          ))}
        </ol>

        <div className="audio-course-current" aria-live="polite">
          Том 2 · Урок {lesson.number}
        </div>

        {open && playing && (
          <div className="podcast-player">
            <div className="podcast-frame">
              <iframe
                key={lesson.videoId}
                title={`Байна ядайк · Том 2 · Урок ${lesson.number}`}
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
          <button className="secondary" disabled={selected === 0} onClick={() => chooseLesson(selected - 1)}>
            ← Предыдущий урок
          </button>
          <button className="secondary" disabled={selected === lessons.length - 1} onClick={() => chooseLesson(selected + 1)}>
            Следующий урок →
          </button>
        </nav>

        <div className="audio-course-volume">
          <h2>Том 3</h2>
          <p className="podcast-hint">Сначала часть 1, затем часть 2.</p>
          <a href={baynaYadaykVolumeThreeUrl} target="_blank" rel="noopener noreferrer">
            Открыть плейлист тома 3
          </a>
        </div>
      </div>
    </section>
  );
}
