# Charter Alignment Review — 2026-04-09

Read-only audit of the First Principles Engine against the Barnes Family Learning Charter.
Each principle is rated **Aligned**, **Partially Aligned**, or **Violated**, with file-path citations.

---

## 1. Five dispositions ARE the report card

**Aligned.**

The Progress page leads with the "Learning Profile" tab (`src/features/progress/ProgressPage.tsx:39`). Its help text explicitly states: "The Learning Profile shows growth in curiosity, persistence, articulation, self-awareness, and ownership — not grades" (`:27-30`). Ladders are accessible but secondary — `src/features/ladders/LaddersPage.tsx` line 1 carries a TODO to remove ladder references after the disposition system is fully live. The `DispositionProfile.tsx` component renders narrative summaries for the five dispositions without any numeric scores.

---

## 2. No grades/scores/rankings on kid UI

**Partially Aligned — Quest UI violates this.**

The Knowledge Mine quest shows score-like metrics directly to kids:
- Running question counter `X/30` in the header (`src/features/quest/ReadingQuest.tsx:564`).
- Running diamond count "X diamonds mined so far" after each answer (`:165`).
- Final summary screen shows `totalCorrect` and `totalQuestions` (`src/features/quest/QuestSummary.tsx:132-142`).
- `EvaluationHistoryTab.tsx:81,130` displays `X/Y correct` for past sessions (parent-facing but navigable by kids).

All other kid-facing surfaces (KidChecklist, KidTeachBack, KidChapterPool, KidConundrumResponse) are clean — no scores, percentages, or rankings.

---

## 3. One-tap emoji engagement

**Aligned.**

After a parent marks a checklist item complete, four emoji buttons appear in a single row (Engaged / Okay / Struggled / Refused). Each is a single `onClick` that calls `handleEngagement()` and persists immediately (`src/features/today/TodayChecklist.tsx:685-707, 293-298`). No multi-step flow or confirmation dialog. On the kid side, mastery feedback uses one-tap chips (Easy / Tricky / Hard) in `KidChecklist.tsx`. `KidExtraLogger.tsx:57` auto-sets engagement to `'engaged'` for self-logged activities.

---

## 4. Extra time counts

**Aligned.**

Kids log extra activities via `KidExtraLogger.tsx` (tap activity type, tap duration, tap "Log It!"). The item is saved as a `ChecklistItem` with `source: 'manual'` and `completed: true` (`:45-89`). Hours calculation in `records.logic.ts:101-114` iterates all completed checklist items with **no filter on source** — manual items count equally toward hours and compliance. Extra activities also award 5 XP + 2 diamonds (`:63-79`).

---

## 5. AI suggests, humans decide

**Partially Aligned — Disposition narrative has no edit control.**

| AI Output | Override? | Evidence |
|---|---|---|
| Skill Snapshot | Full edit | `SkillSnapshotPage.tsx:138-280` — add/edit/delete priorities, supports, stop rules |
| Disposition Narrative | **None** | `DispositionProfile.tsx:220-290` — display-only Card, no edit/override UI. Only option is full regeneration. |
| Week Plan | Partial | `PlanPreviewCard.tsx:160-250` — accept/reject items, edit minutes, remove items. Cannot edit day structure or plan type. |
| Quest Levels | Time-gated | `workingLevels.ts:14-27` — 48-hour manual override guard; automated sources can overwrite after window expires. |

The disposition narrative is the most prominent AI artifact parents will share and it cannot be edited. This is the clearest violation of the principle.

---

## 6. MVD days are real school

**Aligned.**

MVD is consistently framed as legitimate schooling:
- Label is neutral: "Minimum Viable Day" (`src/core/types/enums.ts:250`).
- Kid-facing: "Light day today. Just these X!" (`KidTodayView.tsx:834`) — warm, not apologetic.
- Completion triggers celebration UI (`KidCelebration.tsx:85-96`).
- Charter value injected into AI prompts: "minimum viable days are real school" (`plannerPrompts.ts:35`).
- "Tough Week (MVD)" in the setup wizard (`PlannerSetupWizard.tsx:116`) is contextually honest about energy, not shaming.
- Daily plan templates describe MVD as "the smallest set of items that count as a real day" (`dailyPlanTemplates.ts:13`).

---

## 7. Lincoln teaches London — teach-back first-class

**Aligned.**

Teach-back has dedicated components on both kid and parent sides:
- `KidTeachBack.tsx` — audio-first recording via `MediaRecorder`, creates artifact with `EvidenceType.Audio` and `engineStage: Explain` (`:43-94`). Awards 15 XP + 5 diamonds (`:97-114`).
- `TeachBackSection.tsx` — parent text fallback for capturing what Lincoln taught (`:60-81`).
- Disposition prompt lists "teach-back artifacts" as an observable signal for the Articulation disposition (`functions/src/ai/tasks/disposition.ts:328`).

