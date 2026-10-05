# FUNC-01 authority trace evidence — maintenance review, 2026-10-05

Static source inspection on 2026-10-05 at revision `0054c3531c41fa47bad464dfb51f0a556168730c` (application source matches main `61ad5c1a57430c28daf26940f524f50b0a8e2466`). This is not a live-record inspection or whole-program exclusivity proof. No records, rules or protected calculations were changed.

## Decision retained

`docs/review/DECISION_FUNC-01_source_of_truth.md` chooses layered ownership with named one-directional write-through. Keep that ruling: snapshot academic state, curriculum coverage, activity position, synthesized concept frontier and derived disposition are distinct dimensions. Updating the inventory below does not authorize collapsing stores or changing protected writers. The existing table's word **only** is stronger than current evidence supports; this inventory distinguishes direct writers, callers, maintenance helpers and readers.

## Current source map

### Skill Snapshot — current academic state

`families/{familyId}/skillSnapshots/{childId}` remains the academic-state store. The central helper `src/features/evaluate/skillSnapshotWrites.ts` contains `writeSnapshotUpdate` (line364; setDoc391), additive evidence/block/priority/support/stop-rule changes, and `writeRestoredWorkingLevel` (455; transaction462/469), the separately authorized parent-confirmed upgrade-only restoration of one unchanged observed slot.

Runtime callers of the additive helper include certificate application (`core/hooks/useCertificateProgress.ts:258`), worksheet/certificate scan findings (`features/progress/CertificateScanSection.tsx:150`), mastery checkoff (`evaluate/commitMasteryRollup.ts:42`, called by `MasteryCheckoffPanel.tsx:50`), quest block updates (`quest/useQuestSession.ts:1231`) and confirmed portal edits (`shelly-chat/useShellyChatActions.ts:364-391`). Restoration is called by `settings/restoreScanLoweredLevels.ts:293`.

The following **direct runtime writes are also present** and cannot be hidden behind the table's original-inline-writers caveat:

- `evaluate/EvaluateChatPage.tsx:625,628`: Apply writes the merged snapshot and block fields; it separately invokes map findings at637 and learner-model writeback.
- `quest/useQuestSession.ts:1184,1204`: session completion writes snapshot state and block updates in addition to its central-helper path.
- `evaluation/SkillSnapshotPage.tsx:89,108`: missing-document defaults and manual snapshot save.
- `evaluation/WorkingLevelsSection.tsx:142,169`: manual working-level set and clear. This is a separate direct writer module under the snapshot UI.
- `today/TodayChecklist.tsx:422-447`: Stuck/Got it reads existing blocks and directly updates conceptualBlocks/blocksUpdatedAt; the parallel Stuck call to `enqueueStuckRetests` is a distinct learner-model write, not an atomic cross-store operation.
- `core/hooks/useScanToActivityConfig.ts:353-377`: derived scan working level uses a transaction, checks `canOverwriteWorkingLevel`, then writes a single workingLevels field (or creates a partial snapshot). The source explicitly constrains curriculum-derived updates to advance-only.

Maintenance writers are separately reachable from DevAdminTab: `settings/backfillWorkingLevels.ts:237` (caller `DevAdminTab.tsx:491`) and `settings/backfillBlockIds.ts:91` (caller670). These are not normal assessment entry points, but they invalidate an unconditional exclusive-writer list.

Readers include `useChildSkillSnapshot`, snapshot UI, Today, planner, TeachHelperDialog, book suggestions, Dad Lab calibration, data-review export, map re-derivation and learner-model bootstrap. Server `functions/src/ai/contextSlices.ts:485-486,1008` loads snapshot context; TASK_CONTEXT names plan, quest, story/revise tasks, disposition, scan, Shelly chat, weekly review and help-card consumers. Other server reads occur in chat/evaluate/generate/monthlyReview and its data loader. Therefore an audit should name the shared loader and these consumers, not infer that the UI is its only reader.

### Learning Map — curriculum-node coverage

