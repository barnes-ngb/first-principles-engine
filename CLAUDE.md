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
- `src/core/hooks/` — Shared hooks (useActiveChild, useChildren, useCreativeTimer, useDebounce, useSaveState, useScan, useAudioRecorder, useAudioRecording, useSpeechRecognition, useTranscription, useTTS, useActivityConfigs, useScanToActivityConfig, useCertificateProgress, useMonthlyReviews)
- `src/core/types/` — Domain types (`common.ts`, `family.ts`, `planning.ts`, `evaluation.ts`, `disposition.ts`, `books.ts`, `compliance.ts`, `dadlab.ts`, `workshop.ts`, `xp.ts`, `skillTags.ts`, `shellyChat.ts`, `monthlyReview.ts`, `feedback.ts`, `zod.ts`) and enum-like constants (`enums.ts`)
- `src/core/utils/` — Date/time utilities, formatting, doc ID parsing, compliance mapping, energy patterns, domain mapping, blocker lifecycle, workbook matching, session timer, image compression, `sanitizeJson` (client port of the functions LLM-JSON parser — deliberate duplication, `// TODO: consolidate`)
- `src/core/ai/` — AI service interface (useAI hook), feature flags, prompt templates (`prompts/plannerPrompts.ts`)
- `src/core/profile/` — Profile context provider and hook (family + children)
- `src/core/xp/` — XP ledger, armor tiers, armor unlock logic
- `src/core/avatar/` — Daily armor session management (`getDailyArmorSession.ts`)
- `src/core/curriculum/` — Curriculum knowledge map, skill mapping, finding integration (curriculumMap, mapFindingToNode, skillStatus, updateSkillMapFromFindings, useSkillMap)
- `src/core/data/` — Database seed data
- `src/features/auth/` — Auth guard route wrapper
- `src/features/avatar/` — Voxel avatar, armor, tier celebrations, pose system, icons, decomposed panels (ArmorPieceGallery, ArmorVerseCard, AvatarPhotoUpload, AvatarHeroBanner, AvatarCharacterDisplay, ArmorSuitUpPanel, AvatarCustomizer, speakVerse), VoxelCharacter (Three.js character, armor, poses, materials, camera), `voxel/` sub-module (armor meshes, pose definitions)
- `src/features/books/` — Bookshelf, book editor/reader, generate chat, review chat, sight word dashboard, story guide, print/PDF
- `src/features/dad-lab/` — Dad Lab lifecycle (plan, start, contribute, complete)
- `src/features/engine/` — Engine page and engine logic
- `src/features/evaluate/` — Reading evaluation chat, findings extraction
- `src/features/evaluation/` — Skill snapshot page, quick check panel
- `src/features/login/` — Profile selection
- `src/features/not-found/` — 404 page
- `src/features/planner/` — TeachHelperDialog (shared)
- `src/features/planner-chat/` — Plan My Week (AI chat planner, decomposed: PlannerChatPage + PlannerSetupWizard, WeekFocusPanel, PlanDayCards, PlannerChatMessages)
- `src/features/progress/` — Progress tabs (learning profile, engine, snapshot, milestones, word wall, armor, curriculum)
- `src/features/progress/CurriculumTab.tsx` — Curriculum management tab (activity configs)
- `src/features/progress/learning-map/` — Learning Map UI components (visual curriculum knowledge map)
- `src/features/progress/DispositionProfile.tsx` — AI disposition narrative from day log data, with per-disposition parent overrides (inline edit, revert to AI)
- `src/features/quest/` — Knowledge Mine (interactive reading quest)
- `src/features/records/` — Hours, compliance, evaluations, portfolio
- `src/features/settings/` — AI usage, account, avatar admin, sticker library, Dev tab (admin-only: chapter book seeding, Sunday cleanup, working levels backfill)
- `src/features/shelly-chat/` — Shelly AI chat assistant (ShellyChatPage — thin shell, ChatThreadDrawer, ChatMessageBubble, openChatWithContext, formatRelativeTime, `useShellyChatState` — thread/message/image state hook, `useShellyChatFlows` — effects + send/image/upload/thread-CRUD handlers, `reflectionSuggestions` — pure data-driven conversation-starter heuristics, `parseFollowups` — pure `[FOLLOWUP]` marker parser, `parseChatActions` — pure `<action>` block extractor (detect/parse/allowlist-validate `ChatAction`s + return clean text), `useShellyChatActions` — **portal write layer (Build Steps 3b + 4)**: the confirmed-write path (Tier B complete). Owns confirm-card state (`pending`/`applied`/`dismissed`) + `applyChatAction`; routes sight-word writes through the shared `addSightWord`/`removeSightWord` writers in `useSightWordProgress`, and **`editProfileField` writes (Step 4 — `motivators`/`interests`/`strengths` only) through the shared `updateChildSoftProfile` writer** (`src/core/family/`, also used by Settings' `SoftProfileSection` — no fork); enforces the `ChatAction` allowlist + active-child binding; records applied writes inline on the assistant message (`appliedActions`). `ActionConfirmCard` — inline propose→confirm→write cards (Confirm / Dismiss / batch Confirm all); sight words render a one-liner, `editProfileField` a **before→after** diff (replace-write on freeform text). The `<action>` grammar is taught to the model in `functions/src/ai/tasks/shellyChat.ts` (`buildSightWordActionAddendum` — both sight-word + `editProfileField` grammar, child-tab only). Wired into `useShellyChatFlows`' response handlers (`sendToAI`/`handleSend`/`handleUploadAnalyze`). **Tier C Option 2 (Build 6b) — additive snapshot edits by chat are now live:** four additive `ChatAction` kinds (`addPrioritySkill`/`addSupport`/`addStopRule`/`markSkillProgress`) route through `applyChatAction` → the central `skillSnapshotWrites.ts` `writeSnapshotUpdate` (additive fields auto-stamped as a parent directive; `markSkillProgress` via the mastered-skill path), behind the same allowlist + active-child guard + `appliedActions` audit, **confirm-gated (no write before a tap)**, with a higher-stakes `ActionConfirmCard` ("Updates {child}'s skill snapshot" label + accent border). **Additive only** — removals/downgrades/level-lowering (Option 3) are unrepresentable in the union + rejected by `parseChatActions`; the model grammar (`buildSnapshotActionAddendum`, child-tab only) never emits one. `supports` lives on `skillSnapshots` and is reached only via the snapshot-explicit `addSupport` kind (no `children.supports` field). **A+B+Option-2 portal scope is complete;** Option 3 (authoritative removals/downgrades/level-setting — needs a separate human-override writer class) + ARCH-10 rules hardening remain optional future work (Option 2 is safe without ARCH-10: every write is additive + confirm-gated + shape-checked by the central writer). `parseFriction` — pure `<friction>` block extractor (mirrors `parseChatActions`: detect/parse/validate `quote`+`interpretedWant`, strip the block, never throw). `logFeatureRequest` — **Build Step 5a silent friction capture**: a fire-and-forget, dedup'd write to the `featureRequests` collection (feedback metadata, **NOT** a child's record — deliberately separate from `applyChatAction`, never confirmed, never surfaced to Shelly). Wired into all three `useShellyChatFlows` response handlers (`sendToAI`/`handleSend`/`handleUploadAnalyze`) alongside `parseChatActions`; the `<friction>` grammar is taught to the model in `functions/src/ai/tasks/shellyChat.ts` (`buildFrictionCaptureAddendum` — always emitted, invisible plumbing). Dedup mirrors the `xpLedger` idempotency pattern via `dedupKey` = stable hash of the normalized `interpretedWant`. Step 5b (scheduled CF → GitHub issue) consumes the `new` entries.)
- `src/features/today/` — Parent Today (decomposed: TodayPage shell + TodayChecklist, WeekFocusCard, UnifiedCaptureCard, TeachBackSection, ChapterQuestionPool) + Kid Today (decomposed: KidTodayView shell + KidChecklist, KidTeachBack, KidChapterPool, KidConundrumResponse, KidExtraLogger, KidCelebration) + routine sync, XP, scan advance, rollover, budget enforcement
- `src/features/weekly-review/` — Weekly review page
- `src/features/workshop/` — Story Game Workshop (board/adventure/card games), `steps/` sub-module (wizard step components)
- `src/features/monthly-review/` — Monthly review books (reader, kid books-about-me page, generate/publish controls, photo handling)
- `functions/src/` — Firebase Cloud Functions (AI endpoints)

