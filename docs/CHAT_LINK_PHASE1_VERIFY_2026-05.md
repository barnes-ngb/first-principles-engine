# Chat-Link Phase 1 — Manual Verification

**Date:** 2026-05-24
**Branch:** `claude/awesome-pascal-IE9Wg` (PR #1208)
**Scope:** `shellyChat` task only.

After this branch deploys, run the conversations below on tablet and confirm chat feels meaningfully better than before. Estimated time: 15-20 minutes.

---

## What changed (read before testing)

So the "before" / "after" comparison is meaningful, here's what the model actually saw in `shellyChat` before this branch:

- **Disposition profile block** — read a field name (`dispositionProfile`) that is never written anywhere in the codebase. The block was always silently empty. Model never saw any disposition signal in chat.
- **"Recent growth narrative" block** — read a field (`dispositionNarrative`) that is also never written. Always silently empty. Model never saw weekly review trajectory in chat.
- **"Conundrum this week" block** — read a flat `conundrumTitle` field; the real field is nested at `conundrum.title`. Always silently empty. Model never knew which conundrum was live.
- **Recent teach-backs** — not loaded at all.

So when Shelly asked things like *"how's Lincoln doing with explaining his thinking?"* in the past, the model was reasoning from charter values + skill snapshot + eval history by domain (which IS loaded) but had no disposition signal, no week-over-week narrative, and no conundrum/teach-back evidence to draw on. The answers had to be more generic than they should have been.

This Phase 1 makes all four populate, plus appends a `PLANNING-PARTNER MODE` paragraph to the system prompt instructing the model to reason over time and accept Shelly's mid-chat observations as evidence.

**Implication for the comparison:** production "before" answers may already feel okay-ish, but they are answering questions about disposition/teach-backs/conundrum without the data being present. Look for the AFTER answers to ground in specific recent evidence the model could not have seen before.

---

## Baseline questions (run on production BEFORE deploy if possible)

Open Shelly's chat on production (deploy branch), select Lincoln's tab, and ask each of these. Screenshot or copy-paste the answers so you have a side-by-side later.

1. *"What should we focus on with Lincoln this week?"*
2. *"How's Lincoln doing in reading?"*
3. *"What's been shifting in his math the past few weeks?"*
4. *"He seemed frustrated yesterday during phonics — anything I should adjust?"*
5. *"What's working in his teach-backs?"*

Bonus (probes the three dead-read fixes directly):

6. *"What's the conundrum this week and how should I bring it up at dinner?"*
7. *"Based on his disposition profile, what's one thing I should celebrate this week?"*
8. *"Walk me through what's shifted across his last few weekly reviews."*

If you can't run on production before deploy, that's fine — skip the baseline and use the pass criteria below as the bar.

---

## Post-deploy questions

After this branch deploys, ask the same eight questions on tablet. Then compare.

### Pass criteria

- The AI references specific recent eval data, not just generic skill-level statements. ("In his last comprehension session on May 19 he…", not "Lincoln is working on comprehension.")
- The AI uses trajectory language — *shifting*, *since*, *trending*, *over the last few weeks*, *week over week*. Generic praise ("doing great") is not trajectory.
- The AI surfaces patterns Shelly didn't ask about. (e.g., "I notice his articulation has been trending up in teach-backs over the last two weeks — that lines up with the GATB jump.")
- The AI treats Shelly's mid-chat observations as evidence to build on, not arguments to rebut. (e.g., "Noted — that lines up with the lower engagement on Thursday's phonics block. Want to try…")
- On Q6, the AI knows the actual conundrum title for the current week (the third-dead-read fix). Before this branch it would have either confabulated or hedged ("I don't see a conundrum for this week").
- On Q7, the AI grounds the celebration in actual disposition cache content (curiosity / persistence / articulation / self-awareness / ownership), with `growing` / `steady` / `emerging` / `not-yet-visible` levels. Look for named dimensions, not "Lincoln is curious."
- On Q8, the AI walks through 3-5 distinct weeks with content from each, not "across his recent reviews he's been doing well."

### Fail criteria — capture the exact AI output if any of these happen

- AI cites a specific data point that's wrong (e.g., wrong eval date, wrong score, wrong subject). Note the case verbatim.
- AI references London data inside a Lincoln chat or vice versa. Worst-case failure — would mean the child-scoping bypass broke.
- AI ignores recent context and gives an answer indistinguishable from the baseline.
- AI hedges that it can't see records ("I don't have access to evaluations…") despite the prompt's explicit instruction not to. Production prompt already tells the model otherwise, but if the new context comes in malformed the model may default to hedging.

---

## Empty-state spot-checks (London)

Switch to London's tab (she has effectively no evaluation history yet, per the family context). Ask:

A. *"What should we focus on with London this week?"*
B. *"What's London been working on in her teach-backs?"*
C. *"Show me her disposition profile."*

### Pass criteria for empty-state

- The AI does not confabulate disposition narratives, teach-backs, or eval history that London does not have.
- The AI tells Shelly what's missing and how to populate it (e.g., "There aren't disposition signals for London yet. Generating her profile from the Progress tab would let me give more specific guidance.") — this comes from the existing role-section instruction at `shellyChat.ts` (the "If data is missing…" bullet).
- No "RECENT WEEKLY REVIEWS for London" or "DISPOSITION PROFILE for London" sections referenced as if populated. The Phase 1 formatters omit those sections entirely when data is absent, per the "omit, don't explain absence" rule.

### Fail criteria for empty-state

- AI invents disposition narratives or teach-back examples for London.
- AI references Lincoln's data when answering London-tab questions.
- AI emits a header for a populated-looking section that is actually empty.

---

## No-child general-conversation spot-check

In the chat, don't select a child tab (or use a flow that doesn't pass a `childId`). Ask:

