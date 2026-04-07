# Cleanup Phase 1 + 2 — Codex Prompts (April 7, 2026)

This document turns the cleanup audit into **implementation-ready Codex prompts**.

Use these in order. Do **not** skip ahead to Phase 2 deletion work before Phase 1 verification and before the migration work is complete.

---

## Operating Rules for Every Prompt

Use these rules at the top of every Codex run:

- Work in a new branch for each prompt.
- Keep commits small and focused.
- Run tests for touched areas.
- Do not broaden scope beyond the files listed unless required to make the build pass.
- If an item appears reachable or still imported, stop and report instead of deleting it blindly.
- Prefer updating docs and TODO comments when the code path is still active.
- If Firestore schema changes are implied, do not delete collection helpers until all references are removed.
- At the end, provide:
  - files changed,
  - tests run,
  - risks,
  - follow-up work.

---

## Recommended Execution Order

1. **Phase 1A** — Verify and remove unrouted orphan pages
2. **Phase 1B** — Remove old KidsPage-only ladder/milestone code if Phase 1A proves it is isolated
3. **Phase 2A** — Stop new writes to `workbookConfigs`
4. **Phase 2B** — Migrate AI/planner/quest reads from `workbookConfigs` to `activityConfigs`
5. **Phase 2C** — Remove legacy `WorkbookConfig` paths only after reads/writes are gone

---

# Phase 1A — Verify and remove unrouted orphan pages

## Goal

Remove clearly unrouted legacy pages that are no longer part of the app shell, but **only** if they are truly unreachable from the current router and imports.

## Known candidates

- `src/features/kids/KidsPage.tsx`
- `src/features/engine/EnginePage.tsx`

## Prompt

```text
You are working in repo `barnes-ngb/first-principles-engine`.

Task: Phase 1A cleanup — verify and remove unrouted orphan pages.

Read first:
- docs/CLEANUP_AUDIT_2026_04_07.md
- docs/CLEANUP_PHASE_1_2_CODEX_PROMPTS_2026_04_07.md
- src/app/router.tsx

Goals:
1. Verify whether these pages are truly unreachable from the current app:
   - src/features/kids/KidsPage.tsx
   - src/features/engine/EnginePage.tsx
2. Search for all imports/usages of:
   - KidsPage
   - EnginePage
   - ladder.logic.ts
3. If either page is still routed or imported by an active surface, do NOT delete it. Instead, leave code untouched and write a short findings note in the PR description.
4. If a page is truly orphaned, remove it and any files used only by it.

Constraints:
- Do not touch the newer /ladders route yet.
- Do not delete Firestore collection helpers yet.
- Do not remove shared types yet.
- Keep changes narrowly scoped to unreachable page cleanup.

Likely related files to inspect:
- src/app/router.tsx
- src/features/kids/KidsPage.tsx
- src/features/kids/ladder.logic.ts
- src/features/kids/ladder.logic.test.ts
- src/features/engine/EnginePage.tsx

Acceptance criteria:
- Build passes.
- No active imports remain for deleted files.
- If files are retained, explain exactly why.
- Provide a concise summary of what was deleted vs kept.

Run relevant tests and report them.
```

## Expected output

A focused PR that either:
- removes the orphaned pages and page-only helpers/tests, or
- proves why they still cannot be removed.

---

# Phase 1B — Remove old KidsPage ladder/milestone path if isolated

## Goal

After Phase 1A, remove the **older ladder + milestone** path if it is no longer reachable and no active feature depends on it.

## Target legacy path

- `src/features/kids/KidsPage.tsx`
- `src/features/kids/ladder.logic.ts`
- `src/features/kids/ladder.logic.test.ts`
- `laddersCollection(...)`
- `milestoneProgressCollection(...)`
- old `Ladder`, `Rung`, `MilestoneProgress` usage that exists only for KidsPage path

## Prompt

