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

type SavedSession = {
  view: "learn" | "practice";
  lessonId: number;
  deckIndex: number;
  round: number;
  cardIndex: number;
  questionIndex: number;
  score: number;
  mistakes: string[];
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

const lessonThree: Lesson = {
  id: 3,
  arabicTitle: "الدَّرْسُ الثَّالِثُ",
  title: "Этот мужчина. Те женщины.",
  description: "14 форм · 2 круга повторения · 12 заданий",
  tags: ["Указательные слова", "Люди", "Род и число"],
  decks: [
    {
      title: "Этот, эта, эти и те",
      words: [
        { arabic: "هَذَا", russian: "этот", note: "мужской род" },
        { arabic: "هَذِهِ", russian: "эта", note: "женский род" },
        { arabic: "هَؤُلَاءِ", russian: "эти", note: "для людей" },
        { arabic: "ذَلِكَ", russian: "тот", note: "мужской род" },
        { arabic: "تِلْكَ", russian: "та", note: "женский род" },
        { arabic: "أُولَئِكَ", russian: "те", note: "для людей" },
      ],
    },
    {
      title: "Люди и их признаки",
      words: [
        { arabic: "غَنِيٌّ", russian: "богатый" },
        { arabic: "أَغْنِيَاءُ", russian: "богатые" },
        { arabic: "فَقِيرٌ", russian: "бедный" },
        { arabic: "فُقَرَاءُ", russian: "бедные" },
        { arabic: "رَجُلٌ", russian: "мужчина" },
        { arabic: "رِجَالٌ", russian: "мужчины" },
        { arabic: "اِمْرَأَةٌ", russian: "женщина" },
        { arabic: "نِسَاءٌ", russian: "женщины" },
      ],
    },
  ],
  questions: [
    { prompt: "هَذَا", promptLang: "ar", answer: "этот", options: ["этот", "эта", "тот"], explanation: "هَذَا указывает на один близкий предмет или человека мужского рода." },
    { prompt: "эта", promptLang: "ru", answer: "هَذِهِ", options: ["هَذِهِ", "هَذَا", "تِلْكَ"], explanation: "هَذِهِ — «эта», форма женского рода." },
    { prompt: "أُولَئِكَ", promptLang: "ar", answer: "те", options: ["те", "эти", "тот"], explanation: "أُولَئِكَ — «те» при указании на группу людей вдали." },
    { prompt: "мужчина", promptLang: "ru", answer: "رَجُلٌ", options: ["رَجُلٌ", "رِجَالٌ", "اِمْرَأَةٌ"], explanation: "رَجُلٌ означает «мужчина»." },
    { prompt: "هَذَا رَجُلٌ غَنِيٌّ", promptLang: "ar", answer: "Этот мужчина богатый", options: ["Этот мужчина богатый", "Тот мужчина бедный", "Эти мужчины богатые"], explanation: "هَذَا — «этот», رَجُلٌ — «мужчина», غَنِيٌّ — «богатый»." },
    { prompt: "Эти мужчины бедные", promptLang: "ru", answer: "هَؤُلَاءِ الرِّجَالُ فُقَرَاءُ", options: ["هَؤُلَاءِ الرِّجَالُ فُقَرَاءُ", "أُولَئِكَ الرِّجَالُ أَغْنِيَاءُ", "هَذَا الرَّجُلُ فَقِيرٌ"], explanation: "Для близкой группы людей используется هَؤُلَاءِ." },
    { prompt: "تِلْكَ اِمْرَأَةٌ فَقِيرَةٌ", promptLang: "ar", answer: "Та женщина бедная", options: ["Та женщина бедная", "Эта женщина богатая", "Те женщины бедные"], explanation: "تِلْكَ — «та», форма женского рода." },
    { prompt: "Те женщины богатые", promptLang: "ru", answer: "أُولَئِكَ النِّسَاءُ غَنِيَّاتٌ", options: ["أُولَئِكَ النِّسَاءُ غَنِيَّاتٌ", "هَؤُلَاءِ النِّسَاءُ فَقِيرَاتٌ", "تِلْكَ المَرْأَةُ غَنِيَّةٌ"], explanation: "أُولَئِكَ указывает на удалённую группу людей." },
    { prompt: "هَؤُلَاءِ رِجَالٌ", promptLang: "ar", answer: "Это мужчины", options: ["Это мужчины", "Те мужчины", "Этот мужчина"], explanation: "هَؤُلَاءِ используется для нескольких близких людей." },
    { prompt: "Тот мужчина высокий", promptLang: "ru", answer: "ذَلِكَ الرَّجُلُ طَوِيلٌ", options: ["ذَلِكَ الرَّجُلُ طَوِيلٌ", "هَذَا الرَّجُلُ قَصِيرٌ", "تِلْكَ المَرْأَةُ طَوِيلَةٌ"], explanation: "ذَلِكَ — «тот», الرَّجُلُ — «мужчина»." },
    { prompt: "هَذِهِ المَرْأَةُ قَصِيرَةٌ", promptLang: "ar", answer: "Эта женщина невысокая", options: ["Эта женщина невысокая", "Та женщина высокая", "Эти женщины невысокие"], explanation: "هَذِهِ согласуется с существительным женского рода." },
    { prompt: "هَذَا المَرْأَةُ غَنِيَّةٌ", promptLang: "ar", answer: "هَذِهِ المَرْأَةُ غَنِيَّةٌ", options: ["هَذِهِ المَرْأَةُ غَنِيَّةٌ", "هَذَا الرَّجُلُ غَنِيٌّ", "تِلْكَ المَرْأَةُ فَقِيرَةٌ"], explanation: "С существительным المَرْأَةُ нужно женское указательное слово هَذِهِ." },
  ],
};

const lessonFour: Lesson = {
  id: 4,
  arabicTitle: "الدَّرْسُ الرَّابِعُ",
  title: "Этот юноша — учёный.",
  description: "28 форм · 2 круга повторения · 14 заданий",
  tags: ["Люди", "Возраст", "Занятия и качества"],
  decks: [
    {
      title: "Люди и возраст",
      words: [
        { arabic: "إِنْسَانٌ", russian: "человек" },
        { arabic: "أُنَاسٌ", russian: "люди" },
        { arabic: "شَيْخٌ", russian: "старик / пожилой мужчина" },
        { arabic: "شُيُوخٌ", russian: "старики / пожилые мужчины" },
        { arabic: "عَجُوزٌ", russian: "старуха / пожилая женщина" },
        { arabic: "عَجَائِزُ", russian: "старухи / пожилые женщины" },
        { arabic: "وَلَدٌ", russian: "мальчик / ребёнок" },
        { arabic: "أَوْلَادٌ", russian: "мальчики / дети" },
        { arabic: "صَبِيٌّ", russian: "мальчик" },
        { arabic: "صِبْيَانٌ", russian: "мальчики" },
        { arabic: "صَبِيَّةٌ", russian: "девочка" },
        { arabic: "صَبِيَّاتٌ", russian: "девочки" },
        { arabic: "شَابٌّ", russian: "юноша" },
        { arabic: "شُبَّانٌ", russian: "юноши" },
      ],
    },
    {
      title: "Служение и знания",
      words: [
        { arabic: "شَابَّةٌ", russian: "девушка" },
        { arabic: "شَابَّاتٌ", russian: "девушки" },
        { arabic: "خَادِمٌ", russian: "слуга" },
        { arabic: "خُدَّامٌ", russian: "слуги" },
        { arabic: "خَادِمَةٌ", russian: "служанка" },
        { arabic: "خَادِمَاتٌ", russian: "служанки" },
        { arabic: "عَالِمٌ", russian: "учёный" },
        { arabic: "عُلَمَاءُ", russian: "учёные" },
        { arabic: "عَالِمَةٌ", russian: "учёная" },
        { arabic: "عَالِمَاتٌ", russian: "учёные", note: "женский род" },
        { arabic: "جَاهِلٌ", russian: "невежда / неучёный" },
        { arabic: "جُهَّلٌ", russian: "невежды" },
        { arabic: "جَاهِلَةٌ", russian: "невежда", note: "женский род" },
        { arabic: "جَاهِلَاتٌ", russian: "невежды", note: "женский род" },
      ],
    },
  ],
  questions: [
    { prompt: "إِنْسَانٌ", promptLang: "ar", answer: "человек", options: ["человек", "люди", "юноша"], explanation: "إِنْسَانٌ означает «человек»." },
    { prompt: "пожилые мужчины", promptLang: "ru", answer: "شُيُوخٌ", options: ["شُيُوخٌ", "شُبَّانٌ", "عَجَائِزُ"], explanation: "شُيُوخٌ — множественное число от شَيْخٌ." },
    { prompt: "عَجَائِزُ", promptLang: "ar", answer: "пожилые женщины", options: ["пожилые женщины", "девушки", "женщины-учёные"], explanation: "عَجَائِزُ — множественное число: «пожилые женщины»." },
    { prompt: "девочки", promptLang: "ru", answer: "صَبِيَّاتٌ", options: ["صَبِيَّاتٌ", "صِبْيَانٌ", "شَابَّاتٌ"], explanation: "صَبِيَّاتٌ — «девочки»." },
    { prompt: "هَذَا الإِنْسَانُ شَيْخٌ", promptLang: "ar", answer: "Этот человек — старик", options: ["Этот человек — старик", "Этот человек — юноша", "Те люди — старики"], explanation: "شَيْخٌ обозначает пожилого мужчину." },
    { prompt: "Те старики — учёные", promptLang: "ru", answer: "أُولَئِكَ الشُّيُوخُ عُلَمَاءُ", options: ["أُولَئِكَ الشُّيُوخُ عُلَمَاءُ", "هَؤُلَاءِ الشُّبَّانُ جُهَّلٌ", "ذَلِكَ الشَّيْخُ عَالِمٌ"], explanation: "أُولَئِكَ — «те», الشُّيُوخُ — «старики», عُلَمَاءُ — «учёные»." },
    { prompt: "هَؤُلَاءِ الأَوْلَادُ صِبْيَانٌ", promptLang: "ar", answer: "Эти дети — мальчики", options: ["Эти дети — мальчики", "Те дети — девочки", "Этот ребёнок — мальчик"], explanation: "هَؤُلَاءِ используется для близкой группы людей." },
    { prompt: "Эти девушки — учёные", promptLang: "ru", answer: "هَؤُلَاءِ الشَّابَّاتُ عَالِمَاتٌ", options: ["هَؤُلَاءِ الشَّابَّاتُ عَالِمَاتٌ", "أُولَئِكَ الشُّبَّانُ عُلَمَاءُ", "هَذِهِ الشَّابَّةُ جَاهِلَةٌ"], explanation: "Для женской группы используются формы شَابَّاتٌ и عَالِمَاتٌ." },
    { prompt: "ذَلِكَ الخَادِمُ شَابٌّ", promptLang: "ar", answer: "Тот слуга — юноша", options: ["Тот слуга — юноша", "Этот слуга — старик", "Те слуги — юноши"], explanation: "ذَلِكَ — «тот», الخَادِمُ — «слуга», شَابٌّ — «юноша»." },
    { prompt: "Те служанки — пожилые женщины", promptLang: "ru", answer: "أُولَئِكَ الخَادِمَاتُ عَجَائِزُ", options: ["أُولَئِكَ الخَادِمَاتُ عَجَائِزُ", "هَؤُلَاءِ الخُدَّامُ شُيُوخٌ", "تِلْكَ الخَادِمَةُ شَابَّةٌ"], explanation: "الخَادِمَاتُ — «служанки», عَجَائِزُ — «пожилые женщины»." },
    { prompt: "هُمْ شُبَّانٌ", promptLang: "ar", answer: "Они — юноши", options: ["Они — юноши", "Они — старики", "Они — дети"], explanation: "شُبَّانٌ — множественное число от شَابٌّ." },
    { prompt: "Они — невежды", promptLang: "ru", answer: "هُمْ جُهَّلٌ", options: ["هُمْ جُهَّلٌ", "هُمْ عُلَمَاءُ", "هُنَّ عَالِمَاتٌ"], explanation: "جُهَّلٌ — множественное число слова جَاهِلٌ." },
    { prompt: "هُنَّ خَادِمَاتٌ", promptLang: "ar", answer: "Они — служанки", options: ["Они — служанки", "Они — слуги", "Она — служанка"], explanation: "هُنَّ и خَادِمَاتٌ относятся к группе женщин." },
    { prompt: "هَذِهِ الشَّابُ عَالِمٌ", promptLang: "ar", answer: "هَذَا الشَّابُ عَالِمٌ", options: ["هَذَا الشَّابُ عَالِمٌ", "هَذِهِ الشَّابَّةُ عَالِمَةٌ", "هَؤُلَاءِ الشُّبَّانُ عُلَمَاءُ"], explanation: "С существительным الشَّابُ мужского рода используется هَذَا." },
  ],
};

const lessons = [lessonOne, lessonTwo, lessonThree, lessonFour];

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
  const [storageReady, setStorageReady] = useState(false);

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
    const storedSession = window.localStorage.getItem("shifahiya-active-session");
    if (storedSession) {
      try {
        const session = JSON.parse(storedSession) as SavedSession;
        if (lessons.some((item) => item.id === session.lessonId)) {
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
    };
    window.localStorage.setItem("shifahiya-active-session", JSON.stringify(session));
  }, [storageReady, view, lessonId, deckIndex, round, cardIndex, questionIndex, score, mistakes]);

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
    window.localStorage.removeItem("shifahiya-active-session");
    setSavedScores((items) => ({ ...items, [lesson.id]: score }));
    setView("result");
  }

  function resetLesson() {
    window.localStorage.removeItem(`shifahiya-lesson-${lesson.id}`);
    window.localStorage.removeItem("shifahiya-active-session");
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
          <div className="eyebrow">Ваш путь · 4 из 100 уроков готовы</div>
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
