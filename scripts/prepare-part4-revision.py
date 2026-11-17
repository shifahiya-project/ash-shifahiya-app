#!/usr/bin/env python3
"""Validate and adapt the complete source-linked 2026-11-17 fiqh exports."""

import argparse
from collections import Counter
from copy import deepcopy
import hashlib
import json
from pathlib import Path
import re
import unicodedata


BOOK = "Тухфат аль-фукаха"
REVISION = "2026-11-17"
KINDS = {"verb", "noun", "masdar", "adjective", "expression", "term", "proper_name", "particle", "adverb"}
CYRILLIC = re.compile(r"[А-Яа-яЁё]")
ARABIC = re.compile(r"[ء-ي]")
LRI = "\u2066"
PDI = "\u2069"
RUSSIAN_ONLY_HEADINGS = {
    (139, 2): "Первый раздел: «Твоё дело в твоих руках»",
    (139, 30): "Второй раздел: слова «выбирай»",
    (140, 0): "Третий раздел: слова «ты разведена, если пожелаешь»",
    (140, 7): "Четвёртый раздел: слова «разведи себя сама»",
}


def canonical(value):
    if not isinstance(value, str):
        raise ValueError(f"Expected a string, got {type(value).__name__}")
    return unicodedata.normalize("NFC", value).strip()


class SourceCleaner:
    """Remove only explicitly isolated Russian glosses, retaining all Arabic."""

    def __init__(self):
        self.removals = []
        self.warnings = []

    def arabic(self, value, location):
        canonical_before = canonical(value)
        pieces = []
        spans = []
        index = 0
        while index < len(canonical_before):
            char = canonical_before[index]
            if char == PDI:
                raise ValueError(f"Unmatched PDI at {location}")
            if char in {"\u2067", "\u2068"}:
                raise ValueError(f"Unreviewed directional isolate at {location}")
            if char != LRI:
                pieces.append(char)
                index += 1
                continue
            end = canonical_before.find(PDI, index + 1)
            if end < 0:
                raise ValueError(f"Unclosed LRI at {location}")
            inside = canonical_before[index + 1:end]
            if LRI in inside or "\u2067" in inside or "\u2068" in inside:
                raise ValueError(f"Nested isolate requires review at {location}")
            span = canonical_before[index:end + 1]
            if CYRILLIC.search(inside) and not ARABIC.search(inside):
                spans.append(span)
            else:
                pieces.append(span)
                self.warnings.append({"location": location, "kind": "unremoved_isolate", "span": span})
            index = end + 1
        after = "".join(pieces).strip()
        if spans:
            self.removals.append({"location": location, "before": value,
                                  "canonicalBefore": canonical_before, "after": after, "removed": spans})
        if CYRILLIC.search(after):
            self.warnings.append({"location": location, "kind": "cyrillic_remaining", "value": after})
        return after


def require(condition, message):
    if not condition:
        raise ValueError(message)


