/**
 * Every topic the memorisation part carries.
 *
 * Loaded outright rather than lazily, and deliberately: the screen that lists
 * the topics is the screen that opens them, and a loader for a handful of files
 * is more code than the kilobytes it saves. The whole part lives on
 * its own route, so nothing of this reaches the course's entry chunk. When the
 * shelf grows enough for the weight to be felt, this is the one file that
 * changes.
 */
import { balaghaBadiTopic } from "./balagha-badi.ts";
import { balaghaBayanTopic } from "./balagha-bayan.ts";
import { balaghaHistoryTopic } from "./balagha-history.ts";
import { kafwAlfazTopic } from "./kafw-alfaz.ts";
import { balaghaMaaniTopic } from "./balagha-maani.ts";
import { hajjTopic } from "./hajj.ts";
import { hajjQuduriTopic } from "./hajj-quduri.ts";
import { mirathTopic } from "./mirath.ts";
import { salahQuduriTopic } from "./salah-quduri.ts";
import { sawmQuduriTopic } from "./sawm-quduri.ts";
import { taharahQuduriTopic } from "./taharah-quduri.ts";
import { tawdihatTopic } from "./tawdihat.ts";
import { zakatQuduriTopic } from "./zakat-quduri.ts";
import { zakatTopic } from "./zakat.ts";
import { topicAtoms, topicDrills, topicUnits, type Topic } from "./types.ts";

// Existing shelf order stays stable; each newly authored book section is appended.
export const TOPICS: Topic[] = [zakatTopic, hajjTopic, mirathTopic, taharahQuduriTopic, salahQuduriTopic, zakatQuduriTopic, sawmQuduriTopic, hajjQuduriTopic, tawdihatTopic,
  // «Стилистика арабского языка» идёт порядком самой книги:
  // возникновение науки, затем три её направления — баян, ма‘ани, бади‘.
  balaghaHistoryTopic, balaghaBayanTopic, balaghaMaaniTopic, balaghaBadiTopic,
  // «Кафв аль-асар» — новая книга на полке, поэтому в конец и своим куском:
  // разорвать её соседями значило бы дать ей два разделителя.
  kafwAlfazTopic,
];

export function topicById(id: string) {
  return TOPICS.find((topic) => topic.id === id);
}

export type TopicSummary = {
  id: string;
  title: string;
  subtitle: string;
  source: Topic["source"];
  steps: number;
  facts: number;
  drills: number;
  /** Every unit of the topic, in course order — the schedule's whole world. */
  unitIds: string[];
};

/**
 * Counted from the topic itself rather than written beside it: a number typed
 * by hand goes stale at the first correction, and this one is read off the
 * same data the lessons are built from.
 */
export function summarize(topic: Topic): TopicSummary {
  return {
    id: topic.id,
    title: topic.title,
    subtitle: topic.subtitle,
    source: topic.source,
    steps: topic.steps.length,
    facts: topicAtoms(topic).length,
    drills: topicDrills(topic).length,
    unitIds: topicUnits(topic).map((unit) => unit.id),
  };
}

export const TOPIC_SUMMARIES = TOPICS.map(summarize);

/**
 * The shelf grouped by the book its sections came from.
 *
 * A book read section by section arrives here as several topics — five for
 * «Мухтасар аль-Кудури», four for the Arabic stylistics — and each of them was
 * printing the same book name on its own card. That is the course lists'
 * problem, solved there the same way: one divider over the run, and the cards
 * under it say only which part of the book they are.
 *
 * Grouped by a run rather than by name, so a book can only ever head one place
 * in the list. Should the same book come back further down the shelf — a second
 * volume authored years later — it heads its own run there instead of being
 * quietly hoisted up to the first, which would reorder the shelf under the
 * reader and move a topic away from the ones it was written beside.
 */
export type TopicBook = { book: string; topics: TopicSummary[] };

export const TOPIC_BOOKS: TopicBook[] = TOPIC_SUMMARIES.reduce<TopicBook[]>((books, topic) => {
  const open = books[books.length - 1];
  if (open && open.book === topic.source.book) open.topics.push(topic);
  else books.push({ book: topic.source.book, topics: [topic] });
  return books;
}, []);
