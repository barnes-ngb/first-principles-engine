# First Principles Engine

## Build & Test Commands

- `npm run build` — TypeScript check + Vite build (`tsc -b && vite build`)
- `npm run dev` — Start dev server
- `npm test` — Run vitest
- `npm run lint` — Run ESLint
- `npx tsc -b` — Type-check only (no emit)

## AI Development Operating Model

How this project is built by AI sessions (Claude Code and design chats). These conventions are
load-bearing — follow them even when a request doesn't restate them.

**How work is assigned.** Substantive changes — structure, features, docs — are assigned by a human
through self-contained run-prompts pasted into Claude Code. A run grounds itself against the code,
makes the change, updates the review ledger, and opens a PR. Sessions don't freelance scope beyond
the run they were given.

**Branch + PR, never merge.** Every change lands on a branch with a PR. **Do not merge** — the human
reviews and merges (usually from a phone). Never push directly to `main` or `deploy`.

**Invariants are propose-and-confirm.** Never silently change: compliance / `hours` math, the
`xpLedger`, `skillSnapshots` (write only via the central `skillSnapshotWrites.ts`), the charter
preamble, or `firestore.rules`. Changes touching these are proposed and stop for a human decision.
Any user-facing write to a child's record goes propose → confirm → write; never auto-write.
The central `skillSnapshotWrites.ts` writer is **additive-only**: beyond the scan mastered-skill
write-through, it supports additive, evidence-stamped edit ops (Build 6a / Tier C Option 2) —
`addPrioritySkills` / `addSupports` / `addStopRules`, each deduped and stamped as a parent
directive. It **never removes or downgrades** (RESOLVED/DEFER blocks and existing levels are
untouched); removals/downgrades are the future Option 3 and need a separate override path.

**The review ledger is the backlog + memory.** `docs/review/REVIEW_HOME_BASE.md` §6 is the source of
truth for open work (ID prefixes: `ARCH-` / `FUNC-` / `TEST-` / `DATA-` / `ETHOS-` / `DOC-` / `FEAT-`).
Every run reads it, updates the relevant row, and never reuses an ID. Reusable run-prompts live in
`docs/review/prompts/`; decision docs (e.g. `DECISION_FUNC-01_*`) record settled architecture choices.

**Two chats, split ownership.** A home-base chat owns architecture/review plus non-portal ledger items
and the monthly audit. A dedicated build chat owns the Shelly Chat portal feature, its design doc, and
its ledger rows (`FEAT-01`, `FUNC-03`, `ARCH-10`). Each edits only its own ledger rows; merge ledger
PRs promptly to avoid trivial table conflicts.

**Routines detect; humans assign.** Scheduled routines (claude.ai/code/routines) run audits and
mechanical doc upkeep — stat numbers, index entries, alignment — and surface findings into the ledger.
They do **not** autonomously make substantive structural or feature changes; those are human-assigned.
If a fix-making routine exists, it is scoped to one ledger issue at a time behind a reviewable PR.

**Phone-first.** A run does all build / lint / test / git in its own environment. Never instruct the
human to run a local command — their actions are limited to: pasting a run, uploading a file, and
reviewing / merging a PR.

**Lincoln-first / London minimal.** Wire new work for Lincoln; gate London out of untuned surfaces on
**capability, never on his name** (`isLincoln`/`ageGroup` are cosmetic/personality, not access). London's
account/profile stays live but his experience is intentionally minimal — a surface opens for him only
when it's tuned for a 6-year-old. Log London-specific work in `docs/LONDON_BACKLOG.md`; don't build it
speculatively. Parity is **not** the goal.

### Ledger integrity & base discipline

- **Branch from fresh `origin/main`, and verify the ledger head against the remote before editing.**
  A local checkout or git-proxy snapshot can serve a stale `REVIEW_HOME_BASE.md`; trust the remote,
  not the local ref. Run `git fetch origin main` and diff the ledger against `origin/main` before
  touching it.
- **Ledger edits are additive.** Add new rows; update only the status of rows you own. **Never**
  rewrite, reorder, or delete existing rows, and **never** reopen a `RESOLVED`/`FIXED` item.
- **A ledger diff that shows deletions, reordering, or reopened items means your branch is on the
  wrong base — stop, rebase onto current `origin/main`, and redo.** A correct ledger PR reads
  `+N rows / −0`, one file changed.
- **Single-writer-ish ownership.** The home-base chat owns the review ledger. The build chat edits
  only its portal rows (`FEAT-01`, portal `FUNC-*`, `ARCH-10`). Routines may flip a row **they are
  claiming** to `IN PROGRESS` but must not rewrite other rows. When two PRs touch the ledger, merge
  promptly and in order; if one shows more than additive changes, it's stale — rebase it.

## TypeScript Constraints

### `erasableSyntaxOnly` is enabled

Do **not** use `enum` declarations — they emit runtime code and are blocked by `erasableSyntaxOnly` in `tsconfig.app.json` and `tsconfig.node.json`.

Instead, use `as const` objects with companion type aliases:

```ts
export const MyEnum = {
  Foo: 'Foo',
  Bar: 'Bar',
} as const
export type MyEnum = (typeof MyEnum)[keyof typeof MyEnum]
```

### `verbatimModuleSyntax` is enabled

Use `import type` for type-only imports:

```ts
import type { SomeType } from './types'
```

## Deploy

### CI/CD (preferred method)
- **Push to `main`**: CI runs tests. If `firestore.indexes.json` changed, indexes auto-deploy.
- **Push to `deploy` branch**: Full deploy — hosting, functions (if changed), Firestore rules + indexes, Storage rules + CORS.

### How indexes deploy
Firestore indexes deploy automatically in three ways:
1. When `firestore.indexes.json` changes on `main` (`.github/workflows/deploy-indexes.yml`)
2. When functions change on `deploy` branch (deployed alongside functions)
3. Unconditionally on every `deploy` branch push (`.github/workflows/deploy.yml` line 74)

You should never need to manually run `firebase deploy --only firestore:indexes`.

### Manual deploy (use sparingly, from Claude Code)
If you must deploy manually, always include indexes:
```
firebase deploy --only functions,firestore:indexes
```
Never deploy functions without indexes — new queries may require new composite indexes.

## Common Patterns

### Firestore document mapping

When spreading Firestore document data that includes an `id` field, always put `id` **after** the spread so the document ID takes precedence:

```ts
// Correct — document ID wins
const items = snapshot.docs.map((doc) => ({
  ...(doc.data() as MyType),
  id: doc.id,
}))
```

### Vitest config

`vite.config.ts` uses `defineConfig` from `vitest/config` (not `vite`) so the `test` property is typed correctly.

## Project Structure

