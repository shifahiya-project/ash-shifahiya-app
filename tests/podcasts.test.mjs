import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { DEFAULT_HANDLES } from "../content/podcasts/channels.ts";
import { shippedCatalog } from "../content/podcasts/catalog.ts";
import {
  DEFAULT_WINDOW,
  eligibleVideos,
  formatDuration,
  formatTotalTime,
  parseChannelHandle,
  parseDuration,
  sameHandle,
  thumbnailUrl,
  watchUrl,
} from "../app/podcast-catalog.ts";
import {
  currentVideoId,
  emptyPlan,
  planForDay,
  withAnotherPick,
  withExtraEpisode,
} from "../app/podcast-day.ts";
import {
  activeDates,
  isGoalMet,
  monthCalendar,
  monthProgress,
  podcastDate,
  streaks,
  totals,
  watchedOn,
} from "../app/podcast-stats.ts";
import { activeCatalog } from "../app/podcast-store.ts";
import { WATCHED_RATIO, isWatchedEnough } from "../app/youtube-embed.ts";

/** A stand-in library: three channels, episodes of assorted lengths. */
function makeCatalog() {
  const channels = [
    { id: "UC-echo", handle: "@echo_arabic_podcast", title: "Echo", uploadsPlaylistId: "UU-echo" },
    { id: "UC-miss", handle: "@mcmissam", title: "Missam", uploadsPlaylistId: "UU-miss" },
  ];
  const videos = [];
  for (let index = 0; index < 12; index += 1) {
    videos.push({
      id: `vid-${String(index).padStart(2, "0")}`,
      channelId: index % 2 ? "UC-miss" : "UC-echo",
      title: `Выпуск ${index}`,
      publishedAt: `2026-08-${String(index + 1).padStart(2, "0")}T09:00:00Z`,
      // Alternating 10 minutes and 40 minutes, so half fall outside the window.
      seconds: index % 2 ? 600 : 2400,
    });
  }
  return { generatedAt: "2026-08-20T00:00:00Z", channels, videos };
}

const watch = (videoId, date, seconds = 600) => ({
  videoId,
  channelId: "UC-echo",
  title: videoId,
  date,
  seconds,
  auto: true,
  watchedAt: 0,
});

test("a YouTube duration is read into seconds", () => {
  assert.equal(parseDuration("PT11M42S"), 702);
  assert.equal(parseDuration("PT1H2M30S"), 3750);
  assert.equal(parseDuration("PT45S"), 45);
  assert.equal(parseDuration("PT12M"), 720);
  // An unreadable duration must not slip through as a zero-length episode:
  // it reads as 0 and the length filter then drops it.
  assert.equal(parseDuration("nonsense"), 0);
  assert.equal(parseDuration(""), 0);
});

test("durations are shown the way a player shows them", () => {
  assert.equal(formatDuration(702), "11:42");
  assert.equal(formatDuration(3750), "1:02:30");
  assert.equal(formatDuration(59), "0:59");
  assert.equal(formatTotalTime(31320), "8 ч 42 мин");
  assert.equal(formatTotalTime(600), "10 мин");
});

test("a channel is recognised however the link was copied", () => {
  assert.equal(
    parseChannelHandle("https://youtube.com/@echo_arabic_podcast?si=vFvpAaCmyA2ynJRy"),
    "@echo_arabic_podcast",
  );
  assert.equal(parseChannelHandle("@mcmissam"), "@mcmissam");
  assert.equal(parseChannelHandle("ArabicSpeakingPractice"), "@arabicspeakingpractice");
  assert.equal(parseChannelHandle("  https://www.youtube.com/@McMissam  "), "@mcmissam");
  // The other YouTube URL shapes carry no handle, and guessing one from the
  // path would silently add a channel that does not exist.
  assert.equal(parseChannelHandle("https://www.youtube.com/channel/UC123"), "");
  assert.equal(parseChannelHandle("https://youtube.com/c/Something"), "");
  assert.equal(parseChannelHandle(""), "");
  assert.ok(sameHandle("@McMissam", "@mcmissam"));
});

