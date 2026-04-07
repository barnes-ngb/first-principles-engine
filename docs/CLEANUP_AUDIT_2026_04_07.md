# Cleanup Audit — April 7, 2026

## Summary

This was a **read-only connector audit**, not a shell grep over a local checkout. I confirmed the major dependency paths directly from the repo through the GitHub connector, but I could not run repo-wide `grep` or compute perfect current line-count totals from a local clone because network cloning is blocked in this environment.

### High-confidence findings

- **Ladders are not dead.** They are **deprecated in intent** but still have:
  - a live `/ladders` route,
  - active Firestore reads/writes to `ladderProgress`,
  - a Today-page dependency path through ladder card definitions and Teach Helper,
  - and a second, older ladder/milestone UI path in `KidsPage`.
- **Milestones are mostly tied to the older KidsPage ladder model.**
  - I confirmed active reads/writes in `KidsPage`,
  - but I did **not** find the milestones system in the current router.
  - That makes milestones look **reachable in code but not reachable from nav/router**.
- **WorkbookConfig → ActivityConfig migration is incomplete.**
  - The new `activityConfigs` system is clearly the intended source of truth.
  - But the old `workbookConfigs` collection is still part of:
    - migration/bootstrap,
    - certificate scan updates,
    - planner code,
    - quest code,
    - and AI context loading.
- **There are at least two old/unrouted pages still in the tree:**
  - `src/features/kids/KidsPage.tsx`
  - `src/features/engine/EnginePage.tsx`
- **The old ladder-era schema still leaks into core types**, including:
  - `Artifact.tags.ladderRef`
  - `DayBlock.ladderRef`
  - `ChecklistItem.ladderRef`
  - `DraftPlanItem.ladderRef`
  - `LessonCard.ladderRef`
  - legacy `Session` / `DailyPlan.sessions` ladder-oriented types

## Confidence and scope notes

- Where I say **confirmed**, I fetched and inspected the file directly.
- Where I say **search-confirmed**, I saw the file returned by repo search, but I did not fetch the full source during this pass.
- Where a count is required and I could not compute it exactly, I label it **minimum confirmed** or **needs local grep**.
- I did not delete or modify any code.

---

## Section 1: Ladders System

**Verdict:** **Not safe to delete yet.** This system is philosophically deprecated, but still has active UI, active writes, and type/schema dependencies.

### What is active right now

### Confirmed active files

| File | Role | Active? | Notes |
|------|------|---------|------|
| `src/app/router.tsx` | Imports `LaddersPage` and mounts `/ladders` | Yes | Live route |
| `src/features/ladders/LaddersPage.tsx` | Main ladder UI | Yes | Reads and writes `ladderProgress`; TODO says remove later |
| `src/features/today/LadderQuickLog.tsx` | Quick access to ladder logging | Yes, but likely secondary | Reads `ladderProgress`, navigates to `/ladders?ladder=...` |
| `src/features/today/TodayPage.tsx` | Still computes ladder card data | Yes | TODO says remove ladder refs later; passes `cardLadders` into `TeachHelperDialog` |
| `src/features/ladders/laddersCatalog.ts` | Resolves ladders by child | Yes | Used by `LaddersPage` and `TodayPage` |
| `src/features/ladders/ladderProgress.ts` | Pure progress engine for card-based ladders | Yes | Used by `LaddersPage` |
| `src/core/firebase/firestore.ts` | Defines `laddersCollection` and `ladderProgressCollection` helpers | Yes | Collection helpers still exist |
| `src/core/types/common.ts` | Defines ladder types | Yes | Shared type layer still contains ladder schema |
| `src/core/types/planning.ts` | Ladder refs embedded in planning types | Yes | Cross-cutting schema dependency |

### Confirmed ladder TODOs

I confirmed the same deprecation TODO in these files:

- `src/features/ladders/LaddersPage.tsx`
- `src/features/today/LadderQuickLog.tsx`
- `src/features/today/TodayPage.tsx`
- `src/features/kids/KidsPage.tsx` (on old ladder/milestone imports)

The March 29 architecture notes also said ladder references were marked for removal in 5 files, but I only directly confirmed four during this pass.

### Confirmed writes

