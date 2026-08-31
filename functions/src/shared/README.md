# `functions/src/shared/` — rules that BOTH the app and the Cloud Functions compile

Code in this directory has **exactly one definition** and is type-checked by **both**
TypeScript projects:

| Project | How it reaches this directory | What checks it |
|---|---|---|
| Cloud Functions | `import { … } from "../../shared/x.js"` | `cd functions && npx tsc` (also `firebase.json`'s `predeploy` hook) |
| App | `import { … } from '../../../functions/src/shared/x'` | root `npx tsc -b`, Vite, Vitest |

That is the whole point: **editing a rule here without updating a caller fails to
COMPILE**, on whichever side broke. It replaces the previous guard — a hand-kept port
plus a parity fixture — which only held as long as a test author remembered the fixture
existed. See ARCH-47.

## Why the shared directory lives under `functions/`, not at the repo root

The two compilers are not equally constrained, so the shared code lives on the
constrained side and the permissive side reaches in:

- `functions/tsconfig.json` sets `rootDir: "./src"`, so **any** file outside
  `functions/src` in its program is `TS6059`. Relaxing `rootDir` to the repo root is
  possible and compiles cleanly — but it moves the emit layout from
  `functions/lib/index.js` to `functions/lib/functions/src/index.js`, which is the path
  `functions/package.json`'s `"main"` names and Firebase loads on deploy. Measured, not
  assumed (ARCH-47 spike).
- The app project has no `rootDir` and `noEmit: true`, so it can compile a file from
  anywhere in the repo. It costs nothing.

So: **the shared directory is inside `functions/src`, and `functions/lib/index.js` never
moves.** The dependency arrow reads app → functions, which is unusual; it is the price
of not touching the deploy entrypoint.

## Rules for code in here

1. **No imports outside this directory** — not from `functions/src/ai/**`, not from
   `src/**`. A shared module pulls its whole import graph into *both* programs, and the
   app's graph (DOM types, React) will not survive `functions`' `lib: ["ES2022"]`.
   Anything a rule needs, it declares locally.
2. **Relative imports inside this directory carry an explicit `.js` extension**
   (`./helpers.js`). `functions` compiles with `moduleResolution: "Node16"`, which
   requires the extension (`TS2835` without it); the app's `bundler` resolution and both
   Vite and Vitest resolve `./helpers.js` → `helpers.ts` happily. One file satisfies
   both — this was the crux the ARCH-47 spike had to prove, and it holds.
3. **Firestore data is untyped here.** These modules run against raw documents on the
   functions side, so inputs are declared structurally (`RawDadLabReport`) and validated
   rather than asserted. The app's `DadLabReport` is structurally assignable, so the
   app-side helper stays typed for its callers and delegates.
4. **Nothing environment-specific** — no `firebase-admin`, no `firebase/firestore`, no
   `window`. Pure functions only. This code is bundled into the browser app *and*
   deployed to Cloud Functions.

## What is here, and what is still duplicated

Migrated (ARCH-47 slice 1):

- `dadLabReportArtifacts.ts` — `reportArtifactIds`, the "what is on this Dad Lab report"
  rule (UX-85), previously implemented once in `src/features/dad-lab/reportArtifacts.ts`
  and again in `functions/src/ai/tasks/dadLabReportArtifacts.ts`.

Still hand-kept copies, in the order they should follow:

1. `deriveChildIdFromDocId` — inline in `functions/src/ai/tasks/monthlyHours.ts`, ported
   from `src/core/utils/docId.ts`.
2. `sanitizeJson` — `functions/src/ai/sanitizeJson.ts` vs `src/core/utils/sanitizeJson.ts`
   (carries its own `// TODO: consolidate`).
3. `collectHoursContributions` — `functions/src/ai/tasks/monthlyHours.ts` vs
   `src/features/records/records.logic.ts`. Last, deliberately: it is the largest and it
   is compliance math, which `CLAUDE.md` names propose-and-confirm.