D. *"Give me one teaching idea for either kid this morning."*

### Pass criteria

- The AI does not output a `PLANNING-PARTNER MODE` framing or reference specific eval/disposition/teach-back data. The Phase 1 addendum is scoped to the child-selected branch only (verified in `shellyChat.test.ts`).
- The AI asks which child or offers ideas for both, per the existing general-conversation role text.

### Fail criteria

- AI references Lincoln-specific or London-specific data despite no child being selected.
- AI surfaces a "PLANNING-PARTNER MODE:" instruction-style line (would mean the addendum leaked into the wrong branch).

---

## Failure modes — what to do if you see one

**If chat feels worse (more rambling, less direct):**
- Likely the prompt addendum lands wrong for the actual usage pattern. Capture the specific exchange. Rolling back is safe — `git revert cad5429 1f3fe92` reverts test + implementation; no schema changes, no migrations.

**If chat references data that doesn't exist:**
- Empty-state handling probably regressed. Check whether the `DISPOSITION PROFILE`, `RECENT WEEKLY REVIEWS`, or `RECENT TEACH-BACKS` headers appear in the system prompt when the underlying data is absent. The formatters return `""` on empty input — if a header is showing up anyway, a code path bypassed the formatter.

**If chat is slow (noticeable lag) — Phase 1 token budget was estimated at +25-29%:**
- Phase 1 supplemental additions + role section are bounded under 8000 chars in the token-budget test; that's the ceiling for the new content. If real latency feels worse, capture the timing before/after if you can — a regression in the shared slices (the much larger `buildContextForTask` output) is more likely than the new sections.

**If the third-dead-read fix surfaces wrong conundrum data:**
- Means the planner is writing `conundrum.title` differently than expected. Spot-check the weeks doc structure in Firestore directly. If the field is missing entirely, the planner hasn't run for the week yet — that's expected, not a bug.

---

## Quick triage checklist (for Nathan during verify)

- [ ] Q1-Q5 grounded in specific recent data (not generic)
- [ ] Q1-Q5 use trajectory language
- [ ] Q6 names the actual current conundrum
- [ ] Q7 grounds in named disposition dimensions
- [ ] Q8 walks 3-5 distinct weeks
- [ ] London A-C don't confabulate
- [ ] No-child D doesn't surface PLANNING-PARTNER framing
- [ ] No cross-child data leaks (Lincoln-in-London or vice versa)
- [ ] Latency feels comparable to today

Sign off when all rows are green, or capture exact AI outputs for any failures and report back to the branch so we can patch before merge.
