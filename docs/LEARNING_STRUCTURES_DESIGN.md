# Learning Structures — Projects & Play (Design)

**Version:** v0.1 — July 2, 2026 (design-first; **no build assigned**)
**Status:** Strategic design. Concept + smallest honest pilot + open decisions. **No code.**
**Ledger anchor:** FEAT-42 (DESIGN — doc only, no build assigned).
**Builds on:** `docs/FIRST_PRINCIPLES_ALIGNMENT.md` (disposition-over-content, the learning loop,
evidence-beats-narrative, the measurement-sensitivity rail) and `docs/ENGINE_V2.md` (energy modes,
split-block rhythm, subject mapping). This doc extends those — it does not restate or fork them.

> **What this doc is for.** Make "project and play are learning structures" concrete enough to
> argue with, name the smallest pilot that would honestly test it, and surface the decisions.
> It is **not** a build spec. It proposes no schema, changes no counting rules, and assigns no work.

---

## 1. Thesis

**Projects and play are learning structures. Worksheets are one output format.**

The weekday engine's ontology today is **items and minutes**. Plan My Week emits day checklists;
each `ChecklistItem` carries a `subjectBucket`, an estimated duration, and a done-toggle
(`src/core/types/planning.ts:297`). That shape is worksheet-native — even when the *content* is a
Lego build or a read-aloud, the *container* is a row you check off for N minutes against a subject.
This is not wrong; it is load-bearing structure that Shelly (fibromyalgia) and Lincoln
(executive-function scaffolding) genuinely need. `FIRST_PRINCIPLES_ALIGNMENT.md` already defends it:
"The structure IS the support. Without it, nothing happens."

But the app's **highest-engagement moments are all project- or play-shaped**, and none of them are
checklist rows:

- **Story Game Workshop** — a kid designs a game; play sessions log hours split across subjects.
- **My Books** — a kid authors a book; reading it back logs hours and drops a portfolio artifact.
- **Barnes Bros / Seed Vault** — school *creates a product*; creative time logs hours by subject.
- **Dad Lab** — a multi-week `Project` with phases, a real outcome, and both boys credited.
- **Monthly review book gallery** — the kid's own work, narrated back to him.

And the charter's own frameworks are already project-native, not item-native:

- The **learning loop** — Wonder → Build → Explain → Reflect → Share — is a *project arc*. It
  completes over days, not inside one 20-minute row. Every `Artifact` already carries an
  `engineStage` tag drawn from that loop (`src/core/types/common.ts:18`).
- The **disposition report card** (Curiosity / Persistence / Articulation / Self-Awareness /
  Ownership) reads growth from projects and play — teach-backs, Dad Lab reports, kid-initiated
  creations — not from worksheet completion (`FIRST_PRINCIPLES_ALIGNMENT.md` § "The Reframe").
