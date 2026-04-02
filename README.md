# First Principles Engine

A phone-fast family learning notebook that runs daily school (Normal Day / Minimum Viable Day), captures evidence artifacts (notes/photos/audio), tracks growth through disposition narratives and AI-powered evaluation, and exports Missouri-compliant records (logs, hours, portfolio, evaluations).

Built around Ad Astra / Astra Nova pedagogy: disposition over content mastery, teach-back as primary evidence, conundrums for ethical reasoning, and AI-synthesized growth narratives.

## Prerequisites

- Node.js 20+
- Firebase CLI: `npm install -g firebase-tools`
- Firebase project authenticated: `firebase login && firebase use <project-id>`

## Getting Started

```bash
npm install
cp .env.example .env   # Fill in Firebase config values from Firebase Console
npm run dev             # Start dev server
```

## Scripts

| Command | Description |
|---|---|
| `npm run dev` | Start Vite dev server |
| `npm run build` | TypeScript check + Vite production build |
| `npm test` | Run Vitest test suite (958 tests) |
| `npm run lint` | Run ESLint |
| `npx tsc -b` | Type-check only (no emit) |
| `npm run deploy` | Build + deploy to Firebase (hosting + rules) |
| `npm run deploy:hosting` | Build + deploy hosting only |
| `npm run deploy:rules` | Deploy Firestore + Storage rules only |

## Project Structure

```
src/
├── app/           App shell, routing, theme
├── components/    Shared UI components (22 files)
├── core/          Auth, profile, firebase, hooks, types, utils, AI, XP
├── features/      21 feature modules
│   ├── today/         Parent + Kid daily dashboard
│   ├── planner-chat/  AI-powered Plan My Week
│   ├── avatar/        Voxel avatar, Armor of God, XP progression
│   ├── books/         Kid-authored books, sight words, story guide
│   ├── workshop/      Story Game Workshop (board/adventure/card games)
│   ├── quest/         Knowledge Mine (interactive reading evaluation)
│   ├── shelly-chat/   AI chat assistant (context-aware, per-child)
│   ├── dad-lab/       Dad Lab sessions
│   ├── progress/      Learning profile, disposition, milestones, word wall
│   ├── records/       Hours, compliance, evaluations, portfolio
│   ├── evaluate/      Reading evaluation chat
│   ├── settings/      AI usage, account, avatar admin
│   └── ...            engine, kids, ladders, login, weekly-review, etc.
functions/
└── src/ai/        19 Cloud Functions (AI task dispatch, image gen, weekly review)
```

## Documentation

See [`docs/DOCUMENT_INDEX.md`](./docs/DOCUMENT_INDEX.md) for the full documentation map.

Key docs:
- [`CLAUDE.md`](./CLAUDE.md) — Build commands, coding conventions, project context
- [`docs/MASTER_OUTLINE.md`](./docs/MASTER_OUTLINE.md) — Single source of truth: features, status, sprint history
- [`docs/FIRST_PRINCIPLES_ALIGNMENT.md`](./docs/FIRST_PRINCIPLES_ALIGNMENT.md) — Ad Astra pedagogy alignment
- [`docs/SYSTEM_PROMPTS.md`](./docs/SYSTEM_PROMPTS.md) — AI architecture: task dispatch, model selection, context slices

## TypeScript Constraints

- **No enums** — `erasableSyntaxOnly` is enabled; use `as const` objects instead
- **`import type`** — `verbatimModuleSyntax` requires type-only imports for types
- **Firestore id-after-spread** — Put `id: doc.id` after `...doc.data()` so document ID wins

See [`CLAUDE.md`](./CLAUDE.md) for full coding conventions.

## Deployment

- **Push to `main`**: CI runs tests. If `firestore.indexes.json` changed, indexes auto-deploy.
- **Push to `deploy` branch**: Full deploy — hosting, functions, Firestore rules + indexes, Storage rules + CORS.

See [`docs/08_RUNBOOK.md`](./docs/08_RUNBOOK.md) for operational details.