**Confirmed write path**
- `src/features/ladders/LaddersPage.tsx`
  - loads `ladderProgressCollection(...)`
  - calls `setDoc(doc(ladderProgressCollection(...), docId), result.progress)`

**Confirmed read path**
- `src/features/ladders/LaddersPage.tsx`
- `src/features/today/LadderQuickLog.tsx`

### Confirmed active dependencies

- `/ladders` is still mounted in `src/app/router.tsx`
- `TodayPage` still computes `cardLadders` from `getLaddersForChild(...)`
- `TodayPage` still passes `ladders={cardLadders}` into `TeachHelperDialog`
- Core planning/content types still allow `ladderRef` fields

### AI dependency check

I did **not** confirm any active ladder-specific data loading in the current AI context pipeline.
The current AI context is centered around:
- disposition,
- skill snapshot,
- activity configs,
- workbook paces / curriculum coverage,
- recent scans,
- evaluations.

That suggests ladders are no longer central to planner/eval AI behavior.

### Tests

**Confirmed test coverage**
- `src/features/kids/ladder.logic.test.ts`

I did not confirm a dedicated test file for the newer `src/features/ladders/ladderProgress.ts` path during this pass.

### Dependencies and risks

#### Why this is not safe to delete in one shot

1. `LaddersPage` is still routed.
2. `LadderQuickLog` still reads ladder progress.
3. `TodayPage` still computes ladder definitions and sends them into `TeachHelperDialog`.
4. Core types and artifact tags still carry `ladderRef`.
5. There is a **second, older ladder system** still present in `KidsPage` and milestone progress.

### Removal plan

1. Remove ladder dependency from `TeachHelperDialog` / `TodayPage`
2. Remove `LadderQuickLog` if it is still rendered anywhere, or confirm it is already orphaned
3. Remove `/ladders` route and `LaddersPage`
4. Remove `ladderProgressCollection` usage
5. Remove ladder types and `ladderRef` fields from shared schemas
6. Remove ladder catalog / ladder data definitions
7. Then remove collection helpers and indexes

### Risks

- Breaking Teach Helper behavior if it still expects ladder definitions
- Breaking old artifact linking if `artifact.tags.ladderRef` is still queried anywhere
- Breaking existing Firestore docs/UI assumptions if ladder refs are removed before migrations

---

## Section 2: Milestones System

**Verdict:** **Deprecated / likely orphaned from current navigation, but not fully unused.**

This system appears to belong to the **older ladder + milestone-achievement model**, not the newer card-based ladder-progress model.

### Confirmed active files

| File | Role | Active? | Notes |
|------|------|---------|------|
| `src/features/kids/KidsPage.tsx` | Old ladder/milestone UI | Code-active, route-inactive | Loads ladders + milestone progress + artifacts, can mark achieved |
| `src/features/kids/ladder.logic.ts` | Status logic for old milestone model | Likely only used by `KidsPage` | Search-confirmed |
| `src/features/kids/ladder.logic.test.ts` | Tests old milestone logic | Yes | Confirms old system still has tests |
| `src/core/firebase/firestore.ts` | `milestoneProgressCollection` helper | Yes | Collection helper still present |
| `src/core/types/common.ts` | `MilestoneProgress` type | Yes | Shared type still present |

### Confirmed write path

`src/features/kids/KidsPage.tsx`:
- reads `milestoneProgressCollection(familyId)`
- writes via:
  - `updateDoc(...)`
  - `setDoc(...)`
- marks rung achievement into `milestoneProgress`

### Router / nav reachability

**Important:** I fetched `src/app/router.tsx` and did **not** find `KidsPage` or a `/kids` route in the current router.

That means:

- the milestone system is **not obviously reachable from the main router**
- but it is **still present, still has writes, and still has tests**

### AI / planner / weekly review usage

I did **not** confirm milestones being used by:
- planner context,
- weekly review,
- or active AI task handlers.

The live AI context appears to prefer:
- skill snapshots,
- evaluations,
- activity configs,
- scans,
- disposition narratives.

### Milestones vs milestone moments

These are **not** the same thing:

- **MilestoneProgress** in `common.ts` is a ladder/rung achievement model
- "milestone moments" like armor tier upgrades or curriculum completion are separate feature concepts

