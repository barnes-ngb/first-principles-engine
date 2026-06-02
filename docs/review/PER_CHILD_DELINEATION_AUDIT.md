# Per-Child Delineation Audit — before wiring London

> **What this is:** a read-only recon of whether the app **correctly delineates per-kid data
> everywhere** — profile switching, maps/skills, hours, XP, all of it — *before* London is wired further.
> Wiring London onto a foundation that leaks across kids would bake the bug into a second profile.
> **Type:** READ-ONLY audit. No code or behavior changed. Output = this doc + additive ledger rows.
> **Created:** 2026-06-02 · **Companion to:** `docs/review/REVIEW_HOME_BASE.md` (ledger),
> `docs/LONDON_BACKLOG.md` (London register), `CLAUDE.md` › AI Development Operating Model.

---

## 0. Headline

**The per-child foundation is sound.** Every academic/evidence domain is keyed per child, and the
active-child switch propagates to both reads and writes across the app. The two switch-propagation
risks flagged during recon both resolved on inspection — **Records is reactive (filters by active
child)**, and **Dad Lab is a shared multi-child activity by design** (not a switching bug). No
cross-kid *read* leakage was found.

The real gaps are the two already-known ones, plus two narrow **compliance/XP crediting** observations
that touch invariants and therefore stop for a human decision:

1. **Profile demographics gap (ARCH-15, already logged).** Children are auto-created with `id` + `name`
   only — no `birthdate`/`grade`/learner-profile — so capability gates have no demographic signal and
   must key on snapshot/calibration data. This is the #1 thing to settle before London wiring.
2. **No `londonDefaults` learner profile (LONDON_BACKLOG, Not-built).** London's eval→snapshot infra is
   *Ready*, but he has no starting profile, so his snapshot is empty until a parent seeds it manually.
3. **Dad Lab credits hours + XP to *every* child on completion** regardless of participation
   (DATA-04 below — propose-and-confirm).
4. **Unattributed `hoursAdjustments` (no `childId`) count toward *every* child's compliance summary**
   (DATA-05 below — NEEDS-DATA / propose-and-confirm).

Bottom line: **it is safe to wire London**, provided the profile-init / `londonDefaults` work
(ARCH-15 + LONDON_BACKLOG) is done first so his capability gates have real per-kid signal, and the two
DATA observations are decided.

---

## 1. The per-kid model (Step 0)

### Active-child selection — single source of truth

- **Storage:** React state in `useChildren()` (`src/core/hooks/useChildren.ts`), `selectedChildId`,
  persisted to `localStorage` key `fpe_active_child_id` (`useChildren.ts:10`). Survives reloads.
- **Canonical accessor:** `useActiveChild()` (`src/core/hooks/useActiveChild.ts:32-78`) wraps
  `useChildren()` and is the documented single source of truth. Exposes `activeChildId`, `activeChild`,
  `setActiveChildId`. **Nearly every page reads the active child through this hook.**
- **Kid profiles lock to self:** when logged in as Lincoln/London, `useActiveChild` matches the
  profile to the child record by name and makes `setActiveChildId` a no-op
  (`useActiveChild.ts:46-67`). Switching is only available to the Parents profile.
- **Parent fallback chain** (`useChildren.ts:123-132`): keep current → restore from localStorage →
  profile match → **first child** (`loaded[0]?.id`). The terminal fallback is *first child*, not a
  hardcoded Lincoln. Safe default.

**No parallel/competing "current child" path was found.** Name checks (`isLincoln =
name.toLowerCase() === 'lincoln'`) exist only for **cosmetic theming / AI tone**
(`MyAvatarPage.tsx:199`, `BookshelfPage`, `KidTodayView`, `generateMaterials.ts`), never for data
routing or access — consistent with the "gate on capability, never on name" policy.

### Child profile shape (`src/core/types/family.ts:14-44`)

