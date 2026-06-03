# London (K-1) Evaluation-Readiness Recon

> **What this is:** a read-only recon answering one question — *is the reading-evaluation flow
> age-appropriate for London (6, ~1st grade, early reader) before Shelly sits him down for his
> **first** evaluation?* No code, prompt, or behavior was changed by this run; it inspects and reports.
> **Created:** 2026-06-03 · **Companion to:** `docs/LONDON_BACKLOG.md` (Reading-evaluation row),
> `CLAUDE.md` › Lincoln-first / London-minimal, `docs/review/REVIEW_HOME_BASE.md` (ledger).
> **Lens:** no-shame throughout — the question is whether London gets a *gentle, encouraging* first
> experience, never whether he "passes."

---

## TL;DR — Verdict

**Ready as-is. London can be evaluated now.** The reading evaluation is the right shape for a
6-year-old non-reader, for one structural reason that reframes most age-appropriateness worries:

> **The evaluation is parent-mediated and oral.** Shelly talks to the **parent**, not the child. The
> AI hands the parent one small step at a time ("ask him to read: cat, hat, sat"), the parent runs it
> with London out loud, and the parent types back what they saw. **London never reads the chat and
> never types.** So "can't read the questions yet" and "voice-first / not writing yet" are satisfied
> by design — the parent is the interface.

