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
- `src/components/` — Shared UI components
- `src/core/auth/` — Auth context and hooks
- `src/core/firebase/` — Firebase/Firestore setup, collections, upload
- `src/core/hooks/` — Shared hooks (useActiveChild, useChildren, useDebounce, useSaveState)
- `src/core/types/` — Domain types (`domain.ts`) and enum-like constants (`enums.ts`)
- `src/core/utils/` — Date/time utilities, formatting, doc ID parsing
- `src/core/ai/` — AI service layer, provider adapters, prompt templates
- `src/features/avatar/` — Voxel avatar, armor, tier celebrations
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
- `src/features/planner-chat/` — Plan My Week (AI chat planner, main planning flow)
- `src/features/progress/` — Progress tabs (learning profile, ladders, engine, snapshot, milestones, word wall, armor)
- `src/features/progress/DispositionProfile.tsx` — AI disposition narrative from day log data
- `src/features/quest/` — Knowledge Mine (interactive reading quest)
- `src/features/records/` — Hours, compliance, evaluations, portfolio
- `src/features/settings/` — AI usage, account, avatar admin, sticker library
- `src/features/today/` — Parent Today + Kid Today views, routine sync, XP
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

### Plan type terminology
Use `'normal'` / `'mvd'` (not the legacy `'A'` / `'B'`) for `DailyPlan.planType`. The `PlanType` const enum in `enums.ts` is the source of truth. Display labels come from `PlanTypeLabel` ("Normal Day" / "Minimum Viable Day"). The Firestore converter in `firestore.ts` normalizes legacy `'A'`→`'normal'` and `'B'`→`'mvd'` on read.

### Commit style
Use clear prefixes: `chore:`, `feat:`, `fix:`, `refactor:`, `docs:`, `test:`

Aim for commits that implement one component/flow, can be reverted cleanly, and do not mix scope areas.

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
| `ladders` | Skill ladder definitions |
| `ladderProgress` | Per-child ladder progression |
| `milestoneProgress` | Milestone achievement tracking |
| `dailyPlans` | Daily session plans |
| `dadLab` | Dad lab weeks |
| `skillSnapshots` | Per-child skill snapshots |
| `plannerSessions` | Planner workflow sessions |
| `lessonCards` | Lesson card definitions |
| `weeklyReviews` | AI-generated weekly adaptive reviews |

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
   - Routine generation (worksheets, prompts): Claude Haiku / GPT-4o-mini
   - Complex planning and evaluation: Claude Sonnet
   - Image generation: DALL-E 3

### Testing AI Logic
- Co-locate tests with logic files (e.g., `chatPlanner.logic.test.ts`)
- Mock AI API responses in tests — never call real APIs in test suite
- Test prompt assembly separately from API calls
- Snapshot test system prompts to catch unintended changes

### Prompt Files
- `src/core/ai/prompts/systemPrompts.ts` — Base charter and family context
- `src/core/ai/prompts/plannerPrompts.ts` — Weekly plan generation
- `src/core/ai/prompts/evaluationPrompts.ts` — Progress evaluation and adaptive loop
- `src/core/ai/prompts/tutorPrompts.ts` — Kid-facing interactions (future)

### Cloud Functions Structure
- `functions/src/ai/chat.ts` — Main chat CF, task type routing, prompt builders
- `functions/src/ai/chatTypes.ts` — callClaude helper, task handler types
- `functions/src/ai/contextSlices.ts` — Per-task context loading (charter, child, engagement, etc.)
- `functions/src/ai/tasks/` — Task handlers: plan, evaluate, quest, workshop, generateStory, analyzeWorkbook, disposition, conundrum, chat, analyzePatterns
- `functions/src/ai/generate.ts` — Activity/lesson card generation
- `functions/src/ai/evaluate.ts` — Weekly review (scheduled + manual)
- `functions/src/ai/imageGen.ts` — Image generation routing
- `functions/src/ai/imageTasks/` — DALL-E/gpt-image-1 task handlers
- `functions/src/ai/providers/` — Claude + OpenAI provider adapters

## Family Context (for AI prompt reference)

### Children
- **Lincoln (10):** Speech + neurodivergence. ~3rd grade math, ~1st grade reading. Phonics recently clicking. Motivators: Minecraft, Lego, Art. Needs short routines, frequent wins, visual checklists, low-friction starters.
- **London (6):** Kindergarten. Story-driven, creates own books. Knows most letter sounds. Motivators: Stories, drawing, book-making. Needs attention-rich interactive activities; disengages when unsupervised.

### Energy Modes (PlanType: `'normal'` | `'mvd'`)
- **Normal Day (`PlanType.Normal`):** Full routine (formation + reading stations + math stations + together block)
- **Minimum Viable Day (`PlanType.Mvd`):** Prayer/Scripture + read aloud + math practice + project/life-skills + one-sentence reflection. This is the floor. Both modes count as real school.

### Scheduling Constraint
Shelly's direct attention is the primary schedulable resource. Kids need split-block scheduling: Lincoln gets direct support while London does independent work, then swap. Running simultaneously means London's volume wins and Lincoln loses support.
