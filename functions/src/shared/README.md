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

## What is here, and the one leftover

All four ARCH-47 slices have landed. Every rule the work set out to consolidate —
Dad Lab report artifacts, the day-log doc id, the LLM-JSON parser and the hours
counting path — now has exactly one definition, so the `functions/`↔`src/` wall no
longer hides a copy of any of them.

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

- `hoursContributions.ts` (slice 4) — `collectHoursContributions` with
  `entryMinutes`, `dayLogMinuteContributions` and `itemMatchesBlock`: the counting path
  behind every hours figure the family has (Records, the MO compliance dashboard, the
  compliance pack, the monthly trend chart, the monthly review book). Previously
  `src/features/records/records.logic.ts` plus `src/core/utils/itemBlockMatch.ts`, and a
  hand-kept port in `functions/src/ai/tasks/monthlyHours.ts` written for FEAT-164 so the
  book would stop narrating a smaller month than the record it belongs to. Last,
  deliberately: it is the largest and it is compliance math, which `CLAUDE.md` names
  propose-and-confirm.

  **The copies had NOT drifted.** Unlike slice 3, a differential probe over 40 000
  randomized well-typed corpora plus a hand-built edge battery found the two
  rule-identical: **no compliance figure moved** (`computeHoursSummary` over the
  retiring parity fixture is byte-identical before and after — 285 min, and the same
  per-subject, per-date, home and core splits). The port differed only in that it
  NARROWS its inputs (this directory's rule 3) because it reads unvalidated Firestore
  documents, so where a stored field holds a value its declared type forbids — a `NaN`,
  a string where a number is declared, a missing required `blocks` — the consolidated
  rule now yields a defined number instead of propagating `NaN` into a total or throwing.
  That is the one behavioural delta and it is pinned by tests on both sides.

  Both app files keep their paths and their TYPED signatures and delegate, so no call
  site was loosened to `unknown`. `monthlyHours.ts` survives, but holding only what is
  genuinely the book's own — `summarizeHoursContributions` / `computeMonthHours`, the
  fold to the two numbers the prose reads; the app's `computeHoursSummary` folds the same
  list into a larger compliance shape. The PARITY FIXTURE that used to pin the two copies
  is retired: the compiler replaced it, and its coverage lives on in
  `hoursContributions.test.ts` as the union of both old suites.

Added after the four slices (not a consolidation — a rule that was *born* here rather
than ported into it):

- `customPictureNote.ts` (FEAT-197 / UX-177) — `normalizeCustomPictureNote` and its
  cap: how the "+ My own look" note on the sticker doors is coerced into one bounded
  sentence. Both sides enforce it and they must agree — the client caps as a courtesy
  so a person sees the limit while typing, the server clamps again because a length
  only the client enforces is not a limit. FEAT-194 kept the equivalent story-theme
  rule as two copies with a comment naming the mirror; this is that same rule with the
  comment replaced by the compiler.

Still a hand-kept copy (named while consolidating slice 4, out of all four slices'
scope):

- `labBeatsHaveContent`, `beatTextForChild` and `BEAT_BOTH` in
  `functions/src/ai/tasks/dadLabReportArtifacts.ts` are ports of
  `src/core/types/dadlab.ts` — a DIFFERENT original from the `reportArtifacts.ts` that
  slice 1 consolidated, which is why they were left behind. That file is therefore not
  a pass-through: it still owns three real functions, and only its `reportArtifactIds`
  re-export (kept so `monthlyReviewData.ts`'s import path is untouched) is one. They are
  a good candidate for a fifth slice; the app-side original carries React-free plain
  types, so it should move cleanly.

Not a duplicate, despite appearances: `functions/src/records/compliancePack.logic.ts` also
defines a `DATE_RE` with identical regex text. It is the same *regex*, not the same *rule* —
it shape-checks a client-supplied `startDate`/`endDate` in `validatePackRequest`, rather
than parsing a composite key. Merging the two would couple a request validator to a doc-id
parser for no reason beyond a shared literal. Left where it is.
