# The Learner Model — Foundations Synthesis ("the central brain")

> **Status:** NEW (design — strategic), v0.1, 2026-07-03. Docs-only. No build assigned.
> **Ledger anchor:** `FEAT-46` (DESIGN).
> **Companion drafts (owner curation pending):** [`docs/foundations/READING_GRAPH_V0.md`](./foundations/READING_GRAPH_V0.md), [`docs/foundations/MATH_GRAPH_V0.md`](./foundations/MATH_GRAPH_V0.md).
> **Cross-references:** FEAT-35 / FEAT-36 (re-derivation engine — semantics reused), FEAT-40 / FEAT-43 (Help Card — first downstream consumer), FEAT-41 / FEAT-44 (Dad Lab arcs — kept firewalled per D1), ETHOS-03 (concrete-first / modality calibration — the deferred per-child enrichment this fills), ETHOS-01 (charter injection), ETHOS-02 (measurement-sensitivity — the no-scores rail this obeys).

**A note on two run-prompt references, corrected against the code (Step 0 recon):** the brief named "ETHOS-02" and a function `buildCalibrationParagraph` as the modality-calibration seam. Neither is accurate. **ETHOS-02** is the *measurement-sensitivity (mechanics) guardrail*; the modality/calibration ethos is **ETHOS-03** (`CONCRETE_FIRST_ORAL_SCIENCE`). There is **no `buildCalibrationParagraph`** in the repo — per-child calibration today is *hardcoded literal strings* inside `src/features/dad-lab/dadLabPrompts.ts`, and ETHOS-03 explicitly **defers per-child supports to "FEAT-41 slice 2 context enrichment."** That deferred hole is exactly what this model fills; §5 and §7 are written against ETHOS-03, not ETHOS-02.

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
  domain: 'reading' | 'math'         // v1 scope; science/engineering out of scope (see §11)
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
  sourceId: string       // sessionId / scanId / snapshot ref / word / etc.
  note: string           // human one-liner: "Read cat/run/sit unaided in the Mine, Jun 28"
  observedAt: string
}
```

The nine `kind`s map 1:1 to the Step 0.1 streams. `attestation` (a parent override, §6) is the **highest-quality** kind and is stamped like FEAT-36's manual-freeze. This is the single most important trust feature: the Foundations tab is only believable because every square of terrain is tappable back to the eval / quest session / scan / parent statement behind it.

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

`skillSnapshots` (priority skills + gates, supports, stop rules, working levels, completed programs, conceptual blocks), `childSkillMaps` (node states), recent `evaluationSessions` findings, `scans`, `sightWordProgress`, `dadLabReports` *(for calibration signal only — not academic concept states; §11 firewall)*, disposition profile, day-log teach-backs. The model is a **reader** of every one; it is a writer of none of them.

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

- **Slice 1 — Graph as data + deterministic bootstrap + read-only diag preview. ✅ SHIPPED (FEAT-48).** Shipped: the OWNER-CURATED graphs transcribed to a versioned TS module (`src/core/foundations/` — `types.ts`, `readingGraph.ts` [31 nodes], `mathGraph.ts` [29 nodes], `index.ts`, validation tests); `LearnerModel` types + the `learnerModels/{childId}` collection helper/converter; a pure `seedLearnerModel(graphs, childId, snapshot, skillMap, sightWordData)` that implements the graphs' own seeding sections (band-below-working-level → `solid`, at-level → `frontier`, above → `not-yet`; L7/L8 by node id; sight-word share vs the imported `SIGHT_WORD_MASTERED_THRESHOLD`; gate-3 priority skills + completed programs → `solid`; evidence-only strands → `not-yet`; invariant: every non-`not-yet` state carries ≥1 EvidenceRef; degrades on sparse data), plus `mergeSeededModel` preserving attestation entries on re-seed; and a **parent-only `?diag=1` seed/preview panel** on the Progress page (writes ONLY `learnerModels`, merge). The full Foundations tab (absorbing Learning Profile) is **deferred to slice 2** — the diag preview is the smallest verifiable surface. **This is the smallest thing that produces a real stored model** — useful day one, no AI. *Revert: delete `src/core/foundations/` + the collection writer + the diag panel; nothing else depends on it.*
- **Slice 2 — LLM synthesis beat.** The Sonnet judgment layer (`whatMattersNext`, `modalityCalibration`, `openQuestions`, `changeFeed`, confidence resolution) + the weekly `onSchedule` + on-demand regenerate. *Revert: fall back to deterministic-only model.*
- **Slice 3 — `learnerModel` context slice + `plan`/`helpCard` adoption.** Add the slice + formatter; switch the two tasks' `TASK_CONTEXT` lists. *Revert: restore prior slice lists.*
- **Slice 4 — Dad Lab calibration re-point (ETHOS-03 slice-2 payload).** New `dadLab` task carrying `learnerModel`; delete the hardcoded child strings. *Revert: restore literals.*
- **Slice 5 — Overrides / attestation + evidence drawer.** Tap-a-concept evidence trail + override→attestation with revert & stale-notice. *Revert: drawer becomes read-only.*
- **Slice 6 — Ambient line + teach-back suggestions.** The Plan My Week one-liner + cross-child teach-back computation. *Revert: remove the line.*

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

---

### Appendix — Step 0 recon provenance

This design is grounded in a five-part codebase inventory (evidence streams, AI consumers, the Learning Profile tab, the scheduled-function precedent, and the Learning-Map↔graph bootstrap). Key primary sources: `src/features/evaluate/skillSnapshotWrites.ts`, `src/core/curriculum/deriveWorkingLevelMastery.ts` + `skillLevelMaps.ts` + `curriculumMap.ts`, `functions/src/ai/contextSlices.ts` + `tasks/index.ts`, `functions/src/ai/evaluate.ts` (weeklyReview), `src/features/progress/ProgressPage.tsx` + `DispositionProfile.tsx`, `src/core/ai/prompts/concreteFirstOralScience.ts` + `src/features/dad-lab/dadLabPrompts.ts` (ETHOS-03). The bootstrap-mappability finding is summarized in the two graph appendices' "Seeding" sections.
