# The Learner Model — Foundations Synthesis ("the central brain")

> **Status:** AMENDED (design — strategic), v0.2, 2026-07-04. Docs-only. Slice 1 shipped (FEAT-48).
> **Ledger anchor:** `FEAT-46` (DESIGN); amendment `FEAT-49`.
> **Companion drafts (owner curation pending):** [`docs/foundations/READING_GRAPH_V0.md`](./foundations/READING_GRAPH_V0.md), [`docs/foundations/MATH_GRAPH_V0.md`](./foundations/MATH_GRAPH_V0.md), [`docs/foundations/FAST_PHONICS_BRIDGE_V0.md`](./foundations/FAST_PHONICS_BRIDGE_V0.md).
>
> **Amendment 2026-07-04 (FEAT-49) — driven by the owner's review of the FEAT-48 diag preview against reality.** The seeded model showed 3/350 sight words for a child whose Fast Phonics account shows 548 words known and Peak 13 complete; a 43-row `not-yet` list with "—" evidence proved unreviewable. Six changes, all docs-only: **(§11)** the Foundations *Review Chat* becomes the slice-2 primary interface — a subject-scoped AI conversation that establishes states by evidence or by testing, replacing the browsable list; **(§12)** a new `curriculumPosition` evidence type + an external-curriculum *bridge* (draft: `FAST_PHONICS_BRIDGE_V0.md`) so external programs feed the model; **(§13)** a *covered ≠ mastered* cap (`curriculumPosition` alone maxes at `forming`); **(§14)** parent-surface *display rules* (no band numbers, no percentages, always name the source); **(§15)** slice reorder — the tab is demoted to slice 3 behind the Review Chat, and the weekly-review-adoption finding is logged as a named backlog item. The core model (§§1–8) is unchanged.
> **Cross-references:** FEAT-35 / FEAT-36 (re-derivation engine — semantics reused), FEAT-40 / FEAT-43 (Help Card — first downstream consumer), FEAT-41 / FEAT-44 (Dad Lab arcs — kept firewalled per D1), ETHOS-03 (concrete-first / modality calibration — the deferred per-child enrichment this fills), ETHOS-01 (charter injection), ETHOS-02 (measurement-sensitivity — the no-scores rail this obeys).

**A note on two run-prompt references, corrected against the code (Step 0 recon):** the brief named "ETHOS-02" and a function `buildCalibrationParagraph` as the modality-calibration seam. Neither is accurate. **ETHOS-02** is the *measurement-sensitivity (mechanics) guardrail*; the modality/calibration ethos is **ETHOS-03** (`CONCRETE_FIRST_ORAL_SCIENCE`). There is **no `buildCalibrationParagraph`** in the repo — per-child calibration today is *hardcoded literal strings* inside `src/features/dad-lab/dadLabPrompts.ts`, and ETHOS-03 explicitly **defers per-child supports to "FEAT-41 slice 2 context enrichment."** That deferred hole is exactly what this model fills; §5 and §7 are written against ETHOS-03, not ETHOS-02.