Direct writers are `core/curriculum/updateSkillMapFromFindings.ts` and **`core/curriculum/useSkillMap.ts`**. The former applies findings (export75), initializes history and exports `markProgramCompleteOnSkillMap` (175, final setDoc); current broad symbol search found the program-complete function exported from the curriculum barrel but no production caller. Treat it as a defined writer with unconfirmed runtime reach, not as an active entry point.

`useSkillMap.ts:110,162,252` persists re-derived mastery, history initialization and manual node statuses. Re-derivation reads working levels, completed programs, sight words and priority skills, through `applyReDerivedMastery`; its source specifies upgrade-only/manual-frozen behavior. `LearningMap.tsx:29` consumes this hook. The current `CurriculumTab.tsx` does **not** consume useSkillMap; it manages activity configuration and sends findings to the map (`:524`). Other findings callers are Evaluate Apply, quest completion, `CertificateScanSection.tsx:137`, and Today scan handling (`TodayPage.tsx:1163`).

The old statement **“not read directly by any AI task” is false at this revision**. `functions/src/ai/contextSlices.ts:105-109` includes `childSkillMap` in Shelly chat's context, `:488-489` dispatches its loader, and `:1227` reads the actual collection. Dad Lab calibration and bootstrap also read it. Manual map changes and evidence-derived node changes are not a general reverse write-through to snapshot working levels. Different node vocabularies and evidence sources can yield legitimate or stale disagreement; a matching display is not proof of reconciliation.

### Learner Models — concept frontier and synthesis

Direct writer modules found by collection/path search and followed helper calls are:

- `core/foundations/bootstrapLearnerModel.ts:71-119`: create-only and diagnostic reseed transaction. It also contains **reproject mode**, refreshing band-derived states from current snapshot levels; source/target are read inside its transaction. `progress/useFoundationsBootstrap.ts:131` calls the resolved mode, and `foundationsBootstrap.ts` selects create-only when absent or reproject when present. Diagnostic panel calls reseed (`:178`). The decision table's create-only description is incomplete.
- `core/foundations/workbookPositionSync.ts:85-133`: mapped workbook position evidence; reached by activityConfigWrites, both scan-hook paths and diagnostic sync.
- `features/evaluate/evalModelWriteback.ts:49-68`: completed guided-eval evidence merge.
- `features/quest/questModelSync.ts:54-73`: quest-result merge, called from useQuestSession1033.
- `features/foundations-review/writeReviewAction.ts:63-83`: confirmed review actions. Callers are `useFoundationsReview.ts:417` and `progress/FoundationsTab.tsx:160` (attestation/reconciliation via the same helper).
- `features/today/stuckRetestQueue.ts:132`: queued re-test questions from daily signals.
- `functions/src/ai/learnerSynthesis.ts:66,141`: synthesis-field merge; `synthesizeIfStale` is reached by weekly-review server paths (`evaluate.ts:1813,1899`).

Readers include Foundations tab and its review agenda, planner focus line, server plan/Shelly chat/weekly review via contextSlices' learnerModel slice, quest targeting, diagnostic and restoration survey, and data-review export. Quest's `selectQuestTargets` (`useQuestSession.ts:552`) uses open questions, not a blanket replacement of snapshot state with synthesis.whatMattersNext.

There **is** a narrow snapshot-to-model refresh now (reproject), so “no reconciliation” without qualification is misleading. There is still no general bidirectional cross-store reconciliation. `evalModelSync.ts:214` flags a disagreement with an attestation already inside learnerModels; `progress/conceptOverride.ts:128` reads that flag and compares evidence within that same model. It is not a comparison against snapshot state. Confirmed review actions affect learnerModels only; changing a map concept does not necessarily alter the snapshot's teaching priorities. Position sync and eval/quest writebacks are separate best-effort operations, so partial success remains a possible seam.

### Curriculum position — activity configuration

The actual path is `families/{familyId}/activityConfigs/{activityConfigId}`, with childId stored on the row (and legacy/shared `both` supported); it is **not generally keyed by childId**, despite the decision prose shorthand. Current position is a bookmark, not proof of mastery.

