# Learning Model Census — 2026-09-08 (AUDIT-217)

> **Read-only census.** Nothing in this run changes behaviour, adds a node, adds a bridge, or
> changes a schema. One characterization test was added, documenting finding UX-288; it passes
> against `main` as it stands.
>
> **Baseline:** `main` @ `0b474ec`. Full suite before and after: **574 files · 8,418 passed ·
> 1 skipped**. Lint clean, `tsc -b` clean (root + `functions/`).
>
> **Ids filed:** `UX-286` → `UX-301`.

---

## 1 · The answer, first

**The graph is not the problem, and building a second one would be the wrong move.** Sixty curated
concept nodes across reading and math, eighty edges, zero dangling references, two versioned domain
graphs plus five external-curriculum bridges, six writers, a synthesis beat, a parent tab, a review
chat and an AI context slice — all of it built, all of it tested, most of it correct. The engine is
not slow because it has nothing to think with.

**The engine is slow because on a fresh family the thing it thinks with does not exist, and there is
no way to bring it into existence except a hidden URL flag.** `learnerModels/{childId}` is created by
exactly one line of code — `FoundationsDiagPanel.seedChild`, behind `canEdit` **and** `?diag=1`, a
diagnostic panel whose own docstring says *"this exists only to prove the model."* Every other writer
— the guided eval, the Knowledge Mine, the workbook position sync, the daily struggle signal, the
Foundations Review Chat — opens with `if (!snap.exists()) return`. The weekly synthesis beat returns
`skipped-no-model`. The AI context slice returns `""`. The Foundations tab renders an empty state
that tells the parent to *"do a Knowledge Mine round or a Foundations review"* — **and neither of
those can create the document**; a Review Chat confirm tap on a family with no model hits a
`console.warn` and returns, with no error shown and the card still reading *pending*. So the honest
description of the current state is not *"the model is thin"* — it is *"there may be no model at
all, and four surfaces behave as though the parent simply hasn't tried hard enough."*

**Where evidence does have a path, the paths are narrow, and the two most important ones are dark.**
Of thirteen family-facing capture surfaces, **three** reach concept states with their content (scans
and manual workbook positions; guided evaluations; the Foundations Review Chat), **two** reach the
model with a *question* but never a state (the Today struggle signals; Knowledge Mine, which can only
answer questions already queued), and **eight** reach it not at all — teach-backs, book reads, chapter
responses, Dad Lab reports and concept arcs, artifact photos/audio/notes, quick-log and Life Day
chips, strand sessions, the weekly reflection. Worse, the one path with real daily volume is broken
where it matters most: **the two workbooks every family is seeded with — "Good and the Beautiful
Reading" and "Good and the Beautiful Math" — match no bridge at all**, so scanning a page of the
family's core math book advances `activityConfigs` and reaches the learner model with nothing. A
drafted `TGTB_MATH_BRIDGE_V0.md` has sat awaiting curation since 2026-07-25 and says this in its own
second paragraph. And a guided evaluation's most likely math findings — addition, subtraction,
multiplication, division — map through `mapFindingToNode` onto `math.operations.addSub` /
`math.operations.multDiv`, which are **`curriculumMap` node ids that do not exist in the math
graph**, so they are silently dropped before any write.

**Recall exists and is better than expected — but it starts when the model does.** `changeFeed` is an
uncapped, append-only log of every state transition with `from`, `to`, `cause` and `at`; every
concept's `evidence[]` is append-only too. That is real history, and unlike FEAT-203's
`currentPosition` it is not overwritten in place. Two caveats: a **re-seed drops every `eval` and
`quest` evidence trail** (`mergeSeededModel` preserves only `attestation` and `curriculumPosition`
entries), and the clock only starts at the first seed. So the patterns the owner wants **can** be
computed forward, cannot be computed backwards, and the date they start from is the date somebody
taps a button in a panel most people do not know exists.

**Proportions, plainly: roughly 60% "nothing feeds it" — with about half of that being the single
bootstrap gap — 25% "the graph doesn't cover what the family uses", 15% "it's rendered but the render
is honest about being empty".** The first hour of fix work is worth more than the next twenty.

---

## 2 · Census A — the graphs

### 2.1 Counts

| Graph | Version | Nodes | Edges | Strand prefixes | Roots | Terminals | Dangling edges |
|---|---|---|---|---|---|---|---|
| `readingGraph` | 1 | **31** | 39 | 10 | 8 | 2 | 0 |
| `mathGraph` | 1 | **29** | 41 | 9 | 8 | 1 | 0 |
| **Total** | `reading@1+math@1` | **60** | **80** | 19 | 16 | 3 | 0 |

Band distribution:

| | K | K-1 | 1 | 1-2 | 2 | 3 | 4 | 5 |
|---|---|---|---|---|---|---|---|---|
| reading | 3 | 2 | 5 | — | 5 | 8 | 5 | 3 |
| math | 4 | — | 4 | 1 | 5 | 6 | 6 | 3 |

