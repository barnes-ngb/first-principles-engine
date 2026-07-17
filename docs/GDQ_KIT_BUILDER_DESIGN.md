# GDQ Kit Builder — roster capture for Barnes Bros kits

**Status:** IN BUILD · v0.2 · 2026-07-17 (slice 1 shipped)
**Ledger anchor:** FEAT-78 (design) · **FEAT-80** (code — slice 1: roster type + collection + parent-entry form)
**Reuse base:** the Story Guide capture surface (`src/features/books/StoryGuide*`) + the Barnes Bros business feature (`src/features/business/*`, `src/core/types/business.ts`)
**Companion strategy docs:** `GARDEN_DEFENSE_QUEST_PLAN.md` (FEAT-29), `SEED_VAULT_V1_RUNBOOK.md`, `BUSINESS_TAB_DESIGN.md` (FEAT-30)

> Docs-only. This design proposes a shape; nothing here is final and no code is changed. The
> build plan (§7) is serialized into later, human-assigned runs.

---

## 1. Problem statement — a story is not a roster

The **Story Guide** (`books/StoryGuidePage`) asks five fixed questions —
*hero → setting → problem → solution → ending* — and turns the answers into **one linear
narrative** (a `Book`, in the kid's voice, with generated scenes). Lincoln has used it beautifully.
It is a **story machine**, and it stays exactly as it is.

The **Barnes Bros** business (GDQ — **Garden Defense Quest**) needs a different artifact. A sellable
kit is not a plot — it is a **reusable roster** that *a different family* plays:

- a named **vault** (the treasure the game protects),
- a **hero** (name + look + move),
- **4–6 plant defenders**, each a *name + power*,
- **3–4 invaders**, each a *name + menace*,
- a **win condition**.

That roster is the seed from which the production pipeline grows the actual kit: **stickers**, a
**6-page booklet**, a **defense map**, **clue cards**, and a **badge** (per the GDQ plan and the Seed
Vault runbook).

**The confusion this doc resolves:** the Story Guide's questions produce a *plot* (a single arc that
resolves once), while a kit needs a *cast* (a structured list of characters with attributes, reused
across many printed assets). Pointing a kid at the Story Guide to build a kit yields a story about the
garden, not a roster of defenders. **The Kit Builder is a new sibling flow** that reuses the Story
Guide's *capture surface* (voice-first questions, TTS, the "I heard… / yes / try again" confirm loop)
but changes the **questions** and the **output shape**: a structured **`KitRoster`** (business data),
not a `Book` (My Books data).

> **Design principle throughout.** Voice-first, kid-agnostic, no new behavior for the kid beyond what
> the Story Guide already asks. Reuse the capture surface; change only the questions and the output.
> The business needs a **machine**, not a one-off — the Kit Builder is the repeatable way to turn a
> kid's imagination into a sellable kit.

### 1a. What the recon found (grounding, 2026-07-17)

- **No kit/roster builder exists in any form.** GDQ lives only as strategy docs
  (`GARDEN_DEFENSE_QUEST_PLAN.md`, `SEED_VAULT_V1_RUNBOOK.md`, `BUSINESS_TAB_DESIGN.md`). The only
  code references are a `SaleEntryForm` price comment and the `BusinessItemType` line-items
  (`StarterKit`/`PartyKit`/`CustomKit`) — kits as **sale line items**, never as **rosters**. No `KitRoster`,
  `kitBuilder`, or roster collection exists. **HARD STOP #1 cleared.**
- **The Story Guide capture surface is reusable via a small extraction, not a large refactor.**
  `StoryGuideQuestion.tsx` is a **purely presentational** component (progress dots, TTS-read question
  card, voice/type toggle, mic → stop → "I heard… / ✓ Yes that's right / 🔄 Try Again" confirm loop,
  Back/Skip/Next nav). Its only story coupling is *cosmetic* (`isLincoln` accent theming). The
  voice/TTS/confirm **primitives** in `useStoryGuide.ts` (`speakText`, `startRecording`/`stopRecording`
  over `webkitSpeechRecognition`, the `VoiceState` Idle→Recording→Confirming machine) are equally
  reusable. **What is story-specific** is the *orchestration*: a **fixed-length** question array
  (`Array(5)`), `answers` indexed by a linear `currentIndex`, `isDone = currentIndex >= questions.length`,
  and `assembleBrief()` → `StoryBrief`. The Kit Builder needs a **repeat-until-done** list (defenders,
  invaders) that the fixed-index machine cannot express. So the reuse is: **lift the presentational
  component + voice primitives into a shared capture module; the Kit Builder writes its own
  orchestration.** That is a small extraction. **HARD STOP #2 cleared.**