Shared regular writers: `core/firebase/activityConfigWrites.ts` creates/completes/sets position (batch102; updates132,202); `useActivityConfigs.ts` routes add/complete/set-position into it and also has direct generic update190 and reorder243. Its general update calls `syncActivityPositionToModel` when position changes. Curriculum/AddActivityDialog and chat actions call this layer. The position helper describes last-writer-wins semantics intentionally; do not introduce locking in this doc repair.

Other source-present writers must be visible in the trace:

- `useScanToActivityConfig.ts:149-178,262`: worksheet scan transaction/update or create; both paths invoke workbook model sync (203,269) and separate working-level projection.
- `useCertificateProgress.ts:216,249`: certificate update/create plus central snapshot mastered-skills write-through258; **no learner-model workbook-position sync** is called there. DATA-17 remains a real documented seam.
- `core/firebase/strandSessionWrites.ts:497`: transaction increments currentPosition as a strand's session counter and updates recentTopics; explicitly no learnerModels/snapshot/day-log write. This position has different semantics from a workbook page.
- `core/firebase/migrateActivityConfigs.ts:329-337`: client seed/migration path.
- `functions/src/ai/workbookActivityConfigBackfill.ts:177-199`: server batch backfill, called by `ai/chat.ts:3048`.
- `settings/mergeDuplicateConfigs.ts:137`: maintenance metadata update; `updateActivityMinutes.ts:32` is minutes configuration, not academic/position authority.
- `core/firebase/updateActivityPosition.ts:13-38` defines an older raw position helper, but broad symbol search found no production invocation; retain as source-present/unconfirmed reach, not an active scan caller.

Readers include Curriculum UI, useActivityConfigs/chat configuration loader, planner, quest/workbook paces, scan, weekly review and records export. Neither numeric position nor strand-session count may silently become recorded hours or mastery.

### Disposition — derived narrative

`progress/DispositionProfile.tsx:203-208` writes only dispositionCache after a disposition AI response, while `:246,267,269` saves/removes parent dispositionOverrides on the child doc. Read paths are that UI and Shelly chat (`functions/src/ai/tasks/shellyChat.ts:1604-1605`), which layers overrides over cached text. Server disposition context also includes engagement, grade results, recent domain history, snapshot and word mastery (`contextSlices.ts:99-102`): “from day logs” alone is an incomplete input description. This cache is not academic authority and can lag its inputs. Parent overrides remain distinct from regenerated prose. No other learning-store write was found in the inspected disposition handlers.

### Milestones and Ladders — historical surfaces, not current academic authorities

At this revision, `progress/ProgressPage.tsx:30-36` mounts Foundations, Learning Map, Curriculum, Skill Snapshot and Word Wall. There is **no current Progress → Milestones tab** in that list. Searches found `engine.logic.ts:77`'s pure milestone range helper/type residue, not a milestoneProgress Firestore helper or live Progress renderer. The decision's “computed at render” describes a historical design; do not present it as a currently visible journey. Business goal milestones are separate money/goal data and are not the academic milestone surface.

`ladderProgressCollection` and doc-ID helpers remain in `core/firebase/firestore.ts:227-232`; `settings/ghostChildDocs.ts:165` checks ladderProgress as a deletion-safety reference collection. Searches found no runtime learning read/write caller of that collection helper. Portfolio scoring (`records/records.logic.ts:788`) checks **artifact.tags.ladderRef**, not stored ladderProgress; therefore “ladderProgress read by portfolio scoring” conflates the tag with the historical store. Retain deprecated/history status, avoid deleting legacy data, and qualify the absence claim to this searched source scope.

### Stable identity and execution records

Identity remains `children/{childId}`, human-owned for editable identity/soft fields. Settings calls `core/family/updateChildIdentity.ts:48` (birthdate/grade) and `updateChildSoftProfile.ts:47` (motivators/interests/strengths); confirmed portal edits call the latter (`useShellyChatActions.ts:1229`). `seedProfileChildren.ts:138-154` transactionally creates missing canonical child docs without overwriting existing ones, so “no automated process ever writes children identity fields” needs the bootstrap exception. VoiceInputSection36 writes a preference; disposition writes its separate cache/override fields; AvatarAdminTab562 and ghostChildDocs522 contain admin deletion paths. These do not grant the chat generic children-document write authority. Charter/childProfile context, useChildren and active-child UI read identity.

