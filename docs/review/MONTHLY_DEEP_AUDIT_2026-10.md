# Monthly Deep Audit — 2026-10-24

Automated firing of the monthly audit prompt. It is a detect-only pass: no code, ledger row, invariant or
CLAUDE.md text was changed. The conversational half (prompt-quality read, test-plan authoring) needs a human
and is listed under "Left for the human session".

## Derived numbers

`node scripts/health-census.mjs --rev=65ee1ab9aadd784a7b40beb70305260eb4adbee1 --as-of=2026-10-24` prints:
428,421 TS lines · 4,042 commits · 791 test files · 80 CURRENT docs · 65 older than 30 days.
Against the 2026-09-28 snapshot (382,731 lines / 3,783 commits / 724 tests / 74 docs / 42 stale) that is
+45,690 lines, +259 commits, +67 test files, +6 docs, +23 stale docs. (Both snapshots come from the same script,
so the comparison is valid.)

File sizes below are `wc -l` at HEAD (hand-run, non-test files).

## 1. Top architectural risks

1. **Growth outpaces decomposition.** The five largest source files are unchanged or larger than last month and
   nothing in the debt list moved: `PlannerChatPage.tsx` 3,942 (unchanged), `chat.ts` 3,129 (CLAUDE.md says 3,108),
   `BookEditorPage.tsx` 2,433, `useQuestSession.ts` 2,275, `evaluate.ts` 2,106.
2. **Prose in CLAUDE.md is the real maintenance load.** Single bullets run to thousands of words and restate
   code behaviour; they drift (see stale numbers below) and cost context on every session.
3. **Docs go stale faster than they are touched:** 65 of 80 CURRENT docs are >30 days old (was 42 of 74).

## 2. File growth (vs. CLAUDE.md "Known Technical Debt")

| File | CLAUDE.md says | HEAD | Note |
|---|---|---|---|
| `shelly-chat/ShellyChatPage.tsx` | 647 "Stable" | 874 | claim stale (+227) |
| `functions/src/ai/chat.ts` | 3,108 | 3,129 | +21 |
| `books/BookEditorPage.tsx` | 2,437 | 2,433 | ok |
| `today/TodayPage.tsx` | not listed | 1,982 | past the 1,900 listed files; candidate |
| `progress/CurriculumTab.tsx` | not listed | 1,888 | candidate |
| `records/dataReviewExport.logic.ts` | not listed | 1,966 | candidate |
| `today/LogWorkCard.tsx` | not listed | 1,683 | candidate |

Recommended split targets: `chat.ts` prompt builders (`buildQuestPrompt` first), and the ARCH-02
`useLiveDayEditHandlers` seam in `PlannerChatPage`.

## 3. Data-model coherence

- `workbookConfigs` is still referenced from 20 source files (`grep -l`, hand-run); the ActivityConfig migration
  is not complete. The "308 vs 38 refs" figure in CLAUDE.md is stale.
- `HEALTH_REPORT.md` item still open: CLAUDE.md names `today/captureRowWrite.ts`, the file is `dayChecklistRowWrite.ts`.

## 4. Bundle

No fresh measurement taken (no build run in this audit). Last recorded main chunk 4,225.96 kB after the jsPDF
split (FIX-253). Three.js remains the blocker (ARCH-08).

## 5. Tech debt triage — one item for November

**Recommend: `PlannerChatPage` → `useLiveDayEditHandlers`** (ARCH-02). Largest file, seam already named, ~230 L out
with no change to the tangled core. Alternative if a smaller win is preferred: extract `chat.ts` `buildQuestPrompt`.

## Left for the human session

- Read `plan`, `shellyChat` and `quest` prompts against the charter for bloat (needs judgement, not run here).
- Choose the top two untested paths and write test plans; no coverage report was generated in this run.
- Decide whether to add `TodayPage`, `CurriculumTab`, `dataReviewExport.logic.ts` to the debt list and correct the
  `ShellyChatPage` line.

## Suggested run-prompts (for a human to assign)

1. "Execute ARCH-02: extract `useLiveDayEditHandlers` from `PlannerChatPage.tsx`; no behaviour change; tests pinned."
2. "Doc upkeep: fix `ShellyChatPage` size claim, `captureRowWrite.ts` reference and the workbookConfig ref count in CLAUDE.md."