Strands — reading: `print`, `phonemic`, `phonics`, `decoding`, `fluency`, `vocabulary`,
`comprehension`, `critical`, `independent`, `encoding`. Math: `number`, `operations`, `fractions`,
`decimals`, `measurement`, `geometry`, `data`, `algebra`, `problemSolving`.

### 2.2 What an edge means

`ConceptNode.underlies` is a **forward prerequisite** edge — "concepts this one is a prerequisite
*for*". It is not a sequence and not a containment relation.

**Two consumers read it, and both use it only for ordering:**
- `reviewPriority.ts` — transitive fan-out (descending) ranks the Review Chat's agenda, so a
  high-fan-out foundation is established before the things it holds up.
- `functions/src/ai/tasks/learnerSynthesis.ts` — the same fan-out as a tiebreak in the deterministic
  frontier-first ordering the LLM is forbidden to reorder.

**No consistency rule reads the edges.** Nothing says *"`reading.phonics.longVowels` cannot be solid
while `reading.phonics.cvc` is frontier"*, nothing propagates a downgrade downstream, nothing infers
an upstream `solid` from a downstream one. The graph is a **priority index**, not an inference
engine. That is a defensible v1 choice and it is worth saying out loud, because "we have a graph" is
usually taken to mean the second thing (filed as **UX-299**).

### 2.3 Span

- **Reading reaches a 10-year-old at ~1st-grade reading comfortably.** Lincoln's working edge —
  CVC → blends → digraphs → long vowels → vowel teams → r-controlled → multisyllable — is the graph's
  densest, best-bridged strand (11 phonics/decoding nodes, band K→3).
- **Math reaches 3rd-grade work, and one rung past it.** `regrouping` (band 3),
  `multiDigit` (3), `arrays` (3), `multFacts` (3), `division` (3), `multiTables` (4) are all present,
  and the seeder gives `regrouping` (L7) and `multiTables` (L8) their own node-id override rather
  than a band comparison.
- **The ceiling is band 5** and the whole spine is explicitly K–5. That is right for both boys today
  and will bind on Lincoln within about two years, not this year.

### 2.4 Coverage against what the family actually uses

Resolved by calling the real `workbookBridgeForSource` against the names the app itself writes
(`DEFAULT_ACTIVITY_CONFIG_SEED` in `migrateActivityConfigs.ts`) plus the names in
`docs/foundations/*`:

