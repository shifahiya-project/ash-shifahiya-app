export type Word = { arabic: string; russian: string; note?: string; audio?: string };

export type Question = {
  prompt: string;
  promptLang: "ar" | "ru";
  answer: string;
  options: string[];
  explanation: string;
};

export type Lesson = {
  id: number;
  arabicTitle: string;
  title: string;
  description: string;
  tags: string[];
  decks: { title: string; words: Word[] }[];
  questions: Question[];
};