test("only unwatched episodes inside the length window are offered", () => {
  const catalog = makeCatalog();
  const eligible = eligibleVideos(catalog, [], DEFAULT_WINDOW);

  // Half the library is 40 minutes long and has no business in a daily habit.
  assert.equal(eligible.length, 6);
  for (const video of eligible) {
    assert.ok(video.seconds >= DEFAULT_WINDOW.min && video.seconds <= DEFAULT_WINDOW.max);
  }
  // Newest first, so an otherwise undecided pick leans toward a fresh episode.
  assert.deepEqual(
    eligible.map((video) => video.id),
    ["vid-11", "vid-09", "vid-07", "vid-05", "vid-03", "vid-01"],
  );

  const seen = eligibleVideos(catalog, ["vid-11", "vid-09"], DEFAULT_WINDOW);
  assert.deepEqual(seen.map((video) => video.id), ["vid-07", "vid-05", "vid-03", "vid-01"]);

  // A channel dropped from the sources takes its episodes with it.
  const trimmed = { ...catalog, channels: catalog.channels.slice(0, 1) };
  assert.equal(eligibleVideos(trimmed, [], DEFAULT_WINDOW).length, 0);
});

test("today's episode is the same episode after a reload", () => {
  const catalog = makeCatalog();
  const first = planForDay(catalog, [], "2026-08-24", undefined);
  const again = planForDay(catalog, [], "2026-08-24", undefined);
  assert.equal(currentVideoId(first), currentVideoId(again));

  // And the stored plan is what wins once there is one.
  const stored = { date: "2026-08-24", videoIds: ["vid-03"], skipped: [] };
  assert.equal(currentVideoId(planForDay(catalog, [], "2026-08-24", stored)), "vid-03");

  // Watching it does not unpin it: the card has to keep showing what was done.
  assert.equal(currentVideoId(planForDay(catalog, ["vid-03"], "2026-08-24", stored)), "vid-03");

  // A plan from another day is not today's plan.
  assert.notEqual(currentVideoId(planForDay(catalog, [], "2026-08-25", stored)), "vid-03");
});

test("a different day gets a different episode, and the library spreads out", () => {
  const catalog = makeCatalog();
  const picks = new Set();
  for (let day = 1; day <= 20; day += 1) {
    const date = `2026-09-${String(day).padStart(2, "0")}`;
    picks.add(currentVideoId(planForDay(catalog, [], date, undefined)));
  }
  // Seeding by the date has to actually vary the choice; the newest episode
  // winning every day would be a worse experience than a list.
  assert.ok(picks.size >= 4, `only ${picks.size} distinct episodes over 20 days`);
});

test("an episode outside the window is dropped from a stored plan", () => {
  const catalog = makeCatalog();
  // vid-02 runs 40 minutes: legal under a wide window, not under the default.
  const stored = { date: "2026-08-24", videoIds: ["vid-02"], skipped: [] };
  const plan = planForDay(catalog, [], "2026-08-24", stored, DEFAULT_WINDOW);
  assert.notEqual(currentVideoId(plan), "vid-02");
  assert.ok(currentVideoId(plan));

  const wide = planForDay(catalog, [], "2026-08-24", stored, { min: 60, max: 3600 });
  assert.equal(currentVideoId(wide), "vid-02");
});

test("«Другое» swaps the episode and does not offer it again today", () => {
  const catalog = makeCatalog();
  const plan = planForDay(catalog, [], "2026-08-24", undefined);
  const first = currentVideoId(plan);

  const second = withAnotherPick(catalog, [], plan);
  assert.notEqual(currentVideoId(second), first);
  assert.deepEqual(second.skipped, [first]);
  assert.equal(second.videoIds.length, 1);

  const third = withAnotherPick(catalog, [], second);
  assert.notEqual(currentVideoId(third), first);
  assert.notEqual(currentVideoId(third), currentVideoId(second));

  // A skipped episode stays out even when the plan is rebuilt from storage.
  const rebuilt = planForDay(catalog, [], "2026-08-24", { ...third, videoIds: [] });
  assert.ok(!third.skipped.includes(currentVideoId(rebuilt)));
});

test("«Другое» keeps the episode when there is nothing to swap to", () => {
  const catalog = makeCatalog();
  const only = ["vid-11", "vid-09", "vid-07", "vid-05", "vid-03"];
  const plan = { date: "2026-08-24", videoIds: ["vid-01"], skipped: [] };
  // Everything but vid-01 is watched, so refusing it would empty the screen.
  const next = withAnotherPick(catalog, only, plan);
  assert.equal(currentVideoId(next), "vid-01");
});

test("«Посмотреть ещё» adds an episode without losing the first", () => {
  const catalog = makeCatalog();
  const plan = planForDay(catalog, [], "2026-08-24", undefined);
  const first = currentVideoId(plan);

  const extended = withExtraEpisode(catalog, [first], plan);
  assert.equal(extended.videoIds.length, 2);
  assert.equal(extended.videoIds[0], first);
  assert.notEqual(currentVideoId(extended), first);
});