This matters because removing the old `milestoneProgress` collection should **not** be confused with removing:
- avatar tier progression
- certificate milestones
- curriculum coverage milestones

### Verdict details

The old milestones system looks like:

- **active in code**
- **not clearly reachable in app navigation**
- **logically isolated to the old KidsPage ladder model**

### Safe cleanup path

If you remove the old `KidsPage` ladder flow, then `milestoneProgressCollection` becomes a strong candidate for coordinated deletion.

### Risks

- Hidden link/import path not found in this pass
- Existing milestone data in Firestore may still matter historically
- Artifact linkage from old ladder evidence flows may still exist

---

## Section 3: WorkbookConfig Migration

**Verdict:** **Migration incomplete. Do not remove `workbookConfigs` yet.**

### High-confidence assessment

The repo clearly intends `activityConfigs` to replace `workbookConfigs`, but the old system is still doing real work.

### Confirmed collection helpers

In `src/core/firebase/firestore.ts` both of these still exist:

- `workbookConfigsCollection(...)`
- `activityConfigsCollection(...)`

### Confirmed files still tied to WorkbookConfig

| File | Usage | Status |
|------|-------|--------|
| `src/core/firebase/firestore.ts` | Defines collection + converter | Active |
| `src/core/types/planning.ts` | Defines `WorkbookConfig` type | Active type |
| `src/core/firebase/migrateActivityConfigs.ts` | Reads old workbook configs and creates new activity configs | Active bootstrap dependency |
| `src/core/hooks/useCertificateProgress.ts` | Reads and writes workbook configs after certificate scan | Active |
| `functions/src/ai/contextSlices.ts` | Still loads `workbookPaces`; TODO says migrate to activityConfigs | Active AI dependency |
| `src/features/planner-chat/PlannerChatPage.tsx` | Search-confirmed workbook config usage | Active |
| `src/features/planner-chat/PlannerSetupWizard.tsx` | Search-confirmed workbook config usage | Active |
| `src/features/planner-chat/pace.logic.ts` | Search-confirmed workbook config usage | Active |
| `src/features/planner-chat/PhotoLabelForm.tsx` | Search-confirmed workbook config usage | Active |
| `src/features/quest/useQuestSession.ts` | Search-confirmed workbook config usage | Active |
| `functions/src/ai/tasks/quest.ts` | Search-confirmed workbook config usage | Active |
| `functions/src/ai/chat.ts` | Search-confirmed workbook config usage | Active or compatibility path |
| `src/core/hooks/useScanToActivityConfig.ts` | Search-confirmed reference | Likely bridge layer |

### Confirmed writes to the old collection

**Directly confirmed**
- `src/core/hooks/useCertificateProgress.ts`
  - updates existing workbook config
  - or creates a new workbook config via `setDoc(...)`

**Search-confirmed write hits**
- `src/features/planner-chat/PlannerChatPage.tsx`
- `src/features/quest/useQuestSession.ts`

I did not fetch those two full files in this pass, so treat them as **write-paths needing local confirmation**, not hand-wavy assumptions.

### What the migration utility does

`src/core/firebase/migrateActivityConfigs.ts` does all of the following:

- checks whether `activityConfigs` already exist
- loads completed programs from `skillSnapshots`
- reads existing `workbookConfigs`
- converts them into default/structured `activityConfigs`
- seeds routine activities and evaluation activities
- writes the new activity configs in batch

This means the old collection is still part of **first-run migration/bootstrap**, not just historical storage.

### AI context impact

`functions/src/ai/contextSlices.ts` still contains:

- `ContextSlice.WorkbookPaces`
- task mappings that include `workbookPaces`
- formatting logic for curriculum coverage based on workbook config data
- an explicit comment:
  - `TODO: Migrate to activityConfigs. WorkbookConfig is legacy`

So the AI planner still reads the old model, even while also reading the new model.

### Cleanest migration path

1. **Move AI curriculum coverage loading from `workbookConfigs` to `activityConfigs`**
   - especially `loadWorkbookPaces(...)` / `workbookPaces` in AI context
2. **Move certificate scan updates to `activityConfigs`**
   - update current position and curriculum metadata there instead of writing new workbook configs
