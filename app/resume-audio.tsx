"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { listeningCatalog, listeningHref } from "./listening-catalog";
import { progressStore } from "./progress-store";
import { createListeningPlayback, type ListeningPlayback } from "../public/text-and-audio/playback.js";
import { createListeningTime } from "../public/text-and-audio/time.js";

const playback = createListeningPlayback();
const time = createListeningTime();
const changeEvent = "listening-playback-change";
const announce = () => window.dispatchEvent(new Event(changeEvent));
function snapshot() {
  try {
    const record = playback.latest(window.localStorage, listeningCatalog);
    return record ? JSON.stringify(record) : null;
  } catch { return null; }
}
const serverSnapshot = () => null;
function subscribe(listener: () => void) {
  window.addEventListener("storage", listener);
  window.addEventListener("pageshow", listener);
  window.addEventListener("focus", listener);
  window.addEventListener(changeEvent, listener);
  return () => {
    window.removeEventListener("storage", listener);
    window.removeEventListener("pageshow", listener);
    window.removeEventListener("focus", listener);
    window.removeEventListener(changeEvent, listener);
  };
}

export function ResumeAudio() {
  const saved = useSyncExternalStore(subscribe, snapshot, serverSnapshot);
  const [hidden, setHidden] = useState<string | null>(null);
  const record: ListeningPlayback | null = saved ? JSON.parse(saved) : null;
  if (saved === hidden || !record || record.dismissed || record.finished || record.position <= 0 || record.position >= record.duration) return null;
  const entry = listeningCatalog.find(item => (item.courseId ?? 1) === record.courseId && item.lessonId === record.lessonId);
  return entry ? <Recording key={record.key} record={record} source={entry.audioSrc} title={entry.courseTitle || "Шифахия"} onClose={() => setHidden(snapshot())} /> : null;
}

function Recording({ record, source, title, onClose }: { record: ListeningPlayback; source: string; title: string; onClose(): void }) {
  // A checkpoint update must not reload a recording that is already playing.
  const [initial] = useState(record);
  const [failed, setFailed] = useState(false);
  const audioRef = useRef<HTMLAudioElement>(null);
  const close = useRef(() => {});

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    const storage = window.localStorage;
    let restoration = playback.restore(audio, initial.position);
    let lastSave = 0;
    let interacted = false;
    const clock = time.tracker({
      course: initial.courseId, now: () => performance.now(),
      makeId: () => crypto.randomUUID?.() || `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`,
      read: () => { try { return JSON.parse(storage.getItem(time.KEY) || "{}"); } catch { return {}; } },
      write: value => progressStore.saveListeningTime(value),
    });
    function save(activate = false) {
      clock.flush();
      if (!interacted || !restoration.ready() || audio!.readyState < 1) return;
      const current = playback.active(storage);
      if (!activate && current?.key === initial.key && current.finished && !audio!.ended) return;
      const position = audio!.ended ? 0 : audio!.currentTime;
      const preferences = { rate: audio!.playbackRate, loop: audio!.loop };
      try {
        playback.savePosition(storage, initial, position, preferences);
        playback.checkpoint(storage, initial, { ...preferences, position, duration: audio!.duration, finished: audio!.ended }, activate);
        announce();
      } catch { /* Playback remains usable when browser storage is unavailable. */ }
      lastSave = performance.now();
    }
    const playing = () => {
      if (restoration.ready() && !audio.paused) { interacted = true; clock.start(); save(true); }
    };
    const stop = () => clock.stop();
    const paused = () => { stop(); save(); };
    const seeked = () => {
      if (restoration.ready() && !audio.paused && audio.readyState >= 3) clock.start();
      save();
    };
    const seeking = () => { if (restoration.ready()) interacted = true; stop(); };
    const tick = () => { if (performance.now() - lastSave >= 1000) save(); };
    const external = () => {
      const latest = playback.active(storage);
      if (audio.paused && latest?.key === initial.key) {
        interacted = false;
        if (Math.abs(latest.position - audio.currentTime) > 0.5) {
          restoration.dispose();
          restoration = playback.restore(audio, latest.position);
        }
      }
    };
    const visible = () => { if (document.hidden) save(); else external(); };
    const shown = () => { external(); if (!audio.paused) playing(); };
    const handlers: Record<string, () => void> = {
      playing, pause: paused, ended: paused, seeking, waiting: stop, error: stop,
      seeked, timeupdate: tick, ratechange: () => save(),
    };
    for (const [event, handler] of Object.entries(handlers)) audio.addEventListener(event, handler);
    window.addEventListener("storage", external);
    window.addEventListener("pagehide", paused);
    window.addEventListener("pageshow", shown);
    window.addEventListener("focus", external);
    document.addEventListener("visibilitychange", visible);
    close.current = () => {
      audio.pause();
      paused();
      try {
        // A legacy position may not have an active pointer until its first play.
        if (!playback.active(storage)) playback.checkpoint(storage, initial, initial);
        playback.dismiss(storage, initial.key);
        announce();
      } catch { /* Keep the saved position even if the close cannot persist. */ }
    };
    audio.playbackRate = initial.rate;
    audio.loop = initial.loop;
    return () => {
      paused();
      for (const [event, handler] of Object.entries(handlers)) audio.removeEventListener(event, handler);
      audio.pause();
      restoration.dispose();
      window.removeEventListener("storage", external);
      window.removeEventListener("pagehide", paused);
      window.removeEventListener("pageshow", shown);
      window.removeEventListener("focus", external);
      document.removeEventListener("visibilitychange", visible);
    };
  }, [initial]);

  const review = initial.key !== playback.studyKey(initial.courseId, initial.lessonId);
  const href = `${listeningHref(initial.lessonId, initial.courseId)}${review ? "&review=1" : ""}&resume=1`;
  return (
    <section className="resume-audio" aria-label="Продолжить прослушивание">
      <div className="resume-audio-copy">
        <small>Продолжить прослушивание{review ? " · повторение" : ""}</small>
        <strong>{title} · Урок {initial.lessonId}</strong>
        <a href={href} onClick={() => audioRef.current?.pause()}>Текст урока →</a>
      </div>
      <button className="resume-audio-close" aria-label="Закрыть аудиоплеер" onClick={() => { close.current(); onClose(); }}>×</button>
      <audio ref={audioRef} controls preload="metadata" src={source} aria-label={`Аудио урока ${initial.lessonId}`} onError={() => setFailed(true)} />
      {failed && <small className="resume-audio-error">Не удалось загрузить запись. <a href={href}>Открыть урок</a></small>}
    </section>
  );
}
