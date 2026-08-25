"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { plural } from "../../content/questions";
import { shippedCatalog } from "../../content/podcasts/catalog";
import { DEFAULT_HANDLES } from "../../content/podcasts/channels";
import {
  channelOf,
  eligibleVideos,
  formatDuration,
  formatTotalTime,
  parseChannelHandle,
  sameHandle,
  thumbnailUrl,
  watchUrl,
  type LengthWindow,
  type PodcastVideo,
} from "../podcast-catalog";
import { currentVideoId, emptyPlan, planForDay, withAnotherPick, withExtraEpisode } from "../podcast-day";
import {
  isGoalMet,
  monthCalendar,
  monthProgress,
  streaks,
  totals,
  watchedOn,
} from "../podcast-stats";
import { activeCatalog, podcastStore, todayStore } from "../podcast-store";
import { fetchCatalog } from "../podcast-youtube";
import { POLL_MS, isWatchedEnough, loadPlayerApi, type YouTubePlayer } from "../youtube-embed";

const WEEKDAYS = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"];

/** The length windows offered, shortest first; the first one is the default. */
const WINDOWS: { label: string; window: LengthWindow }[] = [
  { label: "5–15 мин", window: { min: 5 * 60, max: 15 * 60 } },
  { label: "5–30 мин", window: { min: 5 * 60, max: 30 * 60 } },
  { label: "10–30 мин", window: { min: 10 * 60, max: 30 * 60 } },
  { label: "до 60 мин", window: { min: 60, max: 60 * 60 } },
];

function sameWindow(a: LengthWindow, b: LengthWindow) {
  return a.min === b.min && a.max === b.max;
}

