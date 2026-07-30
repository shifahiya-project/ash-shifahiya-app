import type { Lesson } from "./types";

export const lessonFiftyEight: Lesson = {
  id: 58, arabicTitle: "الدَّرْسُ الثَّامِنُ وَالْخَمْسُونَ",
  title: "Зерно, мука и земледелие.", description: "40 форм · 2 круга повторения · 80 заданий",
  tags: ["Земледелие", "Зерно", "Мельница", "Хлеб"],
  decks: [
    { title: "Орехи и зерно", words: [
      { arabic: "جَوْزٌ", russian: "орех" }, { arabic: "بُنْدُقٌ", russian: "лесной орех" },
      { arabic: "لَوْزٌ", russian: "миндаль" }, { arabic: "حِنْطَةٌ", russian: "пшеница" },
      { arabic: "شَعِيرٌ", russian: "ячмень" }, { arabic: "جَاوَرْسٌ", russian: "просо" },
      { arabic: "ذُرَةٌ", russian: "кукуруза / сорго" }, { arabic: "أُرْزٌ", russian: "рис" },
    ] },
    { title: "Бобовые", words: [
      { arabic: "عَدَسٌ", russian: "чечевица" }, { arabic: "حِمِّصٌ", russian: "нут / горох" },
      { arabic: "فُولٌ", russian: "бобы / фасоль" }, { arabic: "بَذْرٌ", russian: "семя" },
      { arabic: "بُذُورٌ", russian: "семена" }, { arabic: "تِبْنٌ", russian: "солома" },
      { arabic: "سُنْبُلٌ", russian: "колос" }, { arabic: "قِشْرٌ", russian: "кожура / шелуха" },
    ] },
    { title: "Мука и тесто", words: [
      { arabic: "دَقِيقٌ", russian: "мука" }, { arabic: "عَجِينٌ", russian: "тесто" },
      { arabic: "طَاحُونٌ", russian: "мельница" }, { arabic: "طَوَاحِينُ", russian: "мельницы" },
      { arabic: "رَحًى", russian: "жернов" }, { arabic: "أَرْحَاءٌ", russian: "жернова" },
      { arabic: "خُبْزٌ", russian: "хлеб" }, { arabic: "طَعَامٌ", russian: "пища" },
    ] },
    { title: "Люди труда", words: [
      { arabic: "طَحَّانٌ", russian: "мельник" }, { arabic: "فَلَّاحٌ", russian: "земледелец" },
      { arabic: "فَلَّاحُونَ", russian: "земледельцы" }, { arabic: "هَوَاءٌ", russian: "воздух" },
      { arabic: "حَقْلٌ", russian: "поле" }, { arabic: "حَرَثَ", russian: "он вспахал" },
      { arabic: "يَحْرُثُ", russian: "он пашет" }, { arabic: "حَصَدَ", russian: "он собрал урожай" },
    ] },
    { title: "Приготовление", words: [
      { arabic: "طَحَنَ", russian: "он смолол" }, { arabic: "يَطْحَنُ", russian: "он мелет" },
      { arabic: "عَجَنَ", russian: "он замесил" }, { arabic: "يَعْجِنُ", russian: "он месит" },
      { arabic: "خَبَزَ", russian: "он испёк" }, { arabic: "يَخْبِزُ", russian: "он печёт" },
      { arabic: "زَرَعَ", russian: "он посеял" }, { arabic: "يَزْرَعُ", russian: "он сеет" },
    ] },
  ],
  questions: [
    { prompt: "يَطْحَنُ الطَّحَّانُ الْحِنْطَةَ", promptLang: "ar", answer: "Мельник мелет пшеницу", options: ["Мельник мелет пшеницу", "Земледелец печёт поле", "Пшеница мелет мельника"], explanation: "طحّان — мельник." },
    { prompt: "Земледелец посеял семена в поле", promptLang: "ru", answer: "زَرَعَ الْفَلَّاحُ الْبُذُورَ فِي الْحَقْلِ", options: ["زَرَعَ الْفَلَّاحُ الْبُذُورَ فِي الْحَقْلِ", "طَحَنَ الْحَقْلُ الْفَلَّاحَ", "خَبَزَ الْفَلَّاحُ الْبُذُورَ"], explanation: "زرع — сеять." },
    { prompt: "الدَّقِيقُ مِنَ الْحِنْطَةِ", promptLang: "ar", answer: "Мука получается из пшеницы", options: ["Мука получается из пшеницы", "Пшеница получается из хлеба", "Солома получается из муки"], explanation: "الدقيق — мука." },
    { prompt: "Исправьте ошибку: يَخْبِزُ الْفَلَّاحُ الْحَقْلَ", promptLang: "ar", answer: "يَحْرُثُ الْفَلَّاحُ الْحَقْلَ", options: ["يَحْرُثُ الْفَلَّاحُ الْحَقْلَ", "يَخْبِزُ الْفَلَّاحُ الْحَقْلَ", "يَعْجِنُ الْحَقْلُ الْفَلَّاحَ"], explanation: "Поле пашут: يحرث." },
  ],
};
