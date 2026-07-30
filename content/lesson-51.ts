import type { Lesson } from "./types";

export const lessonFiftyOne: Lesson = {
  id: 51,
  arabicTitle: "الدَّرْسُ الْحَادِي وَالْخَمْسُونَ",
  title: "Тело человека: голова и лицо.",
  description: "40 форм · 2 круга повторения · 80 заданий",
  tags: ["Тело", "Голова", "Лицо", "Жизнь"],
  decks: [
    { title: "Человек", words: [
      { arabic: "رُوحٌ", russian: "душа" }, { arabic: "أَرْوَاحٌ", russian: "души" },
      { arabic: "بَدَنٌ", russian: "тело" }, { arabic: "أَبْدَانٌ", russian: "тела" },
      { arabic: "عُضْوٌ", russian: "орган / часть тела" }, { arabic: "أَعْضَاءٌ", russian: "органы / части тела" },
      { arabic: "الْحَيَاةُ", russian: "жизнь" }, { arabic: "الْمَوْتُ", russian: "смерть" },
    ] },
    { title: "Голова и лицо", words: [
      { arabic: "رَأْسٌ", russian: "голова" }, { arabic: "رُؤُوسٌ", russian: "головы" },
      { arabic: "شَعْرٌ", russian: "волос" }, { arabic: "شُعُورٌ", russian: "волосы" },
      { arabic: "وَجْهٌ", russian: "лицо" }, { arabic: "وُجُوهٌ", russian: "лица" },
      { arabic: "جَبْهَةٌ", russian: "лоб" }, { arabic: "جَبَهَاتٌ", russian: "лбы" },
    ] },
    { title: "Глаза и уши", words: [
      { arabic: "عَيْنٌ", russian: "глаз" }, { arabic: "عُيُونٌ", russian: "глаза" },
      { arabic: "هُدْبٌ", russian: "ресница" }, { arabic: "أَهْدَابٌ", russian: "ресницы" },
      { arabic: "حَاجِبٌ", russian: "бровь" }, { arabic: "حَوَاجِبُ", russian: "брови" },
      { arabic: "أُذُنٌ", russian: "ухо" }, { arabic: "آذَانٌ", russian: "уши" },
    ] },
    { title: "Нос и рот", words: [
      { arabic: "أَنْفٌ", russian: "нос" }, { arabic: "أُنُوفٌ", russian: "носы" },
      { arabic: "فَمٌ", russian: "рот" }, { arabic: "أَفْوَاهٌ", russian: "рты" },
      { arabic: "شَفَةٌ", russian: "губа" }, { arabic: "شِفَاهٌ", russian: "губы" },
      { arabic: "سِنٌّ", russian: "зуб" }, { arabic: "أَسْنَانٌ", russian: "зубы" },
    ] },
    { title: "Шея и подбородок", words: [
      { arabic: "لِسَانٌ", russian: "язык" }, { arabic: "أَلْسِنَةٌ", russian: "языки" },
      { arabic: "ذَقَنٌ", russian: "подбородок" }, { arabic: "أَذْقَانٌ", russian: "подбородки" },
      { arabic: "قَفًا", russian: "затылок" }, { arabic: "أَقْفَاءٌ", russian: "затылки" },
      { arabic: "لِحْيَةٌ", russian: "борода" }, { arabic: "شَارِبٌ", russian: "усы" },
    ] },
  ],
  questions: [
    { prompt: "جِسْمُ الْإِنْسَانِ مُرَكَّبٌ مِنْ أَعْضَاءٍ", promptLang: "ar", answer: "Тело человека состоит из органов", options: ["Тело человека состоит из органов", "Душа состоит из волос", "Лицо состоит из языков"], explanation: "أعضاء — органы, части тела." },
    { prompt: "У человека два глаза и два уха", promptLang: "ru", answer: "لِلْإِنْسَانِ عَيْنَانِ وَأُذُنَانِ", options: ["لِلْإِنْسَانِ عَيْنَانِ وَأُذُنَانِ", "لِلْإِنْسَانِ عَيْنٌ وَأُذُنٌ", "لِلْإِنْسَانِ لِحْيَتَانِ"], explanation: "Двойственное число: عينان، أذنان." },
    { prompt: "اللِّسَانُ فِي الْفَمِ", promptLang: "ar", answer: "Язык находится во рту", options: ["Язык находится во рту", "Зуб находится в ухе", "Борода находится на лбу"], explanation: "الفم — рот." },
    { prompt: "Исправьте ошибку: هَذِهِ رَأْسٌ", promptLang: "ar", answer: "هَذَا رَأْسٌ", options: ["هَذَا رَأْسٌ", "هَذِهِ رَأْسٌ", "هَؤُلَاءِ رَأْسٌ"], explanation: "رأس — мужского рода." },
  ],
};
