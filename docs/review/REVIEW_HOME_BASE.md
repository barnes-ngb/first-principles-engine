# Review Home Base — First Principles Engine

> **What this is:** the single anchor for the Barnes homeschool app's architecture & functional review.
> **Where reviewing happens:** a dedicated Claude.ai chat (the "home base"). It owns the recurring
> audit, holds the live issue ledger, and spins out fix runs.
> **Where fixing happens:** Claude Code web, driven by the prompts in `prompts/`, reviewed before merge.
> **Repo:** github.com/barnes-ngb/first-principles-engine · **Live:** first-principles-engine.web.app
> **Created:** 2026-05-29 · **Last audit:** 2026-05-29 (seed)

---

## 1. Why this exists

The project already has a working maintenance system (Tiers 1–3 below) that keeps stats and docs
honest every few days. What it lacked was **teeth on architecture** and a path from *finding* to *fix*.
This home base adds that: one recurring deep audit focused on structure and the end-to-end loop, plus
a repeatable fix runner so issues don't just get logged — they get closed.

## 2. Review priority order

Set by Nathan, 2026-05-29. The audit and ledger weight findings in this order:

1. **Architecture & tech debt** — structure, decomposition, bundle, test coverage. *(primary)*
2. **Functional / UX completeness** — does the evaluate → plan → execute → review loop actually work for Shelly and the boys.
3. **Pedagogy & ethos alignment** — charter fidelity, disposition-over-mastery, no-shame, coverage-not-pace.
4. **Data integrity & compliance** — hours aggregation, MO 600-core line, source-of-truth conflicts.

> Note: an item in a lower band still jumps the queue if it is **time-sensitive or compliance-critical**
> (e.g. DATA-01 below, which affects the June 30 MO core-hours line).

## 3. How to run the home base

| Action | Where | How |
|---|---|---|
| **Monthly deep audit** | Claude Code web (scheduled) | Run `prompts/PROMPT_ARCH_AUDIT.md`. Same scheduling mechanism as your /3-day health audit. Suggested: 1st of month, after the health audit. |
| **Fix an issue** | Claude Code web (manual) | Run `prompts/PROMPT_FIX.md` with one issue ID from the ledger (§6). |
| **Strategy / triage / "should we even do this"** | Claude.ai home-base chat | Paste this file + the latest dated audit report. Talk it through. Decisions land back in the ledger. |
| **Refresh project context** | Claude.ai project settings | Point the project at `docs/PROJECT_CONTEXT.md` (regenerated weekly by Tier 3), not the stale v14 outline. See DOC-01. |

## 4. The existing maintenance system (unchanged — for reference)

| Tier | Cadence | Output | Owner |
|---|---|---|---|
| **1 — Health Audit** | every 3 days | `docs/HEALTH_REPORT.md` (stats, build/lint/test, doc drift, auto-fixes numbers) | Claude Code scheduled |
| **2 — Fix Companion** | after Tier 1 | auto-fixes mechanical doc gaps (undocumented tasks, missing collections, nav, index) | Claude Code scheduled |
| **3 — Context Gather** | weekly | `docs/PROJECT_CONTEXT.md` (AI-optimized context for design chats) | Claude Code scheduled |
| **4 — Deep Audit** | **monthly (this system)** | dated `docs/review/ARCHITECTURE_AUDIT_<YYYY-MM>.md` + ledger update | Home base → Claude Code |

Tiers 1–3 stay as they are. This home base **is** Tier 4, made concrete.

## 5. Architecture map (as of 2026-05-29)

**Stack:** React + TypeScript + Vite · Firebase (Auth/Firestore/Storage/Functions/Hosting) · MUI ·
Three.js r128 (3D avatar) · Anthropic Claude (Sonnet 4.6 primary, Haiku 4.5 for image-prompt rewrites) ·
OpenAI DALL-E 3 + gpt-image-1.

**Scale (verified against repo):** ~160,818 TS lines · 135 commits on main · 34 Firestore collections ·
24 Cloud Functions · 17 chat task types · 33 routes · 125 test files · 2,038 tests passing ·
build/lint/tsc all green.

**The core loop (this is what "functional review" traces):**

```
Evaluate ──► Skill Snapshot ──► Plan My Week ──► Daily checklist (Today) ──► Weekly Review
   ▲              (priority skills,                  (evidence: completion,        │
   │               supports, stop rules,             engagement, mastery,         │
   └───────────────conceptual blocks)                minutes, artifacts) ─────────┘
```

**AI pipeline:** 17 task types dispatched via `functions/src/ai/tasks/` registry; per-task context
slices in `functions/src/ai/contextSlices.ts`; charter preamble injected into all calls.

**Feature homes:** `today/` · `planner-chat/` · `quest/` (Knowledge Mine) · `avatar/` (Hero Hub) ·
`books/` · `workshop/` · `shelly-chat/` (Ask AI) · `evaluate/` · `records/` · `dad-lab/` · `progress/`.

**The central architecture tension (already named in `first-principles-system-review.md`):**
the system can answer *"where is Lincoln right now?"* from **six** places — Skill Snapshot, Ladders,
Milestones, Learning Map, Curriculum position, Disposition profile — and **none is authoritative**.
The loop isn't missing; it has too many overlapping truths. Sharpening that authority is the single
highest-leverage architecture move. Tracked as **FUNC-01**.

## 6. Live issue ledger