Daily execution remains routed through `today/dayWriteGuard.ts` (guarded set266/merge279/update293 and checklist transactions). Named callers include useDayLog, applyWeekPlan, liveDayEdit, watch/writeWatchItemToDay, quest/fluency auto-complete and workshopUtils. A source-routing rule exists; this trace does not re-prove its whole-program coverage. Day records feed Today, hours/records and review/disposition consumers; no academic projection replaces actual recorded time.

`planner-chat/applyWeekPlan.ts:395-437,600-606` owns Apply's week+day behavior, reached from planner and next-week draft application. **Other week writes exist** in PlannerChatPage (default initialization992, field updates1000/1025, plan persistence1980, redo goals3282) and DevAdminTab's book maintenance314/316. “Single Apply” is not “only weeks writer.”

`watch/useWatchLibrary.ts:30-36` owns additive vet-in; confirmed portal calls it (`useShellyChatActions.ts:558`). The hook also patches existing library rows135, including status changes; picker/library consumers read the stored choices. The portal remains limited to its granted action rather than inheriting the hook's entire write surface.

## Evidence method / actual searches

Verified the revision with `git rev-parse HEAD`, read CLAUDE.md protected-writer and derived-number sections, the FUNC-01 decision, and bounded source sections around the anchors above. Feature-relative paths above are under `src/features/`; `core/` and `features/` paths are under `src/`. Line numbers refer to the pinned revision.

Representative actual successful searches:

```powershell
rg -n 'skillSnapshots|childSkillMaps|learnerModels|ladderProgress|milestoneProgress|dispositionCache|dispositionOverrides|activityConfigs' src functions/src --glob '!*.test.*' --glob '!*.source.*'
rg -l 'skillSnapshotsCollection|/skillSnapshots' src functions/src --glob '!*.test.*'
rg -l 'learnerModelsCollection|/learnerModels' src functions/src --glob '!*.test.*'
rg -l 'childSkillMapsCollection|/childSkillMaps' src functions/src --glob '!*.test.*'
rg -l 'activityConfigsCollection|/activityConfigs' src functions/src --glob '!*.test.*' --glob '!*.md'
rg -n 'updateActivityConfigPosition' src functions/src --glob '!*.test.*'
rg -n 'milestoneProgress|ladderProgress' src functions/src scripts --glob '!*.test.*' --glob '!*.md'
rg -n 'syncWorkbookPositionToModel|bootstrapLearnerModel|writeEval|syncQuest|writeReviewAction|synthesizeIfStale' src functions/src --glob '!*.test.*'
rg -n 'backfillWorkingLevels|backfillBlockIds|commitMasteryRollup' src/features --glob '!*.test.*'
rg -n 'setDayLogGuarded|mergeDayLogGuarded|updateDayLogGuarded|transaction.*Day|transact.*Day|writeDayLog' src --glob '!*.test.*'
```

Follow-up searches for setDoc/updateDoc/transaction/batch calls were scoped to each discovered module, then callers were followed. Named lists deliberately replace unscripted census counts.

## Acceptance / limitations

The audit can now substantively describe every requested surface without treating the decision table as its evidence. The historical decision table links to this dated implementation inventory, particularly the AI map reader, omitted snapshot/map writers, activity key shape, model reproject and historical Milestones/Ladders wording. Keep the original ruling/history intact. No new production fix is proposed here, and observed multiple writers are not by themselves proof of a runtime defect.

This bounded static review does not prove exclusivity across all dynamic paths, historic deployed functions, external administrative scripts or live data. It does not validate permissions or cross-store atomicity, reproduce races, inspect family state, run assessment models, or assert a new master store. Conditional source reach is explicitly separated from defined-but-unlocated callers. Source anchors are revision-bound; final merge conflict repair must retain them or rebase their references.