Teach-back is tracked, rewarded, and feeds into the disposition narrative pipeline.

---

## 8. He speaks before he writes

**Aligned.**

All Lincoln-facing input channels are audio-first or tap-based:
- Teach-back: audio recording only (`KidTeachBack.tsx:43-66`).
- Chapter responses: audio recording (`KidChapterPool.tsx:167-188`).
- Conundrum responses: audio + chip picks, plus TTS reads the scenario aloud (`KidConundrumResponse.tsx:74-97, 64-72`).
- Photo capture: optional text reflection labeled "(optional)" (`KidTodayView.tsx:1140-1149`).
- No required `TextField` or `textarea` exists in any Lincoln-facing component. `useSpeechRecognition.ts` and `useAudioRecorder.ts` are available as shared hooks.

---

## 9. No busywork — skip actions audit

**Partially Aligned — key skip gaps remain. This is the principal concern.**

### What EXISTS:

| Skip Action | How | File |
|---|---|---|
| Skip individual item (mastery-gated) | `skipAdvisor.logic.ts` — `'skip'` at Level 3, `'modify'` at Level 2 | `skipAdvisor.logic.ts:20-83` |
| Accept/reject plan items | Uncheck before applying plan | `PlanPreviewCard.tsx:160-250` |
| Light-day toggle | Normal / Light / Appointment cycle | `LightDayToggle.tsx:1-67` |
| Mark activity complete | Sets `completed: true`, moves to Completed section | `CurriculumTab.tsx:174-183` |
| Delete activity config | Removes entirely | `CurriculumTab.tsx:180-183`, `useActivityConfigs.ts:124-131` |
| Item-level checklist toggle | Uncheck/re-check any item on today's list | `TodayChecklist.tsx:516` |

### What is MISSING:

| Missing Capability | Impact |
|---|---|
| **Skip a workbook for a week** | Parent cannot pause a specific workbook/curriculum for a full week without deleting the activity config and re-creating it later. |
| **Skip by subject** ("skip all Math this week") | No subject-level bulk skip. Must reject items one by one in plan preview. |
| **Auto-skip mastered content** | `skipAdvisor` recommends but parent must manually uncheck each item. No "apply all skip recommendations" button. |
| **Parent-override skip** (below Level 3) | Skip is locked behind mastery gates. A parent who knows content is busywork at Level 1 cannot force-skip without rejecting the plan item. |

The item-level controls are solid, but the workflow for "this whole workbook is wrong for this week" or "skip everything she's mastered" requires too many taps.

---

## 10. Portfolio over grades

**Aligned.**

Portfolio is the primary evidence system (`src/features/records/PortfolioPage.tsx`). Artifacts carry no grade or score fields — only `EvidenceType`, media, tags, and notes (`src/core/types/common.ts:27-50`). Portfolio export generates narrative markdown without scores (`records.logic.ts:295-334`). The `gradeResult` field on `ChecklistItem` (`planning.ts:293`) is a free-text parent observation note (e.g., "needs more practice on regrouping"), not a letter/number grade. The `mastery` field (`planning.ts:295`) uses `got-it / working / stuck` — observational, not scored. No GPA, letter grades, or percentages exist anywhere in the system.

---

## 11. Print the stack

**Partially Aligned — records and compliance have no print flow.**

| Printable | Status | File |
|---|---|---|
| My Books (PDF) | Working | `src/features/books/printBook.ts:853` — jsPDF with settings dialog (page size, sight word highlighting, booklet layout). Accessible from BookReader, BookEditor, and Bookshelf. |
| Weekly worksheets (HTML) | Working | `src/features/planner-chat/generateMaterials.ts:191` — AI-generated themed worksheets, opens browser print dialog (desktop) or downloads HTML (mobile). |
| Records / compliance | **Missing** | No print or PDF export in `src/features/records/`. Hours charts, evaluation history, and compliance dashboard are view-only. |
| Portfolio | **Partial** | Markdown export exists (`records.logic.ts:295-334`) but no formatted PDF or one-click print. |

For Missouri compliance, the inability to print hours logs or evaluation summaries as a formatted document is a gap.

---

## 12. No heroics

**Aligned.**

No flows require parent action at a specific time:
- Weekly review runs automatically Sunday 7pm CT (`functions/src/ai/evaluate.ts:574-609`) with no parent trigger needed. Manual override available via `generateWeeklyReviewNow` (`:520-569`).
- Daily checklist is parent-initiated with no deadlines or overdue alerts.
- Formation prompt in weekly focus (`functions/src/ai/tasks/weeklyFocus.ts:114`) is a suggestion, not enforced.
- MVD is always one tap away — no guilt flow for incomplete days.
- No scheduled reminders, push notifications, or time-gated workflows requiring parent presence.
