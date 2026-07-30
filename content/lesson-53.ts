import type { Lesson } from "./types";

export const lessonFiftyThree: Lesson = {
  id: 53,
  arabicTitle: "الدَّرْسُ الثَّالِثُ وَالْخَمْسُونَ",
  title: "Внутренние органы и здоровье.",
  description: "40 форм · 2 круга повторения · 80 заданий",
  tags: ["Тело", "Органы", "Здоровье", "Движение"],
  decks: [
    { title: "Главные органы", words: [
      { arabic: "دِمَاغٌ", russian: "мозг" }, { arabic: "أَدْمِغَةٌ", russian: "мозги" },
      { arabic: "قَلْبٌ", russian: "сердце" }, { arabic: "قُلُوبٌ", russian: "сердца" },
      { arabic: "كَبِدٌ", russian: "печень" }, { arabic: "أَكْبَادٌ", russian: "печени" },
      { arabic: "رِئَةٌ", russian: "лёгкое" }, { arabic: "رِئَاتٌ", russian: "лёгкие" },
    ] },
    { title: "Пищеварение и дыхание", words: [
      { arabic: "طِحَالٌ", russian: "селезёнка" }, { arabic: "كُلْيَةٌ", russian: "почка" },
      { arabic: "مَعِدَةٌ", russian: "желудок" }, { arabic: "أَمْعَاءٌ", russian: "кишечник / внутренности" },
      { arabic: "مَرِيءٌ", russian: "пищевод" }, { arabic: "حُلْقُومٌ", russian: "горло" },
      { arabic: "نَفَسٌ", russian: "дыхание" }, { arabic: "أَنْفَاسٌ", russian: "вдохи / дыхания" },
    ] },
    { title: "Ткани тела", words: [
      { arabic: "لَحْمٌ", russian: "мясо" }, { arabic: "عَظْمٌ", russian: "кость" },
      { arabic: "عِظَامٌ", russian: "кости" }, { arabic: "عَصَبٌ", russian: "нерв" },
      { arabic: "أَعْصَابٌ", russian: "нервы" }, { arabic: "عِرْقٌ", russian: "жила / сосуд" },
      { arabic: "عُرُوقٌ", russian: "жилы / сосуды" }, { arabic: "شَحْمٌ", russian: "жир" },
    ] },
    { title: "Жидкости", words: [
      { arabic: "دَمٌ", russian: "кровь" }, { arabic: "مُخٌّ", russian: "костный / головной мозг" },
      { arabic: "عَرَقٌ", russian: "пот" }, { arabic: "دَمْعٌ", russian: "слеза" },
      { arabic: "بَلْغَمٌ", russian: "мокрота" }, { arabic: "بُزَاقٌ", russian: "слюна" },
      { arabic: "مُخَاطٌ", russian: "слизь" }, { arabic: "بَوْلٌ", russian: "моча" },
    ] },
    { title: "Состояния и действия", words: [
      { arabic: "وَرَمٌ", russian: "опухоль" }, { arabic: "جِرَاحَةٌ", russian: "рана" },
      { arabic: "جَوْفٌ", russian: "полость / внутренность" }, { arabic: "تَحَرَّكَ", russian: "он двигался" },
      { arabic: "يَتَحَرَّكُ", russian: "он двигается" }, { arabic: "حَصَلَ", russian: "произошло / получилось" },
      { arabic: "بَصَقَ", russian: "он плюнул" }, { arabic: "تَمَخَّطَ", russian: "он высморкался" },
    ] },
  ],
  questions: [
    { prompt: "الْقَلْبُ يَتَحَرَّكُ دَائِمًا", promptLang: "ar", answer: "Сердце постоянно движется", options: ["Сердце постоянно движется", "Печень постоянно дышит", "Кость постоянно говорит"], explanation: "يتحرّك — двигается." },
    { prompt: "Лёгкие нужны для дыхания", promptLang: "ru", answer: "الرِّئَتَانِ لَازِمَتَانِ لِلتَّنَفُّسِ", options: ["الرِّئَتَانِ لَازِمَتَانِ لِلتَّنَفُّسِ", "الْكُلْيَتَانِ لَازِمَتَانِ لِلْكَلَامِ", "الْمَعِدَةُ لَازِمَةٌ لِلسَّمْعِ"], explanation: "الرئتان — два лёгких." },
    { prompt: "الدَّمُ يَجْرِي فِي الْعُرُوقِ", promptLang: "ar", answer: "Кровь течёт по сосудам", options: ["Кровь течёт по сосудам", "Слюна течёт по костям", "Пот течёт по нервам"], explanation: "العروق — сосуды." },
    { prompt: "Исправьте ошибку: هَذِهِ قَلْبٌ", promptLang: "ar", answer: "هَذَا قَلْبٌ", options: ["هَذَا قَلْبٌ", "هَذِهِ قَلْبٌ", "هَاتَانِ قَلْبٌ"], explanation: "قلب — мужского рода." },
  ],
};