/** «Понедельник, 24 августа», with the weekday capitalised as a heading wants. */
function formatDay(date: string) {
  if (!date) return "";
  const text = new Intl.DateTimeFormat("ru-RU", {
    weekday: "long",
    day: "numeric",
    month: "long",
  }).format(new Date(`${date}T12:00:00`));
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/**
 * The embedded player.
 *
 * Mounted only once the learner presses «Смотреть», so a visit that does not
 * end in watching fetches nothing from YouTube.
 */
function EpisodePlayer({ video, onWatched }: { video: PodcastVideo; onWatched: () => void }) {
  const host = useRef<HTMLDivElement>(null);
  const [failed, setFailed] = useState(false);

  // The effect must not re-run when the callback identity changes, or the
  // player would be torn down and rebuilt mid-episode.
  const latest = useRef(onWatched);
  useEffect(() => {
    latest.current = onWatched;
  });

  useEffect(() => {
    let player: YouTubePlayer | undefined;
    let timer: ReturnType<typeof setInterval> | undefined;
    let cancelled = false;
    let counted = false;

    const count = () => {
      if (counted) return;
      counted = true;
      clearInterval(timer);
      latest.current();
    };

    // Captured now rather than read in the cleanup, which runs after the ref
    // may already point somewhere else.
    const container = host.current;

    loadPlayerApi()
      .then((api) => {
        if (cancelled || !container) return;

        // The API replaces the element it is given with an iframe, so it gets
        // one React does not know about: React would otherwise try to remove a
        // node that is no longer there.
        const mount = document.createElement("div");
        container.append(mount);

        player = new api.Player(mount, {
          videoId: video.id,
          playerVars: { rel: 0, playsinline: 1, modestbranding: 1, autoplay: 1 },
          events: {
            onReady: () => {
              timer = setInterval(() => {
                if (player && isWatchedEnough(player.getCurrentTime(), player.getDuration())) count();
              }, POLL_MS);
            },
            onStateChange: (event) => {
              if (event.data === api.PlayerState.ENDED) count();
            },
          },
        });
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });

    return () => {
      cancelled = true;
      clearInterval(timer);
      player?.destroy();
      container?.replaceChildren();
    };
  }, [video.id]);

  return (
    <div className="podcast-player">
      <div className="podcast-frame" ref={host} />
      <p className="podcast-hint">
        {failed
          ? "Плеер не загрузился. Откройте выпуск в YouTube и отметьте вручную."
          : "Отметится само, когда проиграет 80% выпуска."}
      </p>
    </div>
  );
}

export default function PodcastsPage() {
  const state = useSyncExternalStore(
    podcastStore.subscribe,
    podcastStore.getSnapshot,
    podcastStore.getServerSnapshot,
  );
  const today = useSyncExternalStore(
    todayStore.subscribe,
    todayStore.getSnapshot,
    todayStore.getServerSnapshot,
  );

  const [playing, setPlaying] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [keyDraft, setKeyDraft] = useState("");
  const [sourceDraft, setSourceDraft] = useState("");
  // null means the note has not been touched, so the stored one is shown; an
  // empty string is an edit like any other, which is what makes clearing a note
  // possible at all.
  const [noteDraft, setNoteDraft] = useState<string | null>(null);
  const [noteSaved, setNoteSaved] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [refreshNote, setRefreshNote] = useState("");

  const catalog = useMemo(() => activeCatalog(state, shippedCatalog), [state]);
  const watchedIds = useMemo(
    () => new Set(state.watches.map((watch) => watch.videoId)),
    [state.watches],
  );

  // No date, no episode. The server does not know what day it is where the
  // learner is, and an episode pinned to an empty date is one the client then
  // swaps for a different one — the exact opposite of what pinning is for.
  const plan = useMemo(
    () =>
      today
        ? planForDay(catalog, watchedIds, today, state.plans[today], state.window)
        : emptyPlan(""),
    [catalog, watchedIds, today, state.plans, state.window],
  );

  const videosById = useMemo(
    () => new Map(catalog.videos.map((video) => [video.id, video])),
    [catalog],
  );
  const video = useMemo(() => {
    const id = currentVideoId(plan);
    return id ? videosById.get(id) : undefined;
  }, [plan, videosById]);

  const doneToday = today ? isGoalMet(state.watches, today) : false;
  // What decides whether the episode card is on screen is not whether the day's
  // goal is met, but whether the pinned episode has been watched. The goal is a
  // floor, not a ceiling: once it is met, «Посмотреть ещё» pins another episode,
  // and that one needs somewhere to appear.
  const currentWatched = video !== undefined && watchedIds.has(video.id);
  const todaysWatches = useMemo(
    () => (today ? watchedOn(state.watches, today) : []),
    [state.watches, today],
  );
  const run = useMemo(() => streaks(state.watches, today || undefined), [state.watches, today]);
  const overall = useMemo(() => totals(state.watches), [state.watches]);
  const month = useMemo(
    () => (today ? monthProgress(state.watches, today) : { done: 0, elapsed: 0 }),
    [state.watches, today],
  );
  const calendar = useMemo(
    () => (today ? monthCalendar(state.watches, today) : []),
    [state.watches, today],
  );
  const remaining = useMemo(
    () => eligibleVideos(catalog, watchedIds, state.window).length,
    [catalog, watchedIds, state.window],
  );

  /** The default channels plus whatever the learner has pasted in settings. */
  const handles = useMemo(
    () => [...new Set([...DEFAULT_HANDLES, ...state.sources])],
    [state.sources],
  );

  const secondsToday = todaysWatches.reduce((sum, watch) => sum + watch.seconds, 0);
  const lastWatch = todaysWatches.at(-1);

  const finish = useCallback(
    (auto: boolean) => {
      if (!video || !today) return;
      // Pinning what was on screen is what keeps this episode on the card after
      // a reload: once it counts as watched it would otherwise be picked over.
      podcastStore.savePlan(plan);
      podcastStore.markWatched({
        videoId: video.id,
        channelId: video.channelId,
        title: video.title,
        date: today,
        seconds: video.seconds,
        auto,
        watchedAt: Date.now(),
      });
      setPlaying(false);
      setNoteDraft(null);
      setNoteSaved(false);
    },
    [video, today, plan],
  );

  function anotherEpisode() {
    podcastStore.savePlan(withAnotherPick(catalog, watchedIds, plan, state.window));
    setPlaying(false);
  }

  function oneMore() {
    // An episode already pinned and still unwatched is the extra one: asking
    // again should bring the learner back to it, not burn through the
    // catalogue a click at a time.
    if (!currentWatched) {
      setPlaying(false);
      return;
    }
    podcastStore.savePlan(withExtraEpisode(catalog, watchedIds, plan, state.window));
    setPlaying(false);
  }

  function addSource(event: React.FormEvent) {
    event.preventDefault();
    const handle = parseChannelHandle(sourceDraft);
    if (!handle) {
      setRefreshNote("Не похоже на ссылку канала. Нужен адрес вида youtube.com/@name");
      return;
    }
    if (handles.some((known) => sameHandle(known, handle))) {
      setRefreshNote(`${handle} уже в списке`);
      setSourceDraft("");
      return;
    }
    podcastStore.setSources([...state.sources, handle]);
    setSourceDraft("");
    setRefreshNote(`${handle} добавлен — обновите список, чтобы забрать выпуски`);
  }

  async function refreshCatalog() {
    const apiKey = state.apiKey;
    if (!apiKey) {
      setRefreshNote("Сначала сохраните ключ YouTube Data API");
      return;
    }

    setRefreshing(true);
    setRefreshNote("Читаю каналы…");
    try {
      const { catalog: fresh, missing } = await fetchCatalog(handles, apiKey, setRefreshNote);
      podcastStore.saveCatalog(fresh);
      const found = `${plural(fresh.videos.length, "выпуск", "выпуска", "выпусков")} с ${plural(fresh.channels.length, "канала", "каналов", "каналов")}`;
      setRefreshNote(missing.length ? `${found}. Не открылись: ${missing.join(", ")}` : found);
    } catch (error) {
      setRefreshNote(error instanceof Error ? error.message : "Не удалось обновить список");
    } finally {
      setRefreshing(false);
    }
  }

  const channel = video ? channelOf(catalog, video) : undefined;
  const empty = catalog.videos.length === 0;

  return (
    <main className="app-shell">
      <header className="topbar">
        {/* A plain link, not next/link, and deliberately so: the site is static
            files under a subdirectory, where client-side navigation would fetch
            an RSC payload that nothing serves and would resolve the absolute
            path against the domain root. The static build rewrites this href to
            a relative one; a client-routed Link would keep the absolute path. */}
        {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
        <a className="brand" href="/">
          <span className="brand-mark">ع</span>
          <span>
            <strong>العربية كل يوم</strong>
            <small>подкаст в день</small>
          </span>
        </a>
        <div className="streak" title="Текущая серия дней">
          <span>🔥</span> {run.current} дн.
        </div>
      </header>

      <section className="home-view podcast-view">
        <p className="eyebrow">{formatDay(today) || " "}</p>

        {empty ? (
          <div className="podcast-empty">
            <h2>Список выпусков пока пуст</h2>
            <p>
              Приложение раздаёт подкасты из каналов, которые вы укажете, но сам список выпусков
              приходит из YouTube. Собрать его можно двумя способами.
            </p>
            <ol>
              <li>
                <b>Прямо здесь.</b> Заведите ключ YouTube Data API v3 в Google Cloud Console
                и вставьте его ниже — приложение соберёт список само и запомнит на этом устройстве.
              </li>
              <li>
                <b>При сборке сайта.</b> <code>YOUTUBE_API_KEY=… npm run podcasts:import</code> —
                список попадёт в репозиторий и приедет вместе с сайтом, тогда ключ не нужен никому.
              </li>
            </ol>
            <button className="primary" onClick={() => setSettingsOpen(true)}>
              Открыть настройки
            </button>
          </div>
        ) : doneToday ? (
          <div className="podcast-done">
            <strong>✓ Цель на сегодня выполнена</strong>
            <p>
              {plural(todaysWatches.length, "подкаст", "подкаста", "подкастов")} ·{" "}
              {formatTotalTime(secondsToday)}
            </p>
            {lastWatch && <em>{lastWatch.title}</em>}
            <div className="podcast-done-actions">
              <button className="secondary" onClick={oneMore} disabled={remaining === 0}>
                {remaining === 0 ? "Выпуски кончились" : "Посмотреть ещё"}
              </button>
              {lastWatch && (
                <button className="text-button" onClick={() => podcastStore.unmarkWatched(lastWatch.videoId)}>
                  Отменить отметку
                </button>
              )}
            </div>
          </div>
        ) : null}

        {!empty && video && !currentWatched && (
          <article className="podcast-card">
            {playing ? (
              <EpisodePlayer video={video} onWatched={() => finish(true)} />
            ) : (
              <button className="podcast-cover" onClick={() => setPlaying(true)}>
                {/* eslint-disable-next-line @next/next/no-img-element -- next/image
                    needs the Worker's /_vinext/image endpoint, and this site is
                    deployed as plain files with no server behind it. */}
                <img src={thumbnailUrl(video.id)} alt="" loading="lazy" />
                <span className="podcast-play">▶</span>
              </button>
            )}

            <div className="podcast-meta">
              <h2>{video.title}</h2>
              <p>
                {channel?.title ?? "YouTube"} · {formatDuration(video.seconds)}
              </p>
            </div>

            <div className="podcast-actions">
              {!playing && (
                <button className="primary" onClick={() => setPlaying(true)}>
                  ▶ Смотреть
                </button>
              )}
              <a
                className="secondary"
                href={watchUrl(video.id)}
                target="_blank"
                rel="noreferrer"
              >
                Открыть в YouTube
              </a>
              <button className="secondary" onClick={() => finish(false)}>
                ✓ Я посмотрел
              </button>
              <button className="text-button" onClick={anotherEpisode} disabled={remaining <= 1}>
                Другое
              </button>
            </div>

            <p className="podcast-goal">
              {doneToday
                ? `Цель выполнена · ${plural(todaysWatches.length, "подкаст", "подкаста", "подкастов")} сегодня, это сверх неё`
                : "Цель сегодня · 0 / 1 подкаст"}
            </p>
          </article>
        )}

        {!empty && today && !video && (
          <div className="podcast-empty">
            <h2>На сегодня выпусков не нашлось</h2>
            <p>
              Всё, что подходит по длительности, уже просмотрено. Расширьте окно длительности или
              добавьте канал в настройках.
            </p>
            <button className="primary" onClick={() => setSettingsOpen(true)}>
              Открыть настройки
            </button>
          </div>
        )}

        {doneToday && lastWatch && (
          <form
            className="podcast-note"
            onSubmit={(event) => {
              event.preventDefault();
              podcastStore.saveNote(lastWatch.videoId, noteDraft ?? lastWatch.note ?? "");
              setNoteDraft(null);
              setNoteSaved(true);
            }}
          >
            <label htmlFor="podcast-note">
              <b lang="ar" dir="rtl">ماذا فهمت؟</b> Что вы поняли?
            </label>
            <textarea
              id="podcast-note"
              rows={2}
              value={noteDraft ?? lastWatch.note ?? ""}
              onChange={(event) => {
                setNoteDraft(event.target.value);
                setNoteSaved(false);
              }}
              placeholder="Хотя бы одно предложение — можно по-арабски"
            />
            <div className="note-actions">
              <button className="secondary" type="submit">
                Сохранить
              </button>
              {/* Saving changed nothing on screen, which is indistinguishable
                  from a dead button. It has to say that it worked. */}
              {noteSaved && <span className="note-saved">Сохранено ✓</span>}
            </div>
          </form>
        )}

        {today && (
          <section className="podcast-calendar">
            <h3>{new Intl.DateTimeFormat("ru-RU", { month: "long" }).format(new Date(`${today}T12:00:00`))}</h3>
            <div className="calendar-grid">
              {WEEKDAYS.map((day) => (
                <span key={day} className="calendar-weekday">
                  {day}
                </span>
              ))}
              {calendar.flat().map((cell, index) =>
                cell ? (
                  <span
                    key={cell.date}
                    className={`calendar-day is-${cell.state}`}
                    title={
                      cell.episodes
                        ? `${cell.date}: ${plural(cell.episodes, "подкаст", "подкаста", "подкастов")}`
                        : cell.date
                    }
                  >
                    {cell.state === "done" ? "✓" : cell.day}
                  </span>
                ) : (
                  <span key={`blank-${index}`} className="calendar-day is-blank" />
                ),
              )}
            </div>
          </section>
        )}

        <div className="stats-grid podcast-stats">
          <div>
            <strong>{run.current}</strong>
            <span>Серия, дней</span>
          </div>
          <div>
            <strong>{run.longest}</strong>
            <span>Лучшая серия</span>
          </div>
          <div>
            <strong>
              {month.done}/{month.elapsed}
            </strong>
            <span>В этом месяце</span>
          </div>
          <div>
            <strong>{overall.episodes}</strong>
            <span>Всего подкастов</span>
          </div>
          <div>
            <strong>{formatTotalTime(overall.seconds)}</strong>
            <span>Всего на арабском</span>
          </div>
        </div>

        <section className="podcast-settings">
          <button className="text-button" onClick={() => setSettingsOpen((open) => !open)}>
            {settingsOpen ? "Свернуть настройки" : "Настройки и каналы"}
          </button>

          {settingsOpen && (
            <div className="podcast-settings-body">
              <h3>Каналы</h3>
              <ul className="source-list">
                {handles.map((handle) => {
                  const known = catalog.channels.find((item) => sameHandle(item.handle, handle));
                  const own = state.sources.some((item) => sameHandle(item, handle));
                  return (
                    <li key={handle}>
                      <span>
                        <b>{known?.title ?? handle}</b>
                        {known ? <small>{handle}</small> : <small>ещё не загружен</small>}
                      </span>
                      {own && (
                        <button
                          className="text-button"
                          onClick={() =>
                            podcastStore.setSources(
                              state.sources.filter((item) => !sameHandle(item, handle)),
                            )
                          }
                        >
                          Убрать
                        </button>
                      )}
                    </li>
                  );
                })}
              </ul>

              <form className="source-add" onSubmit={addSource}>
                <input
                  value={sourceDraft}
                  onChange={(event) => setSourceDraft(event.target.value)}
                  placeholder="youtube.com/@channel"
                  aria-label="Ссылка на канал"
                />
                <button className="secondary" type="submit">
                  Добавить
                </button>
              </form>

              <h3>Длительность</h3>
              <div className="chips window-chips">
                {WINDOWS.map(({ label, window: option }) => (
                  <button
                    key={label}
                    className={sameWindow(state.window, option) ? "is-active" : ""}
                    onClick={() => podcastStore.setWindow(option)}
                  >
                    {label}
                  </button>
                ))}
              </div>

              <h3>Ключ YouTube Data API</h3>
              <p className="podcast-hint">
                Нужен только чтобы обновлять список выпусков с этого устройства. Хранится здесь же,
                уходит только на googleapis.com и доступа к вашему аккаунту YouTube не даёт.
              </p>
              <form
                className="source-add"
                onSubmit={(event) => {
                  event.preventDefault();
                  podcastStore.setApiKey(keyDraft.trim());
                  setKeyDraft("");
                  setRefreshNote(keyDraft.trim() ? "Ключ сохранён" : "Ключ удалён");
                }}
              >
                <input
                  type="password"
                  value={keyDraft}
                  onChange={(event) => setKeyDraft(event.target.value)}
                  placeholder={state.apiKey ? "Ключ сохранён — введите новый" : "AIza…"}
                  aria-label="Ключ YouTube Data API"
                />
                <button className="secondary" type="submit">
                  Сохранить
                </button>
              </form>

              <div className="source-add">
                <button className="primary" onClick={refreshCatalog} disabled={refreshing || !state.apiKey}>
                  {refreshing ? "Обновляю…" : "Обновить список выпусков"}
                </button>
                {state.apiKey && (
                  <button className="text-button" onClick={() => podcastStore.setApiKey("")}>
                    Удалить ключ
                  </button>
                )}
              </div>

              {refreshNote && <p className="podcast-hint">{refreshNote}</p>}
              <p className="podcast-hint">
                {catalog.generatedAt
                  ? `Список собран ${new Date(catalog.generatedAt).toLocaleDateString("ru-RU")} · ${plural(catalog.videos.length, "выпуск", "выпуска", "выпусков")}, из них не просмотрено ${remaining}`
                  : "Список ещё ни разу не собирался"}
              </p>
            </div>
          )}
        </section>
      </section>

      <footer>
        <span>Привычка считается по дням, а не по минутам</span>
        {/* Plain link for the same reason as the one in the header. */}
        {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
        <a className="text-button" href="/">
          К курсу Аш-Шифахия
        </a>
      </footer>
    </main>
  );
}
