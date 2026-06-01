# Writing & Spelling — Progression Design (PHASES 1–2 DECIDED — IN PROGRESS)

> **Status:** **Phase 1 (spell-the-word) and Phase 2 (build-the-sentence) decided and building.**
> Phase 3 (say-it-write-it) remains a proposal; the **free-bank** sentence composition and the
> **dictate→reorder** voice on-ramp are explicitly **deferred** (see §3 Phase 2).
> **Ledger:** `FEAT-11` (REVIEW_HOME_BASE.md §6).
> **Phase 1 decisions (locked in review, see §3):** Phase 1 (spell-the-word) leads; **spelling is its
> own tracked signal, never blurred with composition**; surface = **extend the quest**; word source =
> **blend sight-words + phonics frontier**; mastery = **reuse the conservative rollup threshold**; the
> handwriting-first practice ideas were **neutralized** (no pencil routing). Phases 2–3 below stay
> proposals — the pedagogy is still the owner's call; adjust before building.

Writing/spelling is **Lincoln's hardest area** and he's advancing — so this is a careful design pass
to ground what exists, name the gap honestly, define the skill ladder cleanly, and propose a phased
progression that routes through the *existing* mastery loop rather than spinning up a parallel system.

---

## 0. The non-negotiable design constraint (threaded everywhere below)

Lincoln's difficulty is the **mechanics** of writing (handwriting / typing), **not the ideas**. So
every interaction in this progression is **tap or voice — never forced typing or handwriting**:

- **Tile assembly** for words and sentences (tap to place, tap to remove).
- **Voice → transcription** for composition, with **tap-to-revise** on the transcript.
- **Dictation / tap-to-hear** for stimulus; the child never has to read a target to act on it.

No-shame / disposition framing throughout: we are **building** his expression, not **testing** his
weakness. "You crafted that," not "you misspelled that." This mirrors the build-the-word feature's
existing copy discipline (`BuildWordQuestion.tsx:40-47`) and the North Star's "growing, not passing."

> **Why this is load-bearing:** if any phase quietly reintroduces a keyboard or a pencil as the *only*
> path, it re-blocks the exact child this is for. The constraint is a gate on every interaction, not a
> nice-to-have.

---

## 1. What exists today (file evidence)

### 1a. Encoding / spelling — partially built

| Capability | Where | Tap/voice? | Notes |
|---|---|---|---|
| **Build-the-word (FEAT-04)** | `src/features/quest/BuildWordQuestion.tsx`, `questTypes.ts:143-155`, `questHelpers.ts:13-88`, generation in `functions/src/ai/chat.ts:1517-1631` | ✅ Tap-only tiles; **no text input ever**; target word spoken (TTS), never shown | The encoding seed. Child hears a word, taps grapheme tiles to build it. Scaffolds L1–L6 (CVC → digraphs/blends → CVCe/vowel teams). **Capped at L6** — no multi-syllable. 1–2 per 10-question quest, never first, never two in a row. |
| **Sight-word system** | `src/features/books/useSightWordProgress.ts`, `sightWordMastery.ts`, `SightWordDashboard.tsx`, `highlightSightWords.tsx` | ✅ Tap-to-hear (TTS); tap "?" = help, tap ✓ = known | Tracks **reading/recognition** mastery (`sightWordProgress`: new → practicing → familiar → mastered), **not spelling**. Parent can confirm mastery. Generates weak-word practice stories. |
| **Spelling routine log** | `planning.ts:123-158` (`SpellingLog`, `SpellingDictationLog`), `ReadingRoutineItems.tsx:194-242,359-403`, `dailyPlanTemplates.ts:55,79` | ⚠️ Parent-logged checkbox + text | Lincoln's routine has a "Spelling word (+1 XP)" item; MVD floor is "Writing OR spelling: 1 line or 1 word." This is **completion + XP only** — no child interaction, no mastery tracking. |
| **Spelling in evaluate** | `functions/src/ai/tasks/evaluate.ts`, prompt in `chat.ts:556-688` | — | **Absent.** The reading diagnostic tests decoding/recognition only (L0 phonemic awareness → L6 vowel teams). There is no "spell this word" / "write what you hear" step. |

**Honest read:** encoding is genuinely seeded (build-the-word is real, tap-only, well-tested) but
narrow — single words, L6 ceiling, lives inside quest, and is **not** scored into a spelling level.

### 1b. Writing / composition — essentially absent as structured practice

There is **no standalone composition feature** — no place a child builds a sentence or expresses an
idea as text as a deliberate, tracked activity. What exists is **adjacent**, book-flavored, and
AI-first:

| Adjacent piece | Where | What it actually is |
|---|---|---|
| **Books — story creation** | `src/features/books/StoryGuidePage.tsx`, `useStoryGuide.ts`, `BookGenerateChat.tsx`, `useBookGenerateChat.ts` | Child answers guided prompts (voice or text) → **AI writes the story**. The child supplies ideas; the AI supplies the prose. Not the child composing text. |
| **Books — page text edit** | `src/features/books/PageEditor.tsx:89-94` | Plain multiline `TextField` to tweak AI-generated page text. Typing-based, no scaffolding — not a composition surface for Lincoln. |
| **Teach-back** | `src/features/today/KidTeachBack.tsx:74-100` | Audio recording only. Rich oral evidence, **no transcription captured**. |
| **Drawing → story** | `SketchScanner.tsx`, `DrawingChoiceDialog.tsx` | Sketches become **illustrations** only. There is **no** "narrate your drawing → AI writes it down" pipeline. |

**Honest read:** the child can *dictate ideas and get an AI story*, but there is **no surface where
the child's own words become text they can shape** — which is exactly composition, and exactly the gap.

### 1c. Snapshot / mastery representation — writing is a first-class *domain* but an unrouted *skill*

This is the most important finding for routing. The data model already **knows about writing**, but
the **mastery loop doesn't run on it**:

| Layer | Writing represented? | Evidence |
|---|---|---|
| **`EvaluationDomain`** | ✅ Yes | `enums.ts:291-297` — `Reading / Math / Speech / Writing` |
| **Curriculum map** | ✅ Yes, richly — 13 nodes, 6 tiers, incl. **two spelling nodes** (`writing.mechanics.spelling` phonetic, `writing.mechanics.conventionalSpelling`) and a full composition spine (sentence → paragraph → narrative → opinion/informational → revision → voice) | `src/core/curriculum/curriculumMap.ts:333-358` |
| **Skill tags** | ⚠️ Only 3, all handwriting-mechanics | `skillTags.ts:30-35` — `writing.gripPosture / letterFormation / copyWords`. **No spelling or composition tag in the catalog.** |
| **`WorkingLevels`** | ❌ **No `writing` field** | `evaluation.ts:125-131` — only `phonics`, `comprehension`, `math`. So writing has **no leveled progression** the way reading/math do. |
| **Working-level derivation** | ❌ No writing path | `workingLevels.ts` has `PHONICS_/COMPREHENSION_/MATH_SKILL_LEVEL_MAP` and scan/eval/quest derivations — **none for writing**. |
| **Mastery rollup** | ✅ Generic — would already work | `masteryRollup.ts:63-307` aggregates checklist mastery chips for *any* skill tag; a writing checklist item would feed it today. |
| **Central writer** | ✅ Generic | `skillSnapshotWrites.ts` advances *any* matched priority skill/block; additive-only (per `CLAUDE.md`). |

> ⚠️ **A subtle trap in the curriculum map (NEUTRALIZED in Phase 1):** the writing nodes'
> `practiceIdeas` *were* **handwriting-first** ("Tracing practice", "Sand/salt tray writing",
> "Look-say-cover-write-check"), which violate the tap/voice constraint for Lincoln. **FEAT-11 Phase 1
> replaced these with tap/voice (or neutral) equivalents** across the writing map so the planner can
> never route him to a pencil; the *node structure* is retained. (Asserted by
> `src/core/curriculum/writingNoPencil.test.ts`.)