Status: `OPEN` · `IN PROGRESS` · `FIXED` · `WONTFIX` · `NEEDS-DATA` (requires live Firestore export).
Band = priority band from §2. The audit prompt updates this table; the fix prompt flips status.

| ID | Band | Status | Title | Evidence / location |
|---|---|---|---|---|
| **FUNC-01** | 2 | OPEN | No authoritative source for "where is Lincoln" — 6 overlapping truth surfaces | `first-principles-system-review.md`; Skill Snapshot / Ladders / Milestones / Learning Map / Curriculum / Disposition |
| **DATA-01** | 4† | OPEN | `MonthlyTrend` over-counts core hours; canonical view puts Lincoln **~1.3h under MO 600-core**. Fix written, **not applied** (touches additive-hours invariant) | `HEALTH_REPORT.md`; `MonthlyTrend.tsx:48-63` vs `records.logic.ts:85-115` |
| **ARCH-01** | 1 | OPEN | `chat.ts` Cloud Function is 2,466L; `buildQuestPrompt` alone 400+L | `functions/src/ai/chat.ts` |
| **ARCH-05** | 1 | OPEN | Main bundle 3.84MB / 1.13MB gzip, **zero code splitting** (Three.js, jsPDF, curriculum map) | needs route-level `React.lazy` — architectural decision |
| **ARCH-04** | 1 | OPEN | `useQuestSession.ts` 1,870L handles 4 quest types in one hook | `src/features/quest/useQuestSession.ts` |
| **ARCH-02** | 1 | OPEN | `PlannerChatPage.tsx` 2,620L; ~1,700L interconnected state | `src/features/planner-chat/PlannerChatPage.tsx` |
| **ARCH-03** | 1 | OPEN | `BookEditorPage.tsx` 2,278L, grew with themes + drawing flows | `src/features/books/BookEditorPage.tsx` |
| **ARCH-06** | 1 | OPEN | WorkbookConfig → ActivityConfig migration incomplete (27 legacy refs; backfill covers runtime) | quest starting-level check, certificate scan |
| **TEST-01** | 1 | OPEN | `shelly-chat`, `progress`, `dad-lab` have **0** test files | `HEALTH_REPORT.md` coverage table |
| **ARCH-07** | 1 | OPEN | Ladder system partial-deprecation; 3 files carry TODO removal markers | per `CLAUDE.md` tech debt |
| **DATA-02** | 4 | NEEDS-DATA | Possible duplicate hours backfill: near-identical 5-subject batches dated 2025-07-15 & 2025-08-15 | de-dupe `hoursAdjustments` on (date,subject,minutes,reason) |
| **DOC-01** | 1 | OPEN | Claude.ai project still points at MASTER_OUTLINE **v14** (Mar 31); repo is **v15**. Repoint at `PROJECT_CONTEXT.md` | this project's loaded files |
| **LINT-01** | 1 | WONTFIX? | 3 `react-hooks/exhaustive-deps` warnings (intentional timer-ref pattern) | `EvaluateChatPage.tsx:282`, `useQuestSession.ts:679,1760` |

† DATA-01 is in band 4 by topic but **promoted to top of queue** as compliance- and time-sensitive (June 30).

## 7. Triggers (phone-first cheat-sheet)

Everything below is either fully automatic or a single short message pasted into Claude Code web.
No local commands, ever.

### Fully automatic (set once)
- **Monthly audit** — scheduled Claude Code task, same as the /3-day health audit. Task prompt:
  > Read `docs/review/prompts/PROMPT_ARCH_AUDIT.md` and execute it fully.

  Suggested schedule: 1st of the month, after the health audit. It auto-applies safe doc fixes and
  opens a PR for everything else. You just review + merge from the phone.

### One-line triggers (paste into Claude Code web on the repo)
- **Run a fix** (you pick the issue ID from §6):
  > Read `docs/review/prompts/PROMPT_FIX.md` and run it for ISSUE_ID: DATA-01

- **Run the audit now** (off-schedule, e.g. before a design session):
  > Read `docs/review/prompts/PROMPT_ARCH_AUDIT.md` and execute it fully.

- **Just triage / ask** (in the Claude.ai home-base chat, not Claude Code):
  > Read REVIEW_HOME_BASE.md and the latest audit report. What should I fix next and why?

### What is and isn't automated (by design)
- **Auto, no touch:** the audit, stat/doc corrections, PR creation.
- **One tap from you:** merging any PR.
- **Deliberately manual:** fixes that change real code or data — compliance hours, XP ledger, charter
  preamble. These propose-and-stop so a human decides. That's a safety feature for a system holding a
  child's school records, not a gap to close.



## 8. Conventions for this system

- **Design here, build there.** This home base produces decisions and prompts. Claude Code makes the code changes, always on a branch, always reviewed before merge.
- **Inspect → validate → propose for anything touching an invariant.** Hours math, XP ledger, and the additive-hours rule are never auto-fixed. They land as a proposal in the ledger for a human call.
- **One issue ID per fix run.** Keeps PRs small and reviewable.
- **Ledger is the memory.** If it isn't in the ledger, it didn't happen. Every audit and fix updates it.
- **Environment is Claude Code web, phone-first.** Nathan rarely runs anything locally. Claude Code web executes all builds/lint/tests/git in its own environment as part of running a prompt. No prompt should ask the human to run a command, install tooling, or use a local shell. The human's actions are limited to: pasting a prompt, uploading files, and reviewing/merging PRs from the phone.
