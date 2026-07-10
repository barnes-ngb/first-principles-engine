# Docs & Data Alignment (DOC-08)

> A running routine, not a review skill. `scripts/check-docs-alignment.mjs`
> detects doc/index/ledger drift on every PR so it stops getting caught by hand.

## Run it

```
npm run docs:check     # report (HARD failures exit non-zero; SOFT warnings exit 0)
npm run docs:fix       # apply the safe rewrites (generated spans), then report
```

Plain Node, **zero dependencies** — runs identically on Windows PowerShell and in
CI (`docs-check` job in `.github/workflows/ci.yml`, every PR). No `npm install`
needed for the check itself. Phone-first: you never run this locally; CI does.

## The checks

| # | Check | Severity | What it catches |
|---|---|---|---|
| 1 | **Ledger ID uniqueness** | HARD | Two ledger rows owning the same ID (e.g. the FEAT-40 / FEAT-44 parallel-chat collisions). Parses the **ID column** of `REVIEW_HOME_BASE.md` §6 — bolded cross-references in a row body are ignored. Also reports lane gaps ≥3 (informational). |
| 2 | **Index ↔ filesystem** | HARD | A `DOCUMENT_INDEX.md` Repo-Docs row (status not REMOVED/HISTORICAL) pointing at a file that doesn't exist, **and** any `docs/**` file (excluding `archive/`) missing from the index. Subfolders (`foundations/`, `review/`) resolve. |
| 3 | **Ledger anchors** | HARD | Any `Ledger anchor: X-N` string in `docs/**` that names a ledger row which doesn't exist. |
| 4 | **Collection count** | HARD | Docs disagreeing with each other (or reality) on how many Firestore collections exist. The count is **derived** from `src/core/firebase/firestore.ts` (number of exported `*Collection` helpers — precise, not converter type params). Docs never hand-state it: each carries a `<!-- gen:collection-count -->N<!-- /gen -->` span the script verifies, and `--fix` rewrites. The canonical docs (`DOCUMENT_INDEX`, `FIRESTORE_AUDIT`, `PROJECT_CONTEXT`) must each carry a span. |
| 5 | **Declared-but-unwritten data kinds** | SOFT | `EvidenceRef` union members (and any future unions in the config) declared in types with **zero non-test writers**, unless allowlisted with a reason + owning ledger ID. A kind that *gains* a writer is flagged to remove from the allowlist. |
| 6 | **Known raw refs** | SOFT | New `collection(db, \`families/…\`)` template literals outside `firestore.ts`, or a stale allowlist entry whose ref disappeared. |

### Resilience invariants (DOC-09)

Three checks over `src/features/**`, each encoding a bug the family hit in July
2026. All non-HARD (checks 7–8 SOFT, check 9 report-only), grouped under a
**Resilience invariants** section in the output. They are **file-level grep
heuristics** — coarse by design, honest about it in the report.

| # | Check | Severity | What it catches | Lesson |
|---|---|---|---|---|
| 7 | **Remote call timeout + finally** | SOFT → HARD after one clean month | A `src/features` file with a raw `httpsCallable(…)` that isn't within reach of BOTH a timeout signal (`timeout:` option, the FEAT-61 `withTimeout` wrapper, or an AbortController) AND a `finally`. AI-request sites that route through the `useAI` hook are safe by construction (excluded). Allowlist: `remoteCallAllow`. | FEAT-61 (the 5-minute "Reading your photo…" spinner) |
| 8 | **Image-input downscale** | SOFT | An image file-input (`type="file"` + an image `accept`) with no downscale/compress call in-file. Allowlist: `imageDownscaleAllow` — genuine originals-needed (sketch/photo) or a pointer to the handler that downscales. | FEAT-61 (full-res uploads) |
| 9 | **Silent-fallback census** | report-only (never fails CI) | Every `catch` block in `src/features` that neither rethrows, sets a user-visible error, nor logs at warn+ — the swallowed-failure census, printed for the monthly ops window. **No allowlist.** | FEAT-62 (doubly-gated silent artifact-scan fallback) |

The monthly ops window (`docs/OPS_WINDOW.md`) reviews these SOFT warnings and the
census; a clean month is the bar for flipping check 7 HARD.

HARD failures fail the CI job. SOFT warnings annotate and pass — they surface real
drift for a human to file, without blocking merges.

## Allowlist discipline

`scripts/docs-alignment.allow.json` holds the config + allowlists. **Every allowlist
entry carries a `reason` and an owning `ledger` ID** — an allowlist without a
paper trail is just a silenced check. Discipline:

- **`evidenceKindsAllow`** — kinds intentionally declared ahead of their writer
  (forward declarations). When the writer lands, the check tells you to remove the
  entry. Seeded with `eval` / `quest` / `scan` (writers land in Learner Model
  slices 2c/3, `FEAT-46`).
- **`rawRefsAllow`** — intentional raw subcollection refs that have no `firestore.ts`
  helper by design (seeded: the `wordProgress` subcollection reads in
  `useQuestSession.ts` and `useWordWall.ts`). A raw ref to a collection that *does*
  have a helper (e.g. `xpLedger`, `days`) is left to warn — it is minor debt worth
  filing, not silencing.
- **`collectionCountDocs`** — the docs required to carry a generated count span.
- **`evidenceUnions`** — which `as const` unions check #5 scans.
- **`remoteCallAllow`** (DOC-09 check 7) — `src/features` files whose raw
  `httpsCallable` is deliberately un-guarded. Empty on day one: the SOFT month is
  for fixing the census, not silencing it.
- **`imageDownscaleAllow`** (DOC-09 check 8) — image inputs that legitimately
  skip in-file downscale: genuine originals-needed (`SketchScanner`,
  `AvatarPhotoUpload`) or a downscale that lives in an imported handler
  (`KidCaptureForm`, `FoundationsReviewSession`, `ShellyChatPage`, `PageEditor`,
  each with a pointer in its `reason`).

## When a check fires

- **Count span mismatch** → `npm run docs:fix` and commit the rewrite.
- **Missing span in a canonical doc** → add `<!-- gen:collection-count -->N<!-- /gen -->`
  where the count belongs (insertion is manual; `--fix` only rewrites existing spans).
- **New unindexed doc** → add a Repo-Docs row to `DOCUMENT_INDEX.md`.
- **Dangling anchor / index→fs miss** → fix the anchor or the path.
- **Duplicate ledger ID** → this is a real collision. **Do not renumber ledger
  history** (additive-only invariant, `CLAUDE.md`). Report it; a human renumbers one
  row to the next free lane ID, coordinating with whichever PRs introduced the rows.
