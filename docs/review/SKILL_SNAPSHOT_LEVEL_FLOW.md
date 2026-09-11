# Skill Snapshot: what manual changes actually affect

Reviewed against the main branch used for UX-392 (2026-09-11). This is a focused trace of the controls on Skill Snapshot, not a census of every snapshot consumer. The UI refinement preserves their write behavior.

| Control | Saved value | Observed downstream effect |
| --- | --- | --- |
| Working Levels → Adjust → Save | `workingLevels.<mode>` with `source: manual`, timestamp and parent note | The next Knowledge Mine session reads the saved domain level before curriculum hints. It is clamped to that mode’s ceiling. It does not reset a session already running. |
| Clear manual level (previously “Revert to last auto level”) | Deletes the selected working-level field | Clears the override; it does **not** restore an earlier automatic value. Quest startup uses its existing fallback when no working level is present. |
| Priority Skills → Level, or Quick Checks → result | `prioritySkills[].level` | Updates snapshot context used by planning and teaching. Deterministic skip advice uses this level only when an explicit `masteryGate` is absent. |
| Quick Checks → observation | Adds dated text to the priority skill’s notes | Provides context for consumers that read notes; does not update a working level or mastery gate. |
| Mastery check-off | Existing confirmed mastery rollup | Uses the existing central additive writer; collapsing its section does not change its evidence criteria or confirmation. |

## Working levels are effective, but not permanent locks

The client reads the snapshot at quest start in [useQuestSession](../../src/features/quest/useQuestSession.ts) and calls [computeStartLevel](../../src/features/quest/workingLevels.ts). The server’s [quest task](../../functions/src/ai/tasks/quest.ts) also reads the saved mode level before its curriculum fallback.

`manualOverrideHolds` protects a recent manual entry for the window defined in `workingLevels.ts`; it is not an indefinite override. Once that window expires, a quest or evaluation can change the value. Curriculum scans may advance it but cannot lower it. Existing [working-level tests](../../src/features/quest/workingLevels.test.ts) cover the protection window, overwrite direction and start-level precedence.

The UI’s old revert wording was misleading: [handleRevert](../../src/features/evaluation/WorkingLevelsSection.tsx) deletes a field with `deleteField()`. No previous value is fetched. UX-392 changes that button’s label to **Clear manual level**, preserving the operation.

## The planner mismatch needs a separate decision (UX-393)

[SkillSnapshotPage](../../src/features/evaluation/SkillSnapshotPage.tsx) changes a priority skill’s level without changing its existing mastery gate. [getEffectiveMasteryGate](../../src/features/planner-chat/skipAdvisor.logic.ts) prefers an explicit gate, falling back to the level only when no gate exists. Starter defaults include gates. This precedence is pinned by the existing [skip-advisor tests](../../src/features/planner-chat/skipAdvisor.logic.test.ts).

Consequently, selecting `secure` can leave the advisor’s “Active focus” recommendation in place. Meanwhile [snapshot AI context](../../functions/src/ai/contextSlices.ts) includes the updated level and uses it in planning guidance; [TeachHelperDialog](../../src/features/planner/TeachHelperDialog.tsx) also includes priority levels. Receiving that context does not guarantee a model will follow it, and these edits do not automatically rewrite an existing plan.

The next decision is what the parent means by changing a level: recording a current observation, or explicitly overriding mastery evidence. A follow-up should preview the actual planner consequence and make that choice clear. Changing `masteryGate` or persistence semantics requires separate approval under the snapshot invariant; this PR makes no such change.

## Disclosure behavior

Opening and closing sections writes nothing. Closed sections keep their children mounted so unfinished notes, manual adjustments and in-flight saves survive Collapse all. Changing the selected child still clears the snapshot and unmounts the editors; disclosure state resets with it. The new component and page interaction tests cover those distinctions.
