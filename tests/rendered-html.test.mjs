import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import test from "node:test";

async function render() {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);

  return worker.fetch(
    new Request("http://localhost/", {
      headers: { accept: "text/html" },
    }),
    {
      ASSETS: {
        fetch: async () => new Response("Not found", { status: 404 }),
      },
    },
    {
      waitUntil() {},
      passThroughOnException() {},
    },
  );
}

test("server-renders the Shifahiya course with lesson twenty-eight", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);

  const html = await response.text();
  assert.match(html, /<title>Аш-Шифахия — арабский шаг за шагом<\/title>/i);
  assert.match(html, /28 из 100 уроков готовы/);
  assert.match(html, /Известный правитель и занятый министр/);
  assert.match(html, /الدَّرْسُ الخَامِسُ عَشَرَ/);
  assert.match(html, /48 заданий/);
  assert.doesNotMatch(html, /Your site is taking shape|Building your site/);
});

test("keeps lesson fifteen data and local progress support in the app", async () => {
  const page = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");
  const lessonFifteen = await readFile(new URL("../content/lesson-15.ts", import.meta.url), "utf8");
  const catalog = await readFile(new URL("../content/index.ts", import.meta.url), "utf8");
  const contentFiles = await readdir(new URL("../content/", import.meta.url));

  const lessonSixteen = await readFile(new URL("../content/lesson-16.ts", import.meta.url), "utf8");
  const lessonSeventeen = await readFile(new URL("../content/lesson-17.ts", import.meta.url), "utf8");
  const lessonEighteen = await readFile(new URL("../content/lesson-18.ts", import.meta.url), "utf8");
  const lessonNineteen = await readFile(new URL("../content/lesson-19.ts", import.meta.url), "utf8");
  const lessonTwenty = await readFile(new URL("../content/lesson-20.ts", import.meta.url), "utf8");
  const lessonTwentyOne = await readFile(new URL("../content/lesson-21.ts", import.meta.url), "utf8");
  const lessonTwentyTwo = await readFile(new URL("../content/lesson-22.ts", import.meta.url), "utf8");
  const lessonTwentyThree = await readFile(new URL("../content/lesson-23.ts", import.meta.url), "utf8");
  const lessonTwentyFour = await readFile(new URL("../content/lesson-24.ts", import.meta.url), "utf8");
  const lessonTwentyFive = await readFile(new URL("../content/lesson-25.ts", import.meta.url), "utf8");
  const lessonTwentySix = await readFile(new URL("../content/lesson-26.ts", import.meta.url), "utf8");
  const lessonTwentySeven = await readFile(new URL("../content/lesson-27.ts", import.meta.url), "utf8");
  const lessonTwentyEight = await readFile(new URL("../content/lesson-28.ts", import.meta.url), "utf8");
  assert.equal(contentFiles.filter((file) => /^lesson-\d{2}\.ts$/.test(file)).length, 28);
  assert.match(lessonFifteen, /export const lessonFifteen: Lesson/);
  assert.match(lessonFifteen, /مَلِكٌ/);
  assert.match(lessonFifteen, /مُتَأَهِّلَاتٌ/);
  assert.match(lessonFifteen, /أَمَّا \.\.\. فَـ \.\.\./);
  assert.match(catalog, /export const rawLessons/);
  assert.match(lessonSixteen, /export const lessonSixteen: Lesson/);
  assert.match(lessonSixteen, /بِلَادٌ/);
  assert.match(lessonSixteen, /هَذِهِ الْبُيُوتُ وَاسِعَةٌ/);
  assert.match(lessonSeventeen, /export const lessonSeventeen: Lesson/);
  assert.match(lessonSeventeen, /مَسَاجِدُ/);
  assert.match(lessonSeventeen, /هَلْ أَبُوكَ عَالِمٌ أَوَلَا؟/);
  assert.match(lessonEighteen, /export const lessonEighteen: Lesson/);
  assert.match(lessonEighteen, /مَحَابِرُ/);
  assert.match(lessonEighteen, /هَلْ لَكَ قَلَمٌ وَمِحْبَرَةٌ؟/);
  assert.match(lessonNineteen, /export const lessonNineteen: Lesson/);
  assert.match(lessonNineteen, /مُعْوَجٌّ/);
  assert.match(lessonNineteen, /عَصَايَ قَصِيرَةٌ/);
  assert.match(lessonTwenty, /export const lessonTwenty: Lesson/);
  assert.match(lessonTwenty, /بَيْضَاءُ/);
  assert.match(lessonTwenty, /هَذِهِ الْوَرَقَةُ خَضْرَاءُ/);
  assert.match(lessonTwentyOne, /export const lessonTwentyOne: Lesson/);
  assert.match(lessonTwentyOne, /مَدَحْتُنَّ/);
  assert.match(lessonTwentyOne, /مَدَحَ عَلِيٌّ أَبَاكَ/);
  assert.match(lessonTwentyTwo, /export const lessonTwentyTwo: Lesson/);
  assert.match(lessonTwentyTwo, /مِرَارًا/);
  assert.match(lessonTwentyTwo, /مَا سُرِقَ شَيْءٌ/);
  assert.match(lessonTwentyThree, /export const lessonTwentyThree: Lesson/);
  assert.match(lessonTwentyThree, /كَمِثْلِي/);
  assert.match(lessonTwentyThree, /رَجَعَ مِنِّي/);
  assert.match(lessonTwentyFour, /export const lessonTwentyFour: Lesson/);
  assert.match(lessonTwentyFour, /صَلَاةُ الْعِشَاءِ/);
  assert.match(lessonTwentyFour, /مَا ضَرَبَ أَحَدًا/);
  assert.match(lessonTwentyFive, /export const lessonTwentyFive: Lesson/);
  assert.match(lessonTwentyFive, /يَوْمُ الْخَمِيسِ/);
  assert.match(lessonTwentyFive, /رَجَعَ عَلِيٌّ مِنَ السُّوقِ الْبَارِحَةَ/);
  assert.match(lessonTwentySix, /export const lessonTwentySix: Lesson/);
  assert.match(lessonTwentySix, /إِلَى مَتَى/);
  assert.match(lessonTwentySix, /جَلَسْتُ تَحْتَ الشَّجَرَةِ/);
  assert.match(lessonTwentySeven, /export const lessonTwentySeven: Lesson/);
  assert.match(lessonTwentySeven, /بَيْنَمَا/);
  assert.match(lessonTwentySeven, /ذُو الْحِجَّةِ/);
  assert.match(lessonTwentyEight, /export const lessonTwentyEight: Lesson/);
  assert.match(lessonTwentyEight, /أَشْرِبَةٌ/);
  assert.match(lessonTwentyEight, /لَعِبَ هَذَا الْوَلَدُ/);
  assert.match(page, /import \{ rawLessons, type Lesson, type Question \} from "\.\.\/content"/);
  assert.match(page, /shifahiya-active-session/);
  assert.match(page, /shifahiya-session-\$\{lessonId\}/);
  assert.match(page, /unfinished \? "Продолжить"/);
  assert.match(page, /restoreSession\(storedSession\)/);
  assert.match(page, /shifahiya-card-progress-v1/);
  assert.match(page, /REVIEW_INTERVALS = \[0, 1, 3, 7, 14, 30\]/);
  assert.match(page, /Повторить сейчас/);
  assert.match(page, /rateLearningCard\(false\)/);
  assert.match(page, /rateReviewCard\(true\)/);
  assert.match(page, /Сохранить копию/);
  assert.match(page, /shifahiya-learning-stats-v1/);
  assert.match(page, /WORD_ACHIEVEMENTS = \[10, 50, 100, 250, 500, 1000, 1500, 2000\]/);
  assert.match(page, /Ваш путь в цифрах/);
  assert.match(page, /слов выучено/);
  assert.match(page, /рекорд без перерыва/);
  assert.match(page, /Продолжить обучение/);
  assert.match(page, /latestSessionPosition/);
  assert.match(page, /Следующий шаг/);
  assert.match(page, /recommendedLesson/);
  assert.match(page, /updatedAt: Date\.now\(\)/);
  assert.doesNotMatch(page, /setSavedSessions\(\{ \.\.\.sessions \}\);\s+restoreSession\(session\)/);
  assert.match(page, /shifahiya-lesson-\$\{item\.id\}/);
  assert.match(page, /shuffle\(currentQuestion\?\.options/);
  assert.match(page, /const targetCount = words\.length \* 2/);
  assert.match(page, /\.map\(expandLessonQuestions\)/);
});