```text
You are working in repo `barnes-ngb/first-principles-engine`.

Task: Phase 1B cleanup — remove the old KidsPage ladder/milestone path if isolated.

Read first:
- docs/CLEANUP_AUDIT_2026_04_07.md
- docs/CLEANUP_PHASE_1_2_CODEX_PROMPTS_2026_04_07.md
- the merged or current result of Phase 1A

Goals:
1. Confirm whether the old ladder/milestone system is now fully isolated after Phase 1A.
2. Search for remaining active references to:
   - laddersCollection
   - milestoneProgressCollection
   - Ladder
   - Rung
   - MilestoneProgress
   - artifact.tags.ladderRef references tied specifically to KidsPage flow
3. Remove only the old KidsPage-based ladder/milestone path if it has no active app dependency.
4. If collection helpers are still referenced elsewhere, keep them and document why.

Constraints:
- Do not remove the newer card-based /ladders flow yet.
- Do not remove ladderRef from shared schemas yet unless it is proven unused.
- Do not remove any Firestore helper still referenced by active code.

Acceptance criteria:
- Old KidsPage ladder/milestone flow is gone if isolated.
- No broken imports remain.
- Shared code is only removed if no references remain.
- PR description clearly lists what is still left for newer /ladders cleanup.

Run tests for touched files and report them.
```

## Expected output

A PR that removes the **older** ladder/milestone stack, but leaves the **newer `/ladders` card-based flow** intact for later cleanup.

---

# Phase 2A — Stop new writes to `workbookConfigs`

## Goal

Make `activityConfigs` the write target for current operational flows, while preserving compatibility and avoiding data loss.

## Highest-priority write paths

Confirmed or strongly suspected:
- `src/core/hooks/useCertificateProgress.ts`
- `src/features/planner-chat/PlannerChatPage.tsx`
- `src/features/quest/useQuestSession.ts`

## Prompt

```text
You are working in repo `barnes-ngb/first-principles-engine`.

Task: Phase 2A migration — stop new writes to workbookConfigs.

Read first:
- docs/CLEANUP_AUDIT_2026_04_07.md
- docs/CLEANUP_PHASE_1_2_CODEX_PROMPTS_2026_04_07.md
- src/core/firebase/migrateActivityConfigs.ts
- src/core/hooks/useCertificateProgress.ts
- src/core/hooks/useScanToActivityConfig.ts
- functions/src/ai/contextSlices.ts

Goals:
1. Find every active write to `workbookConfigsCollection`.
2. Redirect operational writes to `activityConfigs` where appropriate.
3. Preserve user data and compatibility.
4. If a write cannot safely move yet, keep it and add a precise TODO with reason.

Specific requirements:
- Certificate progress updates should update the matching `activityConfig` when possible.
- Do not create new `workbookConfigs` docs for normal current flows unless there is a proven hard dependency.
- If needed, add helper functions to normalize curriculum matching for `activityConfigs`.
- Keep migration/bootstrap logic intact unless you can safely simplify it.

Constraints:
- Do not delete `workbookConfigsCollection` in this phase.
- Do not remove `WorkbookConfig` type in this phase.
- Do not change AI reads yet except where required to support moved writes.

Acceptance criteria:
- New certificate/progress operational writes no longer create or update `workbookConfigs` unless explicitly justified.
- Existing data is preserved.
- Tests pass for touched code.
- PR notes clearly identify any remaining write paths.
```

## Expected output

A migration PR that reduces or eliminates **new writes** to `workbookConfigs` without deleting legacy read paths yet.

---

# Phase 2B — Migrate AI, planner, and quest reads from `workbookConfigs` to `activityConfigs`

## Goal

Move live read paths away from the legacy pace model and onto the structured activity model.

## Likely read surfaces

- `functions/src/ai/contextSlices.ts`
- `functions/src/ai/chat.ts`
- `functions/src/ai/tasks/quest.ts`
- `src/features/planner-chat/*`
- `src/features/quest/useQuestSession.ts`
- `src/features/planner-chat/pace.logic.ts`

## Prompt