- **Portfolio over grades** (Design Decision #1) and **"growing, not passing"** are project logic:
  you show a body of work accumulating, you don't score a session.

**So the engine already believes the thesis everywhere except in its daily planner.** The proof is
that it has built the project/play pattern **four separate times, ad hoc** (see §1.1). Each
reinvented "a multi-subject activity that logs hours and produces artifacts" — because the engine
has no first-class idea of a *structure* larger than a checklist item. This doc names that missing
idea and asks what it would take to model it once.

The reframe, in charter terms:

- **Dispositions are demonstrated, not tested.** A project is where a kid *demonstrates* persistence
  and ownership over time; a worksheet mostly tests recall in a moment.
- **The loop completes over time, not per session.** Wonder on Monday, Build midweek, Share in the
  monthly book. A single day rarely closes the loop — and shouldn't be asked to.
- **Portfolio over grades.** The natural output of a project is artifacts, which is exactly what the
  compliance portfolio and the monthly book already consume.

Worksheets keep their place. They are one honest output format among several — the right one when a
skill needs isolated, repeated reps (phonics drills, math fluency). The claim is only that they
should stop being the app's *sole* container for a day of learning.

### 1.1 Prior art: the same pattern, built four times

Recon (July 2, 2026) confirms the engine has **no shared abstraction** for "a multi-subject
activity that logs hours and produces artifacts." Instead there are four independent
implementations, each calling `addDoc(hoursCollection(familyId), { childId, date, minutes,
subjectBucket, … })` directly — none through a shared helper, none via `hoursAdjustments`, none via
day-log blocks:

| Implementation | Hours write site | Subject-split | Artifact | Children |
|---|---|---|---|---|
| **Story Game Workshop** | `src/features/workshop/workshopUtils.ts:63` (`logWorkshopHours`) | proportional by card-type count — `Math.round((count/totalCards)*minutes)`, **one hours doc per bucket** (`:61`) | `createGameArtifact` (`:165`) | one |
| **Books reading session** | `src/features/books/BookReaderPage.tsx:61` (`logReadingHours`) | none — hardcoded `LanguageArts` (`:65`) | `logReadingCompletion` (`:79`), stage `Share` | one |
| **Barnes Bros / creative timer** | `src/core/hooks/useCreativeTimer.ts:138` (`stopTimer`) | none — user picks one subject at start | product manifest (`products`) / sales in `businessLog` | one |
| **Dad Lab `Project`** | `src/features/dad-lab/useDadLabReports.ts:70` (`syncComplianceHours`) | even by tag count — `Math.round(totalMinutes/subjectTags.length)` (`:63`) | the report doc itself | **both** |

What each reinvented:

- **Workshop and Dad Lab each invented a subject-split** ("count buckets → `Math.round(share ×
  minutes)` → one hours doc per bucket"). Workshop splits *proportionally by card type*; Dad Lab
  splits *evenly across `subjectTags`*. Same idea, two formulas, zero shared code.
- **Dad Lab additionally invented multi-child fan-out** (`for (child) for (subject)` at
  `useDadLabReports.ts:68`) — every child credited every subject, the "whole-family by design"
  semantic (DATA-04). No other structure knows how to attribute to both boys.
- **Three of four pair the hours write with a separate artifact/report doc** — the "produces
  portfolio evidence natively" behavior, re-wired each time.
- The `Artifact` type *already* has the hooks a structure would need — `projectId`, `labSessionId`,
  `labStage`, and the loop-native `engineStage` tag (`src/core/types/common.ts:44,41,43,18`) — but
  only Dad Lab uses `labSessionId`/`labStage`, and `projectId` is essentially unused. **The socket
  exists; nothing is plugged into it generally.**

This is the strongest evidence for the thesis: when the app needs project/play behavior it *builds
it every time*, because there is no `Structure` concept to reach for. **v1 does not unify these**
(see §5) — but the design must be shaped so that a future unification is natural, not fought.

---

## 2. The three structures (definition layer)

Three containers, one hours system. This is a **conceptual layer**, not a schema — the data sketches
below are deliberately loose.

### Routine — *what exists today, unchanged*

Repeatable items with a subject bucket and a duration, emitted by the planner into a day checklist.
Phonics drill, math practice, handwriting, read-aloud. This is the `ChecklistItem` /
`ActivityConfig` world (`planning.ts:297`, `planning.ts:911`). **Nothing about Routine changes.** It
is the floor and the scaffold; MVD is a Routine at its minimum.

- **Data:** `ChecklistItem` on a `DayLog`, or an `ActivityConfig` the planner expands.
- **Hours:** already flows — completed items count via `dayLogMinuteContributions`
  (`records.logic.ts:148`).
- **Evidence:** optional capture (photo/audio/note) via the Unified Capture Card.
- **Kid sees:** a short must-do / choose list. **Shelly sees:** the plan and its completion.

### Project — *multi-day, a real outcome, spans subjects, evidence-native*

A **Project** is work with a real outcome — a thing made, sold, shown — that lives across multiple
days or weeks, decomposes into daily **contributions**, spans subjects with hours attributed as the
work actually breaks down, produces portfolio artifacts natively, and moves through the engine loop
(Wonder → Build → Explain → Reflect → Share) over its lifetime.

- **What it IS (data sketch, not schema):** a lightweight record — a title, an outcome statement, a
  child (or `'both'`), a lifecycle position expressed as loop stage, a set of subject buckets it
  touches, and a growing list of linked artifacts and contribution days. It looks a lot like Dad
  Lab's `Project` (`src/core/types/dadlab.ts:24`) generalized out of Nathan's domain: `phase`
  (already an `EngineStage`), `sessionLog[]` (append-only completed-session entries), `photoUrls[]`.
  The pilot need not add a new type on day one (see §4 and the open decisions).
- **How minutes reach the hours system — through *existing* entry points only:** a Project **never**
  invents a new counting path. A day's contribution to a Project is logged the way any work is
  logged today — either as a **day-log checklist item** (the planner-emitted contribution item,
  which counts via `dayLogMinuteContributions`) or as an **`hours` entry** (the creative-timer /
  manual path, `useCreativeTimer.ts:138`). The Project record merely *references* those minutes (by
  `dayId` / artifact / activity link); it does not store or re-sum them. **This doc proposes no
  change to `collectHoursContributions`, `dayLogMinuteContributions`, or `itemMatchesBlock`**
  (DATA-11 / DATA-14, `records.logic.ts:219,148`; `src/core/utils/itemBlockMatch.ts`). Subject
  attribution is whatever the contribution item's `subjectBucket` already says — the Project spans
  subjects because its *contributions* do, not because a new splitter runs.
- **How evidence/artifacts flow:** natively. A contribution's captured photo/audio/note is an
  `Artifact` with `projectId` set (the socket at `common.ts:44`) and an `engineStage` matching where
  the project is in its loop. The monthly review book and the compliance portfolio already read
  `artifacts` — so a Project's evidence shows up in both **without new plumbing**.
- **What the kid sees vs what Shelly sees:**
  - **Kid:** a story of a thing being built — "here is what you've made so far," an accumulating
    gallery of steps and artifacts. **Never a completion percentage, never a progress-to-target
    bar.** Per the measurement-sensitivity rail (`FIRST_PRINCIPLES_ALIGNMENT.md` § "the mechanic
    carries the message"), a project surface passes only if it reads as *"here is what you built,"*
    never *"here is how far short you are."* Favor *collect / earned / N steps done*; avoid
    *"3/10 steps"* and any bar that can read as a shortfall on a low day. "The mechanic carries the
    message."
  - **Shelly:** the same body of work plus the subject-hours it has generated (read from existing
    hours, for compliance visibility) and where it sits in the loop — so she can fold the next
    contribution into next week's plan.

### Play — *game-shaped practice with a learning target inside it*

**Play** is repeatable, level-aware practice wrapped in a game, emitting evidence without feeling
like assessment. Knowledge Mine (the interactive reading quest), Workshop games, and the help-card
games sketched in the sibling Today Teaching Help design are all Play. Per interactive-eval-is-
learning (Design Decision #11), **a play session is evidence, not a test** — the quest already emits
findings into the skill snapshot as a byproduct of playing.

- **What it IS (data sketch):** an activity with a learning target and a level, that a kid enters
  repeatedly. It already exists as `itemType: 'evaluation'` checklist items with an
  `evaluationMode` and a `link` (e.g. `/quest`) — `planning.ts:344,346,348`. Play is the
  generalization of that: any game surface the planner can point a kid at.
- **How minutes reach the hours system:** through the **existing** evaluation/session path. Quest
  and fluency sessions already auto-complete their checklist item and log time; the Knowledge Mine
  writes `hours` entries through the same session-timer path used elsewhere. No new counting.
- **How evidence flows:** the play surface emits findings (skill snapshot) and can drop an
  `Artifact` (Workshop already does, `workshopUtils.ts:165`). Evidence is a *side effect of play*,
  which is the whole point — no separate "now take the test" step.
- **What the kid sees vs what Shelly sees:**
  - **Kid:** a game — diamonds mined, a bag that fills, a level climbed. Accumulating framings only
    (the same rail). Play is where the "no-judge mechanic" matters most, because a kid replays a game
    he enjoys and abandons one that measures him.
  - **Shelly:** the findings and the minutes, surfaced where she already reads them (skill snapshot,
    hours) — she does not have to grade a game.

**The through-line:** all three feed **one** hours system through **existing** entry points, and all
three produce evidence the portfolio/monthly-book pipeline already consumes. The difference is
*shape and lifespan*, not accounting. Routine is a row for a day; Project is an arc across weeks;
Play is a loop you re-enter.

---

## 3. How a Project meets the week (the planner question)

**The planner stays the single writer of weekly plans.** This is non-negotiable and already load-
bearing: shelly-chat's own plan-adjustment feature is a *handoff*, never a write — it stages a brief
and lets Plan My Week apply it through the existing lock-in path (FEAT-38, the single-writer-lane
discipline). Projects obey the same rule.

The mechanic: a **live Project registers contributions**, and plan generation folds them in as
ordinary checklist items **tagged to the project** (`projectId`, `itemType: 'activity'` — the
`itemType` union already includes `'activity'`, `planning.ts:344`; the apply path already preserves
it, `chatPlanner.logic.ts:1181`). Shelly's flow is unchanged: pick energy, generate, review, lock
in. The Project's contribution becomes one more item in the generated week — not a new surface, not
a new writer. The plan task's context already loads `activityConfigs`, `skillSnapshot`,
`workshopGames`, and `recentScans` (`functions/src/ai/contextSlices.ts:47`); a live Project would be
one more small context slice (`activeProjects`) the generator can draw a contribution from.

Three realities this must survive:

- **Low-energy weeks.** A Project contribution is *elastic*, not obligatory. On a low-energy or MVD
  week it shrinks to MVD size — the "one hands-on activity" slot — or **pauses without shame**.
  Pausing a project is not a broken streak and must never render as one (the measurement rail). MVD
  is real school; a paused project is a resting project. `ENGINE_V2.md` § "Minimum Viable Day" names
  a "Project or life-skills block" as one of the five essentials — a Project simply *is* that slot
  when one is live.
- **Sparse logging is the confirmed reality.** Shelly will not reliably check boxes to advance a
  project. **Progress must be inferable from artifacts and passive signals, not from Shelly's
  bookkeeping.** A photo captured against a project's contribution *is* the progress log — the
  artifact's existence advances the story; no separate "mark step complete" tap is required. This is
  the "evidence beats narrative" principle (`FIRST_PRINCIPLES_ALIGNMENT.md`) applied to project
  state: the unfalsifiable record is the pile of artifacts, and the loop stage can be read from
  *what's been captured*, not from a checkbox. A Project that depends on diligent logging is a
  Project that will silently die — design for the parent who photographs and moves on.
- **Curriculum coexistence.** Projects **do not replace** Routine. Shelly's workbook curriculum
  (TGTB, Reading Eggs, phonics) keeps running exactly as it does. A Project **absorbs the MVD "one
  hands-on activity" slot and grows from there** on good-energy weeks — it is additive headroom, not
  a substitution. Coverage tracking (`childSkillMap`, working levels) is unaffected; a project's
  artifacts can *feed* coverage but never gate the curriculum. Parity between "project days" and
  "worksheet days" is not the goal — some weeks are heavier on one than the other, by design.

---

## 4. The pilot — Open Decision, with a recommendation

The pilot's job is to test one question honestly and cheaply: **does modeling a live activity as a
first-class Project change how a kid shows up — does he narrate and own the work — without adding
logging burden on Shelly?** Engagement can't be manufactured, so the pilot should point at something
real.

**Candidates:**

- **A. Seed Vault kit as the first tracked Project.** Already live (`SEED_VAULT_V1_RUNBOOK.md`),
  genuinely multi-subject (Art via sticker drawing, Language Arts via story writing, Math via
  counting/pricing, Practical Arts via assembly — `GARDEN_DEFENSE_QUEST_PLAN.md` §7), **both boys
  have real roles** (London creative director, Lincoln operations), and it has a real, sellable
  outcome. Creative-time already logs its hours by subject (`useCreativeTimer.ts:138`) and books/
  stickers already produce artifacts. **Risk:** entangles the business track (its own July build —
  FEAT-27/28/29) with an engine experiment.
- **B. A garden/build project purpose-picked for the pilot.** Cleaner scope, no business coupling —
  but **manufactured**, and a manufactured project can only test the *mechanics*, not the
  *engagement*. It cannot answer the one question the pilot exists to answer.
- **C. Retrofit Dad Lab's `Project` into the general structure.** Unifies code the most (Dad Lab is
  already the closest thing to a real Project). But Dad Lab is **Nathan's Saturday domain** with a
  deliberately separate rhythm (Design Decision #9), while the weekday problem this doc is about is
  **Shelly's**. Retrofitting couples a code-unification refactor to a pedagogy experiment and drags
  Nathan's rhythm into the weekday engine — wrong first move.

**Recommendation: A (Seed Vault), scoped as a thin, read-only engine overlay.**

Rationale: the pilot's question is about *engagement and ownership*, and only a real project the boys
already care about can answer it. Seed Vault is the truest available test — it is live, multi-
subject, dual-child, and outcome-bearing today. B tests plumbing the recon already proves works; C
starts with a refactor in the wrong person's domain.

The coupling risk in A is real and is neutralized by **scope discipline**: the pilot models Seed
Vault as a **Project structure that *reads* existing hours and artifacts** and emits elastic
contribution items into the plan. It does **not** touch the business collections (`businessLog`,
`products`), does not build sales features, and does not become the checkout. The Project structure
lives in the *engine*, points at real work, and stays behind propose→confirm discipline. The
business tab stays separate (`GARDEN_DEFENSE_QUEST_PLAN.md` § "Two boundaries"). If Nathan wants the
business track kept entirely clean of engine experiments, **B is the fallback** — accepting that it
tests less.

**Pilot success criteria — in disposition/engagement terms, not completion metrics:**

- Lincoln (or London) **narrates his project work unprompted** in the monthly review book — the
  Ownership/Articulation signal, the richest evidence in the disposition model.
- Project artifacts **accumulate passively** — the artifact pile grows from normal capture, with
  **no new logging tap** required of Shelly (the sparse-logging test).
- Shelly reports the Project **reduced, not added, weekly planning friction** — the contribution
  showed up in the generated plan and she didn't have to think about it.
- On at least one low-energy week the Project **paused cleanly** — no shame surface, no broken-streak
  mechanic, MVD still counted as real school.
- The kid **re-enters the work across multiple weeks** — the loop visibly completes over time
  (Wonder → … → Share landing in the monthly book), not inside one session.

Explicitly **not** success criteria: percent complete, days-in-a-row, kit count, or any
progress-to-target bar. Those are the exact mechanics §2 and the measurement rail forbid on a kid
surface.

---

## 5. What generalizes later (explicitly NOT v1)

Named here so the pilot is designed *toward* them, but **none is in scope for the pilot**:

- **Unify the four ad-hoc implementations** (§1.1) behind one Structure abstraction / shared hours-
  and-artifact helper. This is the big prize, and the reason to shape the pilot carefully — but
  unifying Workshop + Books + creative-timer + Dad Lab is a large, invariant-adjacent refactor
  (touches hours writes) and must be its own proposed-and-confirmed effort, not a rider on a pilot.
- **Project templates** — reusable project skeletons (a "build-and-sell kit" template, a "garden"
  template) the planner can instantiate.
- **AI project suggestion** from interests + the evaluation frontier — "targeting system → delivery
  system": the disposition/eval data already identifies what a kid is ready for and drawn to; a
  later system could *propose* a project aimed there. This cross-references the sibling **Today
  Teaching Help** design (help-card games as Play — `docs/TODAY_TEACHING_HELP_DESIGN.md`, ledger
  FEAT-40, now on `main`). The help-card "Play it" affordance and this doc's Play structure are the
  same idea seen from two surfaces — reconcile them when either moves to build.
- **London's play track** — Play tuned for a 6-year-old. Per Lincoln-first / London-minimal, London
  surfaces open only when tuned for him; log London-specific project/play work in
  `docs/LONDON_BACKLOG.md`, don't build it speculatively.

---

## 6. What this must never do

Hard constraints. A pilot or any future build violating these is out of bounds:

- **Never change counting rules or stored hours data.** No new counting path, no re-sum, no write to
  `hoursAdjustments` for project bookkeeping, no touch to `collectHoursContributions` /
  `dayLogMinuteContributions` / `itemMatchesBlock` (DATA-11 / DATA-14). Structures feed **existing**
  entry points (day-log items or `hours` entries) and nothing else.
- **Never add completion-percentage, progress-to-target, or breakable-streak mechanics to a kid
  surface.** Accumulating framings only. "The mechanic carries the message"
  (`FIRST_PRINCIPLES_ALIGNMENT.md`).
- **Never add logging burden on Shelly.** If a Project needs diligent box-checking to advance, it is
  designed wrong. Progress is inferred from artifacts and passive signals.
- **Never gate anything on a child's name.** `isLincoln` / `ageGroup` are cosmetic/personality, not
  access (CLAUDE.md § Lincoln-first). Attribution is by `childId` / `'both'`.
- **Never replace the planner as the writer of weekly plans.** Projects register contributions; the
  planner writes the plan; Shelly reviews and locks in (single-writer lane, FEAT-38).

---

## 7. Open decisions summary

| # | Decision | Options | Recommendation / note |
|---|---|---|---|
| **D1** | **Pilot choice** | A. Seed Vault (live, real, dual-child; business-coupling risk) · B. purpose-picked garden/build (clean, manufactured, tests less) · C. retrofit Dad Lab `Project` (unifies code; wrong domain) | **A, scoped as a read-only engine overlay** — real engagement is the only thing worth testing; neutralize coupling by not touching business collections. **B is the fallback** if the business track must stay isolated. |
| **D2** | **Project = new collection vs. `weeks`-adjacent doc** | (a) new lightweight `projects`-style collection (mirrors Dad Lab's `Project`, `dadlab.ts:24`) · (b) a field/sub-doc hung off `weeks` · (c) reuse Dad Lab's existing collection | Lean **(a)** — a Project spans weeks, so a `weeks`-adjacent doc fights its lifespan; a small standalone record referencing days/artifacts fits better. **Open** — could start even thinner (no new type in the pilot, just `projectId` on artifacts + contribution items). |
| **D3** | **Artifact-as-progress semantics** | Does a captured artifact *advance* project state automatically, or does state need an explicit tap? | Recommend **artifact-advances-state** (sparse-logging reality). Loop stage is *read from* what's been captured, not set by a checkbox. **Open:** exact inference rule (which artifact → which loop stage). |
| **D4** | **Multi-child hours attribution when both boys contribute** | Follow the Dad Lab precedent (every child credited every subject — "whole-family by design", DATA-04, `useDadLabReports.ts:68`), or attribute per-child by whose contribution it was? | **Open — invariant-adjacent, propose→confirm.** Dad Lab's fan-out is deliberate for a *shared* Saturday build; a weekday project where London draws and Lincoln counts may warrant per-child attribution. Either way it must flow through **existing** hours entry points — no new splitter. Decide before any dual-child pilot week. |
| **D5** | **Does a Project ever gate curriculum coverage?** | Feed coverage only, or also gate/skip routine? | Recommend **feed only, never gate** — projects are additive headroom; curriculum runs independently (§3). |

---

*This is a design document. It proposes a concept, a pilot, and a decision list. It changes no code,
no schema, and no counting rule. Build is human-assigned per the operating model — nothing here is
authorized for implementation.*
