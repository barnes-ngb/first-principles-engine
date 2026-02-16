# First Principles Engine

A phone-fast family learning notebook that runs daily school, captures evidence artifacts (notes/photos/audio), visualizes weekly progress via a flywheel, tracks growth through ladders and milestones, and exports Missouri-compliant records (logs, hours, portfolio, evaluations).

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
| `npm test` | Run Vitest test suite |
| `npm run lint` | Run ESLint |
| `npx tsc -b` | Type-check only (no emit) |
| `npm run deploy` | Build + deploy to Firebase (hosting + rules) |
| `npm run deploy:hosting` | Build + deploy hosting only |
| `npm run deploy:rules` | Deploy Firestore + Storage rules only |

## Project Structure

```
src/
├── app/           App shell, routing, theme
├── components/    Shared UI components
├── core/          Auth, profile, firebase, hooks, types, utils
├── features/      Feature modules (today, week, engine, ladders, sessions, etc.)
```

## Documentation

See [`docs/`](./docs/) for detailed design documents covering scope, MVP, engine/ladders design, compliance, media capture, deployment, and testing.

## TypeScript Constraints

- **No enums** — `erasableSyntaxOnly` is enabled; use `as const` objects instead
- **`import type`** — `verbatimModuleSyntax` requires type-only imports for types
- **Firestore id-after-spread** — Put `id: doc.id` after `...doc.data()` so document ID wins

See [`CLAUDE.md`](./CLAUDE.md) for full coding conventions.
