import type { Lesson } from "./types";

export const lessonFiftyNine: Lesson = {
  id: 59, arabicTitle: "الدَّرْسُ التَّاسِعُ وَالْخَمْسُونَ",
  title: "Дом, мебель и домашняя утварь.", description: "40 форм · 2 круга повторения · 80 заданий",
  tags: ["Дом", "Мебель", "Посуда", "Материалы"],
  decks: [
    { title: "Жилище", words: [
      { arabic: "قَصْرٌ", russian: "дворец" }, { arabic: "خَيْمَةٌ", russian: "палатка" },
      { arabic: "جِهَازٌ", russian: "утварь / оборудование" }, { arabic: "زِينَةٌ", russian: "украшение" },
      { arabic: "حَصِيرٌ", russian: "циновка" }, { arabic: "لِبْدٌ", russian: "войлок" },
      { arabic: "طِنْفِسَةٌ", russian: "палас" }, { arabic: "بِسَاطٌ", russian: "ковёр" },
    ] },
    { title: "Текстиль", words: [
      { arabic: "فِرَاشٌ", russian: "постель" }, { arabic: "وِسَادَةٌ", russian: "подушка" },
      { arabic: "لِحَافٌ", russian: "одеяло" }, { arabic: "كِلَّةٌ", russian: "занавеска / полог" },
      { arabic: "سِتْرٌ", russian: "штора" }, { arabic: "سُفْرَةٌ", russian: "скатерть" },
      { arabic: "مِنْشَفَةٌ", russian: "полотенце" }, { arabic: "قُمَاشٌ", russian: "ткань" },
    ] },
    { title: "Материалы и мебель", words: [
      { arabic: "حَرِيرٌ", russian: "шёлк" }, { arabic: "كَتَّانٌ", russian: "лён" },
      { arabic: "خِوَانٌ", russian: "стол" }, { arabic: "كُرْسِيٌّ", russian: "стул" },
      { arabic: "مَصْطَبَةٌ", russian: "тахта / скамья" }, { arabic: "رَفٌّ", russian: "полка" },
      { arabic: "تَنُّورٌ", russian: "печь" }, { arabic: "سِرَاجٌ", russian: "лампа" },
    ] },
    { title: "Свет и посуда", words: [
      { arabic: "قِنْدِيلٌ", russian: "люстра / светильник" }, { arabic: "فَانُوسٌ", russian: "фонарь" },
      { arabic: "دَلْوٌ", russian: "ведро" }, { arabic: "إِبْرِيقٌ", russian: "кувшин" },
      { arabic: "خَزَفٌ", russian: "фарфор / керамика" }, { arabic: "طَاسٌ", russian: "таз / чаша" },
      { arabic: "قَارُورَةٌ", russian: "бутыль" }, { arabic: "أُسْطُوَانَةٌ", russian: "столб / колонна" },
    ] },
    { title: "Части дома", words: [
      { arabic: "حَائِطٌ", russian: "забор / стена" }, { arabic: "جِدَارٌ", russian: "стена" },
      { arabic: "سَطْحٌ", russian: "крыша" }, { arabic: "سَقْفٌ", russian: "потолок" },
      { arabic: "حَمَّامٌ", russian: "баня / ванная" }, { arabic: "فَرَشَ", russian: "он постелил" },
      { arabic: "سَتَرَ", russian: "он закрыл / укрыл" }, { arabic: "زَيَّنَ", russian: "он украсил" },
    ] },
  ],
  questions: [
    { prompt: "الْبَيْتُ مَفْرُوشٌ بِالطَّنَافِسِ", promptLang: "ar", answer: "Дом устлан коврами", options: ["Дом устлан коврами", "Дом построен из подушек", "Дворец покрыт водой"], explanation: "مفروش — устлан." },
    { prompt: "Она украсила комнату красивой занавеской", promptLang: "ru", answer: "زَيَّنَتِ الْغُرْفَةَ بِسِتْرٍ جَمِيلٍ", options: ["زَيَّنَتِ الْغُرْفَةَ بِسِتْرٍ جَمِيلٍ", "فَرَشَتِ السِّتْرَ بِالْغُرْفَةِ", "سَتَرَتِ الْقَصْرَ بِدَلْوٍ"], explanation: "زيّن — украшать." },
    { prompt: "السِّرَاجُ عَلَى الرَّفِّ", promptLang: "ar", answer: "Лампа находится на полке", options: ["Лампа находится на полке", "Полка находится в лампе", "Кувшин находится на потолке"], explanation: "رفّ — полка." },
    { prompt: "Исправьте ошибку: هَذِهِ قَصْرٌ", promptLang: "ar", answer: "هَذَا قَصْرٌ", options: ["هَذَا قَصْرٌ", "هَذِهِ قَصْرٌ", "هَاتَانِ قَصْرٌ"], explanation: "قصر — мужского рода." },
  ],
};