> **Correction 2026-07-04 (FEAT-51 Step 0.5 — doc drift, amendment convention: the note above is preserved as historical, this appends the current truth).** The paragraph above was accurate when written (FEAT-46/FEAT-49, before PR #1491). It is now **stale**: **ETHOS-04 (PR #1487) shipped a real `buildCalibrationParagraph`** — a pure fn `buildCalibrationParagraph(child, snapshot, skillMap)` in `src/features/dad-lab/dadLabPrompts.ts` (~line 90) plus a `useCalibrationSources.ts` hook — and it **merged before FEAT-49's PR #1491.** The function carries the re-point doc comment (`"Interim source — re-point to LearnerModel.modalityCalibration when FEAT-46 ships"`). **Consequence for §5:** the Dad Lab calibration re-point (Slice 6, §9 / §5.2) is a **function-source swap** — repointing `buildCalibrationParagraph`'s inputs to `LearnerModel.modalityCalibration` — **not** a hardcoded-string deletion. The remaining hardcoded literals in `dadLabPrompts.ts` are the static Context descriptors (age/interest), a different axis than the calibration output (working levels / supports / modality); ETHOS-04's ledger row records that these do not overlap. §5's intent (one synthesized per-child calibration source, not brittle literals) is unchanged; only the mechanism is now "swap the fn's source," already half-built by ETHOS-04.

---

## 1. The problem — "one child is at a lot of locations in development"

The app already captures a great deal about where each child is. It just never **synthesizes** it. Nine independent evidence streams each hold a slice of the truth, each writes on its own cadence, and every AI consumer assembles a different partial view. Nothing in the system answers the canonical question a parent actually asks:

> **Where is this child? Which foundations are solid, what's forming, and what's the next foundational move?**

One child (Lincoln) has a **spiky profile** — strong here, emerging there, a frontier somewhere else — that a single "level per domain" cannot represent. He is, in the owner's words, "at a lot of locations in development" at once. The current data model can say "phonics working level 4"; it cannot say *"blends are solid, digraphs are forming, and the next real move is long vowels — and by the way he reads at level, so keep reading inside the activity, but scribe the writing."* That synthesis lives only in the parent's head today.

### 1.1 The fragmented-consumer table (Step 0.2)

`functions/src/ai/contextSlices.ts` composes per-task context by union-ing slice loaders. Every task gets a **different** partial picture of the same child, and two slices (`childProfile` and `skillSnapshot`) provably **double-print** priority skills / supports / stop rules because both read `skillSnapshots/{childId}`:

| Consumer (task) | What it loads about "where the child is" today | Gap vs. the canonical question |
|---|---|---|
| `plan` (18 slices) | `childProfile` + `skillSnapshot` + `mastery` + `recentHistoryByDomain` + `recentScans` + `wordMastery` + `sightWords` + `activityConfigs` | The frontier is smeared across 8 slices; no single "next foundational move"; duplicate priority-skill/support printing |
| `helpCard` (FEAT-40/43) | `charter` + `childProfile` + `skillSnapshot` + `wordMastery` + `recentScans` + `recentHistoryByDomain` + `weekFocus` | Its own prompt already treats these as one "passive-signals base" — it *wants* a learner model but has to reconstruct it |
| `shellyChat` (16 slices) | adds `childSkillMap` on top of the above | Coverage counts, not a synthesized state-per-concept |
| `disposition` | `engagement` + `gradeResults` + `recentHistoryByDomain` + `skillSnapshot` + `wordMastery` | Non-academic; complementary, not the academic frontier |
| `weeklyReview` | `skillSnapshot` + `activityConfigs` + `recentHistoryByDomain` + `recentScans` + `wordMastery` + `dadLabReports` | Week-scoped, not a durable per-child model |
| Dad Lab (rides `chat`) | `charter` + `childProfile` only — **all per-child calibration is a hardcoded string** in `dadLabPrompts.ts` | Brittle, un-synced, name-coupled-by-literal; ETHOS-03 deferred the real per-child slice to "later" |

Every one of these is reconstructing, badly and differently, the same underlying object. **The Learner Model is that object, computed once, that they all read.**

### 1.2 What this is (and is not)

- **V1 is a synthesis layer, strictly additive.** The snapshot, the Learning Map, dispositions, and pattern detection remain the writers they are today. The Learner Model **reads them all** and becomes the single thing generators read. Nothing is replaced or migrated in v1.
- **It writes no plans, no hours, no compliance data, ever.** The model *recommends*; the parent and the planner *decide*. The single-writer lane is unchanged.
- **It honors the FEAT-35/36 invariants** (upgrade-only, manual-freeze, persist-delta) so it never fights the re-derivation engine that already exists.

---

## 2. The concept graph — the shared foundations spine

The spine is a **curated concept graph**: reading + math first, spanning **K→5**, so both children map onto the *same* graph at different frontiers. It is the coordinate system; per-child state (§3) is the position on it.

### 2.1 Node shape

```ts
// src/core/foundations/foundationsGraph.ts  (proposed — ships as versioned data, see §2.3)
export interface ConceptNode {
  id: string            // stable id; REUSE curriculumMap ids where one exists (e.g. 'reading.phonics.cvc')
  name: string          // kid-word name — "Sound out short words" (never "CVC decoding")
  description: string   // one-line parent-facing — "Reads simple 3-letter words like cat, run, sit"
  domain: 'reading' | 'math'         // v1 scope; science/engineering out of scope (see §15)
  band: 'K' | '1' | '2' | '3' | '4' | '5'  // grade band, mapped from the repo's level ladders
  underlies: string[]   // edges: concept ids this concept is a prerequisite FOR (a DAG)
  tags?: string[]        // free-text skill-tag substrings the re-derivation engine keys on (§4.3)
}
```

- **`underlies` is the load-bearing edge.** It is the *inverse* of `curriculumMap`'s `dependencies[]`, chosen deliberately: the brain reasons forward ("solid here **unlocks** what?") far more than backward. The two are mechanically interconvertible; the graph module derives `dependencies` from `underlies` for compatibility with existing helpers (`getDependents`).
- **`tags`** are the bridge to the existing machinery. The re-derivation engine (`deriveWorkingLevelMastery.ts`) matches free-text skill-tag substrings; a node that wants to be seedable from working levels lists the tag substrings that resolve to it (§4.3). Nodes with no tag start `not-yet` until an evaluation or attestation touches them.
- **Kid-word `name` obeys the ETHOS-02 no-judge / no-score rail:** names describe a capability positively ("Sound out short words"), never a deficit or a grade level.

### 2.2 Shared spine, two frontiers

The graph is **one object for the whole family**, versioned as data. London sits near the K/1 band frontier; Lincoln sits at a spiky mix of 1–3 in reading and ~3 in math. Same nodes, same edges — the *per-child state* (§3) is what differs. This is the structural answer to "spiky profile": a child is not a level, they are a **set of positions on a shared graph**, and the spiky child simply has states that don't line up in a neat front.

### 2.3 Versioning & storage (proposed — see Open Decisions D2)

The graph is **curated content the owner edits and reviews in PRs**, exactly like `curriculumMap.ts` and `skillLevelMaps.ts` today. Recommendation: ship it as a **versioned TypeScript module** in `src/core/foundations/` with an exported `FOUNDATIONS_GRAPH_VERSION` string (e.g. `'reading-math-v1'`). Per-child models stamp the `graphVersion` they were synthesized against, so a graph revision is detectable and triggers a re-synthesis rather than a silent drift. The alternative (a Firestore config doc editable without a deploy) is recorded as an Open Decision — the TS-module path is preferred for v1 because it keeps the spine reviewable and diff-able and needs no new write path.

---

## 3. The per-child LearnerModel

One stored object per child, synthesized (§4) and read by every surface. It never regenerates on page load — surfaces read storage.

```ts
// families/{familyId}/learnerModels/{childId}   (doc id = childId — proposed; see D1)
export interface LearnerModel {
  childId: string
  graphVersion: string                 // which spine this was synthesized against
  status: 'seeded' | 'synthesized' | 'no-data'
  conceptStates: Record<string, ConceptState>  // keyed by ConceptNode.id
  modalityCalibration: ModalityCalibration      // §3.3 — first-class
  whatMattersNext: NextMove[]           // 1–3 moves, with reasoning
  changeFeed: ChangeEntry[]             // recent state deltas (the "what moved" story)
  openQuestions: OpenQuestion[]         // asks routed to kid-facing checks (§3.5)
  teachBacks: TeachBackSuggestion[]     // computed cross-child (§8)
  synthesizedAt: string
  model?: string
  usage?: { inputTokens: number; outputTokens: number }
}
```

### 3.1 Concept state + confidence

```ts
export interface ConceptState {
  nodeId: string
  state: 'solid' | 'forming' | 'frontier' | 'not-yet'
  confidence: 'attested' | 'derived' | 'inferred' | 'unknown'
  source: 'attestation' | 'evaluation' | 'quest' | 'scan' | 'program' | 'derived'
  evidence: EvidenceRef[]               // the trail — §3.2
  lastMovedAt: string
}
```

- **Vocabulary is fixed:** `solid / forming / frontier / not-yet`. The words *behind / critical / gap / failing* appear **nowhere**. `frontier` is the positive framing of "the edge we're working at" — it is the good place to be, not a deficit. `not-yet` means "we haven't seen it," not "can't."
- **`state` vs `confidence` are orthogonal.** A concept can be `solid` with `attested` confidence (a parent said so) or `solid` with `derived` confidence (implied by a working level). Thin/conflicting evidence lowers *confidence*, which is what routes an **ask** (§3.5) rather than a false claim. **A brain that can't show its work is an opinion** — confidence is how it admits doubt instead of bluffing.
- **The spiky profile renders as terrain**, not inconsistency: `solid` blends next to `forming` digraphs next to `frontier` long-vowels is a *normal, legible landscape*, not a contradiction to reconcile.

### 3.2 Evidence trail — the trust mechanism

Every concept state carries typed evidence refs. **Tapping a concept shows exactly why it's in that state.**

```ts
export interface EvidenceRef {
  kind: 'eval' | 'quest' | 'scan' | 'sightword' | 'workingLevel'
      | 'teachback' | 'attestation' | 'program' | 'block'
      | 'curriculumPosition'   // ADDED (FEAT-49) — external-curriculum unit, §12
  sourceId: string       // sessionId / scanId / snapshot ref / word / etc.
  note: string           // human one-liner: "Read cat/run/sit unaided in the Mine, Jun 28"
  observedAt: string
}
```

The nine `kind`s map 1:1 to the Step 0.1 streams; the tenth, `curriculumPosition` (FEAT-49, §12), is the evidence path for external programs the app never sees directly. `attestation` (a parent override, §6) is the **highest-quality** kind and is stamped like FEAT-36's manual-freeze. This is the single most important trust feature: the Foundations tab is only believable because every square of terrain is tappable back to the eval / quest session / scan / parent statement behind it.

### 3.3 Modality calibration — first-class, per child, per modality

This is the owner's correction made structural: **calibration, never avoidance.** A separate block, not buried in prose:

```ts
export interface ModalityCalibration {
  reading:  { level?: number; note: string }   // "reads at level 3 — reading belongs IN activities, at level"
  writing:  { mode: 'adult-scribe' | 'emerging-independent' | 'independent'; note: string } // "scribe by default"
  speaking: { note: string }                    // "explains aloud well — lean on teach-back"
  listening?: { note: string }
}
```

The rule it encodes: a concept the child *has* but can't yet **write** is still `solid` — you calibrate the modality of the activity (adult scribes; child reads it aloud), you do not mark the concept down or route around it. This block is exactly the per-child enrichment **ETHOS-03 deferred** ("per-child supports are DEFERRED to FEAT-41 slice 2 context enrichment"). §5 wires it into the Dad Lab path, replacing the hardcoded strings.

### 3.4 What-matters-next

1–3 concrete moves, each with reasoning the parent can read and overrule:

```ts
export interface NextMove {
  conceptId: string
  title: string          // "Introduce long vowels (silent-e)"
  why: string            // "Blends and digraphs are solid; long vowels are the next unlock in reading"
  kind: 'introduce' | 'practice' | 'consolidate' | 'calibrate'
  suggestedSurface?: 'plan' | 'quest' | 'dadLab' | 'reading' | 'teachback'
}
```

Grounded in the graph's `underlies` edges: the next move is a `not-yet`/`forming` concept whose prerequisites are `solid`. The planner and parent decide whether to act — the model only proposes.

### 3.5 Open questions — asks, not assumes

When evidence is thin or conflicting, the model does **not** say "the parent should log more." Sparse logging is the household's normal (owner-confirmed) and the model is **sparse-native**. Instead it emits a gentle question routed to a **kid-facing** check:

```ts
export interface OpenQuestion {
  conceptId: string
  question: string       // "Is he ready for long vowels, or still cementing digraphs?"
  routedTo: 'quest' | 'eval' | 'scan'
  reason: string         // "Two quest sessions disagree; one targeted Mine run would settle it"
}
```

A routed ask becomes, e.g., a targeted Knowledge Mine quest — the child plays, the model learns. Never a chore for the parent.

### 3.6 Change feed

```ts
export interface ChangeEntry { conceptId: string; from: ConceptState['state']; to: ConceptState['state']; cause: string; at: string }
```

The "what moved and why" story since last synthesis — the accumulating, one-direction framing ETHOS-02 asks for (things *become solid*; nothing is shown regressing as a scored loss).

---

## 4. Synthesis mechanics

### 4.1 Two layers: deterministic derivation + LLM judgment

The single most important mechanical decision: **most of the model is derived deterministically; only the judgment layer needs an LLM.**

- **Deterministic layer (no LLM, cheap, runnable on read):** concept `state`s and their evidence trails, computed by *reusing the existing inversion engine*. `deriveWorkingLevelMastery.ts` already turns working levels + sight-word share + gate-3 priority skills + completed programs into per-node mastery, upgrade-only and manual-frozen. The Learner Model's deterministic pass is the same function, projecting onto the foundations graph and translating `mastered → solid`, `in-progress → forming/frontier`, absent → `not-yet`. This is what makes the model **useful on day one, before any LLM call** (see build slice 1, §9).
- **LLM layer (Sonnet, on the beat / on demand):** the parts that need judgment — `whatMattersNext` reasoning, `modalityCalibration` prose, `openQuestions` phrasing, resolving *conflicting* evidence into a `confidence`, and the `changeFeed` narrative. This mirrors the disposition CF: aggregate structured inputs, return synthesized narrative, **the CF does not itself write Firestore** — a thin client/callable persists the result.

### 4.2 Inputs (Step 0.1, all read-only)

`skillSnapshots` (priority skills + gates, supports, stop rules, working levels, completed programs, conceptual blocks), `childSkillMaps` (node states), recent `evaluationSessions` findings, `scans`, `sightWordProgress`, `dadLabReports` *(for calibration signal only — not academic concept states; §15 firewall)*, disposition profile, day-log teach-backs. The model is a **reader** of every one; it is a writer of none of them.

### 4.3 The tag bridge (reuse, don't reinvent)

Concept nodes carry the same free-text `tags` substrings the re-derivation engine matches (`PHONICS`/`COMPREHENSION`/`MATH`/`WRITING`/`SENTENCE` maps in `skillLevelMaps.ts`). This means the deterministic pass is a thin projection of an engine that already exists and is already tested — not a parallel derivation that could disagree with the Learning Map. **The two must never silently disagree** (the FUNC-02 principle), so they share the derivation.

### 4.4 Cadence — weekly beat + event marks (no new stale flag needed)

- **Weekly beat:** an `onSchedule` CF following the `weeklyReview` precedent exactly (`"every sunday 19:00"`, `America/Chicago`, families→children loop, empty-child guard writing a `status: 'no-data'` stub). Open Decision D4: run it as its **own** beat vs. piggy-back inside the existing `weeklyReview` loop (it already loads most of the same slices).
- **Event marks:** there is **no `stale`/`dirty` flag in the codebase today** — the established pattern is *event-driven write-through + lazy recompute-and-diff on read*. We follow it: the deterministic layer recomputes cheaply whenever the Foundations tab or a consumer reads, and staleness of the **LLM layer** is detected by diffing `synthesizedAt` against the max of existing per-slot timestamps (`skillSnapshot.updatedAt`, `childSkillMap.updatedAt`, `questActivity.lastQuestAt`, `blocksUpdatedAt`). If the LLM layer is stale on read, regenerate lazily (debounced) or wait for the beat. The client's existing event points — eval-apply (`useUnifiedCapture`), quest-close (`useQuestSession`), scan-ingest (`useScanToActivityConfig`) — are where a lightweight `learnerModelDirty` touch could be written if D4 favors an explicit flag over timestamp-diffing.

### 4.5 Cost estimate

Sonnet, per child, weekly. Inputs ≈ snapshot + skill map + recent findings + dispositions + scans ≈ **4–8k input tokens**; output (states are deterministic, so the LLM emits only the judgment layer) ≈ **1.5–3k tokens**. Two children weekly ≈ the same order as `weeklyReview` today — negligible. On-demand regenerations are rate-limited by the debounce. Cost ceiling is Open Decision D6.

---

## 5. The `learnerModel` context slice + per-task adoption

### 5.1 The slice

Add `learnerModel` to `ContextSlice` in `contextSlices.ts` and a `formatLearnerModel` formatter that reads the **stored** `learnerModels/{childId}` doc (never regenerates). It renders: the frontier concepts by domain, `whatMattersNext`, the `modalityCalibration` block, active conceptual blocks, and supports — i.e. the union that `childProfile` + `skillSnapshot` today print (with the documented duplication removed).

### 5.2 Adoption plan (three consumers, v1)

| Task | Replaces | Keeps alongside | Expected token delta |
|---|---|---|---|
| **`plan`** | `childProfile` + `skillSnapshot` merged & de-duped; folds in `mastery` + `wordMastery` rollups | `workbookPaces`, `weekFocus`, `activityConfigs`, `recentHistoryByDomain`, `sightWords`, logistics slices | **−200 to −400** on an 18-slice / 16k-token budget |
| **`helpCard`** (FEAT-40/43) | `childProfile` + `skillSnapshot` (its prompt already assumes one "passive-signals base") | `wordMastery`, `recentScans`, `recentHistoryByDomain`, `weekFocus` | **−100 to −200**, plus a clarity win — "Say this / Skip signal" reads one named section |
| **Dad Lab** (rides `chat`) | the **hardcoded per-child paragraphs** in `dadLabPrompts.ts` (`"Lincoln (10, neurodivergent…)"`) | `charter`, `CONCRETE_FIRST_ORAL_SCIENCE`, `buildRoleRequestLines` | **≈ token-neutral**, but converts brittle literals → data; this is the ETHOS-03 deferred enrichment, now delivered |

The Dad Lab re-point is the highest-*correctness* win: ETHOS-03 shipped the child-agnostic ethos block and explicitly parked per-child supports for "FEAT-41 slice 2." The `modalityCalibration` block is that slice-2 payload. Cleanest wiring (Open Decision D5 in the ETHOS-03 doc's terms): give Dad Lab its own `dadLab` task in `TASK_CONTEXT` mapping to `['charter', 'learnerModel']` and delete the hardcoded strings — the prompt builders are already isolated and unit-tested.

**No consumer's call site changes** beyond its `TASK_CONTEXT` slice list — every one already routes through `buildContextForTask`.

---

## 6. The Foundations tab

**Locked:** the Progress "Learning Profile" tab is **absorbed**; **"Foundations" becomes the first tab**; the disposition narrative becomes a **section within it**.

### 6.1 Layout narrative (top to bottom)

1. **The terrain map** — the foundations graph rendered as legible landscape, concepts colored by `solid / forming / frontier / not-yet`. Reuses the existing `learning-map/` components (`DomainSection`, `SkillNodeCard`, `SkillDetailDrawer`) recolored to the four-state vocabulary. The spiky profile *is* the visual — no attempt to flatten it to one number.
2. **What matters next** — the 1–3 `NextMove`s with their `why`.
3. **How {child} learns best** — the `modalityCalibration` block, plain language.
4. **What moved** — the `changeFeed`, accumulating framing.
5. **Questions we're exploring** — the `openQuestions`, each with its routed kid-facing check as a tap-to-start.
6. **Dispositions** — `DispositionProfile` embedded as a section (curiosity / persistence / articulation / self-awareness / ownership), unchanged.

### 6.2 Tap-a-concept → evidence + override

Tapping a concept opens a drawer (the existing `SkillDetailDrawer` pattern) showing:
- **The evidence trail** — the `EvidenceRef[]` for that concept, each a human line with its source and date.
- **Override controls** — set the state (`solid / forming / frontier / not-yet`) directly.

### 6.3 Override = attestation (persist semantics reuse FEAT-36 + the disposition precedent)

An override is recorded as **high-quality evidence (an attestation)**, not a scribble:
- It writes a `ConceptState` with `source: 'attestation'`, `confidence: 'attested'`, and an `EvidenceRef { kind: 'attestation', note, observedAt, overriddenBy: 'parent' }`.
- **It persists and the model never silently fights it** — same precedent as FEAT-36's manual-freeze (`source === 'manual'` nodes are skipped by re-derivation) and the `DispositionProfile` override contract (separate override store + `effective…()` resolver + explicit "revert to AI" + a stale-AI notice when synthesis later disagrees).
- Concretely, mirror `DispositionProfile.tsx`: keep attestations in their own map so synthesis writes never clobber them; resolve display via an `effectiveConceptState()` helper (attestation wins, else synthesized); surface a **"revert to synthesized"** action and, when a later synthesis reaches a *different* read, a non-destructive **"the model has a new take — view & reconcile"** notice. The parent's word is durable; the brain adapts around it.

### 6.4 Absorbing the tab (mechanics)

`ProgressPage.tsx` uses **index-based** tabs (literal `<Tab>` order + `{tab === N && …}` guards, no config array). Absorbing entails: insert `<Tab label="Foundations" />` at index 0, renumber every downstream guard by +1, remove the standalone `Learning Profile` tab, and render `<DispositionProfile />` as a section inside the Foundations body. Recommendation (optional): introduce a `{ label, render }[]` descriptor array so future inserts don't require hand-renumbering — but the minimal change is those four edits.

---

## 7. Shelly's ambient layer (all three, v1 — exactly as locked)

Nothing that requires the parent to seek out a page. All three:

1. **Plan generation reads the model.** `plan` adopts the `learnerModel` slice (§5.2) — the week is planned against the synthesized frontier and modality calibration, not eight smeared slices.
2. **Help Card generation context switches to the model's slice.** `helpCard` adopts the slice (§5.2) — "Play it / Say this / Skip signal" is grounded in one coherent learner state.
3. **One line on Plan My Week:** *"This week's foundation focus: {X}, because {Y}"* — sourced from `whatMattersNext[0]`, with **tap-through to Foundations**. One sentence, ambient, on a surface the parent already opens.

---

## 8. Teach-back computation

The charter's richest evidence is Lincoln teaching London (the Feynman mechanic). The model **computes** it: wherever child A is `solid` on a concept where child B is `forming`/`frontier`, it surfaces a teach-back suggestion — the concept exists on the *shared spine*, so this is a direct cross-model comparison, not a heuristic.

```ts
export interface TeachBackSuggestion { conceptId: string; teacherChildId: string; learnerChildId: string; why: string }
```

Timely and specific ("Lincoln's solid on short-vowel words; London's working on them — have Lincoln run the Mine round with him"). Surfaced in the Foundations tab and available to `plan`. It writes nothing; it proposes.

---

## 9. Build plan — serialized, each slice revertable

Ordered so the **first slice produces a real stored model** with zero LLM dependency, and value lands before complexity.

> **Reordered 2026-07-04 (FEAT-49).** The owner's review of the slice-1 diag preview showed that a browsable tab over a *starved* model is 43 rows of "—" — unreviewable. **Reading the model beats browsing it, but only AFTER the model is fed.** So the **Review Chat** (which feeds the model by conversation + upload) is promoted to slice 2, and the **Foundations tab** is demoted to slice 3, where its override interaction becomes a thin shortcut to the same attestation write the chat already performs. The LLM synthesis beat and downstream slices renumber accordingly.

- **Slice 1 — Graph as data + deterministic bootstrap + read-only diag preview. ✅ SHIPPED (FEAT-48).** Shipped: the OWNER-CURATED graphs transcribed to a versioned TS module (`src/core/foundations/` — `types.ts`, `readingGraph.ts` [31 nodes], `mathGraph.ts` [29 nodes], `index.ts`, validation tests); `LearnerModel` types + the `learnerModels/{childId}` collection helper/converter; a pure `seedLearnerModel(graphs, childId, snapshot, skillMap, sightWordData)` that implements the graphs' own seeding sections (band-below-working-level → `solid`, at-level → `frontier`, above → `not-yet`; L7/L8 by node id; sight-word share vs the imported `SIGHT_WORD_MASTERED_THRESHOLD`; gate-3 priority skills + completed programs → `solid`; evidence-only strands → `not-yet`; invariant: every non-`not-yet` state carries ≥1 EvidenceRef; degrades on sparse data), plus `mergeSeededModel` preserving attestation entries on re-seed; and a **parent-only `?diag=1` seed/preview panel** on the Progress page (writes ONLY `learnerModels`, merge). **This is the smallest thing that produces a real stored model** — useful day one, no AI. *Revert: delete `src/core/foundations/` + the collection writer + the diag panel; nothing else depends on it.*
- **Slice 2 — The Foundations Review Chat (§11) — the primary interface. `NEW PRIMARY`.** Subject-scoped review sessions with propose→confirm→write staging; the four response paths (attest / covered-in-curriculum / test-it / not-yet); mid-chat image upload with human context → multi-position extraction; the `attestation` + `curriculumPosition` write path; the external-curriculum bridge data v1 (§12, Fast Phonics from `FAST_PHONICS_BRIDGE_V0.md`); the quest-queue handoff into the existing Knowledge Mine pipeline. Requires the deterministic model (slice 1) to walk; does **not** require the LLM synthesis beat. Split into sub-slices during the build:
  - **Slice 2a — conversation core. ✅ SHIPPED (FEAT-51).** The `foundationsReview` Sonnet CF task (mirrors `shellyChat`, leaves it untouched — **D9 ADOPTED**); a deterministic client-side priority-order walk (`computeReviewPriority`: frontier → forming → not-yet by `underlies` fan-out; solid skipped) handed to the LLM in the request; the three write paths as a **parallel** `FoundationsReviewAction` staging layer (`attest` → `attestation` EvidenceRef, may reach `solid`; `covered` → `curriculumPosition` EvidenceRef **clamped in code** to at most `forming` per §13; `queueTest` → `openQuestion { routedTo: 'quest', conceptId }` deduped); propose→confirm→write confirm cards; merge-only `learnerModels` writes with a minimal `changeFeed` one-liner; session persistence + recap; §14 locked display rules (no band numbers, no percentages) asserted in a render test. The `curriculumPosition` EvidenceRef (§12.1) is added to the model; the re-seed guard now protects `attestation` **and** `curriculumPosition` entries.
  - **Slice 2b — mid-chat uploads + the Fast Phonics bridge as a TS data module (§11.3, §12.2). ✅ SHIPPED (FEAT-53).** `FAST_PHONICS_BRIDGE_V0.md` (v1 CURATED, FEAT-50) transcribed to versioned `src/core/foundations/fastPhonicsBridge.ts` (20 peaks; `bridgeEvidenceForPosition` = the deterministic mapping authority). Mid-chat photo upload (attach image(s) + a required one-line context) mirrors the `shellyChat` transport (compress → Storage → `[IMAGE_URL:…]` markers); the `foundationsReview` CF gains a URL-vision path and an extraction prompt handling **two** source classes — (A) curriculum screenshots → position extraction → bridge-mapped `covered` batch (words-known as evidence *detail*, never mastery; no-bridge source → at most one generic `covered`); (B) **work samples** → `attest` (attestation evidence, may reach `solid`). The client re-grounds every batch through the bridge (`groundCoveredProposals`): the **LLM proposes the position, the bridge decides the mapping** — any `covered` proposal whose conceptId the extracted peak doesn't cover is dropped before staging. The §13 clamp bites exactly one evidence kind (`curriculumPosition`), not the other (`attestation`). All proposals flow through slice 2a's existing staging + `applyReviewActionToModel` — **no new write paths.** Also folds in three owner-tablet amendments: **(A)** the assistant persona is the **Learning Engine**, never a person (the 2a placeholder had copied `Reply to Shelly…` from `shellyChat`, a mirroring bug); **(B)** the **"not sure" outs** — when asking for detail, offer photo / test / skip in the same breath, and never press a second recall follow-up once uncertainty is signalled; **(C)** work-sample uploads are first-class attestation evidence.
  - **Slice 2c — quest-side intake of the queued checks (§11.5). ✅ SHIPPED (FEAT-54).** The consuming side of the §11.5 hand-off: queued `openQuestion { routedTo: 'quest' }` entries become targeted content in the child's next Knowledge Mine session, and session results write `quest`-kind evidence back to the model — **invisible to the child** (the quest just gets smarter about what it asks; no new kid UI, diamonds-not-scores untouched). Built **without** the `conceptualBlocks[]` route the earlier sketch guessed at: that path lives on the invariant-protected `skillSnapshots` and the run forbade touching it, so 2c is a **parallel, learner-model-only** mechanism (the two targeting systems coexist; unification is explicitly deferred). Pure layer (`src/core/foundations/questTargeting.ts`): `selectQuestTargets(model, {domain, max=3})` pulls unresolved, domain-scoped asks oldest-first, capped (a *seasoning*, not the meal); `computeQuestConceptResults` groups a session's answered questions by concept; `applyQuestResultsToModel` folds results back. **Attribution rides the `targetedBlockerId` precedent** — no new mapping layer: quest `skill` tags are free-form and graph ids are canonical (and `ConceptNode` carries no `tags`), so instead of mapping, targets enter the quest prompt as PREFERRED concepts (kid-word name + description) at the child's current level and the AI **echoes `targetConceptId`** on any question it weaves in, which the client threads onto `SessionQuestion`. Targets never override adaptive safety (level-down / frustration / end-on-a-win skip them). **Upgrade rule (conservative, upgrade-only, no-shame):** `forming`/`frontier` with **all** targeted questions correct (min 2) → `solid`; `not-yet` with all-correct (min 2) → at most `forming`; anything less (a wrong answer, or <2 questions) → **state unchanged, `quest` evidence still appended** (a struggle is evidence slice 3 narrates, never a downgrade). Consumed `openQuestions` are **resolved** (`resolvedAt`/`resolvedBySessionId` — kept as additive history; the 2a `withOpenQuestion` dedup now treats resolved entries as non-blocking so a concept can be re-queued after it was tested). A deterministic `changeFeed` line (`source: quest`) is appended on any state change. Minimal ARCH-04 touch on `useQuestSession` (one target-load in `startQuest`, one fire-and-forget write-back after session save, field copies through parse/`SessionQuestion` — no restructuring); the existing quest→snapshot/findings pipeline is untouched and runs in parallel. Parent visibility: the diag preview's queue now shows each item **waiting / tested ✓ {date}**. `quest` EvidenceRef removed from the DOC-08 declared-but-unwritten allowlist (its writer now exists); `eval`/`scan` remain forward-declared.

  *Revert (all of slice 2): disable the review-chat launch; the seeded model + diag preview stand.*
- **Slice 3 — Foundations tab proper.** The tab absorbs Learning Profile, renders the richer (chat-fed) model as terrain, dispositions become a section (§6). Tap-a-concept → evidence drawer; **override becomes a thin shortcut to the same `attestation` write the Review Chat already performs** — not a second write path. Demoted from slice 2 because it only reads well once slice 2 has fed the model. *Revert: `/progress` keeps the current Learning Profile tab.*
- **Slice 4 — LLM synthesis beat.** The Sonnet judgment layer (`whatMattersNext`, `modalityCalibration`, `openQuestions`, `changeFeed`, confidence resolution) + the weekly `onSchedule` + on-demand regenerate. *Revert: fall back to deterministic-only model.*
- **Slice 5 — `learnerModel` context slice + `plan`/`helpCard` adoption.** Add the slice + formatter; switch the two tasks' `TASK_CONTEXT` lists. *Revert: restore prior slice lists.*
- **Slice 6 — Dad Lab calibration re-point (ETHOS-03 slice-2 payload).** New `dadLab` task carrying `learnerModel`; delete the hardcoded child strings. *Revert: restore literals.*
- **Slice 7 — Ambient line + teach-back suggestions.** The Plan My Week one-liner + cross-child teach-back computation. *Revert: remove the line.*

Each slice is a branch + PR; none merged without human review.

---

## 10. Open Decisions

| # | Decision | Options | Lean |
|---|---|---|---|
| **D1** ✅ RESOLVED (FEAT-48) | Where the per-child model is stored | (a) new `learnerModels/{childId}` collection; (b) a field on the child doc (like `dispositionCache`) | **ADOPTED (a)** — new `learnerModels/{childId}` collection; helper/converter shipped in `firestore.ts` |
| **D2** ✅ RESOLVED (FEAT-48) | Graph versioning/storage | (a) versioned TS module in `src/core/foundations/`, PR-reviewed; (b) Firestore config doc editable without deploy | **ADOPTED (a)** — graphs ship as a versioned TS module (`version: 1`), transcribed from the two OWNER-CURATED v1 files |
| **D3** ✅ APPLIED (FEAT-48) | Bootstrap band boundaries | Reuse phonics L1–8 / math L1–8 → K–5 mapping in the graph appendices as-is, or re-tune | Owner curated during FEAT-47; slice 1 transcribes the curated bands verbatim (no reinterpretation) |
| **D4** | Synthesis cadence & stale detection | (a) own weekly beat + timestamp-diff staleness; (b) piggyback `weeklyReview`; (c) explicit `learnerModelDirty` flag written at event points | **OPEN** — slice-3 concern; untouched by slice 1 |
| **D5** ◐ PARTIAL-RESOLVED (FEAT-48) | Deterministic/LLM split boundary | Exactly where judgment starts — e.g. does `confidence` derive mechanically from evidence count, or is it LLM-judged? | **Deterministic layer shipped** (states + evidence trails + modality calibration). `whatMattersNext` / `changeFeed` / `openQuestions` / narrative confidence remain LLM (slice 3) |
| **D6** | Cost ceiling | Per-child weekly + on-demand debounce window (e.g. ≥6h between on-demand regens) | **OPEN** — slice-3 concern; untouched by slice 1 |
| **D7** ✅ RESOLVED (FEAT-48) | Sight-word / mastery thresholds | Reuse FEAT-36's `SIGHT_WORD_MASTERED_THRESHOLD = 0.8` and gate-3 rule verbatim, or set model-specific ones | **ADOPTED: reuse verbatim** — the seeder imports `SIGHT_WORD_MASTERED_THRESHOLD` and reuses the gate-3 rule; no forked tunable |
| **D8** | Confidence → ask routing | What confidence level triggers an `openQuestion`, and the default routed surface (quest vs eval) | **OPEN** — slice-3 concern; untouched by slice 1 |
| **D9** ✅ RESOLVED (FEAT-51) | Review-chat infrastructure to reuse | (a) the `shellyChat` task + `useShellyChatActions` staging; (b) the `evaluationSessions` interactive-eval session pattern | **ADOPTED a — reuse the *pattern*, mirrored not shared, split by role** (slice 2a): a new `foundationsReview` Sonnet task + a **parallel** `FoundationsReviewAction` staging layer (its own union / parser / writer) so the existing Shelly chat is left byte-for-byte untouched (the HARD-STOP the run required — `ChatAction`/`useShellyChatActions` are an allowlist boundary for the Shelly portal, so cramming foundations kinds in would modify its behavior). The **"Test it"** path writes an `openQuestion { routedTo: 'quest' }` for the Knowledge Mine; the kid-side consumer is slice 2c. |
| **D10** (FEAT-49) | Band-number hint vocabulary | When a difficulty hint is needed on a parent surface, what plain phrase replaces the band number ("early skill" / "usually later" / none) | **OPEN** — §14; band numbers never render regardless (locked); this is only the optional plain-phrase hint |
| **D11** (FEAT-49) | Starved-source display threshold | When an in-app source is so thin it would mislead (the 3/350 case), omit it vs. show it with a "just getting started in-app" caveat | **OPEN** — §14; lean *omit when a richer external source exists*, else show with caveat |

---

## 11. The Foundations Review Chat (SLICE 2 — the primary interface)

**Amendment 2026-07-04 (FEAT-49).** The owner seeded both children via the FEAT-48 diag preview and reviewed it against reality. The verdict: **a list is the wrong review interface.** Forty-three `not-yet` nodes with "—" evidence is unreviewable — the parent doesn't carry those answers in his head, and the list *raises* questions instead of *resolving* them. The review must be a **conversation** that walks uncertain concepts one at a time and helps establish each state **by evidence or by testing.** This becomes the slice-2 primary interface; the browsable tab (§6) is demoted to slice 3 (§9), where it reads well *because* the chat has fed the model.

### 11.1 Shape

- **Subject-scoped sessions:** "Review reading" / "Review math," launched from the Foundations area.
- **~10 minutes, endable anytime.** Partial progress is saved; ending early is not a failure (no-shame, MVD-compatible). The session never demands completion.
- **The AI (Sonnet) walks concepts in priority order:** frontier/forming first, then the `not-yet`s that block the most downstream nodes (ranked by `underlies` fan-out), **skipping anything with fresh strong evidence.** It never re-litigates a `solid` node with recent proof.

### 11.2 Per-concept turn

For each concept the chat presents **plain language only** — the kid-word `name` + the parent description — and **never the band number** (§14). It then offers four response paths:

1. **Attest — "I've seen him do this."** → writes an `attestation` EvidenceRef (+ optional note); state set per the parent's judgment. Highest-quality evidence (§3.2); can reach `solid`.
2. **Covered in curriculum.** The parent names the source ("we did this in Fast Phonics"). → writes a `curriculumPosition` EvidenceRef (§12); state moves to **at most `forming`** (the covered≠mastered cap, §13) **plus an `openQuestion`** ("verify with a quick quest?").
3. **Test it.** → queues a targeted **kid-facing** quest for that concept, routing into the **existing Knowledge Mine pipeline** — the *kid* produces the evidence, not the parent. This designs the *queue handoff*, not a new quest engine (§11.5).
4. **Not yet / skip.** → no write, no judgment. The concept stays where it is.

### 11.3 Uploads mid-chat, with human context (the multi-extraction path)

The FEAT-48 scan flow recognised a Fast Phonics screenshot only as "Reading Eggs" — no positioning. The Review Chat fixes this by adding **human context at upload time:** the parent attaches images **and a line** ("these are Fast Phonics"). The chat then extracts **structured positions** — peak/lesson numbers, word counts, completion dates, quiz scores — and maps them through the bridge (§12) to **MULTIPLE node-evidence proposals in one pass.** One set of screenshots → many `curriculumPosition` proposals across the reading strand, not one vague tag.

### 11.4 All writes are propose → confirm → write

The chat **never writes silently.** It *stages* proposed state changes + their evidence; the parent confirms **per item or "confirm all"**; only then are the `attestation` / `curriculumPosition` entries written to `learnerModels`. This preserves the single-writer discipline the model has held since v1 and reuses the exact staging precedent already in the repo — FEAT-37/38's plan-adjustment staging and the `useShellyChatActions` propose→confirm→write loop (§11.6). **No proposal becomes a write without a confirm tap.**

### 11.5 Session output + the quest-queue handoff

The session ends with a **short recap:** what changed (states + evidence) and what got **queued for testing.** The quest-queue handoff is a thin write: each "Test it" concept emits an `openQuestion { routedTo: 'quest' }` (the existing §3.5 shape) that the Knowledge Mine reads as a targeted-concept request. **No new quest engine** — the handoff hands the concept id to the pipeline that already exists (`evaluationSessions` / `useQuestSession`), and the *kid's* play produces the `quest` EvidenceRef that can then reach `solid`.

> **✅ BUILT (FEAT-54, slice 2c).** The consuming side. `selectQuestTargets` reads the model's unresolved `routedTo:'quest'` asks into the next Mine session as **preferred concepts** at the child's current level (a capped seasoning, never overriding the adaptive engine); the AI **echoes `targetConceptId`** on the questions it weaves in (the `targetedBlockerId` precedent — no new tag→graph mapping layer). `applyQuestResultsToModel` folds per-concept correct/total back at session close: upgrade-only (`forming`/`frontier` + all-correct(min 2) → `solid`; `not-yet` → at most `forming`; a struggle appends `quest` evidence and leaves the state alone), a deterministic `source: quest` `changeFeed` line on any change, and the consumed asks marked resolved (kept as history, non-blocking for re-queue). **Invisible to the child** — diamonds-not-scores untouched, no kid-side vocabulary. The `conceptualBlocks[]` steering path (invariant-protected `skillSnapshots`) is **untouched**; the two targeting mechanisms coexist and are **not** unified here (deferred). Parent-visible status (waiting / tested ✓) rides the existing diag-preview queue.

### 11.6 Which chat infrastructure to reuse (Open Decision D9 — recommendation)

Two candidates exist in the repo, and the recommendation is to **reuse both, split by role** (not either/or):

- **Parent-facing Review Chat → reuse the `shellyChat` task + `useShellyChatActions` staging.** It *already* implements propose→confirm→write (`stagePendingActions` → confirm cards → `applyChatAction` / `confirmAll`), `<action>`-block parsing, and mid-chat image upload (`useShellyChatFlows`). Scope it with a new `foundationsReview` task variant (subject filter + concept-walk system prompt) rather than a from-scratch chat. This is the lowest-new-code path and inherits the confirm-gating for free.
- **The "Test it" path → route into the `evaluationSessions` / Knowledge Mine pipeline.** That pattern already produces the **kid** evidence (`useQuestSession`, `EvaluateChatPage`, the `evaluationSessions` store). The Review Chat hands it a concept id; it does the rest.

So: `shellyChat` staging owns the *parent conversation and its confirmed writes*; the eval/quest pipeline owns the *kid-produced verification*. Recorded as D9's lean; final call is the slice-2 build's.

---

## 12. External-curriculum evidence — `curriculumPosition` + the bridge

**Amendment 2026-07-04 (FEAT-49).** The model is **starved, not wrong.** The seeded model showed 3/350 sight words; the child's Fast Phonics account shows **548 words known, 45 sounds, 39 books, Peak 13 complete (June 2026), 100% average end-of-peak quizzes.** His real reading life happens substantially in external curricula and unphotographed workbook pages. The model needs a first-class evidence path for this.

### 12.1 The `curriculumPosition` EvidenceRef

```ts
export interface CurriculumPositionEvidence extends EvidenceRef {
  kind: 'curriculumPosition'
  source: 'fastPhonics' | 'readingEggs' | 'workbook' | string  // the program
  unit: string          // peak / lesson / page range — "Peak 13", "Unit 4 pp.20-28"
  detail?: string        // counts / scores — "548 words known · 100% end-of-peak quizzes"
  capturedAt: string
  via: 'chatUpload' | 'scan' | 'manual'
}
```

### 12.2 The bridge — external units → graph node ids (versioned data)

A **bridge** maps external-curriculum units to graph node ids, **stored as versioned data like the graphs** (a PR-reviewed TS module, `version` bumped on curation). Semantics:

- Completing unit X = **`covered` evidence** for the mapped nodes [...].
- Internal-program thresholds (e.g. 100% end-of-peak quizzes) **may promote *within* `forming`** but **NEVER to `solid`** without independent verification (quest / eval / attestation). This is the §13 cap, applied to bridge data.
- **Sight words are multi-source:** an external "words-known" count is evidence on `reading.phonics.sightWords` **alongside** the in-app `sightWordProgress` tracker — the model takes the **best-supported** source (548 external dominates 3 in-app), not a raw sum.

### 12.3 Deliverable of this run

**[`docs/foundations/FAST_PHONICS_BRIDGE_V0.md`](./foundations/FAST_PHONICS_BRIDGE_V0.md)** — a draft mapping of Fast Phonics **Peaks 1–20** to reading-graph node ids, reconstructed from the published Fast Phonics scope & sequence, **marked DRAFT PENDING OWNER CURATION** (same workflow as the graphs). It includes the bridge data shape, a worked "Peak 13 complete" example, the sight-word multi-source rule, and a **scope-&-sequence gaps** section flagging where per-peak grapheme boundaries are uncertain and need verification against the account.

> **✅ BUILT (FEAT-53, slice 2b).** The doc reached **v1 — CURATED** at FEAT-50, and is now transcribed to versioned code data at **`src/core/foundations/fastPhonicsBridge.ts`** (`version: 1`; `BridgeUnit { peak, phase, label, graphemes?, covers, depthOnly? }[]`). Validation tests pin it to the curated doc (all 20 peaks once, every `covers[]` id a real reading-graph node, phases 2–5 partition, depth-only 19–20 add no new node). `bridgeEvidenceForPosition(peakComplete)` is the deterministic mapping authority the upload path grounds against. **This is the template for future external-curriculum sources** (Reading Eggs core, math apps): each is a new data module of the same shape + a `bridgeForSource` entry — a **data addition, not code**.

### 12.4 Scan-pipeline tie-in (LATER slice)

Certificates / progress reports recognised by the **existing scan flow** route through the **same bridge** later. **Chat-upload is the v1 path** (§11.3); scan-ingest is the follow-on — both converge on one bridge, authored once.

---

## 13. Covered ≠ mastered (state-machine rule)

**Amendment 2026-07-04 (FEAT-49).** The child has "gone over" many concepts in books without page-by-page photos. Coverage must be **representable without claiming mastery** — the owner explicitly does **not** want covered content marked `solid` on inference alone.

**The rule, made explicit in the model:**

- A `curriculumPosition` EvidenceRef **alone** caps a concept at **`forming`** and attaches an **`openQuestion`** ("verify with a quick quest?"). It can never, by itself, reach `solid`.
- **`solid` requires at least one of:** a quest/eval finding, a parent `attestation`, or (future) sustained multi-source signal.
- A program's own internal quiz (even 100%) raises **confidence within `forming`** but is not the app's independent verification — it does not cross to `solid` on its own.

This keeps the terrain honest: "covered" reads as *forming with a route to verify*, never as a false `solid`.

---

## 14. Parent-surface display rules

**Amendment 2026-07-04 (FEAT-49).** Jargon leaked into the diag screen: "band 4" meant nothing to the owner, and "3/350 (1%)" read as failure. These rules apply to **slice-2+ surfaces** (the Review Chat, the Foundations tab); the FEAT-48 diag panel may be grandfathered.

1. **Band numbers never render on parent surfaces.** If a difficulty hint is genuinely needed, use a plain phrase ("early skill", "usually later") — exact vocabulary is Open Decision **D10**. The band is a seeding coordinate, not a parent-facing label.
2. **No percentages anywhere on Foundations surfaces.** Counts render with source attribution — "3 of the 350 tracked in-app" style — **or are omitted** when a starved in-app source would mislead (the 1% lesson; Open Decision **D11**). A raw "1%" is never shown.
3. **Evidence lines always name their source in plain words:** "from the June evaluation", "Fast Phonics Peak 13", "you confirmed this." Every state is traceable to a source a parent recognises.

---

## 15. Out of scope & backlog

**V1 non-goals (named, not built):** kid-facing Foundations views; **science / engineering** as academic concept domains (Dad Lab arcs keep their own `steps[].status` coverage per FEAT-41 **D1**, firewalled from the academic model — the §15 firewall referenced in §1.1 and §4.2); replacing the snapshot / Learning Map / dispositions as writers; any counting-rule or stored-data change.

### 15.1 Findings log

- **Weekly review has failed adoption (owner-stated, 2026-07-03).** "It's just work to do for next week" — the owner does it instead of Shelly, and it doesn't engage or help her. **Design consequence:** the Review Chat's asks must **NOT** be bolted onto the weekly review; they route through the chat (§11). The **weekly-review rethink is a separate future item** — logged here as a named backlog entry, **not designed in this doc.** When it is picked up it gets its own ledger row and design pass; this amendment only records the finding and the routing decision that keeps asks off the weekly review.

---

### Appendix — Step 0 recon provenance

This design is grounded in a five-part codebase inventory (evidence streams, AI consumers, the Learning Profile tab, the scheduled-function precedent, and the Learning-Map↔graph bootstrap). Key primary sources: `src/features/evaluate/skillSnapshotWrites.ts`, `src/core/curriculum/deriveWorkingLevelMastery.ts` + `skillLevelMaps.ts` + `curriculumMap.ts`, `functions/src/ai/contextSlices.ts` + `tasks/index.ts`, `functions/src/ai/evaluate.ts` (weeklyReview), `src/features/progress/ProgressPage.tsx` + `DispositionProfile.tsx`, `src/core/ai/prompts/concreteFirstOralScience.ts` + `src/features/dad-lab/dadLabPrompts.ts` (ETHOS-03). The bootstrap-mappability finding is summarized in the two graph appendices' "Seeding" sections.