- `src/app/` — App shell, routing, theme provider
- `src/components/` — Shared UI components (SectionErrorBoundary, ErrorBoundary, ScanButton/ScanResultsPanel, XpDiamondBar, ChildSelector, PhotoCapture, `VoiceInput/` — reusable Whisper/Web-Speech voice input module, `avatar/` — TierUpCeremony)
- `src/core/auth/` — Auth context and hooks
- `src/core/firebase/` — Firebase/Firestore setup, collections, upload
- `src/core/hooks/` — Shared hooks (useActiveChild, useChildren, useChildSkillSnapshot, useCreativeTimer, useDebounce, useSaveState, useScan, useAudioRecorder, useAudioRecording, useSpeechRecognition, useTranscription, useTTS, useActivityConfigs, useScanToActivityConfig, useCertificateProgress, useMonthlyReviews, `useLearnerModel` — read-only `onSnapshot` subscribe of `learnerModels/{childId}`, shared by the Foundations tab + planner focus line)
- `src/core/types/` — Domain types (`common.ts`, `family.ts`, `planning.ts`, `evaluation.ts`, `disposition.ts`, `books.ts`, `compliance.ts`, `dadlab.ts`, `workshop.ts`, `xp.ts`, `skillTags.ts`, `shellyChat.ts`, `monthlyReview.ts`, `feedback.ts`, `errorLog.ts`, `stonebridge.ts`, `business.ts`, `learnerModel.ts`, `zod.ts`) and enum-like constants (`enums.ts`)
- `src/core/utils/` — Date/time utilities, formatting, doc ID parsing, compliance mapping, energy patterns, domain mapping, blocker lifecycle, workbook matching, session timer, image compression, `sanitizeJson` (re-exports the one shared LLM-JSON parser from `functions/src/shared/sanitizeJson.ts` — ARCH-47 slice 3; it was a hand-kept client port that had drifted behind the server copy)
- `src/core/ai/` — AI service interface (useAI hook), feature flags, prompt templates (`prompts/plannerPrompts.ts`)
- `src/core/profile/` — Profile context provider and hook (family + children), child identity/age helpers (`childIdentity.ts`, `childAge.ts`)
- `src/core/xp/` — XP ledger, armor tiers, armor unlock logic
- `src/core/avatar/` — Daily armor session management (`getDailyArmorSession.ts`)
- `src/core/curriculum/` — Curriculum knowledge map, skill mapping, finding integration (curriculumMap, mapFindingToNode, skillStatus, updateSkillMapFromFindings, useSkillMap)
- `src/core/family/` — Shared family writers (`updateChildSoftProfile` — motivators/interests/strengths, `updateChildIdentity` — birthdate/grade)
- `src/core/observability/` — Client error reporting (ErrorReporterSync, scrubError, anonymize, errorSink, buildInfo)
- `src/core/data/` — Database seed data
- `src/core/compliance/` — MO state compliance mapping (`stateCompliance.ts`)
- `src/core/foundations/` — Foundations concept graphs (reading/math), review priority ordering, quest targeting, learner-model seeding (`index.ts` barrel, `readingGraph.ts`, `mathGraph.ts`, `reviewPriority.ts`, `questTargeting.ts`, `fastPhonicsBridge.ts`, `seedLearnerModel.ts`, `dailySignalTargeting.ts` — FEAT-68/69 pure resolver: a daily struggle on an item → frontier concept(s), unioning the **bridged** workbook position (`bridgeCoveredConcepts`) with the item's **skillTags** (`tagConceptBridge.ts` → `conceptsForTags`, FEAT-69), `[]`/no-guess for unbridged/uncurated sources and unmapped tags, `tagConceptBridge.ts` — versioned owner-curated `skillTag → conceptId` table, `writing.*`/`regulation.*` map to `[]` by design), `evalModelSync.ts` — FEAT-76 pure guided-eval→learner-model projector (`computeEvalRead` maps finding status → concept read via the shared `mapFindingToNode` bridge; `applyEvalFindingsToModel` is the **calibrated sibling** of `questTargeting`'s upgrade-only writer — a guided eval is the highest-confidence signal so it may move a concept UP *or DOWN*, **but** only for concepts it assessed, never over a parent `attestation` (appends `eval` evidence + flags `needsReconcile`), and downward moves use no-shame changeFeed wording; *source confidence gates downgrade* — derived/quest/workbook writers stay upgrade-only))
- `src/features/auth/` — Auth guard route wrapper
- `src/features/avatar/` — Voxel avatar, armor, tier celebrations, pose system, icons, decomposed panels (ArmorPieceGallery, ArmorVerseCard, AvatarPhotoUpload, AvatarHeroBanner, AvatarCharacterDisplay, ArmorSuitUpPanel, AvatarCustomizer, speakVerse), VoxelCharacter (Three.js character, armor, poses, materials, camera), `voxel/` sub-module (armor meshes, pose definitions), `stonebridge/` sub-module (Banner Rally missions, progress computation, location art, banner-raise celebrations)
- `src/features/books/` — Bookshelf, book editor/reader, generate chat, review chat, sight word dashboard, story guide, print/PDF
- `src/features/business/` — Barnes Bros business tab (FEAT-29/30): sales log, goal thermometer/builder, product curation over existing books/stickers (see `docs/BUSINESS_TAB_DESIGN.md`); GDQ Kit Builder (FEAT-80: `KitBuilderSection`/`KitBuilderForm` + `useKitRosters`); Product Catalog (FEAT-81: `CatalogSection`/`CatalogProductForm`/`CatalogProductCard` + `useCatalogProducts`, promote-from-roster — the "show" layer, see `docs/BARNES_BROS_CATALOG_DESIGN.md`); public catalog site + order queue (FEAT-84/85/86: `publicCatalogPage`/`catalogSitePublish`/`useCatalogSite`; FEAT-89: `OrdersSection` + `useCatalogOrders` — the outreach loop, orders placed on the public site via the `submitCatalogOrder` endpoint and fulfilled in-app with a forward-only status stepper)
- `src/features/dad-lab/` — Dad Lab lifecycle (plan, start, contribute, complete). `reportArtifacts.ts` is the single pure answer to "what's on this report" (UX-85): `reportArtifactIds` unions `childReports[*].artifacts` with `beats[*].items[].artifactId` and de-dupes by id, because FEAT-156 routes uploads to beats — a card reading only the child-report side shows a lab full of photos as empty. Both lab cards and `records/dataReviewExport.logic.ts`'s `reportOwnedArtifactIds` read it; there is one definition
- `src/features/engine/` — Engine page and engine logic
- `src/features/evaluate/` — Reading evaluation chat, findings extraction. FEAT-75: the completed eval's `frontier` is retained on the `EvaluationSession` record + surfaced read-only in history; Apply is repeatable (re-apply confirms). FEAT-76: on Apply, `evalModelWriteback.ts` (thin, fire-and-forget, guarded model-exists, merge-only, sets `synthesisStaleAt`) projects findings onto `learnerModels` via the pure `evalModelSync` projector — **alongside** the unchanged `skillSnapshots` write, never blocking apply
- `src/features/evaluation/` — Skill snapshot page, quick check panel
- `src/features/foundations-review/` — Foundations Review Chat (FEAT-51): subject-scoped parent conversation that establishes concept states by evidence or testing, propose→confirm→write into `learnerModels`. **`writeReviewAction.ts` is the single `learnerModels` merge-write for a confirmed review action** (FEAT-66) — merge-only, single-key `conceptStates`, `synthesisStaleAt` stamped; both the chat's `applyAction` and the Foundations tab's concept override go through it, so the payload shape has exactly one definition. `statePhrase.ts` holds the shared §14 plain-language state wording used by the confirm card and the tab's override choices
- `src/features/login/` — Profile selection
- `src/features/not-found/` — 404 page
- `src/features/planner/` — TeachHelperDialog (shared)
- `src/features/planner-chat/` — Plan My Week (AI chat planner, decomposed: PlannerChatPage + PlannerSetupWizard, WeekFocusPanel, PlanDayCards, PlannerChatMessages; `applyWeekPlan.ts` — **the single Apply** (FEAT-150): the `WeekPlan` upsert + the Mon–Fri day writes, extracted out of `PlannerChatPage.handleApplyPlan` so the planner and the chat share ONE lane rather than two copies of a day-write. Pure core + one guarded writer, `canEdit` required, every day routed through `setDayLogGuarded`; `readAloudBookId` is three-state (`undefined` leaves the week's book alone) and `lessonCardMap` is the caller's, so a caller with no book picker and no card generation is first-class. Lesson cards, the `plannerDefaults` write, help cards, the chapter pool and every snack stay on the page — those are the planner's enrichments, not the apply; `FoundationsFocusLine` — the FEAT-65 one-line ambient learner-model focus surface, taps through to the Foundations tab, hidden when the model is empty). FEAT-72: `parseAIResponse` deterministically backfills a real **catalog** `skillTag` on every AI-plan item at parse time (`backfillCatalogTags` → `autoSuggestTags`, single best tag, no synthetic `subject.general`, `[]` for subjects with no unambiguous targeted mapping — Science/SocialStudies/Other and `LanguageArts`, the latter excluded because its reading-first default would seed false CVC re-tests for writing items), so AI-generated items carry tags the FEAT-68/69 daily-signal→re-test bridge can map — never trusting the LLM's emitted tags. FEAT-73: **both** planner paths now share one no-guess decision, the exported pure `resolveSuggestedTags(subject, prioritySkillTags)` — priority-matched (witnessed) tags win; an unwitnessed LA/non-core subject-default is a cross-domain guess and is suppressed (`[]`); reading/math keep their same-domain subject default. The deterministic workbook-assignment loop routes through it directly (replacing the old raw `autoSuggestTags`); `backfillCatalogTags` defers to it for non-core + reading/math but stays **stricter** on LA (the AI path lacks the deterministic planner's workbook+snapshot witness, so a priority match never rescues an LA item there). Skill-practice items (`emergingSkills`/`developingSkills`) are untouched — they stamp witnessed priority skills straight from the snapshot.
- `src/features/progress/` — Progress tabs. **Tab order (FEAT-65): Foundations (index 0) · Monthly Books · Learning Map · Curriculum · Skill Snapshot · Word Wall.** `FoundationsTab` (Learner Model Phase 3b) is the first-class parent home for the Learner Model — graduates the `?diag=1` `FoundationsDiagPanel` render out from behind the flag: `synthesis.whatMattersNext` focus, the concept terrain (tap → evidence drawer), modality calibration, the `changeFeed` "What moved" (with deterministic `→ solid` loop-confirmation cards, G3), routed open questions, and `DispositionProfile` embedded as the final section (the former standalone "Learning Profile" tab is absorbed). **Read-only except for one write (FEAT-66): the parent concept override.** The drawer lets a parent record what they've seen (three states — `solid`/`forming`/`frontier`, never `not-yet`) and resolve FEAT-76's `needsReconcile` flag when a guided eval disagreed with their word (both reads shown; keep-my-word / take-the-model's-read). Every route is propose→confirm→write, builds the same `attest` action, and persists through the shared `foundations-review/writeReviewAction.ts` — `learnerModels`-only, no second write path, nothing writes on a single tap. Pure presenters + the §14 scrub live in `foundationsView.ts`; the override/reconcile presenters in `conceptOverride.ts`. `ProgressPage` uses a `{ label, render }[]` tab descriptor array (no index-based guards)
- `src/features/progress/CurriculumTab.tsx` — Curriculum management tab (activity configs)
- `src/features/progress/learning-map/` — Learning Map UI components (visual curriculum knowledge map)
- `src/features/progress/DispositionProfile.tsx` — AI disposition narrative from day log data, with per-disposition parent overrides (inline edit, revert to AI)
- `src/features/quest/` — Knowledge Mine (interactive reading quest)
- `src/features/records/` — Hours, compliance, evaluations, portfolio
- `src/features/settings/` — AI usage, account, avatar admin, sticker library, Dev tab (admin-only: chapter book seeding, Sunday cleanup, working levels backfill)
- `src/features/shelly-chat/` — Shelly AI chat assistant. Decomposed (ARCH-09): `ShellyChatPage` thin shell, `useShellyChatState` (state/refs), `useShellyChatFlows` (effects + send/image/upload/thread-CRUD handlers), `useShellyChatActions` (portal write layer — propose→confirm→write for sight words, profile soft fields, and additive skill-snapshot edits), `reflectionSuggestions`, `parseFollowups`, `parseChatActions`, `parseFriction`, `logFeatureRequest`. Portal scope: Tier A+B complete (sight words + `editProfileField`), Tier C Option 2 live (additive snapshot edits via `skillSnapshotWrites.ts`). All writes are confirm-gated. **FEAT-150 (chat arc, slice 4 of 4 — complete):** the chat can reshape **next week**. `draftNextWeek` carries the parent's instructions only — no plan, no `weekStart`, no apply flag — and confirming it spends one generation through the **planner's own** `TaskType.Plan` + `buildPlannerPrompt` (`generateNextWeekDraft.ts`; there is no second week prompt). The draft renders in full via the planner's read-only `PlanDayCards` (`NextWeekDraftCard.tsx`), and applying it is a **second, separate tap** with **no `ChatAction` kind behind it** — so no reply can reach a week write in one confirmation. `nextWeekActions.ts` owns the week window (next school week only, re-resolved at the write), the capability gate and the card copy; `writeNextWeekDraft.ts` is a router adding that one rail over the shared `planner-chat/applyWeekPlan.ts`. `useNextWeekDraft.ts` owns the two-tap state machine; `useChatPlannerDefaults.ts` reads the planner's per-subject minutes so both surfaces draft alike. **FEAT-157 (slice 5):** Dad Lab from the chat — `createConceptArc` / `planLab` (create-only; arc steps land verbatim with dialog-rule statuses via the extracted `dad-lab/useConceptArcs.createArc`, `createdFrom: 'ai-suggested'`; labs land `Planned`-only, zero hours, via the extracted `dad-lab/plannedLab.ts` lane the page's suggestion flow also uses), resolved against live arcs in `dadLabActions.ts` before a card is offered — plus the grammar-level **no-substitution rule** in the base role (both branches): an action kind may never stand in for a write the chat doesn't have. All writes are confirm-gated. See `docs/barnes-shelly-chat-portal-design.md` for full design.
- `src/features/today/` — Parent Today (decomposed: TodayPage shell + TodayChecklist, WeekFocusCard, UnifiedCaptureCard, TeachBackSection, ChapterQuestionPool) + Kid Today (decomposed: KidTodayView shell + KidChecklist, KidTeachBack, KidChapterPool, KidConundrumResponse, KidExtraLogger, KidCelebration) + routine sync, XP, scan advance, rollover, budget enforcement. FEAT-68/69: a daily struggle signal also seeds the learner-model re-test queue (`stuckRetestQueue.ts` → `enqueueStuckRetests`, reusing the `queueTest` write path) in parallel to the untouched `masteryBlocker.ts` → `skillSnapshots.conceptualBlock` write; the next Knowledge Mine re-tests it (`selectQuestTargets`). Three wired signals: the **"stuck"** mastery chip (`handleMasteryChip`), the `engagement:'struggled'` flag (`handleEngagement`, stamped `ENGAGEMENT_RETEST_REASON`), and — FEAT-70 — the review note's optional default-off **"Was anything here tricky?"** toggle (`handleSaveGradeNote`, persisting the additive `ChecklistItem.reviewFlaggedTricky` in the same day-log write and stamped `GRADE_NOTE_RETEST_REASON`). All three resolve via the workbook position ∪ skillTag bridge, so **non-workbook** items now seed too (`engagement:'refused'` deliberately skipped — regulation, not a concept miss). FEAT-70 is a **different moment**, not a duplicate: Quick Review is gated on `evidenceArtifactId`, so it fires only *after* capture when the parent has looked at the work — often when the chip already reads `got-it`. It is **structured capture, never an LLM parse of `gradeResult`** (the free-text note stays unread by machines — an LLM prose→conceptId mapping would be the only non-deterministic seeder in the queue, and the note's placeholder is deliberately no-judge). Fires only on the false→true transition (`shouldSeedFromReviewNote`) because the `queueTest` branch appends a `changeFeed` line unconditionally while `withOpenQuestion` only dedups the ask. Adds a fourth **caller**, not a fourth path — `enqueueStuckRetests` and the resolver are untouched — and writes no `skillSnapshots` (the `conceptualBlocks` write stays exclusive to the chip) and never sets `mastery`/`engagement`
- `src/features/ui-preview/` — Component gallery (dev-only, unlinked from nav)
- `src/features/weekly-review/` — Weekly review page
- `src/features/workshop/` — Story Game Workshop (board/adventure/card games), `steps/` sub-module (wizard step components)
- `src/features/monthly-review/` — Monthly review books (reader, kid books-about-me page, generate/publish controls, photo handling)
- `src/features/watch/` — Watch Vehicle curated video library (FEAT-100, design FEAT-86): parent vet-in (`WatchVetInForm`), list (`WatchLibraryTab`, mounted on its own parent-gated `/watch` route via `WatchLibraryPage` — FEAT-132 moved it out of Settings), playback (`WatchPlayer`/`WatchPlayerDialog`, validated-YouTube-id only, `youtube-nocookie.com` embed) and completion tracking (`useWatchItemCompletion`/`watchItemCompletion.ts`) + `useWatchLibrary` hook. `WatchLibraryPicker` is wired into `PlannerChatPage` (FEAT-104/107) — parents pick a vetted video to plan onto a day, with inline vet-in from the planner. **FEAT-132** adds two more ways in and one shared shape: `watchDayItem.ts` is the single definition of a watch row (`buildWatchDraftItem` for the pre-Apply draft, `buildWatchChecklistItem`/`appendWatchItemToDayLog` for a live day — `source: 'manual'` so a re-apply keeps it, otherwise byte-identical to the apply mapping), and `writeWatchItemToDay.ts` is the additive, guard-routed write the planner uses **after** Apply (the day cards stay visible in the active phase with "Add a video" still live). Today's parent edit mode uses the same picker + shared builder against the live `dayLog`. Parent-gated on both paths — kids never add or curate
- `functions/src/` — Firebase Cloud Functions (AI endpoints)

## North Star

**First Principles Engine** is a phone-fast family learning notebook that:
- expresses our Charter/Ethos
- runs daily school (Normal Day / Minimum Viable Day)
- captures evidence artifacts (notes/photos/audio)
- visualizes weekly progress (Flywheel)
- tracks growth (Dispositions + Milestones + Curriculum Map)
- exports records (MO-friendly: logs + hours + portfolio + eval)
- adapts weekly via AI-powered evaluation loop

## First Principles Alignment

The app's growth tracking follows the Ad Astra / Astra Nova pedagogy:
- **Disposition over content mastery**: curiosity, persistence, articulation, self-awareness, ownership
- **Wonder→Build→Explain→Reflect→Share** is the philosophical framework, not a counting system
- **AI synthesizes** growth narratives from data Shelly already captures
- **Conundrums** build ethical reasoning through weekly open-ended scenarios
- **Teach-back** (Lincoln teaches London) is the richest learning evidence
- **No grades, no shame**: "growing" not "passing", struggles are data not failure

## Project Principles

1. **Frictionless daily use**: "Today" must be usable in under 60 seconds.
2. **Small artifacts > perfect documentation**: capture evidence quickly.
3. **Narration counts**: audio evidence is first-class (especially for Lincoln).
4. **Tags power everything**: engineStage + subjectBucket + location + ladderRef.
5. **Defaults everywhere**: reduce decision fatigue.
6. **No heroics**: ship thin slices; keep UI simple; iterate.
7. **Charter alignment**: all AI-generated content must be reviewable against family values.
8. **AI is additive**: local logic stays as fallback; LLM paths are feature-flagged.

## Repo Conventions

### Dates
Store dates as `YYYY-MM-DD` strings for easy Firestore queries and sorting.

### Tags (required for artifacts)
- `childId`, `engineStage`, `subjectBucket`, `location`, `domain`
- Optional: `ladderRef`, `weekId`, `dayId`, `pillar`

### Mobile-first UI
- Large tap targets, minimal text entry
- Prefer dropdowns + templates
- Keep forms short

### Terminology
**Terminology**: Use "sight words" throughout. The `sightWordProgress` collection is the canonical store. "Heart words" (a UFLI term) is not used in this codebase.

### Plan type terminology
Use `'normal'` / `'mvd'` (not the legacy `'A'` / `'B'`) for `DailyPlan.planType`. The `PlanType` const enum in `enums.ts` is the source of truth. Display labels come from `PlanTypeLabel` ("Normal Day" / "Minimum Viable Day"). The Firestore converter in `firestore.ts` normalizes legacy `'A'`→`'normal'` and `'B'`→`'mvd'` on read.

### Commit style
Use clear prefixes: `chore:`, `feat:`, `fix:`, `refactor:`, `docs:`, `test:`

Aim for commits that implement one component/flow, can be reverted cleanly, and do not mix scope areas.

### Cross-platform npm scripts
Nathan develops on Windows PowerShell. Never use bash-style inline env vars (`FOO=bar cmd`) in npm scripts — they break on Windows. Always use `cross-env`:
```json
"my-script": "cross-env FOO=bar tsx scripts/my-script.ts"
```
See `docs/SCRIPT_CONVENTIONS.md` for full conventions.

## Firestore Collections

All under `families/{familyId}/`:

| Collection | Purpose |
|---|---|
| `children` | Child profiles |
| `weeks` | Weekly plans |
| `days` | Daily logs |
| `artifacts` | Evidence artifacts (photos/audio/notes) |
| `hours` | Manual hours entries |
| `hoursAdjustments` | Hours adjustments |
| `evaluations` | Skill evaluations |
| `ladderProgress` | Per-child ladder progression |
| `dailyPlans` | Daily session plans |
| `dadLabReports` | Dad Lab session reports |
| `conceptArcs` | Dad Lab concept arcs per family (auto-ID documents) |
| `skillSnapshots` | Per-child skill snapshots |
| `plannerConversations` | Planner chat conversations |
| `lessonCards` | Lesson card definitions |
| `helpCards` | Today inline teaching help cards (FEAT-43). Doc ID: `{childId}__{subjectSlug}__{labelSlug}` |
| `weeklyReviews` | AI-generated weekly adaptive reviews |
| `monthlyReviews` | AI-generated monthly review books per child (doc ID: `{childId}_{YYYY-MM}`) |
| `workbookConfigs` | Workbook pace/config per child (legacy — see activityConfigs) |
| `activityConfigs` | Structured activity definitions per child (replaces routine text + workbook configs) |
| `xpLedger` | XP event log for armor progression |
| `books` | Kid-authored books (My Books) |
| `stickerLibrary` | Family sticker assets |
| `sightWordProgress` | Per-child sight word mastery tracking (writers in `useSightWordProgress`: `recordInteraction`/`confirmMastery` + shared `addSightWord`/`removeSightWord` — the latter two are the Shelly portal's confirmed-write path) |
| `aiUsage` | AI token usage and cost tracking |
| `avatarProfiles` | Per-child avatar customization |
| `dailyArmorSessions` | Daily armor XP session tracking |
| `evaluationSessions` | Interactive evaluation sessions (Knowledge Mine) |
| `storyGames` | Story Game Workshop games |
| `scans` | Curriculum photo scan records |
| `shellyChatThreads` | Shelly AI chat thread roots |
| `chapterResponses` | Read-aloud chapter discussion responses per child |
| `bookThemes` | Book theme presets and custom themes |
| `childSkillMaps` | Per-child curriculum knowledge maps (read into `shellyChat` AI context as the `childSkillMap` coverage slice — `loadChildSkillMapContext` / `formatChildSkillMap`; read-only, owned by `updateSkillMapFromFindings`) |
| `bookProgress` | Per-child read-aloud book progress and question pools |
| `featureRequests` | Silent friction / feature-request log from Shelly chat (feedback metadata, **not** a child's record — written fire-and-forget via `logFeatureRequest`, deduped by `dedupKey`, separate from the confirm-gated `applyChatAction` path; consumed by Step 5b's scheduled `fileFeatureRequests` CF → GitHub issue, which writes back `status: 'filed'` + `githubIssueUrl`) |
| `errorLog` | Scrubbed client error records (path: `families/{familyId}/errorLog/{autoId}`) |
| `stonebridgeProgress` | Per-child Banner Rally mission progress (doc ID: `{childId}`). Derived read-only from XP ledger reading events — never stores or mutates XP/diamonds. Tracks current mission, active mission counters, completed missions, raised banners, and per-mission reading-action baselines. Written by `useStonebridgeProgress`. |
| `learnerModels` | Per-child learner model (Learner Model design, D1). Doc ID: `{childId}` |
| `learnerReviewSessions` | Persisted Foundations Review Chat sessions (FEAT-51). Doc ID: `{childId}_{domain}` |
| `businessLog` | Barnes Bros append-only sales/earnings event log (additive-only; `addDoc` only, entries never mutated) |
| `businessGoals` | Barnes Bros goal config (milestone stack). One doc per child operator, doc ID: `{childId}` |
| `kitRosters` | GDQ Kit Builder rosters (FEAT-80). Reusable kit cast + rules (vault/hero/defenders/invaders/win) — business data, not a narrative. Additive; auto-ID (a kid makes many kits). Path: `families/{familyId}/kitRosters/{autoId}` |
| `catalogProducts` | Barnes Bros product catalog (FEAT-81). Curated, parent-gated products the boys show (`CatalogProduct {title, type, description, priceCents, images[ref], sourceRef?, madeBy[], status:'draft'|'listed'|'retired'}`) — the "show" layer over Books/stickers/kit rosters. **Family-scoped** (a catalog is the family's storefront, not per-child), additive; auto-ID, no deletes (status `retired` retires). Images REFERENCE existing Storage URLs, never regenerated. Business data — never a learner-model input. Written by `useCatalogProducts`. Path: `families/{familyId}/catalogProducts/{autoId}` |
| `orders` | Barnes Bros order queue (FEAT-89). Orders placed from the **public** catalog site (`CatalogOrder {customerName, items:[{productId,title}], note?, contact?, status:'new'|'making'|'ready'|'delivered'}`) — the outreach loop the kids fulfill. **Minimally-scoped** customer data (owner-lifted the "no PII" rail 2026-07-18: first name + picks + optional note/contact only, no address/payment/email/accounts). WRITTEN server-side by the unauthenticated `submitCatalogOrder` Cloud Function (admin SDK) — the public page has no auth, so `firestore.rules` stays owner-only + untouched. In-app: read newest-first + **forward-only** status stepper (not parent-gated — the making is the kids' work) via `useCatalogOrders`. **Family-scoped**, additive; auto-ID. Business data — never a learner-model input. Path: `families/{familyId}/orders/{autoId}` |
| `artQuota` | Kid art-generation daily counter (FEAT-94). A tiny per-child, per-day courtesy cap on kid-initiated image generation (a paid call): a light, **non-shaming** limit (default `DEFAULT_DAILY_ART_QUOTA = 10`), never a lock. **One counter, two surfaces (FEAT-165):** Kit Builder character art and the Stickers page's three paid controls ("Create!", "Add version", "Make more versions" — via `books/useStickerArtQuota.ts`, a thin wrapper, **not** a second allowance) share the same doc, so a child's daily number is the honest total of what they spent on art that day. Parent profiles are uncapped and never touch it. Written client-side by `useArtQuota` (`setDoc` + `increment`, merge) under the existing owner rule — kids share the family auth, so the cap is **UX, not security** (`firestore.rules` untouched). Additive; no schema churn. Doc ID: `{childId}-{YYYY-MM-DD}`. Path: `families/{familyId}/artQuota/{docId}` |
| `watchLibrary` | Curated, Shelly-vetted videos the kids can watch (FEAT-100, design FEAT-86). `WatchVideo {youtubeId, title, plannedMinutes, subjectBucket, childId: string \| 'both', why?, addedBy, vettedAt, suggestedFromUrl?}` — stores a validated `youtubeId` only, never a free-form URL. A family curates many videos, so it's auto-ID (like `businessLog`/`kitRosters`), not one-doc-per-child. **Family-scoped** with a `childId \| 'both'` filter (like `activityConfigs`). Written by `useWatchLibrary`. Surfaced at the parent-only `/watch` route (FEAT-132; was a Settings tab through FEAT-131). Path: `families/{familyId}/watchLibrary/{autoId}` |

**Global collections** (not under `families/`):

| Collection | Purpose |
|---|---|
| `chapterBooks` | Chapter book library (global, shared across families) |

**Subcollections:**
- `shellyChatThreads/{threadId}/messages` — Messages within a Shelly chat thread
- `children/{childId}/transcriptionEvents` — Whisper voice-input events (transcript, segments, mimeType, sourceSurface, finalText, replacesEventId). Substrate for future trouble-word tracking (see `docs/DESIGN_VOICE_INPUT_MODULE.md` §12).
- `children/{childId}/wordProgress` — Knowledge Mine word progress (referenced in `tasks/quest.ts` via raw Firestore path; no collection helper in `firestore.ts`)

**Settings documents:** `settings/plannerDefaults_{childId}` — Per-child planner subject time defaults (used by `tasks/plan.ts`)

## AI Integration

### Architecture
- **Client-side:** `src/core/ai/` contains the service interface and prompt assembly
- **Server-side:** `functions/src/ai/` contains Firebase Cloud Functions that call AI APIs
- **No API keys in client code.** All AI calls route through Cloud Functions.

### Providers
- **Claude (Anthropic):** Primary provider for reasoning, planning, evaluation, content generation
- **OpenAI:** Image generation (DALL-E) for visual materials

### AI Rules of Engagement
1. **Feature flags for AI paths.** Local logic in planner-chat stays as fallback. AI paths are opt-in via config.
2. **System prompts are version-controlled** in `src/core/ai/prompts/`. Every prompt is reviewable.
3. **Charter values are injected** into every system prompt. See `docs/SYSTEM_PROMPTS.md`.
4. **Child context is assembled per-request** from Firestore (skill snapshot, pace data, recent sessions).
5. **Cost tracking:** Log token usage and model used to Firestore for monitoring.
6. **Model selection by task** (all model strings live in one table: `functions/src/ai/models.ts`):
   - Complex reasoning (plan, quest, generateStory, reviseStory, revisePage, workshop, analyzeWorkbook, disposition, conundrum, weeklyFocus, scan, shellyChat, foundationsReview, chapterQuestions, bookLookup, lessonVideo, helpCard, monthlyReview, weeklyReview, analyzePatterns): Claude Sonnet 5 (`claude-sonnet-5`)
   - **Opus 4.8 pilot suspended (2026-07-16)**: `evaluate` + `learnerSynthesis` are back on Sonnet 5 — the first live call failed before quality could be assessed. `CLAUDE_OPUS` (`claude-opus-4-8`) is retained in `models.ts` for the expected re-pilot, which requires verifying the model ID via a live `GET /v1/models` (or one successful live call) from the deployed environment first. Fable 5 was considered and rejected (2x Opus cost + refusal/stop_reason fallback handling).
   - Routine generation (generate, chat): Claude Haiku (`claude-haiku-4-5-20251001`)
   - Image generation: gpt-image-1.5 (scenes, armor sheets, base character, starter avatar, transparent stickers, photo transform, armor pieces, sketch enhancement)
   - Note: token counts on Sonnet-5 / Opus-4.8 tasks run ~30% higher than the retired Sonnet-4.6 tasks (new tokenizer) — expected, not a regression.

### Testing AI Logic
- Co-locate tests with logic files (e.g., `skipAdvisor.logic.test.ts`, `pace.logic.test.ts`)
- Mock AI API responses in tests — never call real APIs in test suite
- Test prompt assembly separately from API calls
- Snapshot test system prompts to catch unintended changes

### Prompt Files
- `src/core/ai/prompts/plannerPrompts.ts` — Weekly plan generation (client-side)
- `functions/src/ai/tasks/` — All other prompt assembly lives in Cloud Function task handlers (plan, evaluate, quest, workshop, generateStory, reviseStory, revisePage, analyzeWorkbook, disposition, conundrum, weeklyFocus, scan, shellyChat, chat, analyzePatterns, foundationsReview, chapterQuestions, bookLookup, lessonVideo, helpCard, monthlyReview)

### Cloud Functions (29 exported)
- `chat` — Task dispatch (plan, evaluate, quest, workshop, generateStory, reviseStory, revisePage, analyzeWorkbook, disposition, conundrum, weeklyFocus, scan, shellyChat, chat, generate, foundationsReview, chapterQuestions, bookLookup, lessonVideo, helpCard, monthlyReview)
- `analyzeEvaluationPatterns` — Pattern analysis from evaluation sessions
- `weeklyReview` — Scheduled weekly review (Sunday 7pm CT)
- `generateWeeklyReviewNow` — Manual review trigger
- `generateLearnerSynthesisNow` — On-demand Learner Model synthesis callable (FEAT-57): diag panel manual trigger + client regenerate-on-read path; the weekly beat runs the same worker from `evaluate.ts`'s Sunday loop
- `generateMonthlyReview` — Scheduled monthly review (1st of month)
- `generateMonthlyReviewNow` — Manual monthly review trigger
- `publishMonthlyReview` — Mark a monthly review book published (visible to kids)
- `unpublishMonthlyReview` — Revert publish
- `auditMonthlyReviewSources` — Diagnostic: inspect photo sources available for a monthly review
- `generateActivity` — Lesson card generation
- `transcribeAudio` — OpenAI Whisper voice transcription for the voice input module (writes `aiUsage` + `transcriptionEvents`)
- `fileFeatureRequests` — Scheduled (daily 08:00 CT) Shelly-portal feedback-loop closer (Build Step 5b): reads `featureRequests` where `status == 'new'`, opens one GitHub issue per distinct want (deduped by `dedupKey`, belt-and-suspenders), writes back `status: 'filed'` + `githubIssueUrl`. **The only code path in the repo that talks to the GitHub API** — direct `fetch` against GitHub REST (no Octokit dependency), authed with the `GITHUB_PAT` fine-grained-token secret (`functions/src/feedback/fileFeatureRequests.ts`). Degrades safely: if the secret is unset it logs a warning and writes nothing; per-entry HTTP failures leave that entry `new` for the next run. **Requires the one-time human secret step** in `docs/SHELLY_PORTAL_FEEDBACK_LOOP.md` to file anything.
- `submitCatalogOrder` — **The public catalog order endpoint (FEAT-89).** The **only `onRequest` (unauthenticated HTTP) function in the repo.** Receives an order from the public catalog page's baked form and writes it to `families/{familyId}/orders` via the admin SDK, so `firestore.rules` stays owner-only + untouched (mechanism W1). Defense in depth: CORS origin lock (catalog origins only), honeypot field, best-effort per-IP rate limit, strict schema validation + caps, and a product-id allowlist against the family's `listed` products (`functions/src/business/{submitCatalogOrder.ts, orderValidation.ts}`). Writes ONLY an order — no learner-model / compliance / hours / XP write.
- `generateCompliancePack` — **The compliance pack as a real evidence archive (FEAT-126).** The repo's first export-side CF. Takes `{familyId, childId, startDate, endDate, files, artifacts}` and returns a **short-lived link** to a zip holding the pack's four already-rendered text files plus every artifact's actual bytes under `media/<artifactId>-<original name>`, with the portfolio markdown's media links rewritten to **relative** paths so the archive reads offline — no network, no revocable download token, and no permanent public link to a photo of a child. **Renders nothing:** the four text files arrive pre-rendered from the client's existing `buildCompliancePackFiles`, so there is one renderer for hours/logs/evaluations/portfolio and **no hours or compliance math in `functions/`**. Parent gate is server-side identity (`uid === familyId`, never a client flag) plus a child-exists check; every resolved object path is confined to `families/{familyId}/` before the admin SDK reads it. Unfetchable / out-of-family / size-capped evidence is reported **twice** — inline in the markdown and as a `manifest.csv` row — never silently dropped. Writes only the zip, to `families/{familyId}/compliance-packs/` (swept after 24 h). Deploys with the rest (`npm run deploy:functions`, or a `deploy`-branch push); the new Storage rule ships with `npm run deploy:rules`. The 15-minute signed URL needs the runtime service account to hold `roles/iam.serviceAccountTokenCreator` — where it does not, the function falls back to a tokenized URL and reports `urlKind: 'token'`, so the feature never waits on an IAM grant to work. A download token is minted **only** on that fallback path (it is an unauthenticated permanent URL for as long as the object lives), never where signing works. `functions/src/records/{compliancePack.logic.ts, generateCompliancePack.ts}`.
- `sweepCompliancePacks` — Scheduled (daily 04:00 CT) retention beat for `generateCompliancePack` (FEAT-126). Deletes every family's generated packs past the 24 h window. Exists because retention must hold **without** a later export: the pack is the one object in the repo that embeds photos and recordings of the children into a single downloadable file, and on the token-fallback path its URL is unauthenticated, so "it goes away in 24 hours" cannot be a side effect of the next export (Codex P1, PR #1631). Reads family ids only; writes nothing but deletes.
- `healthCheck` — Diagnostic endpoint
- 12 image functions: `generateImage`, `generateAvatarPiece`, `generateStarterAvatar`, `transformAvatarPhoto`, `generateArmorPiece`, `generateBaseCharacter`, `generateArmorSheet`, `generateArmorReference`, `extractFeatures`, `generateMinecraftSkin`, `generateMinecraftFace`, `enhanceSketch`

### Cloud Functions Structure
- `functions/src/index.ts` — Main entry point, exports all Cloud Functions
- `functions/src/ai/chat.ts` — Main chat CF, task type routing, prompt builders
- `functions/src/ai/chatTypes.ts` — callClaude helper, task handler types
- `functions/src/ai/contextSlices.ts` — Per-task context loading (charter, child, engagement, etc.)
- `functions/src/ai/aiConfig.ts` — AI API key secrets (Google Cloud Secret Manager)
- `functions/src/ai/aiService.ts` — Core AI service orchestration
- `functions/src/shared/sanitizeJson.ts` — JSON response sanitization (`sanitizeAndParseJson`, the one definition both projects compile — ARCH-47 slice 3)
- `functions/src/ai/health.ts` — Health check endpoint
- `functions/src/ai/tasks/` — Task handlers: plan, evaluate, quest, workshop, generateStory, reviseStory, revisePage, analyzeWorkbook, disposition, conundrum, weeklyFocus, scan, shellyChat, chat, analyzePatterns, foundationsReview, chapterQuestions, bookLookup, lessonVideo, helpCard, monthlyReview, transcribeAudio
- `functions/src/ai/tasks/index.ts` — Chat task registry (CHAT_TASKS dispatch table, 21 task types)
- `functions/src/ai/learnerSynthesis.ts` — Learner Model synthesis orchestrator + `generateLearnerSynthesisNow` callable (FEAT-57)
- `functions/src/ai/generate.ts` — Activity/lesson card generation
- `functions/src/ai/evaluate.ts` — Weekly review (scheduled + manual)
- `functions/src/ai/monthlyReview.ts` — Monthly review callables (generate / publish / unpublish)
- `functions/src/ai/imageGen.ts` — Image generation routing
- `functions/src/ai/imageTasks/` — 12 image task handlers (armorPiece, armorReference, armorSheet, avatarPiece, baseCharacter, enhanceSketch, extractFeatures, generateImage, minecraftFace, minecraftSkin, photoTransform, starterAvatar) + index
- `functions/src/ai/providers/` — Claude + OpenAI provider adapters (with `__stubs__/` for test mocking)
- `functions/src/feedback/` — Feature request filing (`fileFeatureRequests` — scheduled CF, GitHub issue creation)
- `functions/src/records/` — Compliance pack archive (`generateCompliancePack` callable + pure `compliancePack.logic.ts` — storage-URL resolution, family path confinement, relative-link rewriting, manifest, retention sweep; FEAT-126)
- `functions/src/business/` — Barnes Bros business endpoints (`submitCatalogOrder` — the public order `onRequest` endpoint + pure `orderValidation.ts`; FEAT-89)
- `functions/src/shared/` — **Rules with exactly ONE definition, compiled by BOTH projects** (ARCH-47). Functions imports `"../../shared/x.js"`; the app imports `'../../../functions/src/shared/x'`. Editing a rule here without updating a caller fails to **compile** on whichever side broke — it replaces the previous guard (a hand-kept port plus a parity fixture that held only as long as someone remembered it). It lives under `functions/` rather than at the repo root because the two compilers are not equally constrained: `functions/tsconfig.json`'s `rootDir: "./src"` makes any outside file `TS6059`, and relaxing it — which does compile — moves the emit layout off `functions/lib/index.js`, the path `functions/package.json`'s `"main"` names and Firebase loads on deploy; the app has no `rootDir` and `noEmit`, so it can reach in for free. Rules for code here (no imports outside the directory, explicit `.js` extensions on relative imports so Node16 **and** bundler resolution both work, raw-Firestore-shaped structural inputs, nothing environment-specific — it is bundled into the browser app *and* deployed): `functions/src/shared/README.md`, which also lists the rules still duplicated and the order they should follow. Holds `dadLabReportArtifacts.ts` (`reportArtifactIds`, the UX-85 evidence rule), `docId.ts` (`deriveChildIdFromDocId` / `parseDateFromDocId`, the composite day-log key) and `sanitizeJson.ts` (`sanitizeAndParseJson`, the LLM-JSON parser — consolidated on the fuller server behaviour, so the app side gained the preamble/suffix fallback)

## Family Context (for AI prompt reference)

### Children
- **Lincoln (10):** Speech + neurodivergence. ~3rd grade math, ~1st grade reading. Phonics recently clicking. Motivators: Minecraft, Lego, Art. Needs short routines, frequent wins, visual checklists, low-friction starters.
- **London (6):** Kindergarten. Story-driven, creates own books. Knows most letter sounds. Motivators: Stories, drawing, book-making. Needs attention-rich interactive activities; disengages when unsupervised.

### Energy Modes (PlanType: `'normal'` | `'mvd'`)
- **Normal Day (`PlanType.Normal`):** Full routine (formation + reading stations + math stations + together block)
- **Minimum Viable Day (`PlanType.Mvd`):** Prayer/Scripture + read aloud + math practice + project/life-skills + one-sentence reflection. This is the floor. Both modes count as real school.

### Scheduling Constraint
Shelly's direct attention is the primary schedulable resource. Kids need split-block scheduling: Lincoln gets direct support while London does independent work, then swap. Running simultaneously means London's volume wins and Lincoln loses support.

## Known Technical Debt

- **PlannerChatPage.tsx (3,295L)** — Grew through the chat arc (live-week edit, watch picker, plan handoff), then **shrank ~120L when FEAT-150 extracted Apply** into `planner-chat/applyWeekPlan.ts` (PR #1679) so the planner and Ask AI share one week-write instead of two. The interconnected wizard/chat/plan/apply state is still the hard part. The 2026-08-16 audit named the next clean seam: the three near-identical live-day-edit handlers (`handleRemoveItem` / `handleMoveItemToDay` / `handleSwapWatchItem`) lift into a `useLiveDayEditHandlers` hook mirroring the already-extracted `useAppliedWeekDays` — ~230L out without touching the tangled core. Tracked as ARCH-02.
- **chat.ts CF (2,641L)** — `buildQuestPrompt` alone is 400+ lines. Highest-leverage decomposition target: extract prompt builders to separate files.
- **BookEditorPage.tsx (2,113L)** — Grew from themes + drawing flows. Handlers interleaved but clear section boundaries. Could extract sketch/voice/sticker panels later.
- **useQuestSession.ts (2,218L)** — Quest, comprehension, fluency, encoding (build-word/spell-word/build-sentence) all in one hook. Consider splitting by quest domain.
- **MyAvatarPage.tsx (1,876L)** — Decomposed from 1,862L. Grew from forge + portal + Stonebridge Banner Rally. State management + ceremony flow. Stable.
- **ShellyChatPage.tsx (647L)** — ARCH-09 FIXED (1,632→647L). Decomposed into `useShellyChatState`, `useShellyChatFlows`, `useShellyChatActions`, plus pure modules (`reflectionSuggestions`, `parseFollowups`, `parseChatActions`, `parseFriction`). Portal write layer (Tiers A+B+C Option 2) is live and confirm-gated. Stable.
- **WorkshopPage.tsx (1,623L)** — Phase-based rendering delegates to sub-components. Handlers share `currentGame` state across 3 game types. Not urgent.
- **VoxelCharacter.tsx (1,606L)** — Three.js render code at `src/features/avatar/VoxelCharacter.tsx`. Splitting the render loop is risky. Leave as-is.
- **useShellyChatFlows.ts (1,134L)** — 19 handlers (send, image, upload, thread CRUD). Extracted from ShellyChatPage (ARCH-09) but accumulated handlers. Watch for further growth.
- **contextSlices.ts (1,617L)** — 20+ slice loaders for AI task context. Growing steadily (+241L cumulative). Needs domain-group split.
- **ReadingQuest.tsx (1,066L)** — Grew +365L from quest-type additions (build-word, spell-word, build-sentence). Cohesive now but watch as Phase 3 approaches.
- **Ladder system** — UI surfaces removed (ARCH-07): the `/ladders` route now redirects to `/progress`, and the `src/features/ladders/` directory + the dead `LadderQuickLog` were deleted now that the disposition system is live. The data layer is intentionally retained: the `ladderRef` artifact tag (still scored by `scoreArtifactsForPortfolio` and shown in `ArtifactCard`), the `ladderProgress` collection (historical data), and the `Ladder*` types in `common.ts`.
- **evaluate.ts (weekly review)** — Registered in `TASK_CONTEXT` as `weeklyReview` and now calls `buildContextForTask` to fetch shared slices (charter, childProfile, learnerModel, skillSnapshot, activityConfigs, recentHistoryByDomain, recentScans, wordMastery, dadLabReports). FEAT-74 (G4): the `learnerModel` slice grounds pace-adjustments/recommendations in the synthesized frontier (`whatMattersNext`) — complementary to `skillSnapshot`, not a replacement — and the per-child cron step (`runWeeklyReviewCycleForChild`) now runs `synthesizeIfStale` **before** `generateReviewForChild` so the review reads a fresh model, not a one-cycle-stale synthesis (`generateWeeklyReviewNow` mirrors the ordering; synthesis failures stay isolated and never block the review). Still not routed through the `chat` dispatch — it's a dedicated scheduled CF + `generateWeeklyReviewNow` callable, not a chat task handler — so it composes its own systemPrompt from `[sharedSlices, WEEKLY_REVIEW_ADDENDUM]`. `assembleWeekContext` provides the week-scoped dayLogs/hours/plans/books/teach-backs/missedDays that shared slices don't cover. Books slice = created / completed / reading sessions (cumulative minutes on touched books); teach-backs slice = count / subject breakdown / audio-vs-text / up to 3 brief examples with audio URLs. Both are persisted on the `weeklyReviews/{weekKey}_{childId}` doc as `evidence` so the rendered "Week in Evidence" section reads without re-querying.
- **WorkbookConfig → ActivityConfig migration** — Both systems exist. ActivityConfig is the new primary (106 refs vs 34). workbookConfigs still read by quest starting level check and certificate scan. Plan: complete migration, remove workbookConfig references.
- **Bundle size** — Main chunk is 3.9MB (1.2MB gzipped). Should code-split Three.js, jsPDF, and heavy features.
- **Hours partial-day edge** — If a day has some blocks with actualMinutes and others without, only tracked blocks count. By design but undocumented.