## North Star

**First Principles Engine** is a phone-fast family learning notebook that:
- expresses our Charter/Ethos
- runs daily school (Normal Day / Minimum Viable Day)
- captures evidence artifacts (notes/photos/audio)
- visualizes weekly progress (Flywheel)
- tracks growth (Ladders + Milestones)
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
| `skillSnapshots` | Per-child skill snapshots |
| `plannerConversations` | Planner chat conversations |
| `lessonCards` | Lesson card definitions |
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
6. **Model selection by task:**
   - Complex reasoning (plan, evaluate, quest, generateStory, reviseStory, revisePage, workshop, analyzeWorkbook, disposition, conundrum, weeklyFocus, scan, shellyChat, chapterQuestions, monthlyReview): Claude Sonnet (`claude-sonnet-4-6`)
   - Routine generation (generate, chat): Claude Haiku (`claude-haiku-4-5-20251001`)
   - Image generation: gpt-image-1.5 (scenes, armor sheets, base character, starter avatar, transparent stickers, photo transform, armor pieces, sketch enhancement)

### Testing AI Logic
- Co-locate tests with logic files (e.g., `skipAdvisor.logic.test.ts`, `pace.logic.test.ts`)
- Mock AI API responses in tests — never call real APIs in test suite
- Test prompt assembly separately from API calls
- Snapshot test system prompts to catch unintended changes

