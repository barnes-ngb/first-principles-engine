# Doc Index Updates — Companion to DESIGN_STORY_GENERATION_V2

Per the "pointer/breadcrumb" recommendation, here's the minimal patch to keep
the docs aligned when this design doc gets committed.

## DOCUMENT_INDEX.md — add this row

Add to the `Repo Docs (/docs)` table, alphabetically near the other DESIGN_* docs:

```
| `DESIGN_STORY_GENERATION_V2.md` | **NEW** (2026-05-25) | Story Generation V2 design — single-prompt entry, post-generation review chat with TTS read-back + voice-driven page revision, retires Story Guide wizard. Phases 1 (prompt quality, server-only) and 2 (review chat + entry replacement) in detail; Phase 3 sketched. Builds on `useTTS`, `useSpeechRecognition`, `useBookGenerator` progressive save, `generateStory` task. Adds new `revisePage` task. Pairs with `DESIGN_MONTHLY_REVIEW_BOOK.md` (sibling design on Book Builder substrate). |
```

## MASTER_OUTLINE.md — no change yet

Intentional. MASTER_OUTLINE tracks **what's built**, not what's designed. The
design doc gets a changelog entry when Phase 1 actually ships, not now.

The eventual Phase 1 entry would look something like:

```
| Story Gen V2 P1 | YYYY-MM-DD | Story generation prompt quality pass. Rewrote `buildStoryPrompt` (`functions/src/ai/chat.ts`) with per-child calibration driven by `wordMastery` + skill snapshot reading level, replacing the binary `isYounger` switch. Lincoln calibration corrected — no more "CVC words" instruction for a 10-year-old. Sight word integration changed from "MUST use every word" to "weave 3-5 naturally from the practicing tier"; mastered words excluded from forced injection. Added explicit per-page beat templates (6 beats for London, 10 for Lincoln), craft-of-writing guardrails (consistent character names, natural dialogue, read-aloud sanity check), and a `qualityNotes` output field for usage-log debugging. Token budget raised 4096 → 6144, temperature 1.0 → 0.7. Wired `loadSightWordSummary` output into the prompt; added `skillSnapshot` to the `generateStory` context slice. No client changes; existing JSON parser unchanged. Design doc: `DESIGN_STORY_GENERATION_V2.md` §4. |
```

Phase 2 lands its own entry when it ships.

## SYSTEM_PROMPTS.md — no change yet

Same reasoning. The `generateStory` section in `SYSTEM_PROMPTS.md` describes
the current production prompt. It gets updated alongside the Phase 1 PR, not
ahead of it. Updating it now would describe a prompt that doesn't exist in the
deployed codebase.

## Summary

Three docs, one immediate change (`DOCUMENT_INDEX.md` row addition). The other
two stay accurate until implementation ships.
