# Decision Record — FUNC-01: The "Where Is Lincoln" Source of Truth

> **Status:** RESOLVED-WITH-DECISION · **Band:** 2 · **Decided:** 2026-05-30
> **Decision session inputs:** this brief + `REVIEW_HOME_BASE.md` + `docs/first-principles-system-review.md` + `ARCHITECTURE_AUDIT_2026-05.md §2.1`
> **Produces:** the ruling below, the implied code changes, and a ready-to-run build prompt for Claude Code. No code was written in the decision session itself.

---

## The ruling (one paragraph)

**We adopt Model 2 — Layered ownership with named write-through.** No single store
becomes "the profile." Instead each surface owns exactly one dimension of "where is
Lincoln," with no overlapping claims, and the few places where a change in one store
must be reflected in another are handled by **explicit, one-directional write-through**
through centralized write helpers. Concretely: **`children/{childId}`** owns *stable
identity* (level band, strengths, motivators, supports, speech/ND notes); **`skillSnapshots/{childId}`**
is the **single authority for current academic state** (priority skills, supports, stop
rules, conceptual blocks, working levels) and is the answer to "what do we teach next";
**`childSkillMaps/{childId}`** owns *curriculum coverage / node mastery* ("what has been
covered"); **`activityConfigs/{childId}`** owns *curriculum position* ("what lesson/page
we're on"); **`dispositionCache`** on the child doc is an explicitly **derived cache**
(regenerated from day logs, never authoritative); **Milestones** are computed at render
(not a store); **Ladders** stay deprecated/data-only. The one missing seam — a scan
advancing the Learning Map without telling the Skill Snapshot (FUNC-02) — is closed by a
write-through at the already-stubbed point in `useSkillMapWrite.ts`.

### Why Model 2 (not 1 or 3)

- **Not Model 1 (collapse into one canonical store).** The dimensions are genuinely
  different shapes: working-level skill grades, numeric lesson position, curriculum-graph
  node status, and qualitative disposition narrative. Forcing them into one document is a
  large migration with no pedagogical payoff and it fights the existing collection design.
- **Not Model 3 (add a "Lincoln Now" aggregator read-model) — yet.** An aggregator is
  attractive for the read side, but it adds a new surface to maintain and does **not**
  answer the question Tier C actually needs answered: *"when Shelly edits X, which store
  is written?"* Layered ownership answers that directly. We **reserve Model 3** as a
  future convenience only if read-side divergence keeps causing UX confusion after the
  write-through seams are in place. (If we build it later, it composes — it does not
  replace — the layers below.)
- Model 2 is the "no heroics / ship thin slices" choice: it keeps every store where it is,
  draws bright lines, and adds the minimum write-through to stop silent disagreement.

---

## Authority table (the seams)

| Dimension | Authoritative store | Written by (only) | Read by | Notes |
|---|---|---|---|---|
| **Stable identity** — level band, strengths, motivators, supports, speech/ND notes | `children/{childId}` (childProfile) | Settings (human) · Tier C portal (human-confirmed) | charter context everywhere | The "who Lincoln is" layer. Slow-changing, human-owned. |
| **Current academic state** — priority skills, supports, stop rules, conceptual blocks, working levels | `skillSnapshots/{childId}` | Eval Apply, quest end, scan write-through — **all via `skillSnapshotWrites.ts`** | plan, quest, disposition, shellyChat, weeklyReview AI tasks; Skill Snapshot UI | **THE authority for "what to teach next."** Every academic-state writer routes through the central helper. |
| **Curriculum coverage / node mastery** — "what's been covered" | `childSkillMaps/{childId}` | `useSkillMapWrite` (scan findings) | Learning Map UI; `scan` task curriculum context | Distinct from working levels — it's graph coverage, not skill grade. |
| **Curriculum position** — lesson/page per activity | `activityConfigs/{childId}` | planner setup, scan advance | quest (starting level via `workbookPaces`), planner, Curriculum UI | "What page are we on." Numeric, not a skill judgement. |
| **Disposition** — how he approaches learning | `children/{childId}.dispositionCache` | `DispositionProfile.tsx` AI regen (+ parent override field) | Disposition UI, shellyChat | **Derived cache, NOT authoritative.** Recomputed from day logs; may lag. |
| **Milestones** | *(none — computed at render)* | — | Progress → Milestones | Not a store; makes no authority claim. |
| **Ladders** | `ladderProgress` | *(deprecated — none)* | portfolio scoring only | Data-only, retained for history (ARCH-07). |

**Write-through rules (one-directional, via central helpers):**

1. **Scan / curriculum advance → Skill Snapshot** *(closes FUNC-02)*: when
   `useSkillMapWrite` advances a node to `mastered`/`practicing`, write-through to
   `skillSnapshots` conceptual blocks — mark a matching `ADDRESS_NOW` block `RESOLVING`
   (or `RESOLVED` on mastery) — using the existing `applyScanToSnapshot` /
   `writeConceptualBlocks` helpers in `skillSnapshotWrites.ts`. The site is already
   stubbed at `useSkillMapWrite.ts:22`.
2. **Eval Apply → Skill Snapshot**: unchanged; it is the canonical academic-state writer.
3. **Disposition** reads day logs and regenerates its own cache; it **never writes** any
   other store.
4. **Profile identity** is human-only (Settings / confirmed portal edits); no automated
   process writes `children` identity fields.

---

## Implied code changes (hand to Claude Code as PROMPT_FIX runs)

| # | Change | Target | Issue |
|---|---|---|---|
| 1 | Wire scan → snapshot write-through at the stubbed site; mark matching conceptual blocks RESOLVING/RESOLVED on node advance. Reuse `applyScanToSnapshot`/`writeConceptualBlocks`. Add tests. | `src/features/progress/useSkillMapWrite.ts:22`; `src/features/evaluate/skillSnapshotWrites.ts` | **FUNC-02** |
| 2 | Enforce "all academic-state writes route through `skillSnapshotWrites.ts`" — audit any direct `updateDoc`/`setDoc` on `skillSnapshots` outside that module and migrate them. | `src/features/evaluate/*` | FUNC-01 hardening |
| 3 | Document the authority table as code comments/JSDoc on each owning collection helper in `firestore.ts` so the seams are discoverable at the call site. | `src/core/firebase/firestore.ts` | FUNC-01 hardening |
| 4 | Tier C portal routing map (see green-light below) — when built, route each editable field to its owning store. | Shelly Chat portal | Tier C |

---

## Green-light for Shelly Chat portal (Tier B/C)

Tier C ("Shelly updates the profile") is **unblocked**, with this routing contract:

- **Identity edits** (strengths, motivators, supports, level band) → `children/{childId}`,
  human-confirmed.
- **"What to teach next" / blocks / supports / stop rules** → `skillSnapshots/{childId}`,
  **only via `skillSnapshotWrites.ts`**, human-confirmed.
- **Curriculum position** ("we're on lesson N") → `activityConfigs/{childId}`.
- **Shelly must NEVER write** `dispositionCache` (it is derived — offer "regenerate" not
  "edit") or Milestones (computed).

**Exact green-lit write targets for Tier C:** `children` (identity) and `skillSnapshots`
(academic state, via the central helper), both behind a human-confirm step. Position edits
to `activityConfigs` are a Tier B convenience. Everything else is read-only to the portal.

---

## Build prompt (ready to paste into Claude Code web)

> **Run for ISSUE_ID: FUNC-02 (implements the FUNC-01 write-through seam).**
>
> Per the FUNC-01 ruling (`docs/review/DECISION_FUNC-01_source_of_truth.md`), implement the
> scan → Skill Snapshot write-through.
>
> 1. In `src/features/progress/useSkillMapWrite.ts`, after the `childSkillMaps` write
>    (the stub at line ~22), call a write-through into `skillSnapshots`. Compute which
>    curriculum nodes changed status to `mastered`/`practicing` in this write, map them
>    back to the conceptual blocks they correspond to, and update those blocks: mark
>    `ADDRESS_NOW` → `RESOLVING` on `practicing`, and → `RESOLVED` on `mastered`. Do the
>    snapshot write **only** through the existing helpers in
>    `src/features/evaluate/skillSnapshotWrites.ts` (`applyScanToSnapshot` /
>    `writeConceptualBlocks`) — do not add a new direct `skillSnapshots` writer.
> 2. The write-through must be additive and idempotent: never downgrade a block, never
>    overwrite blocks for unrelated nodes, and no-op cleanly when no matching block exists.
> 3. Guard against the race the audit named (two writes per scan): make the snapshot
>    update a `getDoc` → merge, and tolerate a missing snapshot doc.
> 4. Add unit tests: node advance → correct block transition; no matching block → no-op;
>    mastery → RESOLVED; repeated scans are idempotent. Co-locate as
>    `useSkillMapWrite.test.ts` (or extend the pure reducer's test).
> 5. Update the `// FUNC-02` comment to point at the ruling instead of describing a gap.
> 6. Run `npx tsc -b`, `npm run lint`, `npm test` (and the functions suite if touched).
>    Commit on the working branch with a `feat:`/`fix:` prefix. Do **not** open a PR unless
>    asked.
>
> Out of scope for this run: the Tier C portal, collapsing stores, or any aggregator
> read-model.

---

## Ledger update

`REVIEW_HOME_BASE.md` §6 FUNC-01 → **RESOLVED-WITH-DECISION** (this doc). FUNC-02 stays
**OPEN** as the implementing fix run, now green-lit with the build prompt above.
