# Monthly Deep Audit — 2026-11

**Run:** scheduled routine, 2026-11-14, against `origin/main` @ `1f12b4b5adc4ada433e3dbdacda8cbe9219383c2`.
**Scope:** detect and recommend only (CLAUDE.md › *Routines detect; humans assign*). No code, ledger row,
invariant or prompt was changed by this run. The monthly template expects a back-and-forth conversation;
this is the unattended first pass, written so the owner can pick it up and steer.

## How the numbers here were produced

- Totals and the largest-file list: `node scripts/health-census.mjs --rev=1f12b4b5adc4ada433e3dbdacda8cbe9219383c2 --as-of=2026-11-14`
  (committed script), compared with the pinned 2026-09-28 snapshot in `docs/HEALTH_REPORT.md`
  (`--rev=12ad312b…`). Only files that appear in **both** census outputs get a before/after figure;
  everything else is described with a qualifier, because no committed script prints it.
- Bundle size: one `npm run build` at the same revision, read off `dist/assets/` (`ls -l`, `gzip -c | wc -c`).
  Hand-measured from a build, not pinned by a test.
- Collection-helper count: `grep -oE "collection\(db, *\`families/\$\{familyId\}/[a-zA-Z]+" src/core/firebase/firestore.ts | sort -u | wc -l`.

## 1. Health snapshot (vs. 2026-09-28)

| Metric | 2026-09-28 | 2026-11-14 |
| --- | ---: | ---: |
| TypeScript lines (src + functions/src) | 382731 | 489529 |
| Commits reachable | 3783 | 4204 |
| Test source files | 724 | 866 |
| Unique CURRENT docs | 74 | 81 |
| CURRENT docs untouched > 30 days | 42 | 69 |

`HEALTH_REPORT.md` and `MASTER_OUTLINE.md`'s scale table are both pinned to the September revision and are
now roughly seven weeks old; the scheduled audit has not re-pinned them. The codebase grew by more than a
quarter in that window.

### Top 3 architectural risks

1. **`useQuestSession.ts` is now the second-largest file in the repo (2275 → 3958 lines)** and
   `KnowledgeMinePage.tsx` entered the top 15 at 2068. The Knowledge Mine has become the fastest-growing
   god-hook, and it is the surface that writes working levels and learner-model evidence. CLAUDE.md's debt
   entry still says 2,275L and "consider splitting by quest domain".
2. **Write-path sprawl around protected records.** Several large new modules landed this window
   (program completion writes, native-progress capture, the planner→Ask-AI handoff, Today's Log Work card,
   Stonebridge progress). Each is individually guarded, but the number of transactional writers into
   `learnerModels` / `activityConfigs` / `days` keeps rising, and each carries its own long rule
   paragraph in CLAUDE.md. CLAUDE.md itself is now the single largest piece of "code" every run must load.
3. **Docs freshness is falling behind velocity.** Docs untouched > 30 days rose from 42 to 69 of 81; the
   master outline is still labelled v16 (July). Age is not proof of staleness, but the outline's
   "What's Built" section predates most of the Learner Model, Life Day, strand and program-completion work.

## 2. File growth

Before/after figures (census lists only):

| File | 2026-09-28 | 2026-11-14 |
| --- | ---: | ---: |
| `src/features/quest/useQuestSession.ts` | 2275 | 3958 |
| `src/features/planner-chat/PlannerChatPage.tsx` | 3942 | 4049 |
| `src/features/books/BookEditorPage.tsx` | 2433 | 2505 |
| `src/features/avatar/MyAvatarPage.tsx` | 1897 | 1983 |
| `functions/src/ai/chat.ts` | 3108 | 3131 |
| `functions/src/ai/evaluate.ts` | 2106 | 2106 |

New entrants to the top 15 (not on the September list): `KnowledgeMinePage.tsx` (2068),
`records/dataReviewExport.logic.ts` (2052). Outside the census list, a growth sweep also shows
`ShellyChatPage.tsx` and `EvaluateChatPage.tsx` growing substantially, and several new 1,000-line+
modules (`today/LogWorkCard.tsx`, `core/firebase/programCompletionWrites.ts`,
`shelly-chat/usePlannerAskHandoff.ts`, `progress/program-completion/ProgramCompletionPanel.tsx`) —
qualitative only, since no committed script prints those figures.

**Recommended splits**

- `useQuestSession.ts` — split by quest domain into `useReadingQuestSession` / `useMathQuestSession` /
  `useEncodingQuestSession` over a shared `questSessionCore` (timer, save/recovery, write-back). The
  existing `useQuestSession.saveRecovery.test.tsx` is the regression net; the write-back calls must move
  byte-for-byte (working-level gate, learner-model write-back are protected rails).
- `PlannerChatPage.tsx` — ARCH-02's named seam (`useLiveDayEditHandlers`) is still unbuilt and still the
  cheapest cut.
- `ShellyChatPage.tsx` — the ARCH-09 "Stable" verdict in CLAUDE.md (647L) no longer holds; it has
  re-grown past 1,100 lines. Re-check what accumulated (likely the planner handoff) and whether it belongs
  in `usePlannerAskHandoff`.

## 3. Data model coherence

- `firestore.ts` declares 48 distinct `families/{familyId}/…` collection paths (grep above).
- **WorkbookConfig → ActivityConfig migration: still not complete.** `workbookConfigsCollection` is read
  in two non-test places: `migrateActivityConfigs.ts` (the legacy conversion, expected) and
  `records/dataReviewExportLoader.ts` (the data-review export). CLAUDE.md's debt entry also names the quest
  starting-level check and certificate scan; those no longer reference the helper by name, so the entry is
  partly stale. The remaining work is small: decide whether the export still needs the legacy collection,
  then retire the helper.