def prepare(glossary, reading):
    require(glossary.get("format_version") == 2, "Expected glossary format_version 2")
    require(len(glossary.get("lessons", [])) == 159, "Expected all 159 glossary lessons")
    require(len(reading.get("lessons", [])) == 159, "Expected all 159 reading lessons")
    require(len(glossary.get("books", [])) == len(reading.get("groups", [])) == 9,
            "Expected the same nine books in both exports")
    require(canonical(reading.get("title", "")) == BOOK, "Unexpected reading book title")
    require(glossary.get("totals", {}).get("lessons") == 159, "Wrong glossary lesson total")

    cleaner = SourceCleaner()
    groups = {}
    for index, (book, group) in enumerate(zip(glossary["books"], reading["groups"]), 1):
        require(book["id"] == group["id"] == index, "Nonsequential book identifiers")
        require(book["lessons"] == group["lessons"], f"Book {index} has different lesson membership")
        require(canonical(book["title_ru"]) == canonical(group["ru"]), f"Book {index} title mismatch")
        require(canonical(book["title_ar"]) == canonical(group["ar"]), f"Book {index} Arabic title mismatch")
        groups[index] = group
    all_members = [number for group in groups.values() for number in group["lessons"]]
    require(all_members == list(range(1, 160)), "Books must cover all lessons once in order")

    normalized_glossary = {"title_ru": BOOK, "title_ar": cleaner.arabic(glossary["title_ar"], "book.title_ar"),
                           "author_ru": canonical(glossary["author_ru"]), "revision": REVISION,
                           "format_version": 2, "lessons": []}
    normalized_reading = {"title_ru": BOOK, "author_ru": canonical(reading["author"]),
                          "revision": REVISION, "lessons": [], "items": []}
    source_index = {"revision": REVISION, "books": deepcopy(reading["groups"]), "lessons": []}
    seen_pairs = set()
    seen_entries = set()
    seen_globals = set()
    seen_contexts = set()
    row_counts = Counter()
    entry_counts = Counter()
    total_contexts = 0
    group_pair_counts = Counter()
    wordless = []
    russian_only_headings = []

    for number, (gl, text) in enumerate(zip(glossary["lessons"], reading["lessons"]), 1):
        require(gl["number"] == text["id"] == number, f"Lesson {number} numbering mismatch")
        require(gl.get("previous_number") == text.get("previous"), f"Lesson {number} old-number mismatch")
        require(gl["book"] == text["book"] and number in groups[text["book"]]["lessons"],
                f"Lesson {number} book mismatch")
        require(canonical(gl["title_ru"]) == canonical(text["title"]), f"Lesson {number} title mismatch")
        require(canonical(gl["chapter"]) == canonical(groups[text["book"]]["ru"]),
                f"Lesson {number} section mismatch")
        require(gl["count"] == len(gl["entries"]), f"Lesson {number} entry count mismatch")
        if not gl["entries"]:
            wordless.append(number)

        source_rows = {}
        lesson_rows = []
        for block_index, block in enumerate(text["blocks"]):
            kind = block.get("kind")
            require(kind in {"pair", "heading"}, f"Unknown row kind {kind} at {number}.{block_index}")
            if not ARABIC.search(block.get("ar", "")):
                require(kind == "heading" and block.get("ar") == "" and
                        RUSSIAN_ONLY_HEADINGS.get((number, block_index)) == block.get("ru"),
                        f"Missing Arabic at {number}.{block_index}")
                russian_only_headings.append({"lesson": number, "block": block_index,
                                              "russian": block["ru"]})
            require(CYRILLIC.search(block.get("ru", "")), f"Missing Russian at {number}.{block_index}")
            if kind == "pair":
                source_id = block.get("id")
                require(isinstance(source_id, int) and source_id not in seen_pairs,
                        f"Missing or duplicate pair ID {source_id}")
                seen_pairs.add(source_id)
                context_id = f"p-{source_id}"
                group_pair_counts[text["book"]] += 1
            else:
                source_id = None
                require(block.get("level") in {1, 2, 3}, f"Unreviewed heading level at {number}.{block_index}")
                context_id = f"h-{number}-{block_index}"
            row_counts[kind] += 1
            source_rows[context_id] = block
            row = {"id": context_id, "lesson": number, "type": kind,
                   "ar": cleaner.arabic(block["ar"], f"reading.{number}.{block_index}.ar"),
                   "ru": canonical(block["ru"]),
                   "source": {"id": source_id, "block": block_index, "kind": kind}}
            if kind == "heading":
                row["source"]["level"] = block["level"]
            lesson_rows.append(row)
        require(sum(block["kind"] == "pair" for block in text["blocks"]) == text["pairs"],
                f"Lesson {number} pair count mismatch")
        prepared_by_id = {row["id"]: row for row in lesson_rows}
        normalized_reading["items"].extend(lesson_rows)
        title_ar = cleaner.arabic(gl["title_ar"], f"glossary.{number}.title_ar")
        normalized_reading["lessons"].append({"number": number, "ru": canonical(text["title"]),
            "ar": title_ar, "chapter": canonical(gl["chapter"]), "previous": text.get("previous"),
            "book": text["book"]})

        # Check all raw context pairs before removing any explicit inline hints.
        contexts = {}
        for context in gl["contexts"]:
            key = context["id"]
            require(key not in seen_contexts, f"Duplicate context {key}")
            seen_contexts.add(key)
            require(key in source_rows, f"Context {key} is outside lesson {number}")
            raw = source_rows[key]
            require(context["kind"] == raw["kind"], f"Context {key} kind mismatch")
            require(context["source_id"] == raw.get("id"), f"Context {key} source ID mismatch")
            require(canonical(context["arabic"]) == canonical(raw["ar"]), f"Context {key} Arabic mismatch")
            require(canonical(context["russian"]) == canonical(raw["ru"]), f"Context {key} Russian mismatch")
            require(len(context["entry_ids"]) == len(set(context["entry_ids"])), f"Context {key} duplicate entry refs")
            contexts[key] = context
        total_contexts += len(contexts)

        prepared_entries = []
        lesson_entry_ids = set()
        for position, entry in enumerate(gl["entries"], 1):
            require(entry["id"] not in seen_entries, f"Duplicate dictionary ID {entry['id']}")
            seen_entries.add(entry["id"])
            lesson_entry_ids.add(entry["id"])
            require(entry["lesson"] == number and entry["number"] == position,
                    f"Wrong dictionary position {number}.{position}")
            require(entry["global_number"] not in seen_globals, f"Duplicate global entry number at {number}.{position}")
            seen_globals.add(entry["global_number"])
            require(entry["type"] in KINDS, f"Unknown dictionary type at {number}.{position}")
            entry_counts[entry["type"]] += 1
            context = contexts.get(entry["context_key"])
            require(context is not None, f"Missing context at {number}.{position}")
            require(entry["id"] in context["entry_ids"], f"Missing context reverse reference at {number}.{position}")
            require(entry["source_kind"] == context["kind"], f"Wrong context kind at {number}.{position}")
            require(ARABIC.search(entry["arabic"]) and CYRILLIC.search(entry["russian"]),
                    f"Incomplete dictionary entry {number}.{position}")
            prepared = deepcopy(entry)
            prepared["arabic"] = cleaner.arabic(entry["arabic"], f"glossary.{number}.{position}.arabic")
            prepared["russian"] = canonical(entry["russian"])
            for field in ["past", "present", "masdar"]:
                if field in entry:
                    prepared[field] = cleaner.arabic(entry[field], f"glossary.{number}.{position}.{field}")
            prepared["source"] = {"id": entry["id"], "contextId": context["id"],
                "contextKind": context["kind"], "contextSourceId": context["source_id"],
                "oldLesson": entry.get("old_lesson"), "origin": entry.get("origin")}
            prepared_entries.append(prepared)
        for key, context in contexts.items():
            require(set(context["entry_ids"]) <= lesson_entry_ids, f"Context {key} references unknown dictionary entries")
            for entry_id in context["entry_ids"]:
                entry = next(entry for entry in gl["entries"] if entry["id"] == entry_id)
                require(entry["context_key"] == key, f"Context {key} references an entry attached elsewhere")
        prepared_contexts = [{**deepcopy(context), "arabic": prepared_by_id[context["id"]]["ar"],
                              "russian": prepared_by_id[context["id"]]["ru"]}
                             for context in gl["contexts"]]
        normalized_glossary["lessons"].append({"number": number, "title_ru": canonical(gl["title_ru"]),
            "title_ar": title_ar, "chapter": canonical(gl["chapter"]), "book": gl["book"],
            "previous_number": gl.get("previous_number"), "entries": prepared_entries,
            "contexts": prepared_contexts})
        source_index["lessons"].append({"number": number, "previous": text.get("previous"),
            "book": text["book"], "rows": [row["id"] for row in lesson_rows],
            "entries": [entry["source"] for entry in prepared_entries]})

    require(len(seen_entries) == glossary["totals"]["entries"] == 907, "Wrong total dictionary entry count")
    require(total_contexts == glossary["totals"]["contexts"] == 737, "Wrong total context count")
    require(seen_globals == set(range(1, 908)), "Global dictionary numbers must cover 1 through 907")
    require(row_counts == Counter(pair=4485, heading=183), "Unexpected reading row counts")
    require(len(russian_only_headings) == len(RUSSIAN_ONLY_HEADINGS), "Known Russian-only heading set changed")
    require(reading["pairs"] == 4485, "Wrong top-level reading pair count")
    for group in groups.values():
        require(group_pair_counts[group["id"]] == group["pairs"], f"Group {group['id']} pair count mismatch")

    # The pre-existing, source-verified vocalisation fix remains guarded by ID.
    teak = [entry for lesson in normalized_glossary["lessons"] for entry in lesson["entries"]
            if entry["id"] == "tfq-vocab-0661"]
    require(len(teak) == 1 and teak[0]["arabic"] == "ساج" and teak[0]["lesson"] == 104
            and teak[0]["context_key"] == "p-6464", "The existing teak vocalisation fix needs review")

    report = {"revision": REVISION, "lessons": 159, "entries": len(seen_entries),
        "contexts": total_contexts, "rows": dict(row_counts), "fragments": sum(row_counts.values()),
        "wordKinds": dict(entry_counts), "wordlessLessons": wordless, "books": deepcopy(reading["groups"]),
        "rawContextMatches": total_contexts, "inlineHintRemovals": cleaner.removals,
        "warnings": cleaner.warnings, "russianOnlyHeadings": russian_only_headings}
    return normalized_glossary, normalized_reading, source_index, report


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("glossary", type=Path)
    parser.add_argument("reading", type=Path)
    parser.add_argument("output", type=Path)
    args = parser.parse_args()
    raw_glossary = args.glossary.read_bytes()
    raw_reading = args.reading.read_bytes()
    glossary, reading, index, report = prepare(json.loads(raw_glossary), json.loads(raw_reading))
    report["sourceSha256"] = {"glossary": hashlib.sha256(raw_glossary).hexdigest(),
                              "reading": hashlib.sha256(raw_reading).hexdigest()}
    # No output is written until all source and context checks have passed.
    args.output.mkdir(parents=True, exist_ok=True)
    for name, value in [("glossary.json", glossary), ("reading.json", reading),
                        ("source-index.json", index), ("source-validation.json", report)]:
        (args.output / name).write_text(json.dumps(value, ensure_ascii=False, indent=2) + "\n")
    print(json.dumps({"lessons": report["lessons"], "entries": report["entries"],
        "contexts": report["contexts"], "fragments": report["fragments"],
        "removedInlineHints": len(report["inlineHintRemovals"]), "warnings": len(report["warnings"])},
        ensure_ascii=False))


if __name__ == "__main__":
    main()
