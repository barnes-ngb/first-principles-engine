# The Good and the Beautiful — Language Arts Level 1 → Reading-Graph Bridge — v0 — DRAFT, PENDING OWNER CURATION, not shipped as data

> ⚠️ **DRAFT — PENDING OWNER CURATION. This file is NOT shipped as bridge data.**
> The per-lesson content below is **reconstructed from general model knowledge** of The Good and the
> Beautiful (TGTB) Language Arts Level 1 course, **not** transcribed from the authoritative published
> course guide / scope & sequence. It is a *structural draft* for the owner (and the owner's design
> partner) to curate against the official TGTB LA1 scope & sequence before any of it becomes code.
> **Every row carries a confidence flag.** A later curation-apply run (the FEAT-46 → FEAT-47 pattern)
> transcribes the CURATED version into `src/core/foundations/` bridge data — nothing here is read by
> the app today.
>
> **Companion to:** [`../LEARNER_MODEL_DESIGN.md`](../LEARNER_MODEL_DESIGN.md) §12 (external-curriculum
> bridge) and [`READING_GRAPH_V0.md`](./READING_GRAPH_V0.md) (the reading-graph node ids mapped to).
> Bridge mechanism: FEAT-63 (`src/core/foundations/workbookBridge.ts`). Ledger anchor: **FEAT-63**
> (refs FEAT-49 §12, FEAT-53 the Fast Phonics template, FEAT-62 the position-capture pipeline).

## Why this file exists

The learner model tracks curriculum *positions* but, before FEAT-63, never read them. The family runs
**two** language-arts curricula — Fast Phonics (bridged at FEAT-53) and **TGTB Language Arts Level 1**
(config reads **Level 110**) — and the model saw only the first. FEAT-63 shipped the *wiring*; this
file is the **data half** for TGTB LA1: a draft mapping of its lessons to reading-graph node ids so a
curated version can turn "TGTB LA1 Lesson 110 reached" into `covered` evidence. Because TGTB LA1 and
Fast Phonics both feed the **same** reading graph, they become **multi-source** evidence on shared
nodes (design §12: the model takes the best-supported source, never a raw sum).

## Semantics (the rules a curated version of this data will obey)

Inherited unchanged from the Fast Phonics bridge (design §12 / §13), enforced in code by
`applyBridgeCoverageToModel`:

- **Reaching a lesson = `covered` evidence, capped at `forming`** + a "verify with a quick quest?"
  openQuestion. Never `solid` on curriculum position alone.
- **Positions are cumulative** (Lesson 110 ⇒ coverage of every mapped lesson ≤ 110).
- **Never downgrades** a stronger standing state; a `solid` node only gains the ref.
- **Dedup per concept**, highest lesson-band reached wins as the evidence label.
- **Multi-source with Fast Phonics.** Where TGTB LA1 and Fast Phonics both cover a reading node (e.g.
  `reading.phonics.digraphs`), each contributes an independent `curriculumPosition` ref; the §13 cap
  and best-source rule (not addition) already govern the resulting state.

## Bridge data shape (the generalized interface a curated version fills in)

```ts
// src/core/foundations/tgtbLa1Bridge.ts  (FUTURE — only after curation)
import type { WorkbookBridge } from './workbookBridge'
export const tgtbLa1Bridge: WorkbookBridge = {
  sourceId: 'tgtbLanguageArts1',
  aliases: ['tgtb language arts 1', 'the good and the beautiful language arts 1',
            'good and beautiful la1', 'tgtb la level 1'],
  version: 1,
  units: [ /* the lesson-bands below, once curated */ ],
  // lessonToUnit: see the CURATION QUESTION on lesson numbering below.
}
```

## Per-lesson-band `covers[]` (DRAFT — confidence-flagged, maps onto CURATED reading-graph nodes ONLY)

