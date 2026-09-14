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
import { hajjTopic } from "./hajj.ts";
import { mirathTopic } from "./mirath.ts";
import { zakatTopic } from "./zakat.ts";
import { topicAtoms, topicDrills, topicUnits, type Topic } from "./types.ts";

// В порядке книги: темы идут так же, как разделы в ней.
export const TOPICS: Topic[] = [zakatTopic, hajjTopic, mirathTopic];

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
