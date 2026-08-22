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
| **Current academic state** — priority skills, supports, stop rules, conceptual blocks, working levels | `skillSnapshots/{childId}` | Eval Apply (`EvaluateChatPage.handleSaveAndApply`), quest end (`useQuestSession`), manual edit (`SkillSnapshotPage`); **both scan write-throughs** (`useCertificateProgress` + `CertificateScanSection`) and the **Shelly chat portal** (Tier C Option 2), the latter three via the central `evaluate/skillSnapshotWrites.ts` | plan, quest, generateStory, disposition, scan, shellyChat, weeklyReview AI tasks; Skill Snapshot UI | **THE authority for "what to teach next."** The central helper exists now (`skillSnapshotWrites.ts`, shipped with FUNC-02) and every writer added since routes through it — **additive-only**, never a downgrade. The three original inline writers were deliberately not migrated; that remainder is tracked as **ARCH-12**, not implied change #2. |
| **Curriculum coverage / node mastery** — "what's been covered" | `childSkillMaps/{childId}` | `updateSkillMapFromFindings` (quest/eval/worksheet-scan findings) | Learning Map UI + Curriculum Tab (real-time `useSkillMap`) — **not read directly by any AI task** | Distinct from working levels — it's graph coverage, not skill grade. AI tasks see coverage only indirectly via the `workbookPaces`/`activityConfigs` slices. |
| **Curriculum position** — lesson/page per activity | `activityConfigs/{childId}` (`curriculumMeta`) | planner setup, certificate scan (`useCertificateProgress`), Progress → Curriculum (`CurriculumTab` / `AddActivityDialog` via `useActivityConfigs`), **Shelly chat portal** (FEAT-143 `curriculumActions` — add / complete / set-position, confirm-gated) | quest (starting level via `workbookPaces`), planner, scan + weeklyReview AI tasks, Curriculum UI | "What page are we on." Numeric, not a skill judgement. Every writer here shares one core, `core/firebase/activityConfigWrites.ts` (FEAT-143) — the chat opened no second lane. The same doc's `defaultMinutes` is written by FEAT-135's narrow `updateActivityMinutes` helper; that is activity *config*, not position. **No delete from the chat** — completion is its only removal. |
| **Disposition** — how he approaches learning | `children/{childId}.dispositionCache` (+ `dispositionOverrides`) | `DispositionProfile.tsx` AI regen (+ parent override field) | Disposition UI, shellyChat | **Derived cache, NOT authoritative.** Recomputed on demand from day logs; cache TTL ~24h; may lag. |
| **Milestones** | *(no Firestore collection — computed at render from blocks/XP/quests/certs)* | — | Progress → Milestones | Not a store; makes no authority claim. (The brief's `milestoneProgress` collection does not exist in code.) |
| **Ladders** | `ladderProgress` | *(deprecated — none)* | portfolio scoring only | Data-only, retained for history (ARCH-07). |

### Execution-record stores the portal can now write (added after the 2026-05-30 ruling)

The table above answers *"where is Lincoln"* and its seven dimensions are unchanged by the
ruling. But the table's working purpose is the second question — *"when Shelly edits X, which
store is written?"* — and since the ruling the Shelly portal has grown three write lanes into
stores that had no row here at all. They are **not** "where is Lincoln" judgements (nothing
below is an authority on what to teach next), which is why they sit in their own block rather
than being folded in above. They are listed because a writer with no row is exactly the gap
this doc exists to close.

| Dimension | Authoritative store | Written by (only) | Read by | Notes |
|---|---|---|---|---|
| **Daily execution record** — what was planned/done on one day, and the minutes behind it | `days/{dateKey}` (dayLog) | Today (`useDayLog`), Apply (`planner-chat/applyWeekPlan.ts`), live-day edits (`today/liveDayEdit.ts` — Today's edit mode, the planner's post-Apply live-week edit (FEAT-138) **and** the chat's FEAT-142 day actions), watch-to-day (`watch/writeWatchItemToDay.ts`), quest auto-complete, workshop, the Dev Sunday sweep | Today, hours + compliance aggregation, weeklyReview / monthlyReview, disposition | **Every one of these routes through `today/dayWriteGuard.ts`** — there is no second write path to a day document, and the FEAT-114 preservation guard + FEAT-111 retain rules hold for all of them. This store feeds the `hours` line, so a careless write is a compliance bug: the two audited failures in this app's history (FEAT-111, FEAT-114's P0) were both a second copy of a day-write that forgot a rule. |
| **Planned week** — a child's goals for a week, and that week's day rows | `weeks/{weekStart}` + the `days` writes it drives | **`planner-chat/applyWeekPlan.ts` — the single Apply** (FEAT-150), called by Plan My Week and by the chat's next-week lane (`shelly-chat/writeNextWeekDraft.ts`); plus the planner's own redo-plan goal removal | Today's week focus, planner, weeklyReview | FEAT-150 extracted Apply out of `PlannerChatPage` precisely so the chat would not become a *second* implementation of it. The chat adds exactly one rail the shared module cannot hold — **it may write only the NEXT school week**, re-resolved at the write, never the live week the family is working through. Applying a chat draft is a second, separate tap with **no `ChatAction` behind it**. |
| **Curated media** — the videos the kids may watch | `watchLibrary/{autoId}` (family-scoped, `childId \| 'both'`) | parent vet-in form (`useWatchLibrary`), the planner's + Today's inline vet-in, **Shelly chat portal** (FEAT-149 `vetInVideo`, confirm-gated) — all through the shared `addWatchVideo` | `/watch` route, `WatchLibraryPicker` (planner + Today) | Parent-gated on every path; kids never curate. Additive: retire (status flip) is the only removal, and the chat cannot un-retire, delete, or edit a library entry — **vet-in is its only library write**. Stores a validated `youtubeId`, never a free-form URL. |

**Write-through rules (one-directional, via central helpers):**

1. **Scan / curriculum advance → Skill Snapshot** *(closes FUNC-02)*: a scan currently
   writes `childSkillMaps` and/or `activityConfigs` but never `skillSnapshots`. Two scan
   paths need a write-through: the **certificate path** (`useCertificateProgress.applyUpdate`,
   which already holds `suggestedSnapshotUpdate.masteredSkills` from the scan AI) and the
   **worksheet path** (`CertificateScanSection`, which calls `updateSkillMapFromFindings`).
   The write-through should mark the matching `skillSnapshots` conceptual block `RESOLVING`
   (or `RESOLVED` on mastery) / fold `masteredSkills` into priority-skill status — additive,
   never downgrading.
2. **Eval Apply → Skill Snapshot**: unchanged; it is the canonical academic-state writer.
3. **Disposition** reads day logs and regenerates its own cache; it **never writes** any
   other store.
4. **Profile identity** is human-only (Settings / confirmed portal edits); no automated
   process writes `children` identity fields.

---

## Implied code changes (hand to Claude Code as PROMPT_FIX runs)

| # | Change | Target | Issue |
|---|---|---|---|
| 1 | Wire scan → snapshot write-through on both scan paths. Certificate: in `useCertificateProgress.applyUpdate`, fold `suggestedSnapshotUpdate.masteredSkills` into `skillSnapshots` (mark matching blocks RESOLVING/RESOLVED, additive). Worksheet: alongside the `updateSkillMapFromFindings` call in `CertificateScanSection`, apply the same write-through. Add tests. | `src/core/hooks/useCertificateProgress.ts:115-250`; `src/features/progress/CertificateScanSection.tsx:49-76`; scan AI shape at `functions/src/ai/tasks/scan.ts:94`, `src/core/types/planning.ts:728` | **FUNC-02** |
| 2 | Create a single `skillSnapshots` writer module (e.g. `src/features/evaluate/skillSnapshotWrites.ts`) with an additive, block-merging, idempotent `applyToSnapshot()`, and migrate the three current inline writers onto it so every academic-state write goes through one chokepoint. | `EvaluateChatPage.tsx:492-614`, `useQuestSession.ts:874-971`, `SkillSnapshotPage.tsx:114-150` | FUNC-01 hardening |
| 3 | Document the authority table as JSDoc on each owning collection helper so the seams are discoverable at the call site. | `src/core/firebase/firestore.ts` | FUNC-01 hardening |
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

> **Amended 2026-08-22 (DOC-14).** "Everything else is read-only to the portal" was true when
> written and is not any more. The portal's write surface has since been widened three times,
> each time by a separate human-assigned run and each time onto an **existing** writer rather
> than a new lane: `days` (FEAT-142, via `today/liveDayEdit.ts`), `watchLibrary` (FEAT-149, via
> `addWatchVideo`), and `weeks` + its day rows (FEAT-150, via the extracted
> `planner-chat/applyWeekPlan.ts`). See the execution-record block above for what each may do.
> The **rule** the sentence was protecting is intact and is the one to carry forward: the portal
> writes only through a store's already-owning writer, only behind a confirm tap, and never
> invents a second lane. What changed is the list, not the contract. The two prohibitions are
> also unchanged: Shelly still must never write `dispositionCache` (derived) or Milestones
> (computed).

---

## Build prompt (ready to paste into Claude Code web)

> **Run for ISSUE_ID: FUNC-02 (implements the FUNC-01 write-through seam).**
>
> Per the FUNC-01 ruling (`docs/review/DECISION_FUNC-01_source_of_truth.md`), implement the
> scan → Skill Snapshot write-through. Today a scan writes `childSkillMaps` and/or
> `activityConfigs` but never `skillSnapshots`, so the curriculum map and the snapshot can
> silently disagree. Note there is **no central `skillSnapshots` writer yet** — start by
> extracting one.
>
> 1. Create `src/features/evaluate/skillSnapshotWrites.ts` exporting a pure reducer
>    `applyToSnapshot(snapshot, update)` and a thin Firestore writer. It must be additive,
>    block-merging by stable block ID, and idempotent: never downgrade a block, never touch
>    unrelated blocks, no-op when no matching block exists, and tolerate a missing snapshot
>    doc (`getDoc` → merge).
> 2. Wire the **certificate scan path**: in `src/core/hooks/useCertificateProgress.ts`
>    (`applyUpdate`, ~115-250) it already has `result.suggestedSnapshotUpdate.masteredSkills`
>    in hand and writes only `activityConfigs.curriculumMeta` — add a call into the new
>    writer to fold `masteredSkills` into `skillSnapshots` (mark matching `ADDRESS_NOW`
>    conceptual blocks `RESOLVING`, and `RESOLVED` when the milestone marks the skill
>    mastered).
> 3. Wire the **worksheet scan path**: in `src/features/progress/CertificateScanSection.tsx`
>    (~49-76), alongside the existing `updateSkillMapFromFindings(...)` call, apply the same
>    write-through from the scan's mastered findings.
> 4. (Optional, if low-risk) migrate the three existing inline snapshot writers
>    (`EvaluateChatPage.handleSaveAndApply`, `useQuestSession` end-session, `SkillSnapshotPage`)
>    onto the new module so all academic-state writes share one chokepoint. If risky, leave
>    them and just note it — do not regress the eval/quest merge behavior.
> 5. Add unit tests for the reducer: mastered skill → block RESOLVING/RESOLVED; no matching
>    block → no-op; repeated scans idempotent; missing snapshot tolerated. Reference the scan
>    response shape at `functions/src/ai/tasks/scan.ts:94` and `src/core/types/planning.ts:728`.
> 6. Run `npx tsc -b`, `npm run lint`, `npm test` (and the functions suite if touched).
>    Commit on the working branch with a `feat:`/`fix:` prefix. Do **not** open a PR unless
>    asked.
>
> Out of scope for this run: the Tier C portal, collapsing stores, or any aggregator
> read-model.

---

## Ledger update

`REVIEW_HOME_BASE.md` §6 FUNC-01 → **RESOLVED-WITH-DECISION** (this doc). FUNC-02 →
**FIXED** (commit `b60c3d6`): the scan → Skill Snapshot write-through seam (implied change
#1) shipped via the new central writer `src/features/evaluate/skillSnapshotWrites.ts`,
wired into both scan paths. Implied change #2 (migrating the three inline snapshot writers
onto the central module) was intentionally deferred and is tracked as **ARCH-12**.
