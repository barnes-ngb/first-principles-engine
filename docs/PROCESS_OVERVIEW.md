# Process Overview — How This Project Is Built & Maintained

> **Read this first.** Audits (especially the monthly `PROMPT_ARCH_AUDIT.md`) should orient on this doc
> before judging the codebase, so findings land against how the system is *actually* developed and kept
> honest — not against an imagined CI/agile shop.
>
> **Status:** CURRENT · **Last updated:** 2026-06-20 · **Owner:** home-base chat.
> **Scope:** describes the development loop, the audit pipeline, and the kid learning loop. It does **not**
> redefine invariants or cadences — those live in `CLAUDE.md` and in the human's scheduler. When this doc
> and `CLAUDE.md` disagree, `CLAUDE.md` wins.

---

## (i) The development loop

This is an **AI-built, human-reviewed, phone-first** project. One human (Nathan) assigns work and merges;
Claude (design chats + Claude Code) does the building. The loop:

```
Design chat (Claude.ai)
  → writes a self-contained run-prompt (grounds itself, names the change, names the ledger row)
    → Claude Code web branches from FRESH origin/main
      → makes the change, runs build/lint/test in its own environment
        → opens a PR (never merges)
          → human reviews + merges from a phone
```

Load-bearing rules (the canonical statement is `CLAUDE.md` › **AI Development Operating Model** — read it,
this is only a map):

- **Branch + PR, never merge.** Every change lands on a branch with a PR. The human merges. Never push to
  `main` or `deploy`.
- **Runs don't freelance scope.** A run does the work its run-prompt assigns and updates the matching ledger
  row — nothing more.
- **Invariants are propose-and-confirm.** Never silently change compliance/`hours` math, the `xpLedger`,
  `skillSnapshots` (write only via the central `skillSnapshotWrites.ts`), the charter preamble, or
  `firestore.rules`. Any user-facing write to a child's record goes propose → confirm → write.
- **Phone-first.** A run does all build/lint/test/git itself. Never instruct the human to run a local
  command — their actions are limited to pasting a run, uploading a file, and reviewing/merging a PR.
- **Lincoln-first / London minimal.** Wire new work for Lincoln; gate on **capability, never on name**.
  London's experience is intentionally minimal until a surface is tuned for a 6-year-old. Parity is not the
  goal. (See `PROJECT_CONTEXT.md` › Strategic Direction §1 — multi-kid generality.)

### The review ledger is working memory

`docs/review/REVIEW_HOME_BASE.md` §6 is the **single source of truth for open work and what's been done.**
If it isn't in the ledger, it didn't happen. ID prefixes by lane: `ARCH-`/`TEST-`/`LINT-` (structure) ·
`FEAT-`/`FUNC-` (functionality) · `DOC-`/`ETHOS-` (docs) · `DATA-` (data/compliance) · `AV-` (avatar lane).

**Ledger discipline — non-negotiable:**

- **Additive only.** Add new rows; update only the *status* of rows you own. Never rewrite, reorder, delete,
  or reopen a `RESOLVED`/`FIXED` row. A correct ledger PR reads `+N rows / −0`, one file changed.
- **`max(id)+1` per lane, against the remote.** Re-fetch the ledger from `origin/main` before appending —
  a local/proxy snapshot can be stale. Reuse an ID and you collide.
- **Serialize ledger-touching runs.** Only **one ledger-touching run in flight at a time** across all chats.
  `max(id)+1` only protects *sequential* writes; parallel cross-chat appends collide on the shared counter.
  (This has bitten us — duplicate IDs were swept on 2026-06-07 and 2026-06-08.)
- **Single-writer-ish ownership.** The home-base chat owns the ledger; the build chat edits only its portal
  rows (`FEAT-01`, portal `FUNC-*`, `ARCH-10`). Merge ledger PRs promptly and in order.

---

## (ii) The audit pipeline (canonical cadence)

Three automated audits plus one human conversation keep the codebase honest. Each owns a **distinct scope**
and writes a **distinct output file** so they can't clobber each other.

| Audit | Cadence | Owner / driver | Scope | Output |
|---|---|---|---|---|
| **Health audit** | **Daily** | Claude Code scheduled | Mechanical drift — stat numbers, undocumented tasks/collections/nav, index entries; **auto-fixes** zero-risk doc gaps | `docs/HEALTH_REPORT.md` + small doc-fix PRs |
| **Test builder** | **Weekly** | Claude Code scheduled (`PROMPT_AUTO_ARCH_FIX.md` lane) | **Additive test files only** — raise coverage on real logic; never change product code | new `*.test.ts(x)` PRs |
| **ARCH_AUDIT** | **Monthly** | Claude Code scheduled (`PROMPT_ARCH_AUDIT.md`) | Deep **inspect / validate / propose** — architecture, the functional loop, pedagogy, data integrity. Applies only mechanical doc fixes; everything structural is a *proposal* in the ledger | `docs/review/ARCHITECTURE_AUDIT_<YYYY-MM>.md` + ledger rows |
| **Deep-Audit conversation** | **Monthly, human** | Home-base chat (off-auto) | Strategy / triage / "should we even do this" — reads the latest audit report + ledger, decides what to fix next | decisions land back in the ledger |

