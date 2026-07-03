# Dad Lab Concept Arcs — Design

> **Status:** DESIGN (doc only, no build assigned). Created 2026-07-02.
> **Ledger anchor:** `FEAT-41` (`docs/review/REVIEW_HOME_BASE.md` §6).
> **Build-order dependency:** `ARCH-40` (Dad Lab role-field name-coupling) must land first for any slice
> that touches the suggestion prompt's role fields — see §3 and §7.
> **Scope guardrail:** additive layer only. Does **not** touch hours/XP credit semantics, compliance
> counting, the academic Learning Map, or the `DadLabReport` schema beyond the ARCH-40 dependency.

---

## 1. Problem statement

Dad Lab today teaches **moments**, not **concepts**. Each Saturday lab is an independent unit with no
memory of the labs before it and no sense of where the next one should go.

Grounding evidence (Step 0 recon, 2026-07-02):

- **Suggestions have no trajectory memory.** `src/features/dad-lab/LabSuggestions.tsx:194-275` sends a
  large hardcoded prompt ("Suggest 3 Dad Lab activities for this Saturday") through the **generic
  `chat` task**. That task resolves to `handleChat` (`functions/src/ai/tasks/chatHandler.ts`), runs on
  **Haiku**, and is given only **charter + childProfile** context (`functions/src/ai/contextSlices.ts:53`).
  It receives no prior-lab history — `contextSlices.test.ts:45` explicitly asserts the `chat` task does
  **not** get the `dadLabReports` slice. So every suggestion round starts from a blank slate.
- **Sessions capture a "what changed / next step," but nothing reads it forward.** `LabSession` has
  `finishWhatChanged` / `finishNextStep` / `finishSummary` (`src/core/types/dadlab.ts:69-74`) and
  `SessionLogEntry` has `whatChanged` (`:21`), but these live on the **unwired** `Project`/`LabSession`
  layer (see §2.1). The **live** object, `DadLabReport`, captures `nextTime`, `bestMoment`, and per-child
  `prediction`/`observation` (`:108-134`, `:79-86`) — and **no downstream lab consumes any of it**.
  `handleSuggestionSelect` (`DadLabPage.tsx:172-202`) turns a picked suggestion straight into a Planned
  report; it never looks at the last report's outcome.
- **No sequencing concept exists.** `DadLabPage.tsx` organizes labs purely by `status`
  (planned/active/completed) and `date`. There is no `arcId`, `sequence`, `series`, or `progression`
  field anywhere in the Dad Lab feature.

The nearest existing idea is the **Shared Theme Engine** (`docs/ENGINE_V2.md:77-84`): "one theme every
1-2 weeks… Dad Lab: build something that demonstrates the theme." That is theme-*grouping*, not a
designed *progression* — themes don't order labs, carry outcomes forward, or know their own next beat.

**What we want.** Dad Lab should teach **concepts through arcs**: a designed sequence of labs that
builds a concept progression across Saturdays (e.g. electricity: static → simple circuit → switches →
motors). Each lab knows its place in the arc, and each session's outcome informs the next lab's plan.

---

## 2. Proposed model — `ConceptArc`

An **additive layer above the existing lab objects.** It introduces no changes to how a single lab is
planned, run, credited, or reported. An arc is a lightweight ordered container plus a small amount of
carry-forward wiring.

### 2.1 A note on the linkage target (Project vs DadLabReport)

The originating brief assumed labs hang off a `Project` layer (Plan→Build→Test→Improve, append-only
`sessionLog`) and that arcs would attach via `Project.arcId?`. **Recon contradicts this.** The
`Project`, `LabSession`, and `SessionLogEntry` types (`src/core/types/dadlab.ts:11-75`) have **zero
consumers** anywhere in `src/` or `functions/src/` — only `LAB_FRAMEWORKS` (`:89`) is imported. The
shipped Dad Lab feature runs **entirely on `DadLabReport`**: `DadLabPage.tsx` never imports `Project` or
`LabSession`. The `Project` layer is defined-but-unwired scaffolding.