### Prompt Files
- `src/core/ai/prompts/plannerPrompts.ts` — Weekly plan generation (client-side)
- `functions/src/ai/tasks/` — All other prompt assembly lives in Cloud Function task handlers (plan, evaluate, quest, workshop, generateStory, reviseStory, revisePage, analyzeWorkbook, disposition, conundrum, weeklyFocus, scan, shellyChat, chat, analyzePatterns, chapterQuestions, monthlyReview)

### Cloud Functions (25 exported)
- `chat` — Task dispatch (plan, evaluate, quest, workshop, generateStory, reviseStory, revisePage, analyzeWorkbook, disposition, conundrum, weeklyFocus, scan, shellyChat, chat, generate, chapterQuestions, monthlyReview)
- `analyzeEvaluationPatterns` — Pattern analysis from evaluation sessions
- `weeklyReview` — Scheduled weekly review (Sunday 7pm CT)
- `generateWeeklyReviewNow` — Manual review trigger
- `generateMonthlyReview` — Scheduled monthly review (1st of month)
- `generateMonthlyReviewNow` — Manual monthly review trigger
- `publishMonthlyReview` — Mark a monthly review book published (visible to kids)
- `unpublishMonthlyReview` — Revert publish
- `auditMonthlyReviewSources` — Diagnostic: inspect photo sources available for a monthly review
- `generateActivity` — Lesson card generation
- `transcribeAudio` — OpenAI Whisper voice transcription for the voice input module (writes `aiUsage` + `transcriptionEvents`)
- `fileFeatureRequests` — Scheduled (daily 08:00 CT) Shelly-portal feedback-loop closer (Build Step 5b): reads `featureRequests` where `status == 'new'`, opens one GitHub issue per distinct want (deduped by `dedupKey`, belt-and-suspenders), writes back `status: 'filed'` + `githubIssueUrl`. **The only code path in the repo that talks to the GitHub API** — direct `fetch` against GitHub REST (no Octokit dependency), authed with the `GITHUB_PAT` fine-grained-token secret (`functions/src/feedback/fileFeatureRequests.ts`). Degrades safely: if the secret is unset it logs a warning and writes nothing; per-entry HTTP failures leave that entry `new` for the next run. **Requires the one-time human secret step** in `docs/SHELLY_PORTAL_FEEDBACK_LOOP.md` to file anything.
- `healthCheck` — Diagnostic endpoint
- 12 image functions: `generateImage`, `generateAvatarPiece`, `generateStarterAvatar`, `transformAvatarPhoto`, `generateArmorPiece`, `generateBaseCharacter`, `generateArmorSheet`, `generateArmorReference`, `extractFeatures`, `generateMinecraftSkin`, `generateMinecraftFace`, `enhanceSketch`

### Cloud Functions Structure
- `functions/src/index.ts` — Main entry point, exports all Cloud Functions
- `functions/src/ai/chat.ts` — Main chat CF, task type routing, prompt builders
- `functions/src/ai/chatTypes.ts` — callClaude helper, task handler types
- `functions/src/ai/contextSlices.ts` — Per-task context loading (charter, child, engagement, etc.)
- `functions/src/ai/aiConfig.ts` — AI API key secrets (Google Cloud Secret Manager)
- `functions/src/ai/aiService.ts` — Core AI service orchestration
- `functions/src/ai/sanitizeJson.ts` — JSON response sanitization
- `functions/src/ai/health.ts` — Health check endpoint
- `functions/src/ai/tasks/` — Task handlers: plan, evaluate, quest, workshop, generateStory, reviseStory, revisePage, analyzeWorkbook, disposition, conundrum, weeklyFocus, scan, shellyChat, chat, analyzePatterns, chapterQuestions, monthlyReview, transcribeAudio
- `functions/src/ai/tasks/index.ts` — Chat task registry (CHAT_TASKS dispatch table, 17 task types)
- `functions/src/ai/generate.ts` — Activity/lesson card generation
- `functions/src/ai/evaluate.ts` — Weekly review (scheduled + manual)
- `functions/src/ai/monthlyReview.ts` — Monthly review callables (generate / publish / unpublish)
- `functions/src/ai/imageGen.ts` — Image generation routing
- `functions/src/ai/imageTasks/` — 12 image task handlers (armorPiece, armorReference, armorSheet, avatarPiece, baseCharacter, enhanceSketch, extractFeatures, generateImage, minecraftFace, minecraftSkin, photoTransform, starterAvatar) + index
- `functions/src/ai/providers/` — Claude + OpenAI provider adapters (with `__stubs__/` for test mocking)

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