```ts
interface Child {
  id: string
  name: string
  birthdate?: string      // optional — usually absent (see ARCH-15)
  grade?: string          // optional — usually absent (see ARCH-15)
  settings?: FamilySettings
  dayBlocks?: DayBlockType[]
  routineItems?: RoutineItemKey[]
  voiceInputEnhanced?: boolean
  motivators?: string     // soft profile (human-owned)
  interests?: string
  strengths?: string
}
```

`isLincoln` / `ageGroup` / `themeStyle` are **not** on `Child`. `ageGroup`/`themeStyle` live on the
separate `avatarProfiles` doc; `isLincoln` is derived from name at render time. All cosmetic.

### Creation paths

- **Auto-create** (`useChildren.ts:99-116`): on first login, Lincoln + London are created with
  **only** `{ id, name, createdAt }` (`useChildren.ts:110`). **Confirms ARCH-15.**
- **Manual** (`src/components/AddChildDialog.tsx:34-81`): accepts name (required), age → `birthdate`,
  optional `baselineReading`/`baselineMath`. So demographics *can* be set manually, but the two real
  children were auto-created without them.

### How collections are keyed per child

| Mechanism | Collections |
|---|---|
| Doc ID == `{childId}` | `skillSnapshots`, `childSkillMaps`, `avatarProfiles`, cumulative `xpLedger` doc |
| Composite doc ID `{date}_{childId}` | `days`, `dailyPlans` |
| `childId` field + query filter | `hours`, `artifacts`, `evaluations`, `books`, `scans`, `evaluationSessions`, `lessonCards` |
| Composite doc ID `{childId}_{word}` | `sightWordProgress` |
| Composite doc ID `{week}_{childId}` | `plannerConversations` |
| Stored on the `children/{childId}` doc | `dispositionCache`, `dispositionOverrides` |
| **Family-scoped (date-keyed), per-child via array** | `weeks` (one doc per week; per-child `childGoals[]`) |
| **Family-scoped (shared activity)** | `dadLabReports` (per-child via `childReports` map + roles) |

---

## 2. Per-domain delineation matrix (Step 1)

Legend: **Per-kid?** = correctly keyed/scoped per child · **Switch?** = active-child switch
propagates to reads **and** writes · **Risk** = leakage / hardcoded / default-to-Lincoln.

| Domain | Per-kid? | Switch? | Notes / risk |
|---|---|---|---|
| **skillSnapshots + workingLevels + questActivity** | ✅ Yes (doc id `{childId}`) | ✅ Yes | `SkillSnapshotPage` clears + re-subscribes on `activeChildId`; `skillSnapshotWrites` writes `doc(…, childId)`. questActivity marker nested + domain-keyed. No leak. |
| **hours / day logs + compliance dashboard** | ✅ Yes (`childId` field; days composite id) | ✅ Yes | `RecordsPage` filters all sources by `activeChildId` via `useMemo`; `computeHoursSummary(…, activeChildId)`. Fetch is family-wide-then-filter — **reactive** (recon false-positive cleared). ⚠️ See DATA-05 (null-childId adjustments) + DATA-04 (Dad Lab crediting). |
| **milestones / maps / foundation map** | ✅ Yes (`childSkillMaps` doc id `{childId}`) | ✅ Yes | `useSkillMap(childId)` re-loads on child change; curriculum nodes are global, status is per-child-per-node. No leak. |
| **books + sightWordProgress** | ✅ Yes (books `childId` filter; sight words `{childId}_{word}`) | ✅ Yes | `useBookshelf` re-queries on childId; sight-word docs prefix-filtered defensively. `isLincoln` is cover-theme only. No leak. |
| **avatarProfiles + xpLedger** | ✅ Yes (doc id `{childId}`; `xpLedgerDocId(childId, …)`) | ✅ Yes | `MyAvatarPage` binds `childId` from `useActiveChild`; all XP awards pass `childId` explicitly. No leak. ⚠️ Dad Lab awards XP to all kids — DATA-04. |
| **evaluationSessions + scans** | ✅ Yes (`childId` field + query filter) | ✅ Yes | Quest sessions queried `where('childId','==',activeChildId)`; scans filtered by `activeChildId`. No leak. |
| **planner / weeks / days / lessonCards** | ⚠️ Mixed (see notes) | ✅ Yes | `days`/`dailyPlans` composite-keyed per child; `lessonCards`/`plannerConversations` per child. **`weeks` is family-scoped** (one doc/week) with per-child `childGoals[]` — **by design**, reads/writes navigate by childId, no leak. |
| **learning profile / disposition narrative** | ✅ Yes (on `children/{childId}` doc) | ✅ Yes | `DispositionProfile` loads/writes `dispositionCache`/`dispositionOverrides` to the active child doc; deps on `activeChildId`. Name check at render is display-only. No leak. |