TGTB LA1 runs as a sequence of numbered **Lessons** (the app tracks a single number; currently 110).
The bands below are the DRAFT's best-guess grouping from general course knowledge; **the lesson
boundaries are the uncertain layer** and the primary curation target. Every `covers[]` id is a real
node in [`READING_GRAPH_V0.md`](./READING_GRAPH_V0.md). TGTB LA1 integrates phonics/reading **and**
handwriting/spelling; only the reading-graph-mappable strands appear here (encoding nodes included).

| Band (DRAFT) | Approx. focus | `covers[]` (reading-graph node ids) | Confidence |
|---|---|---|---|
| Lessons ~1–20 | Letter sounds, print concepts, hearing sounds in words, first sight words | `reading.print.concepts`, `reading.phonemic.hearSounds`, `reading.phonics.letterSounds`, `reading.phonics.sightWords` | 🟡 medium — typical LA1 opening; **lesson cutoffs uncertain** |
| Lessons ~21–45 | CVC decoding + encoding, reading-accuracy on simple sentences | `reading.phonics.cvc`, `reading.encoding.spellCvc`, `reading.fluency.accuracy` | 🟡 medium — mapping plausible; cutoff uncertain |
| Lessons ~46–70 | Blends, digraphs (sh/ch/th/wh), spelling patterns | `reading.phonics.blends`, `reading.phonics.digraphs`, `reading.encoding.spellPatterns` | 🟠 low-medium — strand order + cutoffs need S&S check |
| Lessons ~71–100 | Long vowels / silent-e, vowel teams, listening comprehension | `reading.phonics.longVowels`, `reading.phonics.vowelTeams`, `reading.comprehension.listen` | 🟠 low-medium — **spans toward the child's current L110** |
| Lessons ~101–120 | r-controlled vowels, fluency pace, everyday vocabulary | `reading.phonics.rControlled`, `reading.fluency.pace`, `reading.vocabulary.everyday` | 🔴 low — **contains the child's current L110; verify carefully** |
| Lessons ~121+ | Diphthongs, multisyllable decoding, explicit comprehension | `reading.phonics.diphthongs`, `reading.decoding.multisyllable`, `reading.comprehension.explicit` | 🔴 low — beyond the child's position; drafted for completeness only |

**Worked example (DRAFT, illustrative — do not ship):** "TGTB LA1 Lesson 110 reached" would, under this
draft, apply the cumulative union up to the ~101–120 band, i.e. `covered` (→ `forming`, capped) from
print-concepts through r-controlled vowels / fluency-pace / everyday-vocabulary — **alongside** Fast
Phonics's own evidence on the overlapping phonics nodes. **The curation must verify this** before it
writes anything.

## Curation questions (resolve before shipping)

1. **What does the family's TGTB LA "Level" number mean?** (the `lessonToUnit` slot / §0.2 finding).
   Is 110 a TGTB *Lesson* within Level 1, or a course-wide unit? TGTB LA1 has a fixed lesson count —
   does 110 sit inside Level 1, or has the child crossed into Level 2 (a different bridge)? The native
   unit and `lessonToUnit` translation depend on this. **Until answered, config-position sync for TGTB
   is gated** (unregistered → "no bridge yet"; once registered without a curated `lessonToUnit` →
   "lesson mapping pending curation").
2. **Lesson ranges per concept.** The six bands are guesses. What are the *actual* lesson ranges at
   which TGTB LA1 introduces each reading-graph concept? Core transcription task.
3. **Phonics vs. TGTB's own sequence.** TGTB does not follow UK Letters-and-Sounds (as Fast Phonics
   does) or a single US-conventional order; its phonics ordering is its own. Which lessons reach
   digraphs vs. vowel teams vs. r-controlled, in TGTB's actual order?
4. **Where does Level 110 actually sit?** The child's current position lands in a low-confidence band
   (🔴). Getting *this* band right matters most for today's model — and for how it reconciles against
   the Fast Phonics evidence on the same nodes.

> **The owner's design partner will verify this draft against the official TGTB Language Arts Level 1
> scope & sequence during curation.** This file is *structure*, not authority — it exists to make the
> curation a transcription task, not a blank page.