test("an empty catalog offers nothing rather than throwing", () => {
  const empty = { generatedAt: "", channels: [], videos: [] };
  const plan = planForDay(empty, [], "2026-08-24", undefined);
  assert.equal(currentVideoId(plan), undefined);
  assert.deepEqual(withAnotherPick(empty, [], plan), plan);
  assert.deepEqual(emptyPlan("2026-08-24"), { date: "2026-08-24", videoIds: [], skipped: [] });
});

test("one episode makes the day, and the rest only move the counters", () => {
  const watches = [
    watch("a", "2026-08-24", 600),
    watch("b", "2026-08-24", 900),
    watch("c", "2026-08-23", 600),
  ];
  assert.ok(isGoalMet(watches, "2026-08-24"));
  assert.ok(!isGoalMet(watches, "2026-08-22"));
  assert.equal(watchedOn(watches, "2026-08-24").length, 2);

  // Two episodes on one day are two episodes but a single green day: the
  // streak counts days kept, not work done.
  assert.deepEqual(totals(watches), { days: 2, episodes: 3, seconds: 2100 });
  assert.deepEqual(activeDates(watches), ["2026-08-23", "2026-08-24"]);
});

test("the streak survives an unfinished today and breaks on a missed day", () => {
  const days = ["2026-08-19", "2026-08-20", "2026-08-21", "2026-08-22", "2026-08-23"];
  const watches = days.map((date) => watch(date, date));

  // Today is not over, so a streak that ran through yesterday is still live.
  assert.deepEqual(streaks(watches, "2026-08-24"), { current: 5, longest: 5 });
  assert.deepEqual(streaks(watches, "2026-08-23"), { current: 5, longest: 5 });
  // A whole day missed ends it.
  assert.deepEqual(streaks(watches, "2026-08-25"), { current: 0, longest: 5 });

  const broken = [...watches, watch("later", "2026-08-27")];
  assert.deepEqual(streaks(broken, "2026-08-27"), { current: 1, longest: 5 });
  assert.deepEqual(streaks([], "2026-08-24"), { current: 0, longest: 0 });
});

test("the month line counts the days that have actually happened", () => {
  const watches = ["2026-08-01", "2026-08-02", "2026-08-24", "2026-07-30"].map((date) =>
    watch(date, date),
  );
  assert.deepEqual(monthProgress(watches, "2026-08-24"), { done: 3, elapsed: 24 });
});

test("the calendar runs Monday to Sunday and leaves today open", () => {
  const watches = [watch("a", "2026-08-03"), watch("b", "2026-08-03"), watch("c", "2026-08-05")];
  const weeks = monthCalendar(watches, "2026-08-24");

  const days = weeks.flat().filter(Boolean);
  assert.equal(days.length, 31);
  // 1 August 2026 is a Saturday, so five blanks lead the first week.
  assert.equal(weeks[0].filter((cell) => cell === null).length, 5);
  assert.equal(weeks[0][5].day, 1);
  for (const week of weeks) assert.equal(week.length, 7);

  const byDate = new Map(days.map((cell) => [cell.date, cell]));
  assert.equal(byDate.get("2026-08-03").state, "done");
  assert.equal(byDate.get("2026-08-03").episodes, 2);
  assert.equal(byDate.get("2026-08-04").state, "missed");
  // Today is neither done nor failed while it is still today.
  assert.equal(byDate.get("2026-08-24").state, "today");
  assert.equal(byDate.get("2026-08-25").state, "future");
});

test("a day is the learner's own day, not a UTC one", () => {
  // Late evening in a timezone ahead of UTC still belongs to the local date.
  const evening = new Date("2026-08-24T22:30:00");
  assert.equal(podcastDate(0, evening), "2026-08-24");
  assert.equal(podcastDate(-1, evening), "2026-08-23");
  assert.equal(podcastDate(1, evening), "2026-08-25");
});

test("an episode counts once four fifths of it has played", () => {
  assert.equal(WATCHED_RATIO, 0.8);
  assert.ok(isWatchedEnough(480, 600));
  assert.ok(!isWatchedEnough(479, 600));
  // A player that has not loaded reports zeroes, which must not count.
  assert.ok(!isWatchedEnough(0, 0));
  assert.ok(!isWatchedEnough(Number.NaN, 600));
});

test("the newest list wins, and a device without one still has episodes", () => {
  const shipped = { generatedAt: "2026-08-01T00:00:00Z", channels: [], videos: [{ id: "s" }] };
  const local = { generatedAt: "2026-08-20T00:00:00Z", channels: [], videos: [{ id: "l" }] };
  const base = { watches: [], plans: {}, sources: [], window: DEFAULT_WINDOW, apiKey: "" };

  assert.equal(activeCatalog({ ...base, catalog: null }, shipped), shipped);
  assert.equal(activeCatalog({ ...base, catalog: local }, shipped), local);
  // An empty refresh must not blank out the list the site shipped with.
  assert.equal(activeCatalog({ ...base, catalog: { ...local, videos: [] } }, shipped), shipped);
  assert.equal(
    activeCatalog({ ...base, catalog: { ...local, generatedAt: "2026-07-01T00:00:00Z" } }, shipped),
    shipped,
  );
});