**Design decision:** the arc's **live linkage target is `DadLabReport`** — the object the feature
actually creates, reads, and reports on. We add `arcId?` / `arcStepIndex?` there. We *also* mirror the
same optional fields onto `Project` so that, **if** the Project layer is ever wired, arcs already speak
its language — but nothing in v1 depends on `Project` existing. This keeps the doc honest about code
reality while preserving the brief's forward intent.

> If a future run wires the `Project`/`LabSession` layer as the primary lab object, the arc linkage
> should move to `Project.arcId` and the carry-forward fields in §2.4 should read from
> `LabSession.finishWhatChanged` / `finishNextStep` (their natural home) instead of the `DadLabReport`
> equivalents. The carry-forward *contract* (§2.4) is stable across either object.

### 2.2 `ConceptArc`

```ts
// Additive new type. Proposed collection: families/{familyId}/conceptArcs/{arcId}
export interface ConceptArc {
  id?: string
  title: string                       // "The Electricity Arc"
  conceptDomain: ConceptDomain        // see §4 — v1: a free-ish label, NOT a Learning-Map domain
  summary?: string                    // one-line "what the boys will understand by the end"
  steps: ArcStep[]                    // ordered concept beats
  childIds: string[]                  // both children by default (DATA-04 — see §6)
  narrativeHook?: string              // optional Stonebridge tie-in — see §5, evaluate don't assume
  createdFrom: ArcOrigin              // 'ai-suggested' | 'owner-authored'
  status: ArcStatus                   // 'active' | 'complete' | 'archived'
  createdAt?: string
  updatedAt?: string
  archivedAt?: string                 // mirrors DadLabReport soft-hide convention
}

export interface ArcStep {
  title: string                       // "Make a bulb light up" (concept beat)
  conceptBeat: string                 // the idea this step teaches, one sentence
  suggestedLabShape: string           // AI/owner sketch of the lab (type + driving question + rough plan)
  labType?: DadLabType                // optional pre-classification (science/engineering/adventure/heart)
  status: ArcStepStatus               // 'upcoming' | 'active' | 'done'
  reportId?: string                   // set when a DadLabReport is created/completed for this step
}
```

Companion `as const` enums (per the `erasableSyntaxOnly` rule in CLAUDE.md — no `enum` declarations):

```ts
export const ArcStatus = { Active: 'active', Complete: 'complete', Archived: 'archived' } as const
export type ArcStatus = (typeof ArcStatus)[keyof typeof ArcStatus]

export const ArcStepStatus = { Upcoming: 'upcoming', Active: 'active', Done: 'done' } as const
export type ArcStepStatus = (typeof ArcStepStatus)[keyof typeof ArcStepStatus]

export const ArcOrigin = { AiSuggested: 'ai-suggested', OwnerAuthored: 'owner-authored' } as const
export type ArcOrigin = (typeof ArcOrigin)[keyof typeof ArcOrigin]

// ConceptDomain: see §4. v1 recommendation is a light label, not a Learning-Map key.
```

### 2.3 Linkage (additive, optional — existing labs unaffected)

```ts
// Added to DadLabReport (the live object):
export interface DadLabReport {
  // …existing fields unchanged…
  arcId?: string          // the ConceptArc this lab belongs to (absent = one-off lab, today's behavior)
  arcStepIndex?: number   // which ArcStep this lab realizes
}

// Mirrored onto Project for forward-compat (§2.1) — inert until Project is wired:
export interface Project {
  // …existing fields unchanged…
  arcId?: string
  arcStepIndex?: number
}
```

Both fields are optional. A lab with no `arcId` behaves exactly as today. No migration, no backfill, no
change to existing reports.

### 2.4 Carry-forward — the heart of the feature

When a step's lab completes, the **next** step's lab suggestion must be regenerated against **what
actually happened**, not the original sketch. This is the wiring that turns a list of labs into an arc.

