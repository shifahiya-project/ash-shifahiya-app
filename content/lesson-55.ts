import type { Lesson } from "./types";

export const lessonFiftyFive: Lesson = {
  id: 55, arabicTitle: "الدَّرْسُ الْخَامِسُ وَالْخَمْسُونَ",
  title: "Дикие животные.", description: "40 форм · 2 круга повторения · 80 заданий",
  tags: ["Животные", "Хищники", "Дикая природа", "Описание"],
  decks: [
    { title: "Крупные звери", words: [
      { arabic: "سَبُعٌ", russian: "хищник" }, { arabic: "قِرْدٌ", russian: "обезьяна" },
      { arabic: "فِيلٌ", russian: "слон" }, { arabic: "أَسَدٌ", russian: "лев" },
      { arabic: "نَمِرٌ", russian: "тигр" }, { arabic: "دُبٌّ", russian: "медведь" },
      { arabic: "ذِئْبٌ", russian: "волк" }, { arabic: "ثَعْلَبٌ", russian: "лиса" },
    ] },
    { title: "Домашние и мелкие", words: [
      { arabic: "كَلْبٌ", russian: "собака" }, { arabic: "سِنْجَابٌ", russian: "белка" },
      { arabic: "خِنْزِيرٌ", russian: "свинья" }, { arabic: "أَرْنَبٌ", russian: "заяц / кролик" },
      { arabic: "هِرٌّ", russian: "кот" }, { arabic: "تِمْسَاحٌ", russian: "крокодил" },
      { arabic: "سَمَكٌ", russian: "рыба" }, { arabic: "سَرَطَانٌ", russian: "рак" },
    ] },
    { title: "Земноводные и пресмыкающиеся", words: [
      { arabic: "ضِفْدَعٌ", russian: "лягушка" }, { arabic: "حَيَّةٌ", russian: "змея" },
      { arabic: "عَقْرَبٌ", russian: "скорпион" }, { arabic: "سُلَحْفَاةٌ", russian: "черепаха" },
      { arabic: "سَامٌّ", russian: "ядовитый" }, { arabic: "وَحْشِيٌّ", russian: "дикий" },
      { arabic: "أَهْلِيٌّ", russian: "домашний" }, { arabic: "ضَارٌّ", russian: "вредный" },
    ] },
    { title: "Охота", words: [
      { arabic: "صَيَّادٌ", russian: "охотник" }, { arabic: "صَيَادُونَ", russian: "охотники" },
      { arabic: "صَادَ", russian: "он охотился / поймал" }, { arabic: "يَصِيدُ", russian: "он охотится" },
      { arabic: "قَتَلَ", russian: "он убил" }, { arabic: "يَقْتُلُ", russian: "он убивает" },
      { arabic: "هَرَبَ", russian: "он убежал" }, { arabic: "يَهْرُبُ", russian: "он убегает" },
    ] },
    { title: "Сходство", words: [
      { arabic: "شَبِيهٌ", russian: "похожий" }, { arabic: "يُشْبِهُ", russian: "он похож" },
      { arabic: "نَافِعٌ", russian: "полезный" }, { arabic: "مَشْهُورٌ", russian: "известный" },
      { arabic: "مَخْلَبٌ", russian: "коготь" }, { arabic: "نَابٌ", russian: "клык" },
      { arabic: "ذُو أَنِيَابٍ", russian: "имеющий клыки" }, { arabic: "ذُو مَخَالِبَ", russian: "имеющий когти" },
    ] },
  ],
  questions: [
    { prompt: "الْأَسَدُ مِنَ السِّبَاعِ", promptLang: "ar", answer: "Лев относится к хищникам", options: ["Лев относится к хищникам", "Лев — домашняя птица", "Лев живёт в воде"], explanation: "السِّباع — хищники." },
    { prompt: "Охотники не убивают полезных животных", promptLang: "ru", answer: "لَا يَقْتُلُ الصَّيَّادُونَ الْحَيَوَانَاتِ النَّافِعَةَ", options: ["لَا يَقْتُلُ الصَّيَّادُونَ الْحَيَوَانَاتِ النَّافِعَةَ", "يَقْتُلُ الصَّيَّادُونَ كُلَّ حَيَوَانٍ", "تَهْرُبُ الْحَيَوَانَاتُ الْأَهْلِيَّةُ"], explanation: "النافعة — полезные." },
    { prompt: "الذِّئْبُ يُشْبِهُ الْكَلْبَ", promptLang: "ar", answer: "Волк похож на собаку", options: ["Волк похож на собаку", "Тигр похож на рыбу", "Собака похожа на птицу"], explanation: "يُشبه — похож." },
    { prompt: "Исправьте ошибку: هَذِهِ أَسَدٌ", promptLang: "ar", answer: "هَذَا أَسَدٌ", options: ["هَذَا أَسَدٌ", "هَذِهِ أَسَدٌ", "هَاتَانِ أَسَدٌ"], explanation: "أسد — мужского рода." },
  ],
};