**Net:** to route a writing/spelling skill the way reading/math now route (#1316/#1317 mastery loop),
the missing pieces are: (a) a `writing` working-level field, (b) spelling/composition skill tags, and
(c) a writing skill→level derivation. The snapshot, rollup, and writer plumbing are already generic.

### 1d. Reusable infrastructure (what a progression can stand on)

| Infra | Where | Reuse |
|---|---|---|
| **Tile assembly engine** | `BuildWordQuestion.tsx`, `questHelpers.ts:canAssemble` | The tap-to-place/remove/submit UX generalizes from *graphemes→word* to *word-tiles→sentence*. |
| **Voice → transcription** | `useTranscription.ts` (Whisper CF), `transcribeAudio` (`functions/src/ai/tasks/transcribeAudio.ts`), persisted to `transcriptionEvents` with **editable `finalText`** | The composition spine. "Did I hear you right?" + editable transcript already exists. |
| **VoiceInput component** | `src/components/VoiceInput/VoiceInput.tsx` | Whisper + Web-Speech with confirm/edit/"type instead" fallback — drop-in. |
| **`useTTS` / `useSpeechRecognition` / `useAudioRecorder`** | `src/core/hooks/` | Stimulus playback + browser dictation. |
| **Sight-word store** | `sightWordProgress` + `addSightWord`/`removeSightWord` | Word bank to seed sentence tiles and spelling targets from words he's *already met*. |
| **Quest framework** | `src/features/quest/` | Adaptive level engine, findings emission, no-shame copy — a writing quest mode could live here. |
| **Mastery loop** | `masteryRollup.ts` + `skillSnapshotWrites.ts` | Generic — writing checklist/quest signals route through it once tagged. |

---

## 2. The skill distinction (so the progression is coherent)

Three distinct sub-skills, ascending. Naming them apart keeps the progression from collapsing into
"writing practice" mush, and lets each route by its **own** gap.

| Sub-skill | What it is | Tap/voice interaction | Where Lincoln likely sits |
|---|---|---|---|
| **Encoding / spelling** | Building a *word* from its sounds — sound→grapheme mapping | **Tile assembly** (the build-the-word seed): hear word → tap grapheme tiles. Extends to spelling sight words he can already *read*. | **Emerging→developing.** Build-the-word L1–L6 is his live surface; phonics "recently clicking." This is the nearest frontier. |
| **Sentence-building** | Assembling a *sentence* from word/phrase tiles — word order, capital, end punctuation. The **bridge** from words to writing. | **Word-tile assembly**: tap word tiles into order; tap a capital/period tile. Optionally dictate, then fix order by tapping. | **Live (FEAT-11 Phase 2)** — `build-sentence` quest type (scrambled-to-order, bundled capital/period), tracked as its own `WorkingLevels.sentence` signal. Free-bank composition + the dictate→reorder on-ramp are deferred. |
| **Composition** | Expressing an *idea* as text — the hard part, and the one most blocked by mechanics. | **Voice → transcription**, then **tap-to-revise** (tap a word to swap/delete/insert; never forced to type). | **Blocked, not absent** — he has the ideas (teach-back, story dictation prove it); the keyboard/pencil is the wall. This phase removes the wall. |

The point of the ladder: **encoding** is "get the word right," **sentence-building** is "put words in
order," **composition** is "say what you mean." They fail for different reasons and should be **tracked
and routed separately** — which the snapshot model can support once writing is a working-level domain.

---

## 3. Proposed progression (for review — rationale + options, not a prescription)

A **phased** progression, smallest-high-value first, each phase reusing existing infra and threading
into the mastery loop. **Where there's a real pedagogical choice, both options are laid out for you to
pick** — that's the owner's call, not the build's.

### Phase 1 — Spell-the-word (encoding, from words he's already met) **← DECIDED — building (PR #1320)**

> **Decided (FEAT-11 Phase 1).** Built as a new `spell-word` quest question type that **reuses the
> build-the-word tile engine and `BuildWordQuestionScreen` verbatim** (tap-only tiles, target spoken
> not shown, exact-match check — asserted: no text input). Targets are **client-generated** from the
> **blended** source (sight-word bank + phonics frontier), rotated into the reading/phonics quest
> (1–2 per session, never first, never two in a row). Spelling is tracked as its **own** signal:
> `writing.spelling.*` skill tags + a new `WorkingLevels.writing` field derived **only** from the
> spell-word subset — never folded into phonics, and structured so composition becomes a **separate**
> signal later. Spelling **mastery** routes through the existing conservative `masteryRollup` →
> central `skillSnapshotWrites` writer (additive, never-downgrade); the quest seeds an *emerging*
> priority skill but never writes spelling mastery inline.

**What:** Reuse the build-the-word tile engine, but seed targets from Lincoln's **sight-word bank**
and recent phonics frontier instead of only AI-generated quest words. Child hears a word he's been
*reading*, taps grapheme tiles to **spell** it. Same tap-only, target-never-shown discipline.

**Why first:** smallest step on top of two things that already exist and work (build-the-word tiles +
`sightWordProgress`). It closes the read/spell asymmetry — today we track whether he can *read* "said"
but never whether he can *spell* it. High value, low new surface area.

**Tap/voice:** tile assembly only. No typing. ✅

**Routing / mastery wiring:**
- Add a `writing` working-level field + a phonetic-spelling skill tag (see §3.5).
- Emit findings from spell-the-word sessions → derive `workingLevels.writing` (mirror the phonics path
  in `workingLevels.ts`).
- Mastered spelling words route through `masteryRollup` → snapshot the same way reading does.

**Options — DECIDED:**
- **(1a) Surface — ✅ extend the quest.** Spell-the-word is a `spell-word` question type rotated into
  the reading/phonics quest (reuses the adaptive engine, findings, and tile UI). *(A standalone Today
  mini-surface was not built.)*
- **(1b) Word source — ✅ both, blended.** Sight-word bank (familiar/mastered words he can already
  *read*) for confidence + the phonics-frontier list for stretch; sight words lead, frontier follows.
- **(1c) "Spelled" vs "mastered" — ✅ reuse the conservative threshold.** Spelling mastery means the
  same as every other skill (≥3 strong signals across ≥2 days, zero struggles) and routes through the
  same `masteryRollup` → central writer. A single correct spelling never marks mastery.

### Phase 2 — Build-the-sentence (sentence-building bridge) **← DECIDED — building (PR: build-the-sentence)**

> **Decided (FEAT-11 Phase 2).** Built as a new `build-sentence` quest question type that **reuses the
> tap-only tile-assembly paradigm** (a sibling `BuildSentenceQuestionScreen` to the word-tile screen —
> tap tiles into order, tap to remove, no text input ever — asserted: no text-input element). Targets
> are **client-generated** in pure, testable `buildTheSentence.ts` from his **word bank blended with a
> small function-word set** (the grammar scaffold), using level-scaled templates so the target is
> always grammatical and **deterministically checkable**. The correct words are presented **scrambled →
> tapped into order** (scrambled-to-order). A **capital tile** and a **period tile** are **bundled into
> the sentence** (tap them into place; capital at the start, period at the end) — checked
> case/punctuation-sensitively against the target. Rotated into the reading/phonics quest (≤1 per
> session, never first, never right after another injected question, Level ≥ 2). Sentence-building is
> tracked as its **own** signal: `writing.composition.sentence` / `writing.sentence.*` tags + a new
> `WorkingLevels.sentence` field derived **only** from the build-sentence subset — never folded into the
> spelling signal (`WorkingLevels.writing`) or phonics, and structured so composition stays a separate
> future signal. Sentence **mastery** routes through the existing conservative `masteryRollup` → central
> `skillSnapshotWrites` writer (additive, never-downgrade); the quest seeds an *emerging* priority skill
> but never writes sentence mastery inline.

**What:** Word **tiles** the child taps into order to make a sentence — subject + verb, capital at the
start, period at the end. Tiles drawn from his word bank + a small function-word set.

**Why second:** it's the genuine bridge from "right word" to "real writing," and it stays fully inside
the tile paradigm he already succeeds with — no new mechanics, just bigger units.

**Tap/voice:** tap word-tiles into order; tap capital/period tiles. ✅

**Routing / mastery wiring:** maps to `writing.composition.sentence` (curriculum node already exists);
new sentence skill tags + `WorkingLevels.sentence`; same rollup → central-writer path as spelling, but a
separate signal.

**Decisions — DECIDED:**
- **(2a) Construction model — ✅ scrambled-to-order only.** The correct words are offered scrambled and
  tapped into order — deterministic and checkable. **Free-bank** open composition (pick tiles to compose
  freely, multiple valid sentences) is the within-phase graduation but is **deferred — not this run**
  (it needs a validity approach, e.g. an acceptance grammar / AI check, before it can be scored).
- **(2b) Capital/punctuation — ✅ bundled into the sentence.** A capital tile and a period tile are part
  of the same build (not a separate micro-skill); split out only if it later becomes a distinct blocker.
- **(2c) Voice on-ramp — ✅ deferred.** The dictate-a-sentence → reorder-the-transcript-tiles on-ramp is
  **Phase 3**, not this run.

> **Separable-signal note (load-bearing).** Phase 1 named the spelling signal `WorkingLevels.writing`.
> Phase 2 does **not** rename it (no migration of live child records); instead it adds a **sibling**
> `WorkingLevels.sentence` and documents `writing` explicitly as the *spelling* level. Spelling ≠
> sentence ≠ composition: three signals, three fields, never one blurred `writing` number. Composition
> (Phase 3) will get its own field again.

### Phase 3 — Say-it-write-it (composition, voice-first, tap-to-revise)

**What:** The child **speaks** an idea (a sentence, then a few sentences) → Whisper transcribes →
"Did I hear you right?" → **tap-to-revise**: tap any word to swap/delete, tap a gap to insert (by
voice). The child's *own words* become text **they shape** — without ever typing.

**Why third (and why it's the prize):** this is the part most blocked by mechanics and most valuable
for Lincoln, because his ideas are strong (teach-back + story dictation already prove it). It's third
because it leans hardest on revision judgment, which sentence-building scaffolds. The voice→transcript
plumbing already exists (`useTranscription`, editable `finalText`, `transcriptionEvents`).

**Tap/voice:** voice in, tap to revise. Typing is **never** the required path (a "type instead"
fallback may exist as an *option*, never a gate). ✅

**Routing / mastery wiring:** maps to `writing.composition.narrative` / `paragraph` nodes; this is
where teach-back's "write-only" richness (FEAT-09) could finally become *tracked* writing evidence.

**Open options:**
- **(3a) Revision depth:** tap-to-swap-words only (mechanical) vs AI-suggested revisions the child
  accepts/rejects by tap (richer, more scaffolding, more AI surface). *Recommendation: ship mechanical
  tap-revise first; AI-suggested revision is a fast follow.*
- **(3b) Relationship to Books:** is composition a **new surface**, or do we **upgrade the Books
  dictation flow** so the child's narration is captured as *their* tracked writing (not just AI story
  fuel)? *Recommendation: explicitly your call* — Books-upgrade reuses the most, but a dedicated
  surface keeps "Lincoln's writing" legible in the snapshot. **This is a pedagogy + product decision,
  not a build detail.**

### 3.5 — Cross-phase: making writing a routed domain (the plumbing all phases share)

Independent of which phase ships, routing writing through the mastery loop needs (small, additive):

1. **`WorkingLevels.writing?: WorkingLevel`** — `evaluation.ts:125-131` (one field).
2. **Spelling + composition skill tags** — extend `WritingTags` (`skillTags.ts:30-35`) to cover the
   `writing.mechanics.spelling` / `writing.composition.sentence` / `narrative` curriculum nodes that
   already exist in the map.
3. **`WRITING_SKILL_LEVEL_MAP` + a writing derivation** in `workingLevels.ts`, mirroring phonics.
4. **(Optional) a writing evaluate path** — the `Writing` `EvaluationDomain` exists but has no
   diagnostic; a tap/voice writing diagnostic would seed the working level. *Lower priority than the
   practice surfaces — propose deferring.*

> **Invariant note (propose-and-confirm):** any change touching `skillSnapshots` goes through the
> central additive `skillSnapshotWrites.ts` writer and is **propose→confirm→write** per `CLAUDE.md`.
> This design proposes the *shape*; the build run confirms before wiring writes.

---

## 4. Recommended Phase 1 (the smallest high-value step)

**Spell-the-word**: extend the build-the-word tile engine to spell words from Lincoln's
**sight-word bank + phonics frontier**, scored into a new `writing` working level so spelling routes by
his actual gaps the way reading/math now do.

- **Reuses:** build-the-word tiles (`BuildWordQuestion.tsx`), `sightWordProgress`, quest findings,
  `masteryRollup`, `skillSnapshotWrites`.
- **Adds (additive):** `WorkingLevels.writing`, a phonetic-spelling skill tag, a writing level
  derivation, and a target-source that pulls from the sight-word bank.
- **Honors the constraint:** tap-only tiles, target spoken not shown, no-shame copy — identical to the
  feature it extends.
- **Closes a real asymmetry:** we track whether he can *read* a sight word but never whether he can
  *spell* it. Phase 1 makes spelling a first-class, routed skill with the least new surface area.

---

## 5. Summary

- **What exists:** a real, tap-only **encoding** seed (build-the-word, L1–L6, single words) and a
  reading-only sight-word mastery system. Writing is a **first-class `EvaluationDomain` and a rich
  13-node curriculum map** — but its skill tags are handwriting-only, it has **no working level**, and
  there is **no composition surface** where the child's own words become text they can shape.
- **The gap:** spelling isn't *scored* (we track reading a word, not spelling it); sentence-building
  doesn't exist; composition is **blocked by mechanics**, not by ideas — and the curriculum map's
  practice ideas are pencil-first, which is exactly wrong for Lincoln.
- **The proposal:** three tap/voice phases — **spell-the-word → build-the-sentence → say-it-write-it**
  — each reusing existing infra (tiles, Whisper transcription, the generic mastery loop) and routing
  through the snapshot once writing becomes a working-level domain.
- **Recommended Phase 1:** **spell-the-word** on top of build-the-word + sight words.

**This is for your review — adjust the progression (phases, ordering, options in §3) before we build.**
The pedagogy is yours to shape; this doc only grounds what exists and proposes a coherent, constraint-
honoring path.