| Curriculum / activity the family uses | Bridge? |
|---|---|
| **Good and the Beautiful Reading** *(seeded default)* | ❌ none |
| **Good and the Beautiful Math** *(seeded default)* | ❌ none |
| `Simply Good and Beautiful Math K — Course Book` | ❌ none |
| `Language arts workbook` *(seeded default)* | ❌ none |
| The Good and the Beautiful **Language Arts Level 1** | ✅ `tgtbLanguageArts1` |
| Fast Phonics / Reading Eggs Fast Phonics | ✅ `fastPhonics` |
| Mathseeds | ✅ `mathseeds` |
| `Reading Eggs` (bare) | ❌ none |
| Handwriting, Booster cards, Sight word games, Memory card, Fluency Practice | ❌ none |
| History / Bible / Geography (the new strands) | ❌ none — and **no graph domain either** |
| TGTB Language Arts 2, TGTB Math 3 (next year's likely courses) | ❌ none |

**The two rows every family starts with are unbridged.** `TGTB_MATH_BRIDGE_V0.md` (13.5 KB, drafted
2026-07-25, `DRAFT PENDING OWNER CURATION`) opens with: *"The family's workbook configs track 'TGTB
Math L107' — but no TGTB Math bridge exists, so the learner model is blind to the position."* It is
still unshipped. Filed as **UX-289**.

The strands (History / Bible / Geography, UX-281/282/283) are a different kind of gap: they have no
bridge because they have **no domain** — `FoundationDomain` is `reading | math`. That is a design
boundary, not a defect, and it is the right one to leave alone for now.

### 2.5 What `graphIntegrity.test.ts` already guarantees

Per graph: a positive version; ≥1 node; unique ids; every node's `domain` matches the graph's; every
id carries the domain prefix; non-empty `kidName` and `parentDescription`; **every `underlies` target
resolves to an existing node**; no self-edges; ≥1 terminal; ≥1 root; every `band` is one of the eight
legal values. Plus fixed counts (31 / 29) and a named-strand presence check per domain.

It is a good structural guard. **What it does not assert:** that the graph covers anything the family
owns, that a bridge exists for any tracked curriculum, or that the server-side copy agrees with it
(**UX-296**, **UX-301**).

---

## 3 · Census B — the writers

### 3.1 Every writer of `conceptStates` / `learnerModels`

| Writer | Trigger | Evidence it turns into state | Bridge used | Writes `EvidenceRef`? | Creates the doc? |
|---|---|---|---|---|---|
| `seedLearnerModel` + `mergeSeededModel` → `FoundationsDiagPanel.seedChild` | **Manual button, `?diag=1` + `canEdit`** | `skillSnapshots.workingLevels` (band map), `prioritySkills` at Gate 3, `completedPrograms`, `sightWordProgress` share | `mapFindingToNode`, `getNodesForProgram` | ✅ `workingLevel` / `prioritySkill` / `completedProgram` / `sightWordShare` | ✅ **the only one** |
| `applyReviewActionToModel` → `writeReviewAction` | Parent confirm tap in Foundations Review Chat **or** the Foundations tab concept override | Parent's word (`attest`), a named curriculum position (`covered`), a queued check (`queueTest`) | none (LLM proposes, `FOUNDATION_NODE_MAP` validates) | ✅ `attestation` / `curriculumPosition` | ❌ refuses when `modelRef.current` is null |
| `applyEvalFindingsToModel` → `syncEvalFindingsToModel` | Guided evaluation **Apply**, fire-and-forget | `EvaluationFinding.status` per assessed concept — the one **calibrated** writer (may move down) | `mapFindingToNode` | ✅ `eval` (+ `readState`) | ❌ `if (!modelSnap.exists()) return` |
| `applyQuestResultsToModel` → `syncQuestResultsToModel` | Knowledge Mine session close | per-concept correct/total, **restricted to `allowedConceptIds`** | none — reads `targetConceptId` stamps | ✅ `quest` | ❌ same guard |
| `applyBridgeCoverageToModel` → `syncWorkbookPositionToModel` | A scan that **advances** a position (`useScanToActivityConfig`), a manual position edit (`syncActivityPositionToModel`), or the diag panel's sync button | `ActivityConfig.currentPosition` → bridge unit → covered concepts, capped at `forming` | `workbookBridge` (+ `bridgeNameForActivity` for aliases) | ✅ `curriculumPosition` (`positionSync: true`) | ❌ returns `{status:'no-model'}` |
| `enqueueStuckRetests` | Today: the "stuck" mastery chip, `engagement:'struggled'`, the Quick Review "tricky" toggle | **no state at all** — one `openQuestion` + one `changeFeed` line | `dailySignalTargeting` (workbook frontier ∪ `tagConceptBridge`) | ❌ (writes no evidence) | ❌ same guard |
| `synthesizeLearnerModelForChild` (CF) | Weekly cron (`evaluate.ts` Sunday loop, via `synthesizeIfStale`) + `generateLearnerSynthesisNow` | none — writes `synthesis` only, never `conceptStates` | — | ❌ | ❌ `skipped-no-model` |

**Does a state ever change without an `EvidenceRef`?** No. Every path that sets `state` appends a ref
in the same object literal, and the type's docstring states the invariant. The one writer that
touches the model without evidence (`enqueueStuckRetests`) deliberately writes no state.

**Five of the seven bail on a missing document. The sixth (the Review Chat) bails on a null in
memory. The seventh — the only one that creates it — is behind a URL flag.** This is **UX-286**.

### 3.2 The bridges

| Bridge | What it maps | Units | Position-addressable | Distinct concepts it can reach | `lessonToUnit` | Called by |
|---|---|---|---|---|---|---|
| `fastPhonicsBridge` | Fast Phonics / Reading Eggs peaks | 20 | 20 | **12** reading | ✅ divisor, `positionIsProvisional` | `workbookBridge` (all 3 sync call sites) |
| `mathseedsBridge` | Mathseeds lesson bands | 5 | 5 | **25** math | ✅ band-ceiling | same |
| `tgtbLa1Bridge` | TGTB Language Arts Level 1 | 3 | 3 | **12** reading | ✅ band-ceiling | same |
| `tagConceptBridge` | 22 catalog `skillTag`s → concepts | 22 keys | n/a | **9** (13 keys map to `[]`) | n/a | `dailySignalTargeting` (FEAT-69) |
| `mapFindingToNode` | AI finding tags → `curriculumMap` ids | 33 distinct targets probed | n/a | **27** in-graph, **6 dropped** | n/a | `seedLearnerModel`, `evalModelSync` |

**Every bridge in the repo is called by something.** There is no unmounted-bridge instance of the
pace-gauge pattern here — the unshipped thing is *data* (`TGTB_MATH_BRIDGE_V0.md`), not wiring.

**The 6 dropped `mapFindingToNode` targets** (**UX-288**):

| Target the finding bridge emits | Reached from | In the foundations graph? |
|---|---|---|
| `math.operations.addSub` | `math.addition`, `math.subtraction`, any tag containing `addition`/`subtraction` | ❌ |
| `math.operations.multDiv` | `math.multiplication`, `math.division`, `multipl`/`divis`/`times`/`tables` | ❌ |
| `writing.mechanics.spelling` | any tag containing `spelling` | ❌ (`reading.encoding.spellCvc` exists and is not reached) |
| `writing.composition.sentence` | any tag containing `sentence` | ❌ |
| `speech.sounds.late` | every `speech.articulation.*` | ❌ (no speech domain — by design) |
| `speech.sequencing` | `speech.metathesis` | ❌ (by design) |

The two speech ones are correct: `FoundationDomain` is reading + math. The two writing ones are the
open curation question `tagConceptBridge` already names. **The two math ones are a straightforward
defect** — the concepts exist under different ids (`math.operations.addWithin20` /
`subWithin20` / `twoDigit`; `arrays` / `multFacts` / `division`), and the bridge points at a
`curriculumMap` id instead.

### 3.3 What can reach a concept at all

Unioning every bridge's reach: **41 of 60 concepts** are reachable by at least one bridge.
**19 are reachable by none** (**UX-295**) — only a parent attestation, or an eval finding that
happens to map, can ever move them:

```
reading.print.concepts            reading.comprehension.sequence
reading.fluency.accuracy          reading.comprehension.character
reading.fluency.expression        reading.comprehension.mainIdea
reading.vocabulary.everyday       reading.comprehension.inference
reading.vocabulary.wordParts      reading.comprehension.causeEffect
reading.vocabulary.contextClues   reading.comprehension.compareTheme
reading.independent.choice        reading.comprehension.analysis
reading.critical.evaluate
math.operations.factFamilies      math.fractions.compare
math.fractions.operations         math.decimals
```

That is the entire comprehension strand and the entire vocabulary strand — i.e. **everything about
whether Lincoln understands what he reads is invisible to every automatic path.**

---

## 4 · Census C — the evidence that goes nowhere

**How to read "reaches the model".** *Yes* = the surface's **content** lands as a concept state with
an `EvidenceRef`. *Question only* = it lands as an `openQuestion` (a queued check) but never as a
state. *No* = no code path exists. Every row assumes the model document **already exists** — if it
does not, every row is *No* (UX-286).

| Surface | What it captures | Written where | Reaches the model? | What it would take |
|---|---|---|---|---|
| **Workbook scan** (`useScanToActivityConfig`) | lesson/page position, curriculum name | `activityConfigs.currentPosition`, `scans`, `skillSnapshots.workingLevels` | **Yes — for 3 curricula.** `syncWorkbookPositionToModel`, capped at `forming` | A bridge for the seeded G&B rows (UX-289) |
| **Manual position edit** (Curriculum, chat card) | position | `activityConfigs` | **Yes**, same path via `syncActivityPositionToModel` | — |
| **Guided evaluation** (`EvaluateChatPage`) | per-skill `mastered`/`emerging`/`not-yet` | `evaluationSessions`, `skillSnapshots` | **Yes — the only calibrated writer**, but drops the four core math ops | Fix `mapFindingToNode`'s two math targets (UX-288) |
| **Foundations Review Chat** | parent's word, named curriculum positions | `learnerReviewSessions` + `learnerModels` | **Yes — richest path**, and the only one that can reach `solid` | It cannot bootstrap; confirm silently no-ops with no model (UX-287) |
| **Foundations tab concept override** | parent's word | `learnerModels` | **Yes** (same writer) | — |
| **Today: stuck chip / `struggled` / "tricky"** | a struggle on one checklist item | `days`, `skillSnapshots.conceptualBlocks` | **Question only** — one `openQuestion`, no state | By design; the answer comes from the quest |
| **Knowledge Mine** (`useQuestSession`) | per-question correct/skip, word progress | `evaluationSessions`, `children/{id}/wordProgress`, `skillSnapshots` | **Partly** — only concepts already queued as `openQuestions`, capped at 3/session, upgrade-only. An untargeted session writes **nothing** | Non-trivial: it needs the queue to be non-empty, which needs a model |
| **Sight words** (`useSightWordProgress`) | per-word mastery, interactions | `sightWordProgress` | **Once, at seed time.** `recordInteraction`/`confirmMastery` write no model | A share→concept re-sync on mastery change (UX-293) |
| **Teach-backs** (`KidTeachBack`) | audio/text of a child explaining | `artifacts`, `days`, `weeklyReviews.evidence` | **No** | Design §8 specifies a teach-back computation; unbuilt |
| **Book reads / read-aloud** | pages, minutes, chapter position | `books`, `bookProgress` | **No** | Nothing maps a book to a concept |
| **Chapter responses** | a child's answers to chapter questions | `chapterResponses` | **No** | Would need a comprehension-node bridge (all 7 unreachable, UX-295) |
| **Dad Lab reports + concept arcs** | beats, items, artifacts, an arc of concepts | `dadLabReports`, `conceptArcs` | **No** | Arcs already name concepts in prose; no id-level link |
| **Artifacts** (photo / audio / note / link) | the actual evidence | `artifacts` | **No** — not even counted | — |
| **Quick-log chips** (both surfaces) | "I did more" — subject + minutes | `days` | **No** — the items carry no `skillTags`, so even the FEAT-69 path cannot see them | Tagging the chips |
| **Life Day chips** | what actually happened on a set-aside day | `days`, `dailyPlans.planType` | **No** — same, no `skillTags` | — |
| **Strand sessions** (UX-281/282/283) | topic + evidence + an increment | `artifacts`, `activityConfigs.currentPosition` | **No** — the increment goes through `strandSessionWrites`, not `setActivityConfigPosition`, so it never reaches `syncActivityPositionToModel`; and History/Bible/Geography have no graph domain | Out of scope by design (UX-300) |
| **Weekly reflection** ("Was that enough?") | a parent's judgement | `weeklyReviews.reflection` | **No** — and deliberately so; UX-214 says it feeds nothing | Leave it |
| **`businessLog`** | sales / earnings events | `businessLog` | **No** — explicitly "never a learner-model input" | Leave it |
| **Day-log completions (non-struggle)** | every item ticked off, every day | `days` | **No** — only a *struggle* signal has a path | The largest untapped volume in the app |

**Three yes · two partial · thirteen no.** The three that work are all *parent-initiated, low
frequency* (a scan, an eval, a chat). Everything the family does **daily** — ticking items off,
reading books, teaching each other, capturing photos, logging extras — reaches the model with
nothing. Filed as **UX-292**.

The precise shape of "partly" matters and is the whole finding for two rows:

- **Knowledge Mine** is *counted* by the weekly review and *renders* on the child's own surfaces, but
  its results reach concept states only for the ≤3 concepts a queued `openQuestion` seeded. A child
  who plays ten sessions with an empty queue moves nothing.
- **Sight words** reach the model as a single aggregate *share* at seed time. Lincoln can master
  forty more words and `reading.phonics.sightWords` will not move.

---

## 5 · Census D — recall

### 5.1 `changeFeed`

**Holds:** `{ conceptId, from, to, cause, at }` per transition. **Written by** five paths —
`applyReviewActionToModel` (attest / covered / queueTest), `applyEvalFindingsToModel`,
`applyQuestResultsToModel`, `applyBridgeCoverageToModel`, `enqueueStuckRetests`. Every one appends;
**there is no cap and no truncation anywhere in the repo.** `mergeSeededModel` carries an existing
feed forward rather than emptying it.

**How far back:** to the first write after the model was created. Not before.

### 5.2 Is there history?

**Yes — more than FEAT-203 found for `currentPosition`, and this is the single most consequential
positive finding in this run.**

- `ConceptStateEntry.state` **is** overwritten in place (the current value only).
- But `ConceptStateEntry.evidence[]` is **append-only** at every writer — `[...(prev?.evidence ?? []),
  evidence]` — and each ref carries `observedAt`, its `kind`, its `sourceId`, and (since FEAT-66) the
  `readState` the ref itself asserted.
- And `changeFeed` independently records every transition with both endpoints and a cause.

So *"what did the model think about `reading.phonics.digraphs` in July, and what changed it"* is
answerable from stored data. **Patterns can be computed forward. They cannot be computed backwards
past the first seed** — and for a family that has never opened `?diag=1`, that date is *never*.

**Two things erode it:**
1. **A re-seed drops `eval` and `quest` evidence** (**UX-290**). `mergeSeededModel` preserves an
   existing entry only when it carries an `attestation` or `curriculumPosition` ref; everything else
   is replaced by the fresh seed, which for the 19 evidence-only nodes means `state: 'not-yet',
   evidence: []`. A Knowledge Mine result and a guided eval's read are both erasable by a button
   press. No test covers this.
2. **Whole-array read-modify-write** (**UX-297**). Six fire-and-forget writers each `getDoc`, mutate a
   whole array, and `setDoc(..., {merge:true})` it back. Two writes in the same second lose one, and
   the arrays grow without bound inside a document with a 1 MB ceiling.

### 5.3 What can be asked of the model today, and who renders it

| Field | Written by | Rendered by |
|---|---|---|
| `conceptStates` (terrain, per state) | the six writers | **Foundations tab** (chips grouped by domain, tap → evidence drawer); `dataReviewExport` (`?diag=1`); `buildLearnerModelSlice` → the `plan` / `shellyChat` / `weeklyReview` prompts |
| `synthesis.whatMattersNext` | `learnerSynthesis` CF only | **Foundations tab** §1; **`FoundationsFocusLine`** on the planner; the AI slice |
| `synthesis.narrative` | same | Foundations tab, above the terrain |
| `changeFeed` | five writers | **Foundations tab** "What moved" (via `computeMovedFeed` + `computeFocusConfirmations`); `dataReviewExport` |
| `openQuestions` | Review Chat, `enqueueStuckRetests`, bridge coverage | **Foundations tab** (routed asks); consumed by `selectQuestTargets` |
| `needsReconcile` | `applyEvalFindingsToModel` | **Foundations tab** — a quiet info icon on the chip + a reconcile drawer |
| `modalityCalibration` | seeder only | Foundations tab; the AI slice |

**Every field is rendered somewhere.** There is no unrendered-field instance of the pace-gauge
pattern either. But `synthesis` — the field two of the three surfaces lead with — regenerates only
(a) in the weekly cron's `synthesizeIfStale`, and (b) from the diag panel's manual button.
`learnerSynthesis.ts`'s own docstring claims a third caller, *"the client regenerate-on-read path"*;
**that path does not exist in the repo** (**UX-298**). `useLearnerModel` is a pure `onSnapshot` read
and says so.

---

## 6 · Findings

### P1 — the model is wrong, or a surface claims knowledge it does not have

**UX-286 · Nothing in the app can create a learner model except a hidden `?diag=1` button.**
`seedLearnerModel` has exactly one caller: `FoundationsDiagPanel.seedChild`, gated on `canEdit`
**and** `searchParams.get('diag') === '1'`, in a panel documented as existing *"only to prove the
model."* All five other writers guard `if (!snap.exists()) return`; the Review Chat guards on a null
in memory; the synthesis beat returns `skipped-no-model`; `buildLearnerModelSlice` returns `""`. On a
family that has never typed `?diag=1`, the engine's central brain does not exist and every consumer
degrades silently to nothing. *Files: `FoundationsDiagPanel.tsx:194`, `seedLearnerModel.ts`, all six
writers, `learnerSynthesis.ts:68`.*

**UX-287 · The Foundations tab's empty state tells the parent to do two things that cannot work — and
one of them fails silently.** `EmptyFoundations` reads *"Do a Knowledge Mine round or a Foundations
review to start filling this in."* A Knowledge Mine round returns at `!modelSnap.exists()`. A
Foundations Review can run its whole conversation with `modelRef.current === null`, render confirm
cards, and then `applyAction` hits `if (!base) { console.warn(...); return }` — **no `setError`, no
state change, the card still reading *pending***. Two dead ends, one of them invisible.
*Files: `FoundationsTab.tsx:215-223`, `useFoundationsReview.ts:255,384-387`, `questModelSync.ts:57`.*

**UX-288 · A guided evaluation's addition / subtraction / multiplication / division findings reach
the model nowhere.** `mapFindingToNode` maps them to `math.operations.addSub` and
`math.operations.multDiv` — `curriculumMap` node ids that are **not** in `mathGraph` — so
`computeEvalRead`'s `!FOUNDATION_NODE_MAP[conceptId]` filter drops them before any write. The
concepts exist under different ids (`addWithin20`, `subWithin20`, `twoDigit`, `arrays`, `multFacts`,
`division`). For a 10-year-old working at ~3rd-grade math these are the most likely findings an eval
produces. 6 of 33 distinct bridge targets fall outside the graph; 2 are this defect, 2 are the
declared writing scope boundary, 2 are the declared speech boundary.
*Files: `mapFindingToNode.ts:54-57,141-142`, `evalModelSync.ts:114`. Characterization test added:
`src/core/foundations/evalBridgeCoverage.test.ts`.*

**UX-289 · The two workbooks every family is seeded with match no bridge.** `Good and the Beautiful
Reading` and `Good and the Beautiful Math` (`DEFAULT_ACTIVITY_CONFIG_SEED`) both resolve to `null` in
`workbookBridgeForSource`, so scanning a page of the family's core math book advances
`activityConfigs.currentPosition` and reaches the learner model with nothing —
`syncWorkbookPositionToModel` returns `{status:'no-bridge'}` and logs nothing a parent sees.
`docs/foundations/TGTB_MATH_BRIDGE_V0.md` (drafted 2026-07-25) states the problem in its own second
paragraph and has been awaiting owner curation for six weeks. *Files:
`migrateActivityConfigs.ts:104-127`, `workbookBridge.ts:127-131`, `docs/foundations/TGTB_MATH_BRIDGE_V0.md`.*

### P2 — evidence is lost

**UX-290 · A re-seed destroys every `eval` and `quest` evidence trail.** `mergeSeededModel` preserves
an existing concept entry only when its evidence contains an `attestation` or a `curriculumPosition`.
A concept whose evidence is a guided eval's read or a Knowledge Mine result is replaced wholesale by
the fresh seed — which, for the 19 evidence-only nodes, is `{state:'not-yet', evidence:[]}`. Since
the seeder is also the only bootstrap, "seed again" is a natural parent action. No test covers eval
or quest preservation; the only merge test covers `attestation`.
*Files: `seedLearnerModel.ts:371-398`, `seedLearnerModel.test.ts:229-262`.*

**UX-291 · The deterministic layer is a one-time photograph.** `skillSnapshots.workingLevels` is
written live by quests (`workingLevels.ts`), guided evals, scans (`updateWorkingLevelFromScan`) and
the manual Skill Snapshot stepper — but the **only** thing that projects a working level onto concept
states is `seedLearnerModel`, which never runs again on its own. Lincoln's phonics level can move
three rungs and every band-seeded concept keeps the state it was given the day someone tapped Seed.
*Files: `seedLearnerModel.ts:311-334`, `useScanToActivityConfig.ts:257`, `skillSnapshotWrites.ts`.*

**UX-292 · Thirteen capture surfaces write nothing a model can read.** See §4. Teach-backs, book
reads, chapter responses, Dad Lab reports and concept arcs, artifacts, quick-log chips, Life Day
chips, strand sessions, the weekly reflection, `businessLog`, non-struggle day-log completions,
Knowledge Mine `wordProgress`, and post-seed sight-word interactions. Two of these are deliberate
(`businessLog`, the weekly reflection — both have explicit "never a learner-model input" rails).
The rest are simply unwired. *Files: §4's table.*

**UX-293 · Sight-word mastery reaches the model exactly once.** `sightWordProgress` is read on the
model path only by `seedLearnerModel`, which folds it to a single share on
`reading.phonics.sightWords`. `recordInteraction` / `confirmMastery` / `addSightWord` /
`removeSightWord` write no model, so the concept is frozen at its seed-time percentage.
*Files: `seedLearnerModel.ts:126-145`, `books/useSightWordProgress.ts`.*

**UX-294 · 13 of 22 catalog skill tags map to nothing, so the non-workbook struggle path reaches 9 of
60 concepts.** All 7 `writing.*` and all 5 `regulation.*` map to `[]` by declared design;
`reading.fluency.short` is an open curation question the table names. Not a defect — a bound. It means
a struggle on any item that is not a bridged workbook and not one of six tags queues nothing.
*Files: `tagConceptBridge.ts:58-94`.*

**UX-295 · 19 of 60 concepts are reachable by no bridge at all** — the whole comprehension strand
(7 nodes), the whole vocabulary strand (3), two fluency nodes, print concepts, independent reading,
critical evaluation, `math.operations.factFamilies`, `math.fractions.compare`,
`math.fractions.operations`, `math.decimals`. Only a parent attestation, or an eval finding that
happens to map, can ever move them. Everything about whether Lincoln *understands* what he reads is
invisible to every automatic path. *Computed in §3.3.*

**UX-296 · The concept graph has two definitions and nothing enforces they agree.**
`functions/src/ai/data/foundationsGraphSummary.ts` is a hand-committed, machine-generated mirror of
both client graphs, regenerated by `scripts/genFoundationsSummary.ts` as a manual step. Its test pins
only *internal* consistency and says so; it cannot import the client graph across the build boundary.
The file carries its own `// TODO: consolidate`. This is precisely the class ARCH-47 exists to
eliminate, and it is the one graph-shaped instance still open: a re-curation that forgets the
generator leaves the AI slice naming concepts the model no longer has, with no failing test.
*Files: `functions/src/ai/data/foundationsGraphSummary.{ts,test.ts}`, `scripts/genFoundationsSummary.ts`.*

**UX-297 · Every model write is an unbounded whole-array read-modify-write.** Six fire-and-forget
writers `getDoc`, mutate `changeFeed` / `openQuestions` / a concept's `evidence[]`, and merge the
whole array back. Nothing caps any of the three, and they live in one Firestore document with a 1 MB
ceiling. Two writers firing in the same second (a scan sync and a struggle chip, say) silently lose
one. *Files: `writeReviewAction.ts:39-50`, `stuckRetestQueue.ts:126-133`,
`workbookPositionSync.ts:118-126`, `questModelSync.ts:67`, `evalModelWriteback.ts:61`.*

**UX-298 · The synthesis "client regenerate-on-read path" documented in `learnerSynthesis.ts` does
not exist.** Its docstring names two client entry points; grep finds one — the diag panel. So
`synthesis` — the field the Foundations tab and the planner focus line both lead with — refreshes
only in the Sunday cron, and only for a model that already exists. *Files: `learnerSynthesis.ts:10-11`,
`useLearnerModel.ts` (pure read, documented as such), `FoundationsDiagPanel.tsx:51`.*

### P3 — polish / worth stating

**UX-299 · The graph's edges are a priority index, not an inference engine.** `underlies` is read by
exactly two consumers (`reviewPriority`, `learnerSynthesis`), both for fan-out ordering. No
consistency rule, no propagation, no upstream/downstream inference. Defensible for v1; worth stating
because "we have a graph" is usually read as the stronger claim.

**UX-300 · A strand's `currentPosition` deliberately never reaches the model** — the increment goes
through `strandSessionWrites` (atomic `increment(1)`), not `setActivityConfigPosition`, so
`syncActivityPositionToModel` never fires. Correct today (History/Bible/Geography have no graph
domain and no bridge), and recorded here so nobody wires it later by reflex.

**UX-301 · `graphIntegrity.test.ts` guards structure, not fit.** It pins 31/29 nodes, unique ids,
in-graph edges, valid bands, named strands. Nothing asserts the graph covers a curriculum the family
owns, that a tracked `activityConfig` name resolves to a bridge, or that the server copy agrees.

---

## 7 · The recommendation — ranked by evidence recovered per hour

**Wire before you build. The graph does not need to grow first, and adding a node would recover
nothing.**

| # | Do this | Size | What it recovers |
|---|---|---|---|
| **1** | **Bootstrap the model automatically** (UX-286). Seed on first read of a child's Foundations tab, or a one-shot idempotent write behind a visible parent button — not a URL flag. `mergeSeededModel` already exists and is idempotent; this is a trigger, not a new write path. | **S** — 1 run | Turns *every other item on this list* from theoretical into live. Nothing below matters until this lands. |
| **2** | **Fix `mapFindingToNode`'s two math targets** (UX-288). Point `math.addition`/`math.subtraction` and `math.multiplication`/`math.division` at real graph nodes, or split them by the finding's own detail. | **S** — one table edit + tests | Unblocks the calibrated writer on the four most common math findings for a 10-year-old. The eval is the strongest signal in the system and it is currently deaf to half of math. |
| **3** | **Curate and ship the TGTB Math bridge** (UX-289) — the draft is written; the missing input is the owner's course book TOC. Add G&B Reading in the same pass. | **M** — owner curation + 1 transcription run | Turns the family's highest-volume daily signal (a scan of the book they actually use) from a no-op into `curriculumPosition` evidence + verify-asks. |
| **4** | **Stop a re-seed eating eval/quest evidence** (UX-290) — widen `mergeSeededModel`'s preserve rule to any entry carrying non-derivable evidence, and test it. | **S** | Protects everything items 1–3 start collecting. Do it *with* item 1, not after: item 1 makes re-seeding common. |
| **5** | **Fix the two dead ends** (UX-287) — make the Review Chat's confirm say what happened, and make the empty state name a route that works. | **S** | Removes the app telling a parent to do something impossible. |
| **6** | **Re-project working levels when they move** (UX-291) — the cheapest version is running the existing seeder's band pass on a `workingLevels` change, merged. | **M** | Reconnects quests, evals, scans and the manual stepper to the deterministic layer, which is currently frozen at seed time. |
| **7** | **Wire ONE new capture surface, and make it teach-backs** (UX-292). Design §8 already specifies a teach-back computation. It is the richest evidence the family produces and the charter says so. | **L** | The first genuinely new evidence class. |
| **8** | **Give the graph one definition** (UX-296) — an ARCH-47 slice moving the spine into `functions/src/shared/`, deleting the generated mirror. | **M** | Removes the last silent-drift surface in the foundations area. |
| **9** | **Cap and/or shard the growing arrays** (UX-297). | **M** | Not urgent at today's volume; urgent once items 1–3 make the model busy. |
| **10** | **Grow the graph** — comprehension and vocabulary bridges (UX-295), a writing/encoding tag lane (UX-294). | **L** | Only after 1–7. Adding nodes to a graph nothing feeds recovers nothing. |

**If only one thing is done: item 1.** It is small, it is a trigger rather than a new write path, and
without it every other number in this document is describing a document that does not exist.

**On the owner's second question — "a robust method for recalling moving forward".** It is already
built and it is better than the pace-gauge precedent feared: `changeFeed` is uncapped and
append-only, evidence trails are append-only, and every transition records both endpoints, a cause
and a timestamp. The work is not to build recall; it is to **start the clock** (item 1) and **stop
the one thing that erases it** (item 4). As with FEAT-203's coverage rate, the patterns cannot be
recovered backwards — they begin the day the model does.

---

## 8 · What this run did NOT check, and why

- **Live Firestore data.** Every count here is computed from source. Whether the family's
  `learnerModels` documents actually exist, and what is in them, is a `NEEDS-DATA` question — the
  `?diag=1` data-review export (FEAT-120) is the tool for it. If a model *does* exist for both boys,
  UX-286 is a smaller problem than stated and UX-291/UX-290 are larger ones.
- **The quality of the curated graph content.** Band placements and edges were transcribed verbatim
  from two owner-curated docs (D3) and this run treated them as given. Whether
  `reading.comprehension.explicit` really belongs at band 3 is a curation question, not a census one.
- **The LLM behaviour of the synthesis beat and the Review Chat.** Prompt assembly was read; model
  output quality was not evaluated.
- **`curriculumMap` / the Learning Map tab** beyond the `mapFindingToNode` seam. It is a separate
  graph with a separate purpose (20 reading / 16 math / 10 speech / 13 writing nodes) and auditing it
  is its own run.
- **The Dad Lab concept-arc data model** as a possible concept source. Arcs name concepts in prose;
  whether they could carry graph ids is a design question, filed only as part of UX-292.
- **Performance and Firestore read cost** of the surfaces involved.
- **`docs/LEARNER_MODEL_DESIGN.md` §§ not yet built.** Several design sections (§8 teach-back
  computation, §3.1's `confidence` / `lastMovedAt`) describe fields the code does not have. This run
  recorded the gap where it intersected a finding and did not audit the design doc as a whole.