**Carry-forward contract — exactly what flows from step N → step N+1's suggestion prompt:**

| Signal | Source field (live `DadLabReport`) | Why the next lab needs it |
|---|---|---|
| What changed / what to do next | `DadLabReport.nextTime` | Owner's own "next step" steer — the strongest signal |
| What worked / high point | `DadLabReport.bestMoment` | Keep the momentum; reuse what engaged the boys |
| Parent reflection | `DadLabReport.dadReflection` | Tone/pacing adjustments (too hard, too fast, London lost interest) |
| Kid predictions vs. outcomes | per-child `childReports[childId].prediction` vs `.observation` | The core learning signal — did the concept land? Mispredictions define the next beat |
| Concept coverage so far | `ConceptArc.steps[].status` + each done step's `conceptBeat` | Tells the AI which beats are covered so it advances rather than repeats |

> **Substrate note.** On the (unwired) `LabSession` layer the natural carry-forward fields are
> `finishWhatChanged` / `finishNextStep` (`dadlab.ts:69-72`). v1 reads the `DadLabReport` equivalents
> above because those are the fields the live UI actually captures. If a step's report is missing
> `nextTime`/`observation` (they're optional today), carry-forward degrades gracefully to whatever is
> present — worst case, back to the current no-memory behavior for that one hop.

**Adaptive, not contractual.** Arc steps are a *plan*, not a promise. After each completed step, the
next step's `suggestedLabShape` is **regenerated** against the actual outcomes; the owner can accept,
edit, reorder, or drop a step. This mirrors the app's **coverage-not-pace** principle: the arc tracks
which concept beats are covered, never a schedule the family is failing against.

---

## 3. AI arc generation

Four entry points for "suggest an arc":

1. **From an interest** — "Lincoln is into motors" → an arc that ends at building a small motor.
2. **From a concept target** — "I want them to understand electricity" → static → circuit → switch → motor.
3. **From an existing completed lab** — "what arc could this lab have started?" → seeds `steps[0]` from
   an existing `DadLabReport` and proposes the beats that follow.
4. **Revisit / spiral** (added 2026-07-03, ETHOS-03) — the generator reads **completed arcs + their
   linked reports** and proposes a **next-level arc on a previously covered concept**: the *same*
   concept returned to with **a new modality or one more variable** (never more text / longer
   explanation — the ethos's leveling rule, §9). This is spiral pedagogy: revisit to deepen, not to
   re-teach. **Depends on slice-2 carry-forward** (it reads the prior arc's outcome fields to decide
   what "one more variable" should be). Distinct from #3, which seeds an arc from a *single* lab;
   revisit reasons across *whole completed arcs*.

### 3.1 Prompt design notes

- **CHARTER_PREAMBLE** is injected (as every task gets it — `contextSlices.ts:82-112`), so arcs inherit
  charter/ethos framing automatically.
- **Both-kids roles, post-ARCH-40 shape.** Design the arc-generation and per-step suggestion prompts
  against the **fixed** role shape `childRoles: { [childId: string]: string }` that ARCH-40 will
  introduce — **not** the current hardcoded `lincolnRole` / `londonRole`
  (`LabSuggestions.tsx:96,122`; `DadLabReport` `dadlab.ts:121-123`). **This is a hard ordering
  dependency**: any arc slice that emits or reads role fields must land *after* ARCH-40, or it will bake
  the same name-coupling ARCH-40 exists to remove. See §7.
- **Age-appropriate split (capability, not name).** Per CLAUDE.md's Lincoln-first / capability-gated
  rule, the prompt frames roles by capability: a hands-on *build/measure/explain* role and a
  *wonder/predict/draw* role, mapped to children by their profile (today: Lincoln builds, London
  predicts/draws), never hardcoded to the string "Lincoln"/"London".
- **MVD-compatible step sizing.** Each `suggestedLabShape` must fit a single Saturday and be
  MVD-runnable (45–90 min, household materials) — consistent with the existing suggestion prompt's
  constraints (`LabSuggestions.tsx:206-209`).

### 3.2 Where arc generation should run (not the `chat`/Haiku path)

The current suggestion flow uses the generic `chat` task on **Haiku** with **no dad-lab context**
(§1). Arc generation needs prior-lab history and concept reasoning, so it should:

- run on **Sonnet** (per CLAUDE.md's model-selection rule: complex reasoning → Sonnet), and
- receive the **`dadLabReports` context slice** (already defined and wired into `shellyChat` /
  `weeklyReview` — `contextSlices.ts:72,76`) plus the arc's own step history.

The cleanest home is a **new dedicated chat task** (e.g. `dadLabArc`) in the `CHAT_TASKS` registry
(`functions/src/ai/tasks/index.ts`) with its own context entry in `TASK_CONTEXT`, rather than
overloading the generic `chat` passthrough. This also gives the per-step **carry-forward** suggestion
(§2.4) a place to assemble the prior report's outcome fields into the prompt.

### 3.3 Adaptive regeneration

After each completed step, the next step's lab suggestion **regenerates** against actual outcomes
(§2.4) rather than serving the original sketch. Arc steps are a plan, not a contract
(coverage-not-pace). The owner always reviews before a regenerated step becomes a Planned lab — same
propose→confirm posture the rest of the app uses for AI-authored writes.

---

## 4. Where concepts live — ~~Open Decision~~ **RESOLVED (D1 = Option C)**

> **RESOLVED 2026-07-03 (Option C, owner-confirmed via decision session).** No concept map.
> An arc's `steps[].status` is its own coverage record — the arc *is* its own progress record.
> Option A (own arc-adjacent map) remains the explicit growth path; Option B (extend the academic
> Learning Map) is declined for v1 (FEAT-35/36 re-derivation coupling). Slice 1 (FEAT-44) ships no
> map structure.

Science/engineering concepts have **no coverage representation anywhere in the app** today — the
academic Learning Map's domains are reading / math / speech / writing only. This doc must decide where
arc concepts live. **Under every option below, this touches neither working levels, findings, nor
compliance counting.**

### Option A — Own concept map (arc-adjacent, additive)
A small science/engineering strand map that **parallels but does not touch** the academic Learning Map.
Arc steps map to strand nodes; completed steps mark coverage.
- **Pros:** gives science/engineering a real coverage surface; arcs across time roll up into a
  "concepts explored" view; future-proof.
- **Cons:** a whole new map to design, seed, and maintain; risk of a second half-built map alongside the
  academic one; more than v1 needs.

### Option B — Extend the Learning Map with a science domain
Add a science/engineering domain to the existing Learning Map.
- **Pros:** one unified coverage surface.
- **Cons:** **heaviest, and highest-risk.** The Learning Map has a re-derivation engine (FEAT-35/36)
  that recomputes coverage from working levels, sight-word thresholds, and snapshot priority-skills.
  Injecting a science domain means teaching that engine a new signal source (arc step completion) with
  no working-level/findings substrate behind it — a coupling into recently-stabilized machinery.
  **Explicit coupling risk; recommend against for v1.**

### Option C — No map; arcs are self-contained
Coverage lives entirely in the arc's own `steps[].status`. An arc *is* its own progress record.
- **Pros:** zero new coverage infrastructure; ships fastest; the arc's step list is already the natural
  unit of "what's covered"; nothing to keep in sync with another map.
- **Cons:** no cross-arc rollup ("all science concepts explored this year") until a map exists;
  coverage is per-arc, not global.

### Recommendation
**Option C for v1**, with **Option A as the explicit growth path.** Ship arcs as self-contained
step-status containers; if the family wants a cross-arc "concepts explored" surface later, add the
small arc-adjacent map (A) and have arcs feed it. **Avoid Option B** — the Learning Map re-derivation
engine coupling is not worth taking on for a feature whose coverage unit (the arc step) is already
self-describing.

---

## 5. Surfaces

- **Dad Lab page — active arc strip.** A compact strip showing the current arc, its steps as a
  collected/upcoming row, and the current step's next-Saturday lab **one tap away** (reuses the existing
  `handleSuggestionSelect` → Planned-report path, `DadLabPage.tsx:172-202`).
- **Kid view — additive progress only.** Arc progress is framed as **steps collected**, never a
  completion-percentage bar. Per the app's "mechanic carries the message" rule: additive/collecting
  mechanics only — **no fluctuating bars, no streaks, no percent-complete**. A step done is a beat
  earned; an arc is a small set of earned beats. (Kid-view work is also gated on ARCH-40 since
  `KidLabView.tsx` is where the `childReports[childName.toLowerCase()]` + `lincolnRole` coupling lives —
  `:50,267,369`.)
- **Weekly review / monthly book — narrative spines (follow-up, not v1).** Arcs make natural narrative
  spines ("this month the boys built the electricity arc"). The `dadLabReports` slice already feeds
  `weeklyReview` (`contextSlices.ts:76`) and the monthly book pipeline
  (`monthlyReviewData.ts:488-538`), so these consumers can read `arcId` later. **Noted as follow-up
  consumers, explicitly out of v1 scope.**

---

## 6. What this does **not** touch

- **Hours / XP / diamond credit — unchanged.** `syncComplianceHours`, `addXpEvent`, `addDiamondEvent`
  all remain both-children-by-design (DATA-04, `useDadLabReports.ts:65-71,104-124,144-161`). An arc is a
  planning/narrative layer; crediting still happens per completed `DadLabReport`, per child, exactly as
  today.
- **Compliance counting — unchanged.** No new hours math; arcs never write hours.
- **`DadLabReport` schema — only the two additive optional fields** (`arcId?`, `arcStepIndex?`, §2.3),
  plus whatever ARCH-40 changes independently. No field is removed, renamed, or repurposed.
- **The academic Learning Map — untouched** (Option C recommendation; Option B explicitly declined for
  v1).
- **Working levels & findings — untouched** under every §4 option.

---

## 7. Build plan (later runs)

Serialized slices, each a reviewable PR (never merged by the run — human merges):

1. **Types + arc CRUD + manual authoring.** Add `ConceptArc`/`ArcStep` types + enums, the
   `conceptArcs` collection + converter, `useConceptArcs` writer/reader, and owner-authored arc
   creation/edit UI. Add `arcId?`/`arcStepIndex?` to `DadLabReport` (and mirror on `Project`).
   **No ARCH-40 dependency** (no role fields touched).
   **✅ SHIPPED 2026-07-03 (FEAT-44).** Delivered scope: `ArcStepStatus`/`ArcOrigin` enums;
   `ConceptArc`/`ArcStep` types (per the field shape in this run — `domainLabel?` free text,
   `steps[].{title,conceptBeat,status,suggestedLabShape?,completedReportId?,completedDateKey?}`,
   `createdFrom` typed as the `ArcOrigin` union but only ever `'owner-authored'` in this slice);
   additive `arcId?`/`arcStepIndex?` on `DadLabReport`, mirrored inert on `Project`; `conceptArcs`
   collection + converter; `useConceptArcs` (reader filtering archived + create/update/archive-soft
   + pure `markStepDone`/`setActiveStep` transition helpers enforcing at-most-one-active with
   auto-advance); parent-side **Concept Arcs** authoring section on `DadLabPage` (additive collected
   step row — done filled / active highlighted / upcoming outlined, no percentages); and the report
   linkage — a `LabReportForm` "Part of an arc?" picker (active step preselected) plus a
   mark-step-done confirm on completion. **No AI, no suggestion, no kid-facing, no role-field, no
   credit/compliance/Learning-Map changes.** Deferred to slices 2–4 (all ARCH-40-gated except the
   arc-adjacent map growth path): carry-forward suggestion, AI arc generation, kid-view strip.
2. **Arc-aware lab suggestion with carry-forward.** Wire the per-step suggestion to read the prior
   step's outcome fields (§2.4) and the arc's covered beats. **Depends on ARCH-40** — this slice emits
   per-step role guidance and must use the `childRoles` shape, not `lincolnRole`/`londonRole`.
3. **AI arc generation.** New dedicated `dadLabArc` task (Sonnet, `dadLabReports` slice) with the three
   entry points (§3.1) and adaptive regeneration (§3.3). **Depends on ARCH-40** for role fields.
4. **Kid-view arc strip.** Additive collected-steps surface (§5). **Depends on ARCH-40** —
   `KidLabView.tsx` carries the name-coupling ARCH-40 fixes.

**Ordering dependency (explicit):** ARCH-40 lands the `childRoles`-keyed role shape. Any slice that
emits or reads role fields (2, 3, 4) must land **after** ARCH-40 or it re-introduces the exact
name-coupling ARCH-40 removes. Slice 1 is independent and can proceed first.

> **✅ ARCH-40 gate CLEARED (2026-07-03).** ARCH-40 shipped the name-agnostic role shape:
> `DadLabReport.childRoles: { [childId]: string }` (legacy `lincolnRole`/`londonRole` kept as
> `@deprecated` read-only and mapped forward by `normalizeChildRoles`), plus shared
> `parseChildRoles`/`buildRoleRequestLines`/`resolveChildReport` helpers in
> `src/features/dad-lab/childRoles.ts`. **Slices 2–4 are unblocked** and **must** emit/read role
> guidance through `childRoles` (keyed by childId) — never `lincolnRole`/`londonRole` or
> name-keyed `childReports` lookups. See ledger `ARCH-40`.

---

## 8. Open decisions summary

| # | Decision | Options | Recommendation |
|---|---|---|---|
| D1 | Where do arc concepts live? | A: own arc-adjacent concept map · B: extend Learning Map w/ science domain · C: self-contained arc step statuses | **RESOLVED 2026-07-03 → C** (owner-confirmed): self-contained arc step statuses, no map; A is the growth path, B declined (FEAT-35/36 coupling). Shipped in FEAT-44 slice 1. |
| D2 | Arc linkage target | `DadLabReport` (live object) · `Project` (unwired scaffold) | **`DadLabReport`** live; mirror inert `arcId?` on `Project` for forward-compat (§2.1) |
| D3 | Carry-forward source fields | `DadLabReport` finish fields (`nextTime`/`bestMoment`/`dadReflection` + per-child `prediction`/`observation`) · `LabSession` `finishWhatChanged`/`finishNextStep` (unwired) | **`DadLabReport` fields** (what the live UI captures); contract stable if Project layer is later wired |
| D4 | Arc generation runtime | reuse generic `chat`/Haiku (no context) · new dedicated `dadLabArc` task (Sonnet + `dadLabReports` slice) | **New dedicated task** — arc reasoning needs history + Sonnet |
| D5 | Narrative hook (Stonebridge tie-in) | required · optional/evaluate · omit | **Optional** (`ConceptArc.narrativeHook?`) — evaluate per-arc, don't force |
| D6 | Kid-view progress mechanic | collected-steps (additive) · percent/bar/streak | **Collected-steps only** — "mechanic carries the message"; no fluctuating bars |
| D7 | ARCH-40 ordering | build role-touching slices before / after ARCH-40 | **After** — slices 2/3/4 hard-depend on the `childRoles` shape (§7) |

---

*Sections 1–8 above are design only. The §9 addendum below ships code (ETHOS-03) — the shared ethos
block + the Dad Lab model bump — while the arc build slices (2–4) remain design-only and
human-assigned per the operating model (`CLAUDE.md`).*

---

## 9. Addendum (2026-07-03) — ETHOS-03: "concrete-first, oral science" ethos block

**Status: shipped this run** (constant + Dad Lab application + model bump). This is the pedagogy
contract every arc/lab generation obeys — **slices 2–4 must include it verbatim** (it is a shared
constant, not copied text; import the single source).

### 9.1 The ethos block (canonical — the pedagogy contract)

Exported once from `src/core/ai/prompts/concreteFirstOralScience.ts` as `CONCRETE_FIRST_ORAL_SCIENCE`
and prepended to both Dad Lab suggestion prompts (`buildLabSuggestionsPrompt` /
`buildLabIdeaPrompt` in `src/features/dad-lab/dadLabPrompts.ts`):

```
CONCRETE-FIRST, ORAL SCIENCE — rules for all child activity generation:
- Objects before words; do before explain. Every concept must arrive as something a child can hold, throw, stomp, drop, or feel.
- The scientific method is oral and embodied: predict aloud (or point, or draw) -> try it -> observe aloud -> the adult scribes. Never require a child to read or write anything.
- One concept per activity, sayable in one sentence of kid words. No technical vocabulary unless a child asks first.
- "Change one thing and try again" IS the experiment — name it that way.
- Failure is data: where it fits, include one make-it-fail-on-purpose beat and ask why aloud.
- Leveling up = the same concept in a new modality or with one more variable — never more text, never longer explanations.
- A child's answer may be short, pointed at, drawn, or demonstrated; restating it in fuller words is the adult's job, not the child's.
```

**Child-agnostic by design** — no child names, no diagnosis language. The name-coupling defect class
was just closed in **ARCH-40**; the block deliberately does not reintroduce it. Per-child supports
arrive later via context enrichment (§9.2), not by hardcoding into this block. When slice 3 moves arc
generation server-side into the dedicated `dadLabArc` task, that task **reuses this same constant** —
keep a single source; do not fork a server-side copy silently.

### 9.2 Enrichment sequencing decision (owner, 2026-07-03)

Context enrichment is **deferred to FEAT-41 slice 2** — this run adds **no per-child data** to any
prompt. The block is static and child-agnostic. The ordered plan:

| Stage | What | When |
|---|---|---|
| **Ethos-first** | Static `CONCRETE_FIRST_ORAL_SCIENCE` block | **Shipped (this run)** |
| Snapshot supports + working levels | Injected via slice 2's context slice (per-child) | **Slice 2** |
| Disposition | **Compressed-only, if token budget allows** | Slice 2 (conditional) |
| Eval findings | **Excluded** — academic noise for concrete-lab generation | — |

Rationale: the ethos is the invariant pedagogy rail (ship it now, cheaply, everywhere); per-child
tuning is data-plumbing that belongs with the slice-2 context work and shouldn't block the rail.

### 9.3 Third generation entry point — "revisit / spiral" (slice 3)

Added to §3 as entry point **#4**: the generator reads completed arcs + their linked reports and
proposes a next-level arc on a previously covered concept — same concept, **new modality or +1
variable** (the ethos's leveling rule in §9.1). Spiral pedagogy: revisit to deepen. **Depends on
slice-2 carry-forward** (reads prior outcome fields to choose the added variable). Design note only —
no build this run.

### 9.4 Future reuse (named, not built)

The `CONCRETE_FIRST_ORAL_SCIENCE` block is intended for reuse by **other kid-activity generators** —
the Help Card `playIt` generator and workshop challenge generation — as **separate, later runs**. Named
here so the single-source intent is on record; not built now. Each reuse imports the one constant (no
copy). Server-side consumers (the future `dadLabArc` task, §3.2) reuse it too — see the doc comment on
the constant.

---

*This is a design doc. Sections 1–8 remain design-only; §9 records the shipped ETHOS-03 rails plus the
slice-2/slice-3 sequencing decisions. Build slices are human-assigned per the operating model
(`CLAUDE.md`).*