- **PlannerChatPage.tsx (2,620L)** — Decomposed render (800→500L) but state management is still ~1,700L. Interconnected wizard/chat/plan/apply state makes further splitting complex. Stable as-is.
- **chat.ts CF (2,466L)** — `buildQuestPrompt` alone is 400+ lines. Highest-leverage decomposition target: extract prompt builders to separate files.
- **BookEditorPage.tsx (2,278L)** — Grew from themes + drawing flows. Handlers interleaved but clear section boundaries. Could extract sketch/voice/sticker panels later.
- **useQuestSession.ts (1,870L)** — Quest, comprehension, fluency all in one hook. Consider splitting by quest domain.
- **MyAvatarPage.tsx (1,804L)** — Decomposed from 1,862L. Grew +152 from forge + portal. State management + ceremony flow. Stable.
- **ShellyChatPage.tsx (611L)** — ARCH-09 FIXED (decompose complete across PR #1274 + #1277, 1,632→611L, first tests added): state/refs in `useShellyChatState` (typed, unit-tested); effects + flow handlers (send/response, image gen/refine, image analysis/attach upload cluster, thread CRUD) in `useShellyChatFlows`; the branchy reflection-suggestion heuristics in the pure `reflectionSuggestions` module (unit-tested); the `[FOLLOWUP]` parser in `parseFollowups`. The page is now a thin shell composing the state + flows hooks (plus the actions hook + confirm cards). The actions/write layer (`useShellyChatActions`, Build Steps 3b + 4 + 6b) is live: Tier B is complete — the portal's confirmed-write path covers sight words **and profile soft fields (`editProfileField` → `motivators`/`interests`/`strengths` via the shared `updateChildSoftProfile` writer)** — and **Tier C Option 2 (6b) adds confirmed additive Skill-Snapshot edits** (`addPrioritySkill`/`addSupport`/`addStopRule`/`markSkillProgress` → the central `skillSnapshotWrites.ts` writer; additive-only, removals/downgrades unrepresentable = Option 3, deferred). All propose→confirm→write, wired into `useShellyChatFlows`' response handlers. No auto-writes — only a confirm tap commits.
- **WorkshopPage.tsx (1,623L)** — Phase-based rendering delegates to sub-components. Handlers share `currentGame` state across 3 game types. Not urgent.
- **VoxelCharacter.tsx (1,562L)** — Three.js render code at `src/features/avatar/VoxelCharacter.tsx`. Splitting the render loop is risky. Leave as-is.
- **Ladder system** — UI surfaces removed (ARCH-07): the `/ladders` route now redirects to `/progress`, and the `src/features/ladders/` directory + the dead `LadderQuickLog` were deleted now that the disposition system is live. The data layer is intentionally retained: the `ladderRef` artifact tag (still scored by `scoreArtifactsForPortfolio` and shown in `ArtifactCard`), the `ladderProgress` collection (historical data), and the `Ladder*` types in `common.ts`.
- **evaluate.ts (weekly review)** — Registered in `TASK_CONTEXT` as `weeklyReview` and now calls `buildContextForTask` to fetch shared slices (charter, childProfile, skillSnapshot, activityConfigs, recentHistoryByDomain, recentScans, wordMastery, dadLabReports). Still not routed through the `chat` dispatch — it's a dedicated scheduled CF + `generateWeeklyReviewNow` callable, not a chat task handler — so it composes its own systemPrompt from `[sharedSlices, WEEKLY_REVIEW_ADDENDUM]`. `assembleWeekContext` provides the week-scoped dayLogs/hours/plans/books/teach-backs/missedDays that shared slices don't cover. Books slice = created / completed / reading sessions (cumulative minutes on touched books); teach-backs slice = count / subject breakdown / audio-vs-text / up to 3 brief examples with audio URLs. Both are persisted on the `weeklyReviews/{weekKey}_{childId}` doc as `evidence` so the rendered "Week in Evidence" section reads without re-querying.
- **WorkbookConfig → ActivityConfig migration** — Both systems exist. ActivityConfig is the new primary (66 refs vs 27). workbookConfigs still read by quest starting level check and certificate scan. Plan: complete migration, remove workbookConfig references.
- **Bundle size** — Main chunk is 3.8MB (1.1MB gzipped). Should code-split Three.js, jsPDF, and heavy features.
- **Dead `ladders` collection query** — `functions/src/ai/generate.ts` still queries a `ladders` collection that is never written to. Safe to remove.
- **Hours partial-day edge** — If a day has some blocks with actualMinutes and others without, only tracked blocks count. By design but undocumented.