**Matrix headline: 8/8 domains correctly per-kid with reactive switching.** The only structural
asterisks are *by-design* family-scoping (`weeks`, `dadLabReports`), and the only delineation *risks*
are the two invariant-touching crediting observations (DATA-04/05).

---

## 3. Active-child switching review (Step 2)

Per-page trace of whether flipping the active child reaches the page. Verdicts: **REACTS** /
**STALE-RISK** / **BY-DESIGN** / **N/A**.

| Page | Hook | Verdict | Evidence |
|---|---|---|---|
| Today — parent (`TodayPage`) | `useActiveChild` | **REACTS** | `useDayLog`/`useDailyPlan`/`useBookProgress`/scan subscriptions all dep on `selectedChildId`; `useDayLog` clears stale state on child change. |
| Today — kid (`KidTodayView`) | child via prop | **REACTS** | Child passed down from `TodayPage`; no own cache. |
| Progress / Skill Snapshot | `useActiveChild` | **REACTS** | `SkillSnapshotPage:72-76` state-during-render clears snapshot on `activeChildId`; `onSnapshot` re-subscribes. |
| Progress / Disposition | `useActiveChild` | **REACTS** | Loads/writes keyed on `activeChildId`; name check is display-only. |
| Progress / Learning Map | `useActiveChild` | **REACTS** | `useSkillMap(activeChildId)` re-fires. |
| Progress / Curriculum Tab | `useActiveChild` | **REACTS** | `useActivityConfigs(activeChildId)` + scans `onSnapshot` dep on `activeChildId`. |
| Records / hours + compliance | `useActiveChild` | **REACTS** | Family-wide fetch, **reactive per-child filter** (`useMemo` lines 142-161, summary line 282). The `fetchRecords` dep omitting `activeChildId` is correct — it loads all kids; filtering is reactive. |
| Knowledge Mine (`/quest`) | `useActiveChild` | **REACTS** | Resume query `where('childId','==',activeChildId)`; per-domain access gates read the active child's snapshot. |
| Books | `useActiveChild` | **REACTS** | `useBookshelf(familyId, childId)` re-queries on child change. |
| Avatar / Hero Hub | `useActiveChild` | **REACTS** | `useAvatarProfile(familyId, activeChildId)` + daily-armor session re-subscribe on child id. |
| Dad Lab | `useChildren` (not `useActiveChild`) | **BY-DESIGN** | Shared family activity: shows all family reports; per-child contributions live in `childReports`. Not a switching bug. ⚠️ but crediting is per-DATA-04. |
| Settings | `useProfile` | **N/A** | Family/profile-level; no child-scoped state to switch. |

**No page defaults to Lincoln, caches stale across a switch, or fails to react.** (The two recon
"critical" flags — Records and Dad Lab — were verified as false positives / by-design.)

---

## 4. Profile setup gap (Step 3 — ARCH-15)

- **What a profile contains today:** `id` + `name` (auto-created); `birthdate`/`grade` optional and
  **absent** for both real children. Soft fields (`motivators`/`interests`/`strengths`) may be set via
  Settings/Shelly. Avatar `ageGroup`/`themeStyle` live on a separate doc, name-seeded.