3. **Move quest starting-level logic off workbook configs**
   - likely to `activityConfigs` + `skillSnapshot` + `childSkillMap`
4. **Remove planner setup writes to workbook configs**
5. **Keep a one-time migration reader only until all live writes are gone**
6. **Then delete the collection helper, type, and old pace logic**

### Data risk

Yes — there is risk that **some curriculum metadata still only lives in workbook configs** right now, especially:
- target finish date
- school days per week
- curriculum milestone metadata
- current position for legacy setups

Do **not** remove the old collection until you explicitly migrate or intentionally discard those fields.

### Best current interpretation

- `activityConfigs` = intended operational source of truth
- `workbookConfigs` = still-active compatibility + migration + some remaining authoring

---

## Section 4: Other Dead / Duplicate Concepts

### 4.1 Duplicate ladder-era systems

This is the biggest duplicate concept I found.

#### System A — Newer card-based ladders
- `src/features/ladders/LaddersPage.tsx`
- `src/features/ladders/ladderProgress.ts`
- `src/features/ladders/laddersCatalog.ts`
- `src/features/today/LadderQuickLog.tsx`
- Firestore: `ladderProgress`

#### System B — Older ladder + milestone + artifact proof flow
- `src/features/kids/KidsPage.tsx`
- `src/features/kids/ladder.logic.ts`
- Firestore: `ladders`
- Firestore: `milestoneProgress`
- artifacts linked by `artifact.tags.ladderRef`

These are separate systems and should be treated separately in cleanup.

### 4.2 Unrouted / likely orphaned pages

| File | In router? | Verdict |
|------|------------|---------|
| `src/features/kids/KidsPage.tsx` | No, not found in fetched router | Likely orphaned UI |
| `src/features/engine/EnginePage.tsx` | No, not found in fetched router | Likely orphaned UI |

### 4.3 Legacy planner leftovers

From the fetched router:

- `/planner/legacy` still exists, but only as a redirect to `/planner/chat`

This is low-risk legacy surface, but not dead code in itself.

### 4.4 Shared schema still carries ladder-era fields

These are important because they block “simple deletion”:

- `Artifact.tags.ladderRef`
- `DayBlock.ladderRef`
- `ChecklistItem.ladderRef`
- `DraftPlanItem.ladderRef`
- `LessonCard.ladderRef`

There are also older session-oriented types still embedded in `planning.ts`:
- `Session`
- `PlannedSession`
- `DailyPlan.sessions`

Those look like remnants of an older ladder/session planning model.

### 4.5 Confirmed low-level legacy notes

- `src/core/hooks/useCertificateProgress.ts` has an explicit migration TODO pointing away from workbook configs.
- `functions/src/ai/contextSlices.ts` has an explicit migration TODO for workbook paces.
- `src/features/today/TodayPage.tsx`, `LadderQuickLog.tsx`, `LaddersPage.tsx`, and `KidsPage.tsx` still carry ladder-removal TODOs.

### 4.6 Previously removed systems — spot check

I did **not** find live code evidence in this pass that the already-removed systems were still active:

- sessions collection
- scoreboard
- projects
- legacy planner page

The router evidence supports that the **legacy planner page is gone** and replaced by redirect only.

I did **not** fully re-audit scoreboard/projects in source, so keep this as a spot-check, not an absolute guarantee.

---

## Section 5: Recommended Cleanup Order

### Phase 1 — Lowest-risk cleanup

1. **Confirm and remove unrouted orphan pages**
   - `src/features/kids/KidsPage.tsx`
   - `src/features/engine/EnginePage.tsx`
2. Remove code that is only used by those pages:
   - `src/features/kids/ladder.logic.ts`
   - `src/features/kids/ladder.logic.test.ts`
3. Then evaluate whether these Firestore helpers are still needed:
   - `laddersCollection`
   - `milestoneProgressCollection`

### Phase 2 — Finish WorkbookConfig migration

1. Stop all **new writes** to `workbookConfigs`
   - certificate scan
   - planner setup / planner chat
   - quest/session side effects
2. Move AI curriculum coverage to `activityConfigs`
3. Move any remaining quest calibration logic to:
   - `activityConfigs`
   - `skillSnapshot`
   - `childSkillMap`
