> *Landed by DOC-21 on 2026-09-06. The PR this document describes was never pushed; its documentation
> corrections are tracked in the ledger under DOC-21, not assumed applied.*

# AI development and documentation review — September 5, 2026

Ledger anchor: DOC-20.
Validation baseline: `main` at `2ea479d8e9b56cd1715cd78ef51f8f649534c61b`.
Source refresh/rebase: `main` at `73f87902de4628cbda1c7248fc9cc76b06598272`.
Scope: review Drive homeschool direction, evaluate AI development guidance,
align repository documentation with implementation, and validate that baseline
before a separate functional/UX refinement pass. No product code, prompts,
models, rules, learner records, hours, or XP changed. No deployment.

## Assessment

The code has a substantial adaptive-learning foundation. The development process
already uses small human-assigned PRs, protected write paths, a review ledger,
prompt/logic tests, and client/server CI. The immediate weakness is **context
drift**: dated design assumptions and June feature inventories still appeared as
current onboarding guidance after the relevant code changed.

The family goal is broader than lesson completion: faith and formation, capable
hands and minds, curiosity, persistence, articulation, self-awareness and ownership.
Wonder → Build → Explain → Reflect → Share is a rhythm over time, not a daily
form to complete. Shelly needs preparation and decisions taken off her plate;
the boys need understandable next steps and ways to create, explain and share.

## Sources and review boundary

Family reference documents were reviewed privately for purpose and ethos. Their
private links, newly learned personal details and current project specifics are
not included in this public PR. The family purpose summarized above was already
stated in this repository's `CLAUDE.md` and `PROJECT_CONTEXT.md`.

Repository: `CLAUDE.md`, README, process/context/index/prompt docs, current ledger
and source-of-truth decision, recent architecture review, London backlog, package
scripts/CI, AI dispatch/models/context/task handlers, app navigation, learning
projections and the named shared writers. This was a repository orientation and
AI-development audit, not a claim of line-by-line review of every feature.

Production Firestore records, actual family learning levels, authenticated browser
journeys, deployed model acceptance and AI output quality were not inspected.
March learner observations are explicitly dated. Old legal summaries were removed
from the current orientation in favor of the implementation boundary and a pointer
to future source verification; no legal/compliance behavior was changed.

## Changes on main during this review

The branch was rebased onto `73f87902` before publication. Source comparison
now includes the explicit planning-week choice and dated buttons (FEAT-196),
the shared parent-request framing in planner messages (FEAT-198), activity-configured
quick-log chips (FEAT-199), Life Day capture (FEAT-200), and custom picture-note
work. These features are already present; they are not proposed new builds.

The newly merged Ask AI Part A audit materially qualifies this review:
UX-186–189 remain open and report progress reset on re-adding a sight word,
“progressing” recorded as full mastery, missing parent gates on record actions,
and child access to an unmetered image door. Read that audit and the live ledger
before extending chat. This refresh incorporates its findings; it does not claim
an independent execution of its reproductions. Part B remains separately scoped.

## Documentation changes

| Drift found | Correction |
|---|---|
| Codex has no concise repository entry point | Added `AGENTS.md`, pointing to the existing operating model rather than duplicating its policy. |
| All AI paths described as opt-in | Documented the single `ai_planning` flag, enabled by default, and the limited local planner route. |
| Client folder described as the home of every system prompt | Mapped client planner input, server builders, context slices, handlers and standalone functions separately. |
| DALL-E and old function/test counts in onboarding | Corrected configured image/transcription providers; verified 29 exported functions and 21 dispatch keys; removed stale test-total claims. |
| Charter injection described as guaranteeing aligned responses | Distinguished prompt guidance from observed model behavior and utility-specific paths. |
| June context described retired Story Guide, old nav and already-shipped work as queued | Refreshed the code map, Foundations tab, current books entry, parent Watch Library/Barnes Bros, and kid-nav changes. |
| Learner profiles looked like current calibration | Marked March levels/observations as historical; active records must supply current state. |
| Source-of-truth discussion omitted implementation distinctions | Documented academic state, position, coverage, model evidence, attestation and confidence-gated recalibration; retained ARCH-12's legacy-writer limitation. |
| Seven handlers lacked dedicated prompt-reference summaries | Added reviseStory, foundationsReview, chapterQuestions, bookLookup, lessonVideo, helpCard and monthlyReview summaries. |
| Docs checker described nine checks | Documented existing checks 10–11 and semantic limits, including DOC-19's known unmatched status wording. |

> **[Editor's note — DOC-21, 2026-09-06. The "29 exported functions and 21 dispatch keys" claim above
> is confirmed, and this is the rule it was counted with.]** Two independent counts over `functions/src`
> on `main` at `63a8ba3` both return **29**: (a) declaration sites — `export const <name> = on(Call|Request|Schedule|…)`
> matched **anchored to the start of a line**, excluding `*.test.ts`; and (b) the names re-exported from
> `functions/src/index.ts`, which is what Firebase actually deploys. The rule's anchoring is load-bearing:
> the same regex run **unanchored** returns 30, because it also matches a `* export const myFn = onCall({…})`
> line inside the JSDoc example block at `functions/src/ai/aiConfig.ts:18` — a comment, not a function.
> An unanchored count is where the competing "30" comes from. Dispatch keys: the `CHAT_TASKS` registry in
> `functions/src/ai/tasks/index.ts` holds **21** keys (`generate` and `chat` both map to `handleChat`, so
> 21 keys resolve to 20 distinct handlers). DOC-16 independently verified the same 29 on 2026-08-28.

