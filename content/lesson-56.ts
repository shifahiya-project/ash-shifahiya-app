import type { Lesson } from "./types";

export const lessonFiftySix: Lesson = {
  id: 56, arabicTitle: "الدَّرْسُ السَّادِسُ وَالْخَمْسُونَ",
  title: "Птицы и насекомые.", description: "40 форм · 2 круга повторения · 80 заданий",
  tags: ["Птицы", "Насекомые", "Природа", "Польза"],
  decks: [
    { title: "Домашние птицы", words: [
      { arabic: "طَائِرٌ", russian: "птица" }, { arabic: "طُيُورٌ", russian: "птицы" },
      { arabic: "نَعَامَةٌ", russian: "страус" }, { arabic: "طَاوُوسٌ", russian: "павлин" },
      { arabic: "دِيكٌ", russian: "петух" }, { arabic: "دَجَاجَةٌ", russian: "курица" },
      { arabic: "إِوَزَّةٌ", russian: "гусь" }, { arabic: "بَطَّةٌ", russian: "утка" },
    ] },
    { title: "Дикие птицы", words: [
      { arabic: "حَمَامَةٌ", russian: "голубь" }, { arabic: "عُصْفُورٌ", russian: "воробей" },
      { arabic: "غُرَابٌ", russian: "ворон" }, { arabic: "صَقْرٌ", russian: "сокол" },
      { arabic: "نَسْرٌ", russian: "орёл" }, { arabic: "بُومَةٌ", russian: "сова" },
      { arabic: "جَنَاحٌ", russian: "крыло" }, { arabic: "مِنْقَارٌ", russian: "клюв" },
    ] },
    { title: "Полёт и яйца", words: [
      { arabic: "رِيشٌ", russian: "перья" }, { arabic: "بَيْضَةٌ", russian: "яйцо" },
      { arabic: "عُشٌّ", russian: "гнездо" }, { arabic: "طَارَ", russian: "он полетел" },
      { arabic: "يَطِيرُ", russian: "он летает" }, { arabic: "فَرَّخَ", russian: "он вывел птенцов" },
      { arabic: "يَفْرُخُ", russian: "он выводит птенцов" }, { arabic: "نَقَرَ", russian: "он клевал" },
    ] },
    { title: "Полезные насекомые", words: [
      { arabic: "نَحْلَةٌ", russian: "пчела" }, { arabic: "نَحْلٌ", russian: "пчёлы" },
      { arabic: "عَسَلٌ", russian: "мёд" }, { arabic: "نَمْلَةٌ", russian: "муравей" },
      { arabic: "نَمْلٌ", russian: "муравьи" }, { arabic: "مَلِكَةٌ", russian: "матка / королева" },
      { arabic: "خَلِيَّةٌ", russian: "улей / ячейка" }, { arabic: "جَمَعَ", russian: "он собрал" },
    ] },
    { title: "Мелкие существа", words: [
      { arabic: "ذُبَابٌ", russian: "мухи" }, { arabic: "بَعُوضٌ", russian: "комары" },
      { arabic: "دُودَةٌ", russian: "червь" }, { arabic: "بُرْغُوثٌ", russian: "блоха" },
      { arabic: "جِيْفَةٌ", russian: "падаль" }, { arabic: "مَيِّتٌ", russian: "мёртвый" },
      { arabic: "يَمُصُّ", russian: "он сосёт" }, { arabic: "يَنْشُرُ", russian: "он распространяет" },
    ] },
  ],
  questions: [
    { prompt: "الطَّائِرُ يَطِيرُ بِجَنَاحَيْهِ", promptLang: "ar", answer: "Птица летает двумя крыльями", options: ["Птица летает двумя крыльями", "Птица ходит двумя клювами", "Пчела летает без крыльев"], explanation: "جناحان — два крыла." },
    { prompt: "Пчёлы собирают мёд с цветов", promptLang: "ru", answer: "يَجْمَعُ النَّحْلُ الْعَسَلَ مِنَ الْأَزْهَارِ", options: ["يَجْمَعُ النَّحْلُ الْعَسَلَ مِنَ الْأَزْهَارِ", "يَجْمَعُ النَّمْلُ الرِّيشَ", "يَأْكُلُ الْعَسَلُ النَّحْلَ"], explanation: "يجمع — собирает." },
    { prompt: "النَّمْلَةُ حَيَوَانٌ مُجْتَهِدٌ", promptLang: "ar", answer: "Муравей — усердное животное", options: ["Муравей — усердное животное", "Муравей — большая птица", "Муравей производит перья"], explanation: "مجتهد — усердный." },
    { prompt: "Исправьте ошибку: هَذَا دَجَاجَةٌ", promptLang: "ar", answer: "هَذِهِ دَجَاجَةٌ", options: ["هَذِهِ دَجَاجَةٌ", "هَذَا دَجَاجَةٌ", "هَؤُلَاءِ دَجَاجَةٌ"], explanation: "دجاجة — женского рода." },
  ],
};