test("links are built from the video id alone", () => {
  assert.equal(watchUrl("abc123"), "https://www.youtube.com/watch?v=abc123");
  // mqdefault exists for every video, where the larger names are missing on
  // some and would render as a broken box.
  assert.equal(thumbnailUrl("abc123"), "https://i.ytimg.com/vi/abc123/mqdefault.jpg");
});

test("the shipped catalog is the shape the app expects", () => {
  assert.ok(Array.isArray(shippedCatalog.channels));
  assert.ok(Array.isArray(shippedCatalog.videos));
  assert.equal(typeof shippedCatalog.generatedAt, "string");
  for (const video of shippedCatalog.videos) {
    assert.match(video.id, /^[\w-]{5,}$/);
    assert.ok(video.seconds > 0, `${video.id} has no duration`);
    assert.ok(
      shippedCatalog.channels.some((channel) => channel.id === video.channelId),
      `${video.id} belongs to a channel that is not in the catalog`,
    );
  }
});

test("the three starting channels are the ones that were asked for", () => {
  assert.deepEqual(DEFAULT_HANDLES, [
    "@echo_arabic_podcast",
    "@mcmissam",
    "@arabicspeakingpractice",
  ]);
  // Stored the way the parser produces them, so a pasted link matches a default
  // instead of adding the same channel twice.
  for (const handle of DEFAULT_HANDLES) assert.equal(parseChannelHandle(handle), handle);
});

test("the podcast habit keeps its own keys and its own storage", async () => {
  const store = await readFile(new URL("../app/podcast-store.ts", import.meta.url), "utf8");
  for (const key of [
    "shifahiya-podcasts-v1",
    "shifahiya-podcast-days-v1",
    "shifahiya-podcast-catalog-v1",
    "shifahiya-podcast-window-v1",
  ]) {
    assert.ok(store.includes(key), `${key} is missing from the store`);
  }

  // The learner's API key is theirs: it may reach googleapis.com and nothing
  // else. There is no server in this project to send it to, and there must be
  // no code that tries.
  const client = await readFile(new URL("../app/podcast-youtube.ts", import.meta.url), "utf8");
  const hosts = client.match(/https:\/\/[\w.-]+/g) ?? [];
  assert.deepEqual([...new Set(hosts)], ["https://www.googleapis.com"]);
});

async function renderPodcasts() {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);

  return worker.fetch(
    new Request("http://localhost/podcasts", { headers: { accept: "text/html" } }),
    { ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) } },
    { waitUntil() {}, passThroughOnException() {} },
  );
}

test("the podcast screen is its own route and renders on the server", async () => {
  const response = await renderPodcasts();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);

  const html = await response.text();
  assert.match(html, /العربية كل يوم/);
  assert.match(html, /Всего на арабском/);
  // The route carries its own title rather than inheriting the course's.
  assert.match(html, /<title>[^<]*подкаст в день<\/title>/i);

  // Nothing about the learner is known on the server, so the day starts blank
  // and the counters start at zero: the client fills both in on hydration.
  assert.match(html, /Серия, дней/);

  // And the server must not choose today's episode. The date it would pin one
  // to is empty here, so the choice would differ from the one the client makes
  // and the card would visibly swap — in a feature whose whole point is that
  // today's episode is decided once and stays put.
  assert.doesNotMatch(html, /podcast-card/);
});

test("the day's card follows the pinned episode, not the goal", async () => {
  const page = await readFile(new URL("../app/podcasts/page.tsx", import.meta.url), "utf8");

  // The daily goal is a floor, not a ceiling. Gating the card on the goal left
  // «Посмотреть ещё» pinning an episode with nowhere to show it: the goal stays
  // met for the rest of the day, so the card never came back and a learner who
  // wanted a second episode could not watch one.
  assert.match(page, /!empty && video && !currentWatched/);
  assert.doesNotMatch(page, /video && !doneToday/);
});

test("the course home offers the podcast habit without mixing it into a lesson", async () => {
  const page = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");
  assert.match(page, /className="podcast-link" href="\/podcasts\/"/);
  // The daily podcast must not touch the Leitner boxes or the lesson scores.
  assert.doesNotMatch(page, /podcastStore|podcast-catalog/);
});