**Dropped:** the former separate **Tier-2 "fix companion"** audit (was listed as audit #1 in the older
Tier-1–4 table in `REVIEW_HOME_BASE.md` §4) is **retired as redundant** — the **daily health audit** already
applies mechanical doc fixes, and the **monthly ARCH_AUDIT** owns deeper proposals. The weekly **context
gather** (Tier 3) is also effectively folded in: `PROJECT_CONTEXT.md` is now regenerated on demand from the
sources (no generator script yet — see that file's header). _This describes the cadence; changing the
scheduler itself is a human action, out of scope for any run._

### COLLISION rule (read before scheduling or running an audit)

Collisions are real — a duplicate ledger ID has already happened from parallel runs. Therefore:

1. **Only one ledger-touching audit/run in flight at a time.** Merge it before starting the next.
2. **Audits write distinct output files** (health → `HEALTH_REPORT.md`; ARCH → dated `ARCHITECTURE_AUDIT_*`;
   test builder → new test files). Two runs must never edit the same file concurrently.
3. **Never run an audit concurrently with a ledger-touching feature run.** The shared ledger counter is the
   contention point; serialize anything that appends a row.
4. **Re-fetch the ledger from `origin/main` and use `max(id)+1`** immediately before appending — never trust
   a stale local/proxy view.

### Related run-prompts

- `prompts/PROMPT_ARCH_AUDIT.md` — the monthly deep audit (this is the one that reads this doc first).
- `prompts/PROMPT_FIX.md` — close exactly **one** ledger ID per run; small reviewable PR; never merge.
- `prompts/PROMPT_AUTO_ARCH_FIX.md` — the weekly autonomous, inspect-first, one-safe-item fix routine.
- `prompts/PROMPT_BACKUP_CHECK.md` — verify the data is recoverable (closes `DATA-03`).

---

## (iii) The kid learning loop

This is the loop the **functional review** traces end to end. It must close, and every kid's work must be
**saved and state-labeled** (MO now; MO + TX next — see `PROJECT_CONTEXT.md` › Strategic Direction §2).

```
CAPTURE ──► SAVED + STATE-LABELED ──► EVALUATED ──► PLANNED ──► TAUGHT ──► RE-EVALUATED ──┐
 (notes/photos/audio,    (artifact/day-log,        (Knowledge Mine +    (Plan My Week    (Lincoln       │
  multi-photo,            hours; tagged for          eval chat → skill    reads findings)  teaches        │
  mode-set Mine)          MO compliance)             snapshot, findings,                   London)        │
        ▲                                            conceptual blocks,                                    │
        └────────────────────────────────────────── missing foundations / dependencies) ◄────────────────┘
```

- **Capture** — notes / photos / audio (now multi-photo + audio upload, FEAT-31/32), and the mode-set
  Knowledge Mine quest. Narration is first-class evidence for Lincoln.
- **Saved + state-labeled** — every capture must persist as an artifact / day-log with hours, tagged so it
  counts toward compliance. **MO today; the labeling must become MO + TX-aware** (exports are MO-only now).
- **Evaluated** — Knowledge Mine + the evaluation chat produce an `EvaluationFinding` → skill snapshot
  (priority skills, supports, stop rules), conceptual blocks, and missing foundations/dependencies.
- **Planned** — Plan My Week reads findings and shapes the next checklist.
- **Taught** — Lincoln teaches London (Feynman); his explanations are the richest portfolio artifacts.
- **Re-evaluated** — the loop comes back around per child.

**Per-child, multi-kid:** one **shared engine** with **distinct paths**. Kids can borrow evaluation signal
across each other without being locked to the same path or level.

### Loose points to watch (known weak links in the loop)

These are the spots where the loop frays today — audits and runs should treat them as live risks, not
settled:

- **Sparse-upload days** — when little is captured, evaluation and planning have thin signal; the loop quietly
  starves rather than failing loudly.
- **Lincoln does Knowledge Mine only ~weekly** — re-evaluation cadence is low, so the snapshot can lag his
  actual progress.
- **Learning-map "shows missing things he's actually learned"** — coverage/derivation bug where the map under-
  reports mastery (work captured elsewhere isn't reflected). Treat map gaps as suspect, not authoritative.
- **Knowledge Mine is too limited / needs more levels** — quest ceilings are principled (content runs out),
  but at 10 Lincoln is at/over several caps; depth + routing are the largest open content gaps (FEAT-08/10).
- **State-labeling is MO-only** — work is saved but not yet TX-aware; this is a loop-integrity gap the moment
  the family moves.

These are exactly what the three audit lenses in `PROMPT_ARCH_AUDIT.md` (learning-loop integrity, multi-kid
generality, MO→TX compliance) exist to keep in view.