---

## 2. The roster data model (proposed, not final)

A roster is **structured business data**, additive, living under the business feature (§4 places the
collection). Shape:

```ts
// src/core/types/business.ts (proposed — additive to the existing FEAT-30 shapes)

/** One plant defender: a kid-named character with a kid-named power. */
export interface KitDefender {
  id: string          // stable id for list ordering / mid-list resume
  name: string        // the kid's word — never corrected
  power: string       // "shoots sticky sap", "grows a thorn wall"
}

/** One invader: a kid-named threat with a kid-named menace. */
export interface KitInvader {
  id: string
  name: string
  menace: string      // what it does — "steals the seeds", "digs under the fence"
}

export const KitRosterStatus = {
  InProgress: 'InProgress',
  Complete: 'Complete',
} as const
export type KitRosterStatus = (typeof KitRosterStatus)[keyof typeof KitRosterStatus]

/**
 * A reusable GDQ kit roster — the seed for stickers, booklet, map, clue cards, badge.
 * Business data, NOT a narrative. Stored under the business feature (§4).
 */
export interface KitRoster {
  id: string
  /** The child who dreamed it up (the operator/author). */
  childId: string
  /** Capture provenance — always 'kitBuilder' for this flow. */
  source: 'kitBuilder'
  status: KitRosterStatus

  // ── The roster ──
  vaultName: string
  heroName: string
  heroLook: string
  heroMove: string
  defenders: KitDefender[]   // target 4–6
  invaders: KitInvader[]     // target 3–4
  winCondition: string

  /**
   * Which capture beat is "current" for mid-flow resume (§3). Free-form beat key
   * (e.g. 'vault' | 'hero.look' | 'defenders' | 'invaders' | 'win' | 'done'),
   * NOT a numeric index — the defender/invader beats are variable-length.
   */
  resumeBeat?: string

  createdAt: string          // ISO
  updatedAt: string          // ISO
}
```

**Notes on the shape**

- **Additive.** New types, new collection; nothing in the existing `BusinessLogEntry` / `BusinessGoal`
  shapes moves. The append-only earnings-log invariant is untouched (§4).
- **Targets, not hard caps.** "4–6 defenders / 3–4 invaders" are *guidance the flow nudges toward*
  (§3), not schema constraints. A kid who names 7 defenders keeps all 7 — weird is canon (§6). The
  flow encourages "done" once the target range is met but never blocks.
- **Kid's words preserved.** `name`/`power`/`menace`/`vaultName` are stored verbatim, spelling and all
  (§6). No normalization, no autocorrect.
- **Partial save + resume is first-class.** A kid will not finish in one sitting. Status starts
  `InProgress`; every confirmed beat writes through immediately (the roster doc is the running state,
  not a submit-at-end form). `resumeBeat` records where to re-enter. This mirrors the Story Guide's
  intent but *strengthens* it — the Story Guide holds answers in React state and assembles the brief
  only at the end; the Kit Builder persists per-beat so a mid-list defender is never lost.
- **`Complete`** is set when the kid finishes the win-condition beat. A complete roster is what the
  downstream (§5) consumes; an in-progress one is resumable and shown distinctly in the roster list
  (§4).

---

## 3. The question flow (roster questions, NOT story questions)

Each beat reuses the Story Guide capture surface: **TTS-read prompt → voice or type → "I heard… /
yes / try again" confirm** (the reused `StoryGuideQuestion` presentation + voice primitives). Framing
is kid-word, warm, and never corrective.

| Beat | Prompt (kid-word) | Captures | Screens |
|---|---|---|---|
| **The Vault** | "The seeds are treasure. What's the safe place called?" | `vaultName` | 1 |
| **The Hero — name** | "Who guards the vault? What's your hero's name?" | `heroName` | 1 |
| **The Hero — look** | "What does {hero} look like?" | `heroLook` | 1 |
| **The Hero — move** | "What's {hero}'s special move?" | `heroMove` | 1 |
| **The Defenders** | "Name a plant defender and what its power is." → then "Another one? Or are you done?" | `defenders[]` (name + power) | **repeats** until 4–6 |
| **The Invaders** | "Name a bad guy trying to get the seeds — and what makes it scary." → "Another? Or done?" | `invaders[]` (name + menace) | **repeats** until 3–4 |
| **The Win** | "How do you win? How does a defender beat an invader?" | `winCondition` | 1 |

