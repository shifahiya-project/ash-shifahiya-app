import type { Lesson } from "./types";

export const lessonFiftyTwo: Lesson = {
  id: 52,
  arabicTitle: "الدَّرْسُ الثَّانِي وَالْخَمْسُونَ",
  title: "Тело человека: руки, ноги и омовение.",
  description: "40 форм · 2 круга повторения · 80 заданий",
  tags: ["Тело", "Руки", "Ноги", "Омовение"],
  decks: [
    { title: "Рука", words: [
      { arabic: "كَتِفٌ", russian: "плечо / лопатка" }, { arabic: "يَدٌ", russian: "рука" },
      { arabic: "ذِرَاعٌ", russian: "предплечье" }, { arabic: "مِرْفَقٌ", russian: "локоть" },
      { arabic: "رُسْغٌ", russian: "запястье" }, { arabic: "كَفٌّ", russian: "кисть / ладонь" },
      { arabic: "إِصْبَعٌ", russian: "палец" }, { arabic: "أَصَابِعُ", russian: "пальцы" },
    ] },
    { title: "Пальцы и ногти", words: [
      { arabic: "إِبْهَامٌ", russian: "большой палец" }, { arabic: "سَبَّابَةٌ", russian: "указательный палец" },
      { arabic: "وُسْطَى", russian: "средний палец" }, { arabic: "بِنْصِرٌ", russian: "безымянный палец" },
      { arabic: "خِنْصِرٌ", russian: "мизинец" }, { arabic: "ظُفْرٌ", russian: "ноготь" },
      { arabic: "أَظْفَارٌ", russian: "ногти" }, { arabic: "صَدْرٌ", russian: "грудь" },
    ] },
    { title: "Туловище", words: [
      { arabic: "ثَدْيٌ", russian: "грудь / грудная железа" }, { arabic: "بَطْنٌ", russian: "живот" },
      { arabic: "ظَهْرٌ", russian: "спина" }, { arabic: "ضِلْعٌ", russian: "ребро" },
      { arabic: "أَضْلَاعٌ", russian: "рёбра" }, { arabic: "سُرَّةٌ", russian: "пупок" },
      { arabic: "خَصْرٌ", russian: "поясница / талия" }, { arabic: "فَخِذٌ", russian: "бедро" },
    ] },
    { title: "Нога", words: [
      { arabic: "رِجْلٌ", russian: "нога" }, { arabic: "أَرْجُلٌ", russian: "ноги" },
      { arabic: "رُكْبَةٌ", russian: "колено" }, { arabic: "رُكَبٌ", russian: "колени" },
      { arabic: "سَاقٌ", russian: "голень" }, { arabic: "سِيقَانٌ", russian: "голени" },
      { arabic: "كَعْبٌ", russian: "щиколотка" }, { arabic: "عَقِبٌ", russian: "пятка" },
    ] },
    { title: "Омовение", words: [
      { arabic: "عَوْرَةٌ", russian: "место, которое следует скрывать" }, { arabic: "مَسْتُورٌ", russian: "скрытый / покрытый" },
      { arabic: "وُضُوءٌ", russian: "омовение" }, { arabic: "غُسْلٌ", russian: "полное омовение" },
      { arabic: "الْيُمْنَى", russian: "правая рука" }, { arabic: "الْيُسْرَى", russian: "левая рука" },
      { arabic: "مَسَحَ", russian: "он протёр" }, { arabic: "يَمْسَحُ", russian: "он протирает" },
    ] },
  ],
  questions: [
    { prompt: "الْيَدُ مِنَ الْكَتِفِ إِلَى الْأَصَابِعِ", promptLang: "ar", answer: "Рука — от плеча до пальцев", options: ["Рука — от плеча до пальцев", "Нога — от локтя до ладони", "Спина — от колена до пятки"], explanation: "كتف — плечо, أصابع — пальцы." },
    { prompt: "Я протёр голову при омовении", promptLang: "ru", answer: "مَسَحْتُ رَأْسِي فِي الْوُضُوءِ", options: ["مَسَحْتُ رَأْسِي فِي الْوُضُوءِ", "غَسَلْتُ رُكْبَتِي فَقَطْ", "تَرَكْتُ الْوُضُوءَ"], explanation: "مَسَحَ — протирать." },
    { prompt: "اغْسِلُوا أَيْدِيَكُمْ إِلَى الْمَرَافِقِ", promptLang: "ar", answer: "Мойте ваши руки до локтей", options: ["Мойте ваши руки до локтей", "Протирайте ноги до колен", "Закрывайте пальцы"], explanation: "المرافق — локти." },
    { prompt: "Исправьте ошибку: هَذَا يَدٌ", promptLang: "ar", answer: "هَذِهِ يَدٌ", options: ["هَذِهِ يَدٌ", "هَذَا يَدٌ", "هَؤُلَاءِ يَدٌ"], explanation: "يَدٌ — слово женского рода." },
  ],
};
