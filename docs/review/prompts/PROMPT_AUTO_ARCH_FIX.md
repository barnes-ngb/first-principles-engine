# PROMPT — Autonomous Architecture Fix (inspect-first, one issue)

> **Used by:** the "Bigger architecture fixes" routine. Point the routine's prompt at this file:
> *"Read `docs/review/prompts/PROMPT_AUTO_ARCH_FIX.md` and execute it fully."*
> **Cadence:** weekly (its current Saturday slot is fine).
> **Contract:** inspect before touching anything; fix at most **one** ledger item; **branch + PR, never
> merge**; never touch an invariant or human-claimed work. Phone-first — do all build/git yourself.

---

You are the autonomous architecture-fix routine. You **inspect first, then fix** — and only safe,
decision-free work. Anything needing a human judgment call you leave alone.

## Step 1 — Select one item (and skip what isn't yours)
Read `docs/review/REVIEW_HOME_BASE.md` §6. Choose the **single highest-priority `OPEN` `ARCH-` or
`TEST-` row** that is **all** of:
- **not** `IN PROGRESS` / `FIXED` / `NEEDS-DATA` / `WONTFIX` (those are claimed, done, or parked);
- **not** invariant-touching — skip anything that would change `hours`/compliance math, `xpLedger`,
  `skillSnapshots`, the charter preamble, or `firestore.rules`;
- **not** build-chat-owned — skip `ARCH-10`, `FEAT-*`, and any portal/`FUNC-*` row;
- **decision-free** — a decomposition, dead-code removal, migration completion, or test fix. If the item
  needs a provider/design/scope choice (e.g. picking an error-reporting service, a bundle-split
  strategy), it's a **human** call — skip it.

If nothing qualifies, do nothing this run and say so. Don't invent work.

## Step 2 — Claim it
Immediately set the chosen row to `IN PROGRESS` (note: "auto-fix routine, <date>") and push that ledger
update first, so a concurrent human run won't grab the same item. If you can't claim cleanly, stop.

## Step 3 — Establish a green baseline
Run root + functions lint/tsc/tests yourself. If red, stop and report — don't stack onto a broken tree.

## Step 4 — Inspect (this is the gate)
Read every file the item touches. Confirm it still reproduces. Map the blast radius (importers,
state, current tests). For a decomposition, name the exact seams and confirm the public surface stays
identical. **If inspection reveals it actually touches an invariant or needs a decision you didn't catch
in Step 1 → revert the claim to `OPEN`, write a one-paragraph proposal into the ledger row, and stop.**

## Step 5 — Fix (only decision-free, behavior-preserving)
Make the smallest change that closes it. Preserve behavior exactly (no observable contract change).
Add/keep tests proving it. No new heavy dependencies (bundle is tracked debt).

## Step 6 — Verify & PR
Green before and after. Branch `auto/arch-<id>-<slug>`. PR `fix(<area>): <id> — <desc> (auto)`.
**Do not merge.** Update the ledger row to `IN PROGRESS` with the PR link. Then run **End of run** below,
and post the 4-line summary there — the item, what changed, before/after evidence, and confirmation no
invariant was touched — under the `CODEX ROUND:` first line. Do not post a summary before the Codex round
is answered. A green run
status means it executed, not that it's correct — the human reviews the PR.

## End of run

A run is not finished when the PR opens; it is finished when the **automated review round on that PR is
answered**. This is the run's last step, and the summary below is the run's **one** summary — do not post a
finish-looking summary before it.

1. **Poll for the Codex round**, up to 10 minutes, reading three things:
   - the PR's **reviews** (`/repos/{owner}/{repo}/pulls/{n}/reviews`);
   - its **inline review threads** (`/pulls/{n}/comments`, or the GraphQL `reviewThreads`) — Codex anchors
     its findings to lines, and `gh pr view <n> --comments` fetches top-level comments and review bodies but
     **no** review threads, so it shows a review that looks empty while every finding sits unread;
   - the PR's **top-level comments** and the **reactions** on the PR and on the comment that asked — because
     a clean round does **not** come back as a review. It arrives as a plain top-level comment from the
     reviewer ("Codex Review: Didn't find any major issues", naming the reviewed commit) or as a 👍 reaction,
     and the review endpoints return neither. Either counts **only when it is the Codex reviewer's own**
     (`chatgpt-codex-connector[bot]`) and belongs to **this** head: when the comment names a reviewed commit,
     that commit must **be** the head you asked about — one naming an older SHA is the previous round
     arriving late, however recent its timestamp — and only when none is named may you fall back to it
     post-dating the ask; a reaction on the PR itself must have been added **within this round's window**.
     A 👍 from a human or another bot is not a review result, and an older one is not this round's. A qualifying clean signal closes the round
     immediately; don't burn the rest of the window on it.
2. **If the round raised no findings, go straight to step 5.** Never re-ask for a review of an unchanged head.
3. **Address every finding in the same PR**, and push.
4. **Ask for the next round** with an `@codex review` comment — Codex reviews on PR open, on a draft going
   ready, and on that comment, **not** on every push, so without the ask the next window times out silently
   — then poll another full 10-minute window, reactions included, against the new head commit. **If that
   round raises a finding, go back to step 3 and repeat 3–4** — as many times as it takes. The round is
   done when one comes back clean or a whole window passes with nothing; never stop on an unanswered one.
   At most three rounds. If a third round still raises findings, address what you can, post `CODEX ROUND:
   open — do not merge yet` naming exactly what is outstanding and on which head, and stop. The human
   decides whether to merge, open a follow-up, or paste the remainder into a new run.
5. **Post the summary**, with as its first line one of:
   - `CODEX ROUND: done — safe to merge`
   - `CODEX ROUND: none arrived in 10 min — safe to merge`
   - `CODEX ROUND: open — do not merge yet`

Never subscribe to the PR, never schedule a check-in, reminder, wake-up or scheduled task of any kind, and
never stay resident to "watch CI" — CI's result is on the PR page. Then, as the **last action of the run**:
where the harness subscribed the session for you when the PR was created, **unsubscribe** — otherwise the run
stays armed exactly as this protocol exists to prevent — and only **then stop**. If CI fails
after you stop, the human pastes the log into a new run. **A merged PR is never touched again by the run
that opened it**; a fix that is still needed goes on a new branch and PR.

The human merges only a PR whose summary's first line says `safe to merge`.
