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

// Wrong — spread overwrites id (TS2783)
const items = snapshot.docs.map((doc) => ({
  id: doc.id,
  ...(doc.data() as MyType),
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
- `src/features/` — Feature modules (engine, today, week, ladders, sessions, records, etc.)

## North Star

**First Principles Engine** is a phone-fast family learning notebook that:
- expresses our Charter/Ethos
- runs daily school (Plan A / Plan B)
- captures evidence artifacts (notes/photos/audio)
- visualizes weekly progress (Flywheel)
- tracks growth (Ladders + Milestones)
- exports records (MO-friendly: logs + hours + portfolio + eval)

## Project Principles

1. **Frictionless daily use**: "Today" must be usable in under 60 seconds.
2. **Small artifacts > perfect documentation**: capture evidence quickly.
3. **Narration counts**: audio evidence is first-class (especially for Lincoln).
4. **Tags power everything**: engineStage + subjectBucket + location + ladderRef.
5. **Defaults everywhere**: reduce decision fatigue.
6. **No heroics**: ship thin slices; keep UI simple; iterate.

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
| `sessions` | Skill practice sessions |
| `dailyPlans` | Daily session plans |
| `projects` | Long-form projects |
| `weeklyScores` | Weekly score summaries |
| `labSessions` | Saturday lab sessions |
| `dadLab` | Dad lab weeks |
| `skillSnapshots` | Per-child skill snapshots |
| `plannerSessions` | Planner workflow sessions |
| `lessonCards` | Lesson card definitions |
