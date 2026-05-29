# First Principles Engine

## Build & Test Commands

- `npm run build` — TypeScript check + Vite build (`tsc -b && vite build`)
- `npm run dev` — Start dev server
- `npm test` — Run vitest
- `npm run lint` — Run ESLint
- `npx tsc -b` — Type-check only (no emit)

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
- `src/components/` — Shared UI components (includes SectionErrorBoundary for per-section crash isolation, `VoiceInput/` — reusable Whisper/Web-Speech voice input module)
- `src/core/auth/` — Auth context and hooks
- `src/core/firebase/` — Firebase/Firestore setup, collections, upload
- `src/core/hooks/` — Shared hooks (useActiveChild, useChildren, useCreativeTimer, useDebounce, useSaveState, useScan, useAudioRecorder, useAudioRecording, useSpeechRecognition, useTranscription, useTTS, useActivityConfigs, useScanToActivityConfig)
- `src/core/types/` — Domain types (`common.ts`, `family.ts`, `planning.ts`, `evaluation.ts`, `disposition.ts`, `books.ts`, `compliance.ts`, `dadlab.ts`, `workshop.ts`, `xp.ts`, `skillTags.ts`, `shellyChat.ts`, `zod.ts`) and enum-like constants (`enums.ts`)
- `src/core/utils/` — Date/time utilities, formatting, doc ID parsing, compliance mapping, energy patterns
- `src/core/ai/` — AI service layer, feature flags, useAI hook, prompt templates
- `src/core/profile/` — Profile context provider and hook (family + children)
- `src/core/xp/` — XP ledger, armor tiers, armor unlock logic
- `src/core/avatar/` — Daily armor session management (`getDailyArmorSession.ts`)
- `src/core/curriculum/` — Curriculum knowledge map, skill mapping, finding integration (curriculumMap, mapFindingToNode, skillStatus, updateSkillMapFromFindings, useSkillMap)
- `src/core/data/` — Database seed data
- `src/features/auth/` — Auth guard route wrapper
- `src/features/avatar/` — Voxel avatar, armor, tier celebrations, pose system, icons, decomposed panels (ArmorPieceGallery, ArmorVerseCard, AvatarPhotoUpload, AvatarHeroBanner, AvatarCharacterDisplay, ArmorSuitUpPanel, AvatarCustomizer, speakVerse), VoxelCharacter (Three.js character, armor, poses, materials, camera), `voxel/` sub-module (armor meshes, pose definitions)
- `src/features/books/` — Bookshelf, book editor/reader, sight word dashboard, story guide
- `src/features/dad-lab/` — Dad Lab lifecycle (plan, start, contribute, complete)
- `src/features/engine/` — Engine page and engine logic
- `src/features/evaluate/` — Reading evaluation chat, findings extraction
- `src/features/evaluation/` — Skill snapshot page, quick check panel
- `src/features/kids/` — Kids page, ladder logic
- `src/features/ladders/` — Skill progression ladders
- `src/features/login/` — Profile selection
- `src/features/not-found/` — 404 page
- `src/features/planner/` — TeachHelperDialog (shared)
- `src/features/planner-chat/` — Plan My Week (AI chat planner, decomposed: PlannerChatPage + PlannerSetupWizard, WeekFocusPanel, PlanDayCards, PlannerChatMessages)
- `src/features/progress/` — Progress tabs (learning profile, ladders, engine, snapshot, milestones, word wall, armor, curriculum)
- `src/features/progress/CurriculumTab.tsx` — Curriculum management tab (activity configs)
- `src/features/progress/learning-map/` — Learning Map UI components (visual curriculum knowledge map)
- `src/features/progress/DispositionProfile.tsx` — AI disposition narrative from day log data, with per-disposition parent overrides (inline edit, revert to AI)
- `src/features/quest/` — Knowledge Mine (interactive reading quest)
- `src/features/records/` — Hours, compliance, evaluations, portfolio
- `src/features/settings/` — AI usage, account, avatar admin, sticker library, Dev tab (admin-only: chapter book seeding, Sunday cleanup, working levels backfill)
- `src/features/shelly-chat/` — Shelly AI chat assistant (ShellyChatPage, ChatThreadDrawer, ChatMessageBubble, openChatWithContext, formatRelativeTime)
- `src/components/ScanButton.tsx` — Camera capture for curriculum photo scanning
- `src/components/ScanResultsPanel.tsx` — AI scan results display
- `src/features/today/` — Parent Today (decomposed: TodayPage shell + TodayChecklist, WeekFocusCard, QuickCaptureSection, TeachBackSection, ChapterQuestionPool) + Kid Today (decomposed: KidTodayView shell + KidChecklist, KidTeachBack, KidChapterPool, KidConundrumResponse, KidExtraLogger, KidCelebration) + routine sync, XP
- `src/features/weekly-review/` — Weekly review page
- `src/features/workshop/` — Story Game Workshop (board/adventure/card games)
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
| `sightWordProgress` | Per-child sight word mastery tracking |
| `aiUsage` | AI token usage and cost tracking |
| `avatarProfiles` | Per-child avatar customization |
| `dailyArmorSessions` | Daily armor XP session tracking |
| `evaluationSessions` | Interactive evaluation sessions (Knowledge Mine) |
| `storyGames` | Story Game Workshop games |
| `scans` | Curriculum photo scan records |
| `shellyChatThreads` | Shelly AI chat thread roots |
| `chapterResponses` | Read-aloud chapter discussion responses per child |
| `bookThemes` | Book theme presets and custom themes |
| `childSkillMaps` | Per-child curriculum knowledge maps |
| `bookProgress` | Per-child read-aloud book progress and question pools |

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