### 3a. The repeating capture — the one genuinely new pattern

This is the key structural difference from the Story Guide. The Story Guide is a **linear fixed list**;
the Defenders and Invaders beats are **repeat-until-done lists** the fixed-index machine cannot express.
Design it explicitly:

- Each defender is captured as **two chained sub-prompts** — *name* → *power* — reusing the same
  confirm loop per sub-prompt (so "I heard 'Sunflower Sam'… yes" then "I heard 'shoots sticky
  sap'… yes"). On the second sub-prompt confirm, the pair is appended to `defenders[]` **and written
  through** (mid-list persistence, §2).
- After each appended defender, a **"Another? / I'm done"** fork. The flow **nudges** toward the target:
  below 4 it gently encourages one more ("You have 2 — let's get a few more defenders!"); within 4–6 it
  offers done as the primary action; at 6 it suggests wrapping up but still allows more.
- The list is **editable mid-flow**: a captured defender can be removed or re-recorded before moving
  on (the confirm loop already supports "try again" per answer; extend it to per-list-item).
- Invaders repeat identically (name → menace → another/done), targeting 3–4.
- **Resume mid-list.** Because each item writes through and `resumeBeat` records the active beat, a kid
  who stops after 2 defenders re-enters *on the Defenders beat with 2 already captured* — the open
  decision on the exact mid-list resume granularity is in §8.

### 3b. What the reused surface gives us for free

- **TTS reads every prompt** (`speakText`, rate 0.85) — no reading required of the kid.
- **Voice or type toggle** — dictation counts (ETHOS-04); a kid who can't/won't type still completes
  a roster entirely by voice.
- **The confirm loop** — "I heard: … / ✓ Yes that's right / 🔄 Try Again" — the kid hears back what was
  captured and re-records if wrong. His spelling and phrasing are preserved on confirm.
- **Progress + Back/Skip nav** — the presentational component already renders progress dots and
  Back/Skip/Next; the Kit Builder feeds it a beat-aware progress model instead of a fixed count.

> **Voice substrate note.** The Story Guide talks to the raw `webkitSpeechRecognition` Web Speech API
> directly. The repo also ships a richer reusable **`VoiceInput/`** module (Whisper via the
> `transcribeAudio` CF, with a `transcriptionEvents` substrate). The Kit Builder should **match the
> Story Guide surface for fidelity in v1** (§8 open decision), but the VoiceInput module is the more
> robust option if transcription quality on kid speech proves a problem — noted, not decided here.

---

## 4. Where it lives + who reaches it

- **In the business area, not My Books.** My Books is for stories; a roster is business data. The Kit
  Builder is a **parent-initiated, kid-driven** session — the parent starts it, the kid answers — the
  same shape as a Dad Lab or Story Guide session.
- **Entry point:** a "Build a Kit" action on the Barnes Bros business tab (`BusinessPage`), alongside
  Operations and Goal. Tapping it opens the Kit Builder flow (§3).
- **A roster list** shows saved and in-progress kits: each row a kit name (the vault name), its status
  (In progress / Ready), and a tap-through to resume or view. In-progress kits are visually distinct
  and resumable.
- **Collection placement (proposed, §8 open decision D1):** a new
  `families/{familyId}/kitRosters/{autoId}` collection, auto-ID (a kid makes *many* kits — so an
  auto-ID collection like `businessLog`, **not** a one-doc-per-child like `businessGoals`), queried and
  filtered by `childId`. It follows the existing `firestore.ts` converter pattern
  (`kitRostersCollection(familyId)` with a `KitRoster` converter, `id` after the spread per the repo
  mapping convention). Additive — no existing collection changes.

---

## 5. What the roster feeds (name, don't build — the downstream)

The roster is the seed; these are later slices or in-chat drafting tasks, **named here, not built**.

- **Sticker prompts.** Each defender / invader / hero → **one `gpt-image-1.5` transparent-background
  prompt** → a cutout sticker. The plumbing already exists: `enhanceSketch` (transparent mode → "clean
  cutout suitable for use as a sticker") and `generateImage` (`book-sticker` style, `background:
  'transparent'`), and there is already a **`book-illustration-garden-warfare`** style — the image layer
  is GDQ-aware. A roster → sticker-sheet generator is a natural production step (a later slice or an
  in-chat drafting task).
- **Booklet / map / clue cards / badge.** The roster + win condition → the printable kit assets. Per the
  Seed Vault runbook, some of these are **parent + Claude-in-chat** rather than in-app (the runbook
  already builds clue cards / map / badge by hand or in chat). The Kit Builder makes the *structured
  input* those steps consume.

### 5a. The learning-loop linkage — honest scope

The prompt's premise was that a Kit Builder session should "log as a portfolio artifact and feed the
learner model **exactly as the Story Guide session does**." **Recon correction:** the Story Guide does
**neither** today. It emits a `Book` document; `Book`s are *not* `artifacts` (the photo/audio/note
portfolio records) and are *not* learner-model inputs. The only existing learning-loop touch is the
**Weekly Review's "books" evidence slice** (created / completed / reading-session minutes). So the
linkage is **genuinely new work**, not a mirror of an existing path — design it deliberately and
minimally:

- **A Kit Builder session IS real school** — Language Arts, oral narrative, Speech (especially for
  Lincoln). It should be **loggable as a portfolio artifact**: a note/audio artifact tagged
  (`subjectBucket: LanguageArts`, engine stage, a Speech/oral-narrative marker), honoring the
  dictation-counts rule (ETHOS-04). This is the same `artifacts` write any capture uses — an additive,
  propose-and-confirm parent action, never an auto-write to a child's record.
- **It should NOT auto-write the learner model.** The learner-model writers are calibrated evidence
  paths (guided eval / quest / workbook position — FEAT-54/63/76). A creative roster session is **not an
  assessment**; auto-moving concept states off a make-believe roster would violate the calibrated,
  source-confidence-gated design. If the loop wants credit here, the correct route is the *artifact* →
  Weekly-Review evidence path (like books), **not** a concept-state write. This keeps the invariant
  discipline intact.
- **Retrofit note:** the same optional artifact-logging could later be added to the Story Guide, closing
  a real gap. Out of scope here — named for the ledger.

---

## 6. What this must NEVER do

- **Never change the Story Guide or My Books.** Lincoln's book flow is untouched. The Kit Builder is a
  *new sibling*; any shared-surface extraction must leave the Story Guide byte-for-byte behaviorally
  identical (its tests still pin it).
- **Never treat the roster as a narrative.** No plot, no arc, no "and then". The output is a *cast +
  rules*, stored structured — a `KitRoster`, never a `Book`.
- **Never correct the kid's names or spelling.** Names/powers/menaces are stored verbatim. Weird is
  canon. No autocorrect, no "did you mean", no normalization.
- **Never require reading or writing.** Voice-first; TTS reads every prompt; dictation counts
  (ETHOS-04). A non-reader completes a whole roster by voice.
- **Never gate on a child's name.** `isLincoln`/`ageGroup` are cosmetic/personality only (accent color,
  font), never access. The Kit Builder opens for any child (Lincoln-first wiring; London's cosmetic
  variant per the London-minimal rule, logged in `LONDON_BACKLOG.md` if tuned separately — not built
  speculatively).
- **Never auto-write a child's record.** Artifact logging and any learner-model touch are
  propose → confirm → write. No silent writes.

---

## 7. Build plan (later, human-assigned runs)

Serialized slices — each a reviewable PR, smallest-testable-thing first:

1. **Roster type + collection + a manual/parent-entry roster form.** ✅ **SHIPPED (FEAT-80, slice 1).**
   Ship the `KitRoster` types, the `kitRostersCollection` helper + converter, and a plain parent-entry
   form (type in a roster and save it). This lands the **data model, testable, before the kid flow** —
   the smallest thing that stores a real roster. First slice. *As built:* `KitRoster` / `KitDefender` /
   `KitInvader` / `KitRosterStatus` in `src/core/types/business.ts` (§2 shape, verbatim); the
   `kitRostersCollection` auto-ID helper + `kitRosterConverter` in `firestore.ts` (mirrors `businessLog`);
   `useKitRosters` (list/create/update/get); `KitBuilderForm` (plain MUI form, add/remove defender +
   invader rows, verbatim words, target-hint not a cap, partial saves valid); `KitBuilderSection` entry
   point on `BusinessPage` (roster list + status chip + "New kit" / empty state). No voice flow (slice 2).
2. **The voice capture flow.** Extract the shared capture primitive from the Story Guide
   (presentational component + voice/TTS/confirm loop), then build the Kit Builder orchestration on top,
   **including the repeating defender/invader pattern** (§3a) with mid-list write-through + resume.
3. **Roster → sticker-prompt generation.** Each roster character → a `gpt-image-1.5`
   transparent-background sticker prompt (§5), in-app or in-chat (§8 D4).
4. **The learning-loop artifact linkage.** Optional portfolio-artifact logging for a Kit Builder session
   (§5a), propose→confirm→write, LA/Speech-tagged.

Slice 1 stands alone and de-risks the data model; slice 2 is the extraction-heavy one; 3 and 4 are
independent downstream.

---

## 8. Open decisions

| # | Decision | Options / lean |
|---|---|---|
| **D1** | **Roster collection location.** | New `families/{familyId}/kitRosters/{autoId}` auto-ID collection (a kid makes many kits), filtered by `childId` — **leaning this** (mirrors `businessLog`, not the one-doc `businessGoals`). Alt: nest under a per-child business doc. |
| **D2** | **Shared extraction vs parallel component.** | (a) Extract `StoryGuideQuestion` + the voice/TTS/confirm primitives into a shared `capture/` module both flows import (DRY, but touches the Story Guide's imports — must not change its behavior); (b) copy a parallel component for the Kit Builder (zero risk to the Story Guide, some duplication). **Lean (a)** with the Story Guide's tests as the safety net; fall back to (b) if the extraction proves invasive. |
| **D3** | **How the repeating capture persists mid-list.** | Write-through per confirmed item (each defender/invader `updateDoc`s the roster's array immediately) vs batch-on-beat-exit. **Lean write-through** (§2/§3a) so a mid-list stop loses nothing; open question is the exact `resumeBeat` granularity (re-enter on the beat vs on the specific sub-prompt). |
| **D4** | **Sticker generation in-app vs in-chat.** | In-app roster→sheet generator (polished, more build) vs a parent + Claude-in-chat drafting task seeded from the roster (faster, matches the Seed Vault runbook's current hand/chat steps). Decide at slice 3. |
| **D5** | **Voice substrate.** | Match the Story Guide's raw Web Speech API (fidelity, simplest reuse) vs adopt the richer `VoiceInput/` Whisper module (better kid-speech transcription, `transcriptionEvents` substrate). **Lean Web Speech for v1**; revisit if transcription quality is poor. |
| **D6** | **Target-range enforcement.** | Soft nudge (encourage 4–6 defenders / 3–4 invaders but never block) vs hard min/max. **Lean soft** (§3a) — weird is canon, a kid's 7th defender stays. |

---

## Appendix — recon citations (2026-07-17)

- **Story Guide surface:** `src/features/books/StoryGuideQuestion.tsx` (presentational: dots, TTS card,
  voice/type toggle, mic→stop→confirm loop, Back/Skip/Next — story-coupling is cosmetic `isLincoln`
  only); `src/features/books/useStoryGuide.ts` (reusable voice/TTS/confirm primitives + `VoiceState`;
  story-specific fixed-5 array, linear `currentIndex`, `assembleBrief`→`StoryBrief`);
  `src/features/books/StoryGuidePage.tsx` (wizard steps → `Book` output).
- **Business feature:** `src/core/types/business.ts` (`BusinessLogEntry` append-only, `BusinessGoal`
  one-per-child, `BusinessItemType` kits-as-line-items); `src/features/business/BusinessPage.tsx`
  (Operations + Goal regions); `useBusinessLog.ts` (auto-ID `addDoc` pattern);
  `firestore.ts` (`businessLogCollection` / `businessGoalsCollection` converters — the placement
  template for `kitRostersCollection`). **No `KitRoster` / `kitBuilder` / roster collection exists.**
- **My Books output:** `booksCollection` emits a `Book` (`source: 'manual' | 'ai-generated'`) — a
  narrative, not an `artifact`, not a learner-model input; only the Weekly-Review "books" evidence slice
  touches it. The `KitRoster` is designed as a **sibling**, not a fork.
- **Image gen (transparent stickers):** `functions/src/ai/imageTasks/enhanceSketch.ts` (transparent
  cutout sticker mode), `generateImage.ts` (`book-sticker` style + `background: 'transparent'`, and an
  existing `book-illustration-garden-warfare` style) — all `gpt-image-1.5`.
</content>
</invoke>