The family charter/preamble and existing review-round policy were preserved.
Drive source documents were not rewritten. Historical audit/decision records
remain historical; this refresh does not silently reopen their ledger items.

## Validation evidence

The build/lint/test results below belong to the earlier `2ea479d8` baseline.
After rebasing onto `73f87902`, source alignment, the docs checker and the additive
Markdown diff were checked again; the broader suites were not rerun. Do not treat
the earlier test counts or bundle size as measurements of the rebased code.

Node **22.23.2** was used for build, lint and test validation, matching the repo's
Node 22 target. Both lockfiles were installed with `npm ci --ignore-scripts`;
that installation choice is reported rather than presented as an exact CI clone.

| Check | Result |
|---|---|
| Production `npm run build` | PASS — TypeScript project build and Vite bundle |
| Root `npm run lint` | PASS with 3 existing `sessionTimer` dependency warnings (EvaluateChatPage and useQuestSession) |
| Functions lint and `tsc --noEmit` | PASS |
| Functions tests, UTC, two workers | **56 files / 1,320 tests passed** |
| Focused root tests, UTC, two workers | **4 files / 75 tests passed**: planner prompt composition, planning flag defaults, daily signal targeting, guided-eval model projection |
| Full root suite | **Incomplete** — automatic approval review rejected continuation because it detected Firebase Storage access whose data/destination it could not verify. No complete passing root total is claimed. The blocked command was not retried; the separate focused selection uses inspected pure/local test modules. |
| Documentation checker | PASS — zero HARD failures; 11 existing SOFT warnings. Verifies index/ledger/count/write-routing invariants, not every semantic claim |
| Diff checks | Markdown-only source changes; whitespace and additive ledger checks performed before PR |

**Timezone finding:** the environment actually exposed `TZ=Asia/Tokyo`, despite
the session's advertised UTC setting. The initial server run had six date failures
(five `getWeekMonday` cases and one story assessed-date assertion). The unchanged
suite passed under explicit UTC. This is an existing timezone sensitivity, not a
documentation regression. Do not silently label it fixed or infer correct family
timezone behavior from the UTC pass. A future date-focused run should distinguish
date-only values from timestamps and test the chosen family timezone explicitly.

**Bundle finding:** the main emitted chunk was **4,404.77 kB / 1,317.38 kB gzip**;
Vite emitted its large-chunk warning. This supports existing ARCH-05 as a mobile
performance candidate, but is not a measured phone-load-time result.

**Checker limitations:** current soft findings are 2 raw refs, 8 remote-call guard
sites and 1 image-downscale site; its report-only census has 98 swallowed catches.
These are heuristics and existing triage inputs, not 109 newly proven defects.

## What the next phase should evaluate

These are ranked candidate slices and observable acceptance questions, **not new
build assignments**. Verify existing ledger status first and preserve its settled
decisions. Avoid adding another planner, dashboard or academic-state store.

| Priority | Existing starting point | Proposed family outcome / acceptance scenario |
|---|---|---|
| First: trustworthy Ask AI writes | `review/ASK_AI_AUDIT_2026-09_PART_A.md`, UX-186–189 | Confirmed wording must match the saved state; existing progress must survive an add; child profiles must not reach parent write/image actions. Address the existing findings under their required decisions before adding more chat responsibilities. |
| 1. Evidence → useful next action | Foundations, `dailySignalTargeting.ts`, `stuckRetestQueue.ts`, `questTargeting.ts`, `contextSlices.ts`, `helpCard.ts` | Capture a supported struggle → see its evidence and proposed recheck → complete the check → see what changed and what to do next. Missing/unmapped evidence must remain explicit. Help cards currently omit `learnerModel`; first assess whether adopting the existing slice would improve advice. |
| 2. Shelly's Normal, MVD and Life Day | Planner Apply/materials, Today checklist/help/capture, Ask AI next-week lane | Preview/print what is needed, find the next activity without searching another dashboard, choose the intended week and day type, record one quick observation, recover from a failed save. Measure her actual steps and decision points. |
| 3. Oral and creative evidence | `dad-lab/KidLabView.tsx`, parent `LabCaptureBeats`, shared VoiceInput, FUNC-15 | A child predicts, tries and explains with speech/photo/drawing; confirm attribution and visible save. KidLabView still has five typed fields and no VoiceInput import. Reuse the existing capture vocabulary before adding new structure. |
| 4. Each child's independent path | `LONDON_BACKLOG.md`, `knowledgeMineAccess.ts`, books entry/readability, child/profile helpers | Walk launch → understand next step → do work → recover/stop → show someone, separately for each child. Do not equate adult readability tests with independent usability. No name-based access or cross-child mastery transfer. |
| 5. Phone responsiveness | ARCH-05, `router.tsx`, AppShell's avatar dependency | Measure cold start and navigation on actual family devices before assigning a narrowly scoped lazy-loading change. |

Across these journeys: protect formation, sustainable pacing, parent decision authority,
and useful evidence of growth. Completion counts alone cannot establish that the
engine is serving the family better.