On top of that, the reading diagnostic **starts at a true pre-reading kindergarten floor** (Level 0:
phonemic awareness — rhymes, first sounds, blending), uses K-appropriate content (CVC families like
`-at`, `-ig`), caps each step at 2–3 minutes, and is framed encouragingly ("every skill map has a
frontier, that's normal and good").

There are **three small, optional polish items** (below) that would make a young first-timer's run
*marginally* gentler and bring the reading prompt to parity with the already-shipped math prompt.
**None blocks London's first eval** — they are nice-to-haves, logged as one small slice in
`LONDON_BACKLOG.md`, not a prerequisite.

---

## What was inspected (Step 0 — grounding)

| Piece | Where |
|---|---|
| Eval chat UI (parent-facing) | `src/features/evaluate/EvaluateChatPage.tsx` — start flow `:358`, send `:425`, input `TextField :893`, intro copy `:814-836` |
| Reading diagnostic prompt + level structure | `functions/src/ai/chat.ts:556-688` (`buildEvaluationPrompt`, `domain === "reading"`) |
| Eval task handler + context | `functions/src/ai/tasks/evaluate.ts`; context = `charter + childProfile + sightWords + wordMastery` (`contextSlices.ts` TASK_CONTEXT) |
| Child profile (age/grade) into prompt | `contextSlices.ts:291-329` (`formatChildProfile` — emits `Age`, `Grade`, motivators…) |
| Working-level calibration / start point | `src/features/quest/workingLevels.ts` (`deriveWorkingLevelFromEvaluation`, `canOverwriteWorkingLevel`); EvaluateChatPage `:566-577` |
| Input model | EvaluateChatPage `TextField :893` (parent types); no voice on this surface (not needed — adult input) |

> **Scope note:** this recon is about the **first evaluation** (the parent-driven *Evaluate* chat). The
> child-direct **Knowledge Mine quest** (`/quest`) is a *separate* surface where voice/tap/reading-load
> genuinely matter for London — and it is **already held** from London behind a reading-snapshot
> capability gate (`canAccessKnowledgeMine`) until he's tuned, per `LONDON_BACKLOG.md`. The quest is out
> of scope here; the eval is what *opens* it.

---

## Step 1 — K-1 appropriateness, per criterion

### 1. Gentle start (true K floor) — ✅ PASS
The reading diagnostic sequence (`chat.ts:572-601`) opens at **Level 0: Phonemic Awareness** — hearing
rhymes, identifying first sounds, segmenting and blending — *before any letters or words are required*,
then **Level 1: Letter-Sound Knowledge**, then Level 2 CVC. This is a genuine pre-reading floor; it does
**not** assume reading fluency. It actually starts *lower* than the math diagnostic (which opens at L1
number sense). A fresh eval with no prior snapshot naturally begins at Level 0.
- **Minor (optional):** unlike the math prompt — "START AT THE LEVEL THE SKILL SNAPSHOT SUGGESTS, OR L1
  IF NO DATA" (`chat.ts:709`) — the reading prompt has **no explicit "start at Level 0 if no data" line.**
  It lists Level 0 first and walks up (the adapt rule is "if the child clearly knows something, skip
  ahead"), so behaviour is correct, but the floor is *implicit*. An explicit line would remove any chance
  the model opens above a true non-reader's floor.

### 2. Language / pacing — ✅ PASS (audience is the parent)
The instructions are written **for the parent** (an adult): "Tell the parent exactly what to show/ask the
child," "ask him to read: cat, hat, sat." There is **no requirement that a 6-year-old read anything in the
chat.** Content is K-appropriate (rhyme, first-sound, CVC `-at`/`-ig`), and each step is explicitly capped
at **2–3 minutes of actual testing** (`chat.ts:570`) — well-matched to a young child's attention span and
the "adapt: skip ahead / go deeper" rule keeps it responsive.

### 3. Early-reader handling (can't read the questions) — ✅ PASS (non-issue here)
Because the parent administers every step orally and reports back, a child who can't yet read the
questions is **fully supported** — this is exactly the design for a non-reader. London is asked to *say
sounds and read individual words aloud to his parent*, never to read the assessment itself.

### 4. Voice-first / tap input — ✅ PASS (satisfied by parent-mediation)
London's responses are **oral**, captured by the parent. The on-screen input is a `TextField` the
**parent** types into (`EvaluateChatPage.tsx:893`) — appropriate, since the typist is an adult. There is
no child-direct typing or reading on this surface, so "London isn't writing yet" doesn't bite. (Voice/tap
input for the *child* is a Knowledge-Mine concern, not an eval concern.)

### 5. No-shame — ✅ PASS (with one small asymmetry)
The reading prompt instructs the model to "**Be encouraging about the child: every skill map has a
frontier, that's normal and good**" (`chat.ts:569`), frames everything as a *frontier* rather than a
score, and the generated `stopRules` include "If frustration appears, switch to a familiar word game"
(`chat.ts:687`). The intro copy is warm ("Have London nearby — you'll show letters and words…").
- **Minor (optional):** the **math** prompt carries an explicit guardrail line — "**No grades, no
  rankings. Findings are evidence-based, never shaming.**" (`chat.ts:703`) — that the **reading** prompt
  does **not** have. Both are encouraging in practice; reading just lacks the one-line explicit guard.
- **Very minor (parent-facing only):** the *Findings So Far* panel renders a `not-yet` status as a red
  `error`-coloured chip (`EvaluateChatPage.tsx:944-955`). The child never sees this; it's a parent view.
  Noted for completeness, not a child-experience issue.

### 6. Profile-awareness (does it adapt to a younger child?) — ⚠️ NEUTRAL
The `childProfile` slice **does** carry London's `Age` and `Grade` into the eval context
(`formatChildProfile`, `contextSlices.ts:294-300`). But the **reading** prompt body never references it —
whereas the **math** prompt explicitly says "**See the child profile context above for age,
neurodivergence, and current math level**" (`chat.ts:695`). In practice this doesn't break the reading
eval (it always starts at the Level 0 floor, which is *correct* for a 6-year-old), so it's **not a gap that
blocks London** — but the prompt isn't *leveraging* his age to lean extra-gentle/extra-short either. Listed
as optional polish, not a fault.

---

## Step 2 — Gaps + smallest tune

**Can London be evaluated as-is?** **Yes.** Nothing above blocks a gentle, encouraging first reading eval
for a 6-year-old. The parent-mediated, oral, Level-0-floor design is well-suited to an early reader.

**If (and only if) a polish slice is wanted later**, the *smallest* additive change — reading-prompt-only,
no UI, no level-structure change — is to bring `buildEvaluationPrompt`'s reading branch to parity with the
math branch:

1. Add an explicit **"For a young/early reader with no prior snapshot, START AT LEVEL 0"** line (mirrors
   `chat.ts:709`), so the floor is explicit, not just implicit.
2. Add the explicit **"No grades, no rankings — findings are evidence-based, never shaming"** line
   (mirrors `chat.ts:703`) to the reading branch.
3. Add a **"See the child profile above for age — for a 6-year-old, keep steps very short, phrasing
   simple, and lead with an easy win"** line (mirrors `chat.ts:695`), so the eval *uses* the age it
   already receives.

All three are a few lines in **one function** (`functions/src/ai/chat.ts` `buildEvaluationPrompt`,
reading branch), behaviour-additive, and **propose-and-confirm** would not be triggered (no
compliance/`hours`/`xpLedger`/`skillSnapshot`/charter/rules surface is touched — it's prompt copy). This
run does **not** make that change (read-only); it's logged as the next optional slice below.

---

## Step 3 — Spin-out

Logged in `docs/LONDON_BACKLOG.md`:
- The **Reading-evaluation** row notes updated additively to point here and record the "ready as-is"
  verdict.
- An **optional** polish slice (the 3-line reading-prompt parity tune above) added to the hand-off
  section with a one-line scope — explicitly marked *not blocking* London's first eval.

No `REVIEW_HOME_BASE.md` ledger row is opened: per the ledger's own note, **London-specific work lives in
`LONDON_BACKLOG.md`, not as `FEAT-` rows.**