### Cloud Functions (24 exported)
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
- `healthCheck` — Diagnostic endpoint
- 12 image functions: `generateImage`, `generateAvatarPiece`, `generateStarterAvatar`, `transformAvatarPhoto`, `generateArmorPiece`, `generateBaseCharacter`, `generateArmorSheet`, `generateArmorReference`, `extractFeatures`, `generateMinecraftSkin`, `generateMinecraftFace`, `enhanceSketch`

### Cloud Functions Structure
- `functions/src/index.ts` — Main entry point, exports all Cloud Functions
- `functions/src/ai/chat.ts` — Main chat CF, task type routing, prompt builders
- `functions/src/ai/chatTypes.ts` — callClaude helper, task handler types
- `functions/src/ai/contextSlices.ts` — Per-task context loading (charter, child, engagement, etc.)
- `functions/src/ai/aiConfig.ts` — AI configuration (model selection, tokens, etc.)
- `functions/src/ai/aiService.ts` — Core AI service orchestration
- `functions/src/ai/sanitizeJson.ts` — JSON response sanitization
- `functions/src/ai/health.ts` — Health check endpoint
- `functions/src/ai/tasks/` — Task handlers: plan, evaluate, quest, workshop, generateStory, reviseStory, revisePage, analyzeWorkbook, disposition, conundrum, weeklyFocus, scan, shellyChat, chat, analyzePatterns, chapterQuestions, monthlyReview
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

- **PlannerChatPage.tsx (2,508L)** — Decomposed render (800→500L) but state management is still ~1,700L. Interconnected wizard/chat/plan/apply state makes further splitting complex. Stable as-is.
- **BookEditorPage.tsx (2,087L)** — Grew from themes + drawing flows. Handlers interleaved but clear section boundaries. Could extract sketch/voice/sticker panels later.
- **ShellyChatPage.tsx (1,653L)** — 23+ useState hooks. Image generation, thread management, follow-up suggestions, image refinement flow. Decomposition candidate after usage patterns stabilize.
- **WorkshopPage.tsx (1,623L)** — Phase-based rendering delegates to sub-components. Handlers share `currentGame` state across 3 game types. Not urgent.
- **chat.ts CF (1,599L)** — Grew +420 from quest expansion. buildQuestPrompt alone is 400+ lines. Consider extracting prompt builders to separate files.
- **useQuestSession.ts (1,763L)** — Grew from 954L. Quest, comprehension, fluency all in one hook. Consider splitting by quest domain.
- **MyAvatarPage.tsx (1,749L)** — Decomposed from 1,862L. Grew +152 from forge + portal. State management + ceremony flow. Stable.
- **VoxelCharacter.tsx (1,433L)** — Three.js render code at `src/features/avatar/VoxelCharacter.tsx`. Splitting the render loop is risky. Leave as-is.
- **Ladder system** — Partially deprecated. Disposition system replacing it. 3 files have TODO comments marking ladder references for removal.
- **evaluate.ts (weekly review)** — Registered in `TASK_CONTEXT` as `weeklyReview` and now calls `buildContextForTask` to fetch shared slices (charter, childProfile, skillSnapshot, activityConfigs, recentHistoryByDomain, recentScans, wordMastery, dadLabReports). Still not routed through the `chat` dispatch — it's a dedicated scheduled CF + `generateWeeklyReviewNow` callable, not a chat task handler — so it composes its own systemPrompt from `[sharedSlices, WEEKLY_REVIEW_ADDENDUM]`. `assembleWeekContext` provides the week-scoped dayLogs/hours/plans/books/teach-backs/missedDays that shared slices don't cover. Books slice = created / completed / reading sessions (cumulative minutes on touched books); teach-backs slice = count / subject breakdown / audio-vs-text / up to 3 brief examples with audio URLs. Both are persisted on the `weeklyReviews/{weekKey}_{childId}` doc as `evidence` so the rendered "Week in Evidence" section reads without re-querying.
- **WorkbookConfig → ActivityConfig migration** — Both systems exist. ActivityConfig is the new primary (66 refs vs 27). workbookConfigs still read by quest starting level check and certificate scan. Plan: complete migration, remove workbookConfig references.
- **Bundle size** — Main chunk is 3.4MB (1MB gzipped). Should code-split Three.js, jsPDF, and heavy features.
- **Hours partial-day edge** — If a day has some blocks with actualMinutes and others without, only tracked blocks count. By design but undocumented.
