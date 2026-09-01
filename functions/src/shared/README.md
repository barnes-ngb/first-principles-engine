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

Migrated:

- `dadLabReportArtifacts.ts` (slice 1) — `reportArtifactIds`, the "what is on this Dad Lab
  report" rule (UX-85), previously implemented once in
  `src/features/dad-lab/reportArtifacts.ts` and again in
  `functions/src/ai/tasks/dadLabReportArtifacts.ts`.
- `docId.ts` (slice 2) — `deriveChildIdFromDocId` and `parseDateFromDocId`, plus the
  `DATE_RE` they share: how a composite `days` doc id splits into a date and a child id,
  in either order. Previously `src/core/utils/docId.ts` plus a hand-kept inline port in
  `functions/src/ai/tasks/monthlyHours.ts` with its own copy of the regex. Both readers
  moved together — they are one rule about one key, and leaving half behind would have
  split `DATE_RE` across the wall. `src/core/utils/docId.ts` keeps its path and
  re-exports, so its consumers (and the further re-export in `records.logic.ts`) are
  untouched; on the functions side `monthlyReviewData.ts` imports it directly.
- `sanitizeJson.ts` (slice 3) — `sanitizeAndParseJson`, the LLM-JSON parser: fence
  stripping, trailing commas, control characters and interior quotes inside strings,
  and the preamble/suffix fallback (`candidateJsonSpans`). Previously
  `functions/src/ai/sanitizeJson.ts` plus a "deliberate client-side port" at
  `src/core/utils/sanitizeJson.ts`, each with a `// TODO: consolidate`. **This was
  the slice where the copies had DRIFTED**: the functions copy had gained the
  preamble/suffix fallback and the app copy never received it, so `Here is the
  JSON:\n{ … }` parsed on the server and threw in the browser — where every
  consumer swallows the throw and silently drops the payload. Consolidated on the
  fuller behaviour, so the app side *gained* the fallback; declared and tested as a
  behaviour change, not a refactor. `src/core/utils/sanitizeJson.ts` keeps its path
  and re-exports, so its three consumers are untouched; the functions-side copy is
  deleted and its nine consumers import the shared module directly.

Still hand-kept copies:

1. `collectHoursContributions` — `functions/src/ai/tasks/monthlyHours.ts` vs
   `src/features/records/records.logic.ts`. Last, deliberately: it is the largest and it
   is compliance math, which `CLAUDE.md` names propose-and-confirm.

Not a duplicate, despite appearances: `functions/src/records/compliancePack.logic.ts` also
defines a `DATE_RE` with identical regex text. It is the same *regex*, not the same *rule* —
it shape-checks a client-supplied `startDate`/`endDate` in `validatePackRequest`, rather
than parsing a composite key. Merging the two would couple a request validator to a doc-id
parser for no reason beyond a shared literal. Left where it is.