```text
You are working in repo `barnes-ngb/first-principles-engine`.

Task: Phase 2B migration — move active reads from workbookConfigs to activityConfigs.

Read first:
- docs/CLEANUP_AUDIT_2026_04_07.md
- docs/CLEANUP_PHASE_1_2_CODEX_PROMPTS_2026_04_07.md
- functions/src/ai/contextSlices.ts
- src/core/firebase/firestore.ts
- src/core/types/planning.ts
- src/core/firebase/migrateActivityConfigs.ts
- relevant planner/quest files that still reference WorkbookConfig

Goals:
1. Identify all active read paths still using `workbookConfigs`.
2. Replace those reads with `activityConfigs` equivalents where possible.
3. Preserve the planner’s notion of curriculum coverage, current position, and completed programs.
4. Keep user-facing behavior stable.

Specific requirements:
- Replace AI context `workbookPaces` loading with `activityConfigs`-based curriculum coverage where possible.
- Preserve current position, unit label, total units, completion, and curriculum metadata if still needed.
- If activityConfigs lacks a field needed by a current reader, add the minimal safe adapter/helper rather than re-expanding WorkbookConfig reliance.
- Update planner/quest logic to prefer `activityConfigs` + `skillSnapshot` + `childSkillMap`.

Constraints:
- Do not remove legacy collection/type definitions yet.
- Do not delete migration utilities yet.
- Keep diffs understandable; split helper extraction from behavior changes if needed.

Acceptance criteria:
- Active planner/AI/quest reads no longer depend primarily on `workbookConfigs`.
- Behavior remains stable or is explicitly documented if improved.
- Tests pass.
- Remaining legacy WorkbookConfig references are documented and minimized.
```

## Expected output

A PR that moves the **read side** of the system toward `activityConfigs` and sharply reduces dependency on `workbookConfigs`.

---

# Phase 2C — Remove legacy WorkbookConfig path only after reads/writes are gone

## Goal

Finish the migration and remove the old compatibility layer, but only once operational reliance is truly gone.

## Prompt

```text
You are working in repo `barnes-ngb/first-principles-engine`.

Task: Phase 2C cleanup — remove legacy WorkbookConfig path only after migration is complete.

Prerequisite:
- Phase 2A and 2B are complete and merged.

Goals:
1. Confirm all remaining references to:
   - WorkbookConfig
   - workbookConfigsCollection
   - workbookConfigDocId
   - workbook pace helpers / legacy pace logic
2. Remove the legacy collection helpers, types, and adapters only if no active code depends on them.
3. Update docs and comments to reflect the completed migration.

Constraints:
- If any operational dependency remains, do not force deletion.
- Prefer a small final cleanup PR over mixing migration and deletion together.

Acceptance criteria:
- No active planner, quest, scan, or AI path depends on WorkbookConfig.
- Legacy types/helpers are removed or clearly marked as temporary if one blocker remains.
- Tests pass.
- PR description lists the final removed legacy pieces.
```

---

## Suggested PR Titles

### Phase 1A
- `chore: remove unrouted legacy pages`

### Phase 1B
- `chore: remove old kids ladder milestone path`

### Phase 2A
- `refactor: stop writing workbook configs in active flows`

### Phase 2B
- `refactor: move planner and ai curriculum reads to activity configs`

### Phase 2C
- `chore: remove legacy workbook config compatibility layer`

---

## What I would run first

If you want the safest order with the best payoff:

1. **Phase 1A**
2. **Phase 2A**
3. **Phase 2B**
4. **Phase 1B**
5. **Phase 2C**

Reason:
- Phase 1A is low-risk and cleans obvious clutter.
- Phase 2A/2B remove the biggest architectural duplication that still affects live flows.
- Phase 1B is easier once the migration work has reduced confusing overlap.

---

## Notes for Nathan / reviewer

Watch for these pitfalls in review:

- accidental removal of the newer `/ladders` path while only intending to remove the old KidsPage path
- silent data loss when moving certificate progress from workbook configs to activity configs
- AI context regressions when replacing `workbookPaces`
- current-position matching bugs caused by curriculum-name normalization differences
- overly broad type deletions before all imports are gone