4. Only after all live writes/reads are migrated:
   - remove `WorkbookConfig` type
   - remove `workbookConfigsCollection`
   - remove legacy pace helpers
5. Phase 2C guardrail:
   - keep workbook fallback reads until the guaranteed server-side backfill path has been deployed and verified for active families/children.
   - see `docs/WORKBOOK_ACTIVITYCONFIG_BACKFILL.md` for exact rollout/validation gates.

### Phase 3 — Remove newer ladder UI path

1. Remove ladder dependency from `TeachHelperDialog` and `TodayPage`
2. Remove `LadderQuickLog`
3. Remove `/ladders` route
4. Remove `LaddersPage`
5. Remove `ladderProgressCollection`
6. Remove ladder card definitions and ladder-progress logic
7. Remove ladder-related shared schema fields (`ladderRef`) if no other feature uses them

### Phase 4 — Shared schema cleanup

After ladder/milestone UI is gone:

- remove `ladderRef` from artifacts/planning types
- remove old `Ladder`, `Rung`, `MilestoneProgress`, `LadderProgress` types
- remove old `Session` / ladder-oriented daily plan remnants if truly unused

### Phase 5 — Keep for now

Keep these until their replacements are fully verified:

- `workbookConfigsCollection`
- `WorkbookConfig` type
- `useCertificateProgress`
- workbook-based AI context loading
- any quest-starting-level logic using workbook coverage

---

## Total Impact Estimate

Because this was a connector-based audit rather than a local grep audit, these numbers are intentionally conservative.

### High-confidence removable groups after coordinated cleanup

- **Collections likely removable after coordinated cleanup:** 3
  - `ladders`
  - `milestoneProgress`
  - `ladderProgress`
- **Likely orphaned page/components:** at least 2 pages
  - `KidsPage`
  - `EnginePage`
- **Migration work still needed before deleting old pace model:** several active files, not just one or two
- **Cross-cutting schema cleanup needed:** yes

### Practical interpretation

The biggest cleanup win is **not** deleting a random page first.
It is clarifying authority in this order:

1. finish `WorkbookConfig` → `ActivityConfig`
2. delete the **old KidsPage ladder/milestone system**
3. then delete the **newer card-based ladder UI path**
4. then clean shared ladder-era fields out of core schemas

That sequence minimizes breakage and matches the current architectural direction.

---

## Appendix: Confirmed files touched in this audit

### Fetched and inspected directly
- `src/app/router.tsx`
- `src/core/firebase/firestore.ts`
- `src/core/types/common.ts`
- `src/core/types/planning.ts`
- `functions/src/ai/contextSlices.ts`
- `functions/src/ai/tasks/plan.ts`
- `functions/src/ai/tasks/evaluate.ts`
- `functions/src/ai/evaluate.ts`
- `src/features/ladders/LaddersPage.tsx`
- `src/features/today/LadderQuickLog.tsx`
- `src/features/today/TodayPage.tsx`
- `src/features/kids/KidsPage.tsx`
- `src/core/firebase/migrateActivityConfigs.ts`
- `src/core/hooks/useCertificateProgress.ts`

### Search-confirmed during this pass
- `src/features/kids/ladder.logic.ts`
- `src/features/kids/ladder.logic.test.ts`
- `src/features/engine/EnginePage.tsx`
- `src/features/planner-chat/PlannerChatPage.tsx`
- `src/features/planner-chat/PlannerSetupWizard.tsx`
- `src/features/planner-chat/PhotoLabelForm.tsx`
- `src/features/planner-chat/pace.logic.ts`
- `src/features/planner-chat/pace.logic.test.ts`
- `src/features/quest/useQuestSession.ts`
- `functions/src/ai/tasks/quest.ts`
- `functions/src/ai/chat.ts`
- `src/core/hooks/useScanToActivityConfig.ts`

---

## Recommended next action

Turn this audit into two focused cleanup tracks:

1. **Migration track**
   - finish WorkbookConfig → ActivityConfig
2. **Deprecation track**
   - remove old milestone ladder path first
   - remove new ladder path second

That will keep the cleanup from turning into a tangled, cross-feature regression project.