- Overlap to watch: `nativeProgressObservations` + `nativeProgressCorrectionMarkers` +
  `programCompletionEvents` + `programCompletionState` are four collections for one feature family. That is
  deliberate (immutable history vs. projection, documented in `DESIGN_FAST_PHONICS_COMPLETION.md`), not
  redundancy — noted so the next audit does not re-raise it.
- `workbookConfigs` and the orphaned `bookThemes` documents remain unread legacy data; no delete is proposed
  (data deletes are propose-and-confirm).

## 4. AI prompt quality (plan, shellyChat, quest)

`functions/src/ai/tasks/plan.ts`, `tasks/shellyChat.ts` and `tasks/quest.ts` did not change size this
window (census sweep), so no new drift entered through them. Standing observations:

- `chat.ts` still carries `buildQuestPrompt` (400+ lines) — the quest prompt is the one of the three that
  lives outside its task file. Extracting it is the highest-leverage prompt-hygiene change and is
  behaviour-neutral if snapshot-tested.
- The hours-target language was removed from prompts by UX-410 (`promptHours.ts`), and
  `aiHoursReaders.source.test.ts` guards it — the charter point "hours aren't the goal" is now enforced,
  not just stated.
- A full read for bloat/charter alignment needs the conversation; flagged as an agenda item, not assessed.

## 5. Test coverage

Every feature directory with real logic has tests. The only zero-test feature directories are single-file
shells (`auth`, `login`, `not-found`, `planner`, `ui-preview`). Targeted plan for the top 2 risks:

1. **`useQuestSession` split safety net** — before any split, add a characterization test that drives one
   session of each quest domain through the hook and asserts the exact write-back payloads
   (working level via `canOverwriteWorkingLevel`, learner-model evidence, XP). This pins the protected
   writes so the split can be verified as a pure move.
2. **`components/RequireParent`** — a dedicated render test that it redirects a child profile and admits a
   parent. It is the access boundary for every parent-only route; today it is exercised only indirectly
   (e.g. `WatchLibraryPage.test.tsx` walks the route table) and has no test of its own.

## 6. Bundle and performance

| | CLAUDE.md (last recorded) | 2026-11-14 build |
| --- | ---: | ---: |
| Main chunk (raw) | 4.23 MB | 4,564,876 B (≈4.56 MB) |
| Main chunk (gzip) | 1.26 MB | 1,362,700 B (≈1.36 MB) |

The main chunk has grown again after FIX-253's jsPDF split. Three.js (ARCH-08) is still in it. The plan
that would move the number most: lazy-load the avatar/Hero Hub route tree (Three.js + voxel + Stonebridge)
with `React.lazy`, since only kid profiles visiting *My Hero* need it. On a phone on cellular, the first
Today load would drop by the Three.js share of the chunk; that figure should be measured in the run that
does it rather than estimated here.

## 7. Tech debt triage

**Worse:** `useQuestSession.ts` (much), `PlannerChatPage.tsx`, `ShellyChatPage.tsx` (no longer "Stable"),
`MyAvatarPage.tsx`, bundle size.
**Flat:** `chat.ts`, `evaluate.ts`, `WorkshopPage.tsx`, `VoxelCharacter.tsx`, `contextSlices.ts`,
`ReadingQuest.tsx`.
**Partly resolved:** WorkbookConfig migration (two readers left, one of them the expected migrator).
**Stale entries in CLAUDE.md's debt section:** the line counts for `useQuestSession`, `ShellyChatPage`
(647L), `PlannerChatPage`, `MyAvatarPage`, `BookEditorPage` and the bundle (4.23MB). A mechanical doc pass
should refresh them from the census.

**The one thing to fix this month: split `useQuestSession.ts`.** It nearly doubled, it sits on protected
write rails, and every new quest type makes the split more expensive.

## 8. Proposed run-prompts (for the owner to paste, not auto-run)

**A. `ARCH-` — split `useQuestSession` by quest domain**
> Ground against `src/features/quest/useQuestSession.ts` at current `origin/main`. First add a
> characterization test that runs one reading, one math and one encoding session through the hook and pins
> every write payload (working level, learner-model evidence, XP, session save). Then split into a shared
> core plus per-domain hooks with no behaviour change; the characterization test and
> `useQuestSession.saveRecovery.test.tsx` must pass unchanged. No working-level, `xpLedger` or
> `learnerModels` logic may change — this is a move. Add a ledger row, open a PR, follow End of run.

**B. `DOC-` — refresh the health snapshot and debt section**
> Re-pin `docs/HEALTH_REPORT.md` and `MASTER_OUTLINE.md`'s scale table to current `origin/main` with
> `scripts/health-census.mjs`, refresh the line counts in CLAUDE.md › Known Technical Debt from the census
> output (paste, don't retype), mark `ShellyChatPage` no longer Stable, update the WorkbookConfig entry to
> name its two remaining readers, and record the new main-chunk size from a build. Docs only.

## Open items for the conversation

- Should `dataReviewExportLoader` keep reading legacy `workbookConfigs`, or is it time to retire the helper?
- Prompt bloat read of plan / shellyChat / quest (needs the session).
- Whether CLAUDE.md's per-feature paragraphs should move into per-directory docs so runs load less.

## Not verified by this run

- `npm run build`: passed at this revision.
- `npx eslint .`: 0 errors, 2 warnings (the September report recorded 3).
- Full root test suite: started, did not finish inside the run's 590 s window — **no pass/fail claim**.
  CI on `main` is the authority.
- `npm audit`, `docs:check`: not run.