- **The birthdate/grade gap (ARCH-15):** with no demographics, "gate on capability not name" has *no
  demographic signal*, so gates must key on **snapshot/calibration data**. This is exactly the shape
  forced on `canAccessKnowledgeMine` (`src/features/quest/knowledgeMineAccess.ts`).
- **Do the capability gates work per-kid *without* demographics?** **Yes, today.** The Knowledge Mine
  entry gate + per-domain gates (`hasReadingCalibration`/`hasMathCalibration`, ARCH-16) key on the
  child's own `skillSnapshot` (working levels, priority skills, completed program) — fully per-kid,
  no name/age. London (empty snapshot) is correctly held; the tile reappears automatically once he's
  evaluated. So the absence of demographics is *not* currently a leak — it's a **future-proofing and
  onboarding** gap (you can't build an age-shaped gate at all without it).
- **Does London have a complete profile?** **No.** He has `id` + `name` only — no birthdate/grade and
  **no `londonDefaults` learner profile** (`lincolnDefaults.ts` has no London twin). His eval/snapshot
  infra is *Ready*, but his snapshot starts empty.
- **What a proper profile-init would need:** at onboarding/Settings, capture `birthdate` (or age) and
  `grade`, and optionally a per-child capability/learner-profile seed (priority skills, supports, stop
  rules, starting levels) — i.e. a `londonDefaults` analogous to `lincolnDefaults.ts`. That unlocks
  age-shaped gating *and* gives London a non-empty starting snapshot.

---

## 5. London state map (Step 4)

Grounded against `docs/LONDON_BACKLOG.md` (16 surfaces: 13 Ready / 1 Hold / 1 N/A / 1 Not-built).

| Surface group | London status | Why |
|---|---|---|
| Kid Today (checklist, XP bar, extra logger, greeting) | **Works** | Ungated; greeting/celebration already London-tuned. |
| Avatar / Hero Hub | **Works** | Fully built for London (platformer theme, younger proportions, `londonPowerupPrompt`). |
| My Books / Story Workshop / Conundrum | **Works** | No name/age gate; Conundrum is London-tuned (drawing-first prompt). One of his strongest areas. |
| Image-gen theming, Functions per-child AI context | **Works** | Branch to story/platformer styling; slices fed London's own data. |
| Reading-eval + Math-eval infra (FEAT-06) | **Ready (infra), blocked on profile** | Per-child flow works, but needs `londonDefaults` to start from. |
| Knowledge Mine | **Held** | Capability gate (no reading snapshot → tile hidden, `/quest` redirects). Opens automatically once evaluated. |
| Teach-back | **N/A** | Youngest is the audience, not the teacher. |
| Formal London learner profile (`londonDefaults`) | **Not-built** | Underpins both eval rows; the keystone London dependency. |

**First safe wiring slices (in order):**
1. **Seed London demographics** (`birthdate` ≈ 6yo, `grade` ≈ K) — the ARCH-15 profile-init work.
   Additive to the `children/{childId}` doc; unlocks future age-shaped gating.
2. **Build `londonDefaults`** (learner profile) so his snapshot has a starting point — this is the
   single highest-leverage London slice; it converts the *Ready (infra)* eval surfaces into usable
   ones and is the prerequisite for the Mine opening.
3. **(Then) evaluate London** through the existing per-child eval→snapshot flow — no new code; the
   capability gates will open the Mine on their own.

These are all **additive** and ride the already-clean per-child plumbing this audit confirmed.

---

## 6. Risks & judgment calls

**Confirmed → logged as ledger rows (Step 5):**
- **DATA-04** — Dad Lab completion credits compliance hours **and** XP/diamonds to *every* child
  regardless of participation. `useDadLabReports.ts` `syncComplianceHours` loops `for (const child of
  children)` and writes `minutesPerSubject` hours to each; `saveReport`/`updateStatus` likewise loop
  all children awarding `DAD_LAB_COMPLETE` XP (20) + 10 diamonds. The data model supports differing
  participation (`childReports` map, distinct `lincolnRole`/`londonRole`), so a single-participant lab
  over-credits the non-participant's MO hours and XP. **Touches hours + xpLedger invariants →
  propose-and-confirm; do not auto-fix.**
- **DATA-05** — `hoursAdjustments` with no `childId` are counted toward *every* child's compliance
  summary: `computeHoursSummary` includes `!a.childId` adjustments and `RecordsPage` filters
  `!a.childId || a.childId === activeChildId` (`RecordsPage.tsx:150-152`). An unattributed adjustment
  therefore inflates **both** kids' hours. Overlaps the DATA-02 backfill-dupe concern. **NEEDS-DATA**
  (depends on whether such legacy adjustments exist) — **propose-and-confirm; touches hours invariant.**

**Judgment calls → left proposed here, not logged:**
- `weeks` family-scoping (one doc/week, per-child `childGoals[]`) is intentional; no action unless a
  future feature needs per-child week docs.
- Parent-profile terminal fallback to *first child* (`loaded[0]`) is a sensible default; flagged only
  so it isn't mistaken for name-based defaulting.
- Whether Dad Lab is *always* a both-kids activity (which would make DATA-04 intended) is the owner's
  call — that decision determines whether DATA-04 is a fix or a documentation note.

**Reinforced (already logged):** **ARCH-15** (demographics gap) is the audit's #1 structural item;
this audit independently confirms it from the active-child + gating angle.

---

## 7. SPIN-OUT MENU (the deliverable)

Prioritized. Each is a proposed **separate run** — this audit changes nothing. `⚑` = touches an
invariant (hours/compliance, xpLedger, snapshot) → **propose-and-confirm**.

| # | Lane | Priority | Scope (one line) | Invariant |
|---|---|---|---|---|
| 1 | DATA | **High** | **DATA-04** — decide + (if confirmed) scope Dad Lab crediting to actual participants only, instead of all children. | ⚑ hours + xpLedger |
| 2 | DATA | Med | **DATA-05** — decide handling of null-`childId` `hoursAdjustments` so they don't double-count across kids (needs live data check; pairs with DATA-02). | ⚑ hours |
| 3 | ARCH | **High** | **ARCH-15 / profile-init** — capture `birthdate`/`grade` at onboarding + Settings so capability gates can key on demographics, not just snapshot. | — (additive to `children` doc) |
| 4 | London (→ `LONDON_BACKLOG`) | **High** | Build `londonDefaults` learner profile (priority skills/supports/stop-rules/starting levels) — keystone that activates London's Ready eval infra. | ⚑ snapshot seed (propose-and-confirm child-record write) |
| 5 | London (→ `LONDON_BACKLOG`) | Med | Seed London demographics (≈6yo / grade K) on his `children` doc — small additive write; pairs with #3. | — |
| 6 | London (→ `LONDON_BACKLOG`) | Med | After #4, run London through the existing per-child eval→snapshot flow; the Knowledge Mine gate opens automatically — no new code. | — |

**Lead item is cross-kid crediting (DATA-04)**, then **profile-init (ARCH-15)**, then the
**first London-wiring slices** (`londonDefaults` → demographics → evaluate).

> **Convention note:** per `CLAUDE.md` (Lincoln-first / London-minimal) and the ledger's London policy,
> the London slices (#4-6) are tracked in **`docs/LONDON_BACKLOG.md`**, **not** as `FEAT-` ledger rows.
> Only the cross-kid/profile items (DATA-04, DATA-05) are logged in the active ledger by this run.

---

## 8. What this audit did *not* do

Read-only. No code or behavior changed; no compliance/hours, `skillSnapshots`, or `xpLedger` logic
touched. Findings doc + two additive ledger rows only. All fixes spin out as their own scoped,
propose-and-confirm runs.
</content>
</invoke>
