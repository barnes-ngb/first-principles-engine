# Chat-Link Phase 1 Plan — Lincoln's Eval Trajectory in Chat

**Date:** 2026-05-24
**Status:** Step 0 — inventory only. No code changes yet.
**Branch:** `claude/awesome-pascal-IE9Wg`

---

## ⚠️ STEP 0 — CRITICAL FINDING (read this first)

**The prompt targets the `chat` task type. Shelly's chat UI does not use `chat` — it uses `shellyChat`.**

| Surface | Task type used | Notes |
|---|---|---|
| **Shelly's chat UI** (`src/features/shelly-chat/ShellyChatPage.tsx:523`) | `shellyChat` | What "Shelly's planning partner" actually runs on. Already loaded with most of the proposed additions. |
| **`chat` task type** | `chat` | Used only by `src/features/books/StoryGuidePage.tsx:90` (kid story-shaping prompt) and `src/features/books/useComprehensionQuestions.ts:68` (comprehension Q generation for kids reading). Lightweight, kid-facing utility — not Shelly-facing. |

The prompt's "before" description ("the `chat` task today reads the curated `findings` on the skill snapshot") matches neither task accurately:
- The current `chat` task type loads ONLY `charter + childProfile` (confirmed by `functions/src/ai/contextSlices.ts:52` and the existing test `functions/src/ai/contextSlices.test.ts:27` titled "chat only includes charter and childProfile").
- The current `shellyChat` task type already loads `charter, childProfile, engagement, gradeResults, recentEval, sightWords, weekFocus, wordMastery, workbookPaces, skillSnapshot, recentHistoryByDomain, recentScans, dayToday, dadLabReports` plus a supplemental block that includes `dispositionProfile` (broken read — see below), weekly review narrative, conundrum title, completion patterns, conundrum artifacts, and chapter responses (`functions/src/ai/tasks/shellyChat.ts:28-233`).

**Reconciliation question for Nathan (this is the Step 0 gate):**

The behavior change the prompt describes — Shelly's chat experience becoming a real planning partner — almost certainly belongs in `shellyChat`, not `chat`. Three interpretations of intent are possible:

1. **(Most likely)** "chat" in the prompt is colloquial — Nathan means Shelly's chat (= `shellyChat`). In that case the deliverable is much smaller than the prompt suggests, because `shellyChat` already loads `recentHistoryByDomain`, has a disposition block (currently broken — see latent bug), and has a "TEACHING REFLECTION DATA" block. The remaining gaps are: (a) fix the disposition field name; (b) add recent teach-backs (currently absent from `shellyChat` context); (c) tune/extend the system-prompt addendum per the prompt's "planning partner" framing. Phase 1 scope shrinks accordingly.
2. **(Less likely)** Nathan literally means the `chat` task type. That would dump heavy Lincoln context into the kid-facing story-guide / comprehension-question utility — which would be a regression in cost and a behavioral mismatch (the kid prompts don't want Lincoln's eval trajectory). Recommend NOT doing this.
3. **(Possible)** Nathan wants the proposed expansion applied to BOTH `chat` and `shellyChat`. Same regression concern for `chat`.

**Recommended path:** Interpretation 1 — apply Phase 1 to `shellyChat`. The remaining sections of this Step 0 doc inventory both tasks so the choice is explicit. If Nathan confirms interpretation 1, Step 1 of the plan will be re-scoped to "what's still missing from `shellyChat`."

The rest of this document is the literal inventory the prompt asked for, so Nathan can verify everything before any code change.

---

## Step 0 — Verified inventory

### Chat task context slice — current state (`chat` task type)

**Slice list:** `["charter", "childProfile"]` only.
- Defined at `functions/src/ai/contextSlices.ts:52`.
- Confirmed by test `functions/src/ai/contextSlices.test.ts:27`.

**Handler:** `functions/src/ai/tasks/chatHandler.ts:11-50`.
- Calls `buildContextForTask("chat", …)` at line 16.
- Joins sections into `systemPrompt` at line 20. No task-specific addendum is appended.
- Uses Haiku (`modelForTask("chat")` → routed via `functions/src/ai/chat.ts:78-79` "case TaskType.Chat").
- `maxTokens: 1024`.

**Data sources actually loaded by `chat`:**
- `charter` — static `CHARTER_PREAMBLE` text (`contextSlices.ts:79-109`).
- `childProfile` — assembled from already-loaded `childData` + `snapshotData` via `formatChildProfile` (`contextSlices.ts:268-293`). `snapshotData` is read once upstream in `functions/src/ai/chat.ts` per request and passed into the handler; `formatChildProfile` does not re-query Firestore.

**Data sources NOT loaded by `chat`:**
Verified absent from the `chat` slice list at `contextSlices.ts:52`:
- `recentHistoryByDomain` ❌
- `skillSnapshot` (full snapshot text, beyond what's already in `snapshotData.prioritySkills/supports/stopRules`) ❌
- `engagement`, `gradeResults`, `recentEval`, `sightWords`, `wordMastery`, `weekFocus`, `workbookPaces`, `activityConfigs`, `recentScans`, `dayToday`, `dadLabReports`, `mastery`, `workshopGames`, `generatedContent`, `bookStatus`, `hoursProgress` ❌
- Disposition trajectory ❌
- Recent teach-backs ❌
- Interactive quest sessions are part of `recentHistoryByDomain` (covered below) — also absent.

---

### `shellyChat` task context slice — current state (for comparison)

**Slice list:** `["charter", "childProfile", "engagement", "gradeResults", "recentEval", "sightWords", "weekFocus", "wordMastery", "workbookPaces", "skillSnapshot", "recentHistoryByDomain", "recentScans", "dayToday", "dadLabReports"]` (`contextSlices.ts:65-70`).

**Handler:** `functions/src/ai/tasks/shellyChat.ts:15-352`.

**Shared context** (via `buildContextForTask("shellyChat", …)` at line 28) loads all 14 slices above in parallel.

**Supplemental queries** (lines 46-84, run in parallel) load:
- `families/{familyId}/children` — all children list (lines 48, 91-113).
- `families/{familyId}/children/{childId}` document — read as the source of `dispositionProfile` (lines 50-52, 116-129). **Broken read — see latent bug below.**
- `families/{familyId}/weeklyReviews` filtered to `childId`, limit 5 — picks the most recent and pulls `dispositionNarrative` (lines 53-58, 132-147). This is the actual disposition trajectory signal the model gets today.
- `families/{familyId}/weeks/{weekId}` — pulls `conundrumTitle` for the current week (lines 59, 150-158).
- `families/{familyId}/days` for the child, last 14 days, limit 50 — computes `Completion by day` and `Most skipped` activity (lines 61-67, 164-204).
- `families/{familyId}/artifacts` for the child where `tags.domain == 'conundrum'`, limit 20 — counts conundrum responses (lines 69-75, 207-211).
- `families/{familyId}/chapterResponses` for the child, last 14 days, limit 20 — counts responses and unique book titles (lines 77-83, 214-225).

**Token-budget note:** `maxTokens: 2000` (lines 311, 322). Input context is much larger than `chat`'s 1024-cap reply.

**Latent bug — disposition field name is stale.**
- `shellyChat.ts:120` reads `cd?.dispositionProfile`.
- `dispositionProfile` is never written anywhere in the codebase (`grep -rn "dispositionProfile"` returns only the read site, plus an unrelated `dispositionProfileSnapshotAt` timestamp in monthly review code).
- The actual field that stores the AI-generated disposition narrative is `dispositionCache`, written by `src/features/progress/DispositionProfile.tsx:179`. `dispositionOverrides` holds parent edits on top of that (`src/core/types/disposition.ts:36`, `DispositionProfile.tsx:221`).
- Net effect today: the `DISPOSITION PROFILE for ${childName}` block in the `shellyChat` system prompt is silently always empty. The only disposition signal reaching the model is the `RECENT GROWTH NARRATIVE` pulled from the most recent `weeklyReviews/{…}` doc.
- Fix is a one-line rename from `dispositionProfile` to `dispositionCache` (and the iteration shape adjustment because `dispositionCache.dispositions` is the inner object — see `src/core/types/disposition.ts:12-23`). Phase 1 should likely include this.

---

### Planner's `recentHistoryByDomain` — shape, window, source

**Read site:** `functions/src/ai/tasks/plan.ts:38` calls `buildContextForTask("plan", …)`. The `plan` slice list (`contextSlices.ts:46-51`) includes `"recentHistoryByDomain"`.

**Loader:** `functions/src/ai/contextSlices.ts:364-371` calls `loadRecentEvalHistoryByDomain(db, familyId, childId, { filterDomain: ctx.domain })`. For `plan`, `ctx.domain` is undefined (the `plan` task does not set a domain), so all four domains are queried.

**Implementation:** `loadRecentEvalHistoryByDomain` in `functions/src/ai/chatTypes.ts:231-323`.

- **Window length:** NOT a date window. It is "the most recent `sessionsPerDomain` sessions per domain, no date filter." Default `sessionsPerDomain = 3` (line 237). Planner uses the default (does not override).
- **Domains queried:** `["phonics", "comprehension", "math", "fluency"]` (line 207).
- **Source collection:** `families/{familyId}/evaluationSessions` (line 246).
- **Filters:** `childId == childId`, `status == "complete"`, `domain == <each domain>`, `orderBy("evaluatedAt", "desc")`, `limit(sessionsPerDomain)` (lines 246-252).
- **Confirmed: both guided AND interactive sessions are included** — the query does NOT filter on `sessionType`. The formatter at line 295 labels them differently (`"quest"` vs `"eval, guided"`) but both are pulled.
- **Shape per session** (`EvalSessionSummary` interface at lines 210-219): `domain, date, sessionType, finalLevel?, totalCorrect?, totalQuestions?, summary?, findings?`.
- **Format** (lines 282-316): one block per domain that has at least one session, header `Recent ${DomainLabel} history (last N session(s))`, one bullet per session with date + type + summary or score. Findings are inlined ONLY for the most recent session per domain (line 308) to keep prompt size bounded.
- **Wrapper for the prompt:** `formatEvalHistoryByDomain` (lines 326-329) prepends `EVALUATION HISTORY BY DOMAIN:` and returns "" when no history exists.

**Question for Nathan re: "window length matches planner."** Per the prompt: "chat will MATCH whatever window planner currently uses. … If it's outside 4-12 weeks, surface for review." Planner's window is `3 sessions per domain`, not a date range. Two ways to interpret:
- (a) Inherit literally: `sessionsPerDomain = 3`. Recommended — keeps chat and planner symmetric and is what `shellyChat` already does today.
- (b) Switch to a date-bounded window: would require changing the loader signature and would diverge from planner. Not recommended in Phase 1.

Recommend (a).

---

### Scan's `recentHistoryByDomain` — alignment check

**Slice list:** `scan: ["childProfile", "recentEval", "recentHistoryByDomain", "skillSnapshot", "activityConfigs"]` (`contextSlices.ts:64`).
- Same loader, same default `sessionsPerDomain = 3`.
- Same shape and same formatter.
- `scan` may pass a `domain` hint (used in the quest path) — irrelevant for chat-link Phase 1.

Confirmed aligned: planner, scan, quest, weeklyReview, disposition, and shellyChat all share one `recentHistoryByDomain` loader and one default window.

---

### Child scoping in chat

**`chat` task type:**
- The handler (`chatHandler.ts:14`) destructures `childId` from `ChatTaskContext` and passes it into `buildContextForTask` (line 17).
- The two real call sites (`StoryGuidePage.tsx:89`, `useComprehensionQuestions.ts:68`) both pass a concrete `childId` for the kid whose book/story is being authored.
- The current slice list (`charter + childProfile`) makes `childId` mostly irrelevant — only `formatChildProfile` consumes it via the already-loaded `childData/snapshotData`.

**`shellyChat` task type (Shelly's UI):**
- `ShellyChatPage.tsx:523` passes `taskType: 'shellyChat'` plus a `childId`. UI is tab-scoped — Shelly selects either Lincoln's tab or London's tab; the active child's `childId` is sent. There is also a no-child general-conversation path: `shellyChat.ts:243-266` branches on `childId && childName` and constructs a different `roleSection` when no child is selected.
- All supplemental queries (children list, disposition, weekly review, dad lab, etc.) are filtered by `childId` where applicable. Lincoln-only data does not bleed into a London chat or vice versa.

**Implication for Phase 1 (assuming interpretation 1, `shellyChat`):** Child scoping already works correctly. New context (teach-backs) must follow the same scoping — load per `childId`, omit cleanly when `childId` is absent.

---

### Disposition data — where it lives, how it's queried

**Storage:**
- Per-child cached AI narrative: `families/{familyId}/children/{childId}.dispositionCache` (`src/features/progress/DispositionProfile.tsx:179`, type `DispositionCache` in `src/core/types/disposition.ts:41-46`).
- Per-disposition parent overrides: `families/{familyId}/children/{childId}.dispositionOverrides` (`DispositionProfile.tsx:221`, type at `src/core/types/disposition.ts:36`).
- Effective text helper: `effectiveDispositionText` (`src/core/types/disposition.ts:48-…`) — picks override if present, else AI text.
- Shape: `{ dispositions: { curiosity, persistence, articulation, selfAwareness, ownership }, summary, generatedAt }` (`src/core/types/disposition.ts:12-23`).

**Trajectory shape — does it exist today?**
- **Not as a stored structure.** `dispositionCache` is a current-state narrative regenerated on demand (the `disposition` task is invoked from the UI button — `disposition.ts` handler aggregates 4 weeks of data and synthesizes a narrative each time, then the UI caches the result with a `generatedAt` timestamp).
- The closest thing to "trajectory" available without new work is the sequence of `dispositionNarrative` strings on past `weeklyReviews/{weekKey}_{childId}` docs. `shellyChat.ts:53-58` already pulls the 5 most recent weekly reviews for the child and surfaces the most recent narrative as `RECENT GROWTH NARRATIVE`. Pulling all 5 narratives instead of just the latest would give a multi-week trajectory at near-zero cost.
- A true "trajectory across the five dispositions over recent weeks" would require either: (a) snapshotting `dispositionCache` into a history collection at intervals (write-side change, out of scope for Phase 1); or (b) computing a multi-week trajectory at read time from prior `weeklyReviews` + day-log data on each chat turn (potentially heavy).

**Phase 1 recommendation (for Nathan to confirm in Step 1):**
- Fix the `dispositionProfile` → `dispositionCache` bug so the current-state narrative actually reaches the model.
- Expand the existing `RECENT GROWTH NARRATIVE` block to surface all 5 recent weekly review narratives (with dates) instead of only the most recent. This is the cheapest "trajectory" signal available today.
- Defer any new trajectory storage to a later phase (the prompt explicitly excludes write-back).

**Other tasks that already load disposition data:**
- `disposition` task — it IS the synthesizer. Reads 4 weeks of day logs, chapter responses, lab reports (`disposition.ts`).
- `weeklyReview` (evaluate.ts) — writes `dispositionNarrative` onto the weekly review doc.
- `shellyChat` — broken read of `dispositionProfile` + working read of latest weekly review narrative.
- `monthlyReview` — also reads disposition data (uses `dispositionProfileSnapshotAt` timestamp).

---

### Teach-back data — collection, shape, recent-fetch pattern

**Storage:** `families/{familyId}/artifacts` (the artifacts collection, not the day log or a child subcollection).

**Filter pattern** (from `functions/src/ai/evaluate.ts:415-422`):
- `childId == childId`
- `tags.engineStage == "Explain"`
- `createdAt >= weekStart` and `createdAt <= weekEnd` (week-bounded for the weekly review)

**Post-filter** (`evaluate.ts:424-428`): keep artifacts whose `title` starts with `"teach-back"` (case-insensitive). This is because not every `engineStage == "Explain"` artifact is a teach-back.

**Per-record shape consumed** (`evaluate.ts:429-438`):
- `title`, `type` ("Audio" / etc.), `notes`, `content`, `createdAt`, `mediaUrl`, `uri`, `tags.subjectBucket`, `tags.engineStage`.
- `summarizeTeachBacks` (`evaluate.ts:457-513`) compresses into `TeachBacksWeekSummary`: `{ count, bySubject: Record<string, number>, audioCount, textCount, examples: Array<{ subject, hasAudio, createdAt, audioUrl?, excerpt? }> }`. Examples capped at 3 to bound prompt cost.

**Day-log signal:** `dailyPlans/days[].teachBackDone: boolean` (`src/core/types/planning.ts:220`) — Shelly's checkbox indicating "we did a teach-back today." Not the artifact itself, just a flag. Already surfaced in `shellyChat` via the `dayToday` slice (`contextSlices.ts:1253`).

**Currently NO task loads recent teach-back artifacts for chat-style context.** The only consumer is `evaluate.ts` (weekly review), which loads them week-scoped, not "last N."

**Phase 1 recommendation (for Nathan to confirm in Step 1):**
- Add a new loader `loadRecentTeachBacksContext(db, familyId, childId, opts?: { days?: number; limit?: number })` that mirrors `evaluate.ts`'s query but bounded by "last 14 days" (matches the rest of `shellyChat`'s reflection window) and `limit: 10` to cap cost.
- Format as a compact block: subject breakdown, audio-vs-text count, up to 3 short example excerpts (reuse `summarizeTeachBacks`).
- Wire into the `shellyChat` slice list (and only `shellyChat` — see critical finding above).
- Empty-state: omit the section entirely rather than emit "No teach-backs."

---

### Chat system prompt — current text

**For the `chat` task type:**
- No task-specific prompt at all. `chatHandler.ts:20`: `systemPrompt = sections.join("\n\n")` where `sections = [CHARTER_PREAMBLE, formatChildProfile(...)]`.
- `CHARTER_PREAMBLE` text is at `contextSlices.ts:79-109` (copied verbatim below):

```
You are an AI assistant for the First Principles Engine, a family homeschool learning platform.

FAMILY: Shelly (parent, fibromyalgia), Nathan (dad, builds the system), Lincoln (10, boy, neurodivergent, speech challenges), London (6, boy, story-driven, creative).

CHARTER VALUES:
- Formation first: character and virtue before academics. Prayer/scripture every day before school.
- Portfolio over grades: no scores, no rankings. Evidence of growth through work samples, audio recordings, and observations.
- No shame: mistakes are feedback. Bad days are data. MVD (Minimum Viable Day) is real school. Rest is by design.
- Engagement > completion: track HOW the child approached the activity, not just IF it got done.
- Lincoln teaches London: the Feynman technique. If he can explain it, he understands it. This is the richest evidence of learning.
- Adventure matters: movement, building, discovery, and creation are core curriculum.
- Narration counts: oral evidence is first-class, especially for Lincoln.
- Small artifacts > perfect documentation: one photo, one audio clip, one sentence. Capture quickly.
- Shelly's direct attention is the primary schedulable resource. Plans must be simple enough for a fibromyalgia flare day.

LEARNING DISPOSITIONS (what we track instead of grades):
- Curiosity (Wonder): Does the child want to know more? Choose to explore?
- Persistence (Build): Does the child push through hard activities?
- Articulation (Explain): Can the child explain what they learned? Teach someone else?
- Self-Awareness (Reflect): Does the child recognize what was hard vs easy?
- Ownership (Share): Does the child take pride in their work?

CONTENT GENERATION: When generating activities, questions, or plans:
- Connect to what the child is currently studying (subjects, books, themes)
- Ask questions with no single right answer when appropriate (conundrums)
- Generate content Shelly can USE — not just describe. Actual questions, actual prompts, actual activities.
- For Lincoln: Minecraft-framed, short instructions, visual, predictable. Narration over writing.
- For London: story-driven, interactive, creative. Voice-first. Drawing counts.
- For Shelly: simple to execute, adaptable to energy level, no prep required beyond what the app provides.

Always align recommendations with these values. Be concise, practical, and encouraging.
```

**For the `shellyChat` task type:**
- Composed at `shellyChat.ts:268-279`: `${sharedContext}\n\n${supplementalContext}\n\n${roleSection}\n\n[…followup-format instructions…]`.
- `sharedContext` = the joined slice sections (charter + childProfile + … + dadLabReports).
- `supplementalContext` = the all-children list, disposition block (silently empty due to bug), recent growth narrative (1 most-recent only), conundrum title, and "TEACHING REFLECTION DATA" block.
- `roleSection` text at `shellyChat.ts:244-266`. Two variants based on whether a child is selected. The child-scoped variant is the one relevant here (full text verbatim):

```
ROLE: You are Shelly's homeschool assistant. She selected ${childName}'s tab, so prioritize ${childName}'s data and needs in your responses.

SHELLY-SPECIFIC GUIDELINES:
- Be warm, practical, and specific. Shelly is busy — respect her time.
- You DO have access to ${childName}'s records — the data above is current. Never say "I don't have access to records" or "I can't see evaluations." If data is missing, tell her specifically what's not there yet and how to populate it (e.g., "No evaluations yet — running one from the Progress tab would help me give more specific advice").
- Connect suggestions to ${childName}'s skill snapshot and what's emerging vs. mastered.
- Reference recent evaluation findings when discussing what to work on.
- If engagement data shows frustration or low energy on certain subjects, acknowledge it and suggest alternatives.
- She has chronic pain and does heroic work every day. If she's frustrated or tired, acknowledge it genuinely.
- Keep responses concise unless she asks for detail.
- If she asks you to generate an image, tell her to tap the image button.
- For printable activities, format them clearly for screenshot or print.
```

- Followed by (`shellyChat.ts:274-279`):

```
After your response, suggest 2-3 brief follow-up questions Shelly might want to ask. Format them on new lines at the very end of your response, each prefixed with "[FOLLOWUP] ". Keep each under 50 characters. These should be specific to what you just discussed, not generic.

Example:
[FOLLOWUP] How do I adapt this for London?
[FOLLOWUP] What materials do I need?
[FOLLOWUP] Can you make this a printable?
```

**Insertion point for the proposed "planning partner" addendum:**
- For `shellyChat`: append a 1-paragraph addendum to the `SHELLY-SPECIFIC GUIDELINES` block (between line 255 and the end of the child-scoped `roleSection`), or as a sibling section between `${roleSection}` and the followup-format block. Keeps the existing structure intact; does not replace any existing instruction.
- For `chat` (NOT recommended): there's no `chat`-specific prompt today. The addendum would have to go after `formatChildProfile(...)`. But the addendum talks about "evaluation history across reading, math, and speech" and "disposition signals" — neither of which `chat` would have, defeating the addition.

---

### Token budget — current chat slice size

Live mocking of the slice assembly is not practical in Step 0 without standing up Firestore emulator fixtures. Rough character-based estimate (1 token ≈ 4 chars):

| Block | Approx chars | Approx tokens |
|---|---|---|
| `CHARTER_PREAMBLE` | ~2100 | ~525 |
| `formatChildProfile` (Lincoln, with priority skills + supports + stop rules) | ~400-1000 | ~100-250 |
| **`chat` total (today)** | **~2500-3100** | **~625-775** |
| `shellyChat` shared context (14 slices, realistic Lincoln data) | ~6000-12000 | ~1500-3000 |
| `shellyChat` supplemental block (all children + disposition + 1 narrative + conundrum + reflection) | ~800-1500 | ~200-375 |
| `shellyChat` role + followup instructions | ~1500 | ~375 |
| **`shellyChat` total (today)** | **~8300-15000** | **~2075-3750** |

**Proposed Phase 1 additions to `shellyChat`:**
- Disposition fix (no size change — just makes an existing-but-empty block populate). Realistic add: ~300-500 chars (~75-125 tokens) for the 5-disposition cache.
- Trajectory expansion (5 weekly review narratives instead of 1): ~1500-3000 chars (~375-750 tokens). Bounded by 5 docs × ~500 chars each.
- Recent teach-backs slice (last 14 days, ≤10 artifacts, summarized): ~300-800 chars (~75-200 tokens).
- Prompt addendum: ~500 chars (~125 tokens).

**Estimated `shellyChat` total after Phase 1:** ~10000-19500 chars (~2500-4900 tokens). Increase: roughly +20-30% over today. Within the prompt's "above 30% increase" surface-for-review threshold but at the upper edge. Step 1 will tighten the numbers when we pick exact limits for the teach-back loader.

---

### Tests touching the chat task

**Direct tests for the `chat` task or its context assembly:**
- `functions/src/ai/contextSlices.test.ts:27` — `"chat only includes charter and childProfile"`. Asserts the literal slice list. Any expansion of `chat`'s slice list will break this.
- `functions/src/ai/contextSlices.test.ts:64` — `"shellyChat still uses recentEval (backward compat)"`. Asserts `shellyChat` retains the legacy `recentEval` slice when planner/scan moved to `recentHistoryByDomain`. Expansions to `shellyChat` slices that don't touch `recentEval` are safe.
- `functions/src/ai/contextSlices.test.ts:68` — `"shellyChat wires the added context slices (skillSnapshot, recentHistoryByDomain, recentScans, dayToday, dadLabReports)"`. Asserts the existing `shellyChat` additions. Any further additions are additive and won't break this.

**Indirect tests touching the chat surface:**
- `functions/src/ai/chat.test.ts` — covers `getWeekMonday` and `buildKnownBlockersSection` (helpers used by various tasks including chat); no direct assertions on `chat` task's prompt content.
- No dedicated `chatHandler.test.ts`. No dedicated `shellyChat.test.ts`.

**Test plan implication for Phase 2/3:** at minimum, update `contextSlices.test.ts` line 68 to add the new slice (if a `recentTeachBacks` slice is created), or add a new `it(...)` test for the teach-back addition. If we fix the `dispositionCache` bug in `shellyChat.ts`, add a small test asserting the `DISPOSITION PROFILE` block populates when `dispositionCache` is present and is omitted when absent.

---

## STOP — STEP 0 GATE

This document is read-only. No production code has been touched.

**Outstanding decisions for Nathan before Step 1:**
1. **Confirm target task.** Should Phase 1 be applied to `shellyChat` (recommended interpretation 1) or literally to `chat` (not recommended)?
2. **Confirm window.** Inherit planner's `sessionsPerDomain = 3` (recommended) or switch to a date-bounded window?
3. **Confirm disposition trajectory shape.** Expand `RECENT GROWTH NARRATIVE` from 1 weekly review to 5 (recommended cheap option) or build a new computed trajectory?
4. **Confirm scope for the disposition latent bug.** Fix `dispositionProfile` → `dispositionCache` field-name bug as part of this prompt (recommended — it's a one-liner and the prompt addendum will not have the effect intended without it) or out of scope?
5. **Confirm teach-back loader bounds.** `last 14 days, limit 10` (recommended, matches existing reflection window) or different?

Step 1 (expansion plan + prompt-edit draft) and Step 2 (implementation) are blocked until Nathan reviews this.

---

## Step 1 — Expansion plan

**Nathan's Step 0 decisions** (baked into this plan):
1. **Target = `shellyChat`** (not `chat`).
2. **Window = inherit planner's `sessionsPerDomain: 3`** (no date filter).
3. **Trajectory shape = surface all 5 weekly review narratives.**
4. **Latent disposition bug = fix in this phase** (`dispositionProfile` → `dispositionCache`).
5. **Teach-backs = last 14 days, limit 10.**

---

### ⚠️ Contradictions surfaced (read these — they alter Decision 3)

Two findings discovered while drafting Step 1 contradict assumptions in Step 0 and require Nathan to confirm a small course-correction. Both are pure inventory findings, surfaced now per the prompt's guardrails.

#### Contradiction A — `dispositionNarrative` is a second dead read

Step 0 claimed: *"The only disposition signal reaching the model is the `RECENT GROWTH NARRATIVE` pulled from the most recent `weeklyReviews/{…}` doc."*

That claim is **wrong**. Verified by re-grepping (`grep -rn "dispositionNarrative"` returns only `functions/src/ai/tasks/shellyChat.ts:143-144`, no writers anywhere in `src/`, `functions/src/`, or types). The `WeeklyReviewDoc` interface (`functions/src/ai/evaluate.ts:60-78`) has no `dispositionNarrative` field. The fields that DO exist on weekly review docs are: `celebration`, `summary`, `wins[]`, `growthAreas[]`, `paceAdjustments[]`, `recommendations[]`, `energyPattern`, `evidence{books, teachBacks}`.

Net effect: today `shellyChat` reads two disposition-shaped fields (`children/{id}.dispositionProfile` and `weeklyReviews/{key}.dispositionNarrative`) and BOTH are silently always empty. The model has been getting zero disposition signal from `shellyChat`, full stop.

**Impact on Decision 3.** The decision was framed as "expand from 1 to 5 weekly review narratives." There are zero narratives to expand from. Three ways forward, recommend (a):

- **(a) Re-aim Decision 3 at what actually exists** — surface a compact 5-week strip from past `weeklyReviews/{…}` docs using the real fields (`weekKey + celebration + summary + top 2 growthAreas + energyPattern` per row). This is a true week-over-week trajectory of what the AI already wrote, with no schema or write-side change. Cheap, accurate, and a real improvement over today (which surfaces nothing).
- **(b) Lean only on the now-working `dispositionCache`** (after the field-name fix) and skip the weekly-review trajectory. Current state only, no trajectory. Smallest change.
- **(c) Both (a) and (b).** Largest signal but more tokens.

Phase 1 plan below assumes (a) + (b) = essentially (c). It's still small, the two pieces serve different purposes (`dispositionCache` = current dispositional state across the 5 dimensions; weekly-review strip = what we've been seeing/doing week over week), and the combined token add is well within budget.

#### Contradiction B — `dispositionCache` shape is nested

Step 0 implied the fix is a one-line rename. The actual shape is nested (`src/core/types/disposition.ts:42-45`):

```ts
interface DispositionCache {
  result: DispositionResult     // { profileDate, periodWeeks, dispositions: {…5 keys}, celebration, nudge, parentNote }
  generatedAt: string
}
```

So the broken iteration `for (const [key, value] of Object.entries(dp))` (`shellyChat.ts:122-125`) was over-flat — even with the field name fixed, it would dump `result` and `generatedAt` as top-level "dispositions." Fix is a 4-5 line change (rename + drill into `dispositionCache.result.dispositions` + format the 5 named entries with their `level/trend/narrative`, optionally including `celebration/nudge`). Not a one-liner. Still a tight surgical change.

Also: `dispositionOverrides` should be respected on read — the UI uses `effectiveDispositionText(entry, override)` (`disposition.ts:51-56`) to pick the parent edit over the AI text. The `shellyChat` read should mirror that so we don't surface a stale AI narrative when Shelly has explicitly overridden it.

---

### Window length decision (Decision 2)

Confirmed inherit from planner: `sessionsPerDomain: 3`, no date filter. Already passes the prompt's "4-12 weeks" sanity check — three sessions per domain in a household that logs roughly weekly comes out to ~3-12 weeks of coverage per domain naturally, without imposing a hard date cutoff (which would hide signal during stretches with fewer sessions). No flag needed.

Concretely: chat will call `loadRecentEvalHistoryByDomain(db, familyId, childId, { sessionsPerDomain: 3 })` — identical to how planner calls it today, since `recentHistoryByDomain` is already in the `shellyChat` slice list (`contextSlices.ts:65-70`). **Already wired.** No code change needed for Decision 2.

---

### Context expansion — BEFORE vs. AFTER (`shellyChat`)

**BEFORE** (verified Step 0):

Shared slices (via `buildContextForTask("shellyChat", …)`, `contextSlices.ts:65-70`):
- `charter`, `childProfile`, `engagement`, `gradeResults`, `recentEval`, `sightWords`, `weekFocus`, `wordMastery`, `workbookPaces`, `skillSnapshot`, **`recentHistoryByDomain`** ✅ (already loaded), `recentScans`, `dayToday`, `dadLabReports`.

Supplemental block (`shellyChat.ts:46-233`):
- All-children list ✅
- "Disposition profile" — **silently empty** (Contradiction B) ❌
- "Recent growth narrative" — **silently empty** (Contradiction A) ❌
- Conundrum title ✅
- Completion-by-day + most-skipped ✅
- Conundrum response count ✅
- Chapter response count + book set ✅

**AFTER** (Phase 1):

Shared slices — unchanged. `recentHistoryByDomain` already covers the eval-trajectory ask (3 sessions per domain × 4 domains, both guided and interactive, with findings on the most-recent session per domain).

Supplemental block:
- All-children list — unchanged.
- **Disposition profile (FIXED)** — replace the broken `dispositionProfile` read with a correct `dispositionCache` read.
  - **Source:** `families/{familyId}/children/{childId}` document, `dispositionCache.result.dispositions` (keyed: `curiosity`, `persistence`, `articulation`, `selfAwareness`, `ownership`); also `dispositionCache.result.celebration/nudge/parentNote` and `dispositionCache.generatedAt`. Apply `dispositionOverrides[key]?.text` over `entry.narrative` per `effectiveDispositionText` (`disposition.ts:51`).
  - **Serialization:** prose block, one line per disposition, format `<Key>: <level>, trend <trend> — <effectiveText>`. Followed by an optional one-line `Profile generated <date>` and the short `celebration` / `nudge` strings if present. Total length naturally bounded by what the disposition generator wrote (~300-500 chars).
  - **Token estimate:** ~75-125 tokens added when populated.
- **Weekly-review trajectory (NEW; replaces broken `dispositionNarrative` read)** — surface up to 5 most recent `weeklyReviews` docs for the child as a compact strip.
  - **Source:** same query the existing supplemental block already runs (`weeklyReviews.where(childId).limit(5)`, `shellyChat.ts:54-58`). No new query, just use more of the result instead of throwing 4 rows away.
  - **Serialization:** one line per review: `<weekKey>: <summary>` (truncate summary to ~140 chars). Include `celebration` and up to 2 `growthAreas` only on the most-recent review (avoid bloat). Skip docs with `status === "no-data"`.
  - **Token estimate:** ~375-625 tokens added (5 rows × ~70-100 tokens each, weighted toward the most-recent row).
- Conundrum title, completion patterns, conundrum responses, chapter responses — unchanged.
- **Recent teach-backs (NEW)** — load Shelly's evidence of Lincoln explaining things back.
  - **Source:** `families/{familyId}/artifacts` where `childId == childId`, `tags.engineStage == "Explain"`, `createdAt >= today - 14d`, then in-memory filter where `title.toLowerCase().startsWith("teach-back")`. Mirrors the existing query at `functions/src/ai/evaluate.ts:415-422` exactly, with the week-bound replaced by a 14-day window. **Decision 5:** apply `limit(10)` at the Firestore layer to cap cost, then summarize via the existing `summarizeTeachBacks` reducer (`evaluate.ts:457-513`).
  - **Reuse:** export `summarizeTeachBacks` if not already exported (it is — `evaluate.ts:457` `export function`). Add a thin new loader `loadRecentTeachBacksContext(db, familyId, childId)` that lives in `contextSlices.ts` for parity with the other slice loaders, and a small formatter that turns the `TeachBacksWeekSummary` into prompt text.
  - **Serialization:** compact block — `RECENT TEACH-BACKS (last 14 days): N total (audio: A, text: T). By subject: Reading 3, Math 1, …. Examples: <subject> — "<excerpt, ≤80c>" (audio|text). <up to 3 examples>`. Omit the section entirely when count is zero.
  - **Token estimate:** ~75-200 tokens added.

**Total estimated token add to `shellyChat` context: ~525-950 tokens**, on top of today's ~2075-3750 tokens of `shellyChat` system prompt. That's roughly +15-30%, landing at or just below the prompt's 30% surface-for-review threshold. Tracking under threshold by design (driving the upper bound is the 5-row weekly-review strip; if Step 2 measurements come in hot we can drop the strip to 3 rows and stay clean).

---

### Chat prompt addendum — draft for Nathan's review

**Insertion point.** Append a new paragraph to the child-scoped branch of `roleSection` (`shellyChat.ts:244-255`), right after the existing bulleted SHELLY-SPECIFIC GUIDELINES list and BEFORE the closing back-tick of the template literal. Do NOT modify the general-conversation branch (`shellyChat.ts:257-266`) — the addendum talks about per-child eval data that doesn't apply when no child is selected. Do NOT replace any existing instructions.

**Proposed text** (verbatim, based on the prompt's draft, mildly tightened for the existing voice; Nathan tune freely):

```
PLANNING-PARTNER MODE: You have ${childName}'s recent evaluation history across reading, math, fluency, and phonics (EVALUATION HISTORY BY DOMAIN above), his disposition signals (curiosity, persistence, articulation, self-awareness, ownership in DISPOSITION PROFILE), the week-over-week strip of recent reviews (RECENT WEEKLY REVIEWS), and his recent teach-backs (RECENT TEACH-BACKS). Use them to help Shelly see patterns over time — what is shifting, what is steady, what connects across signals she hasn't linked. When she shares an observation about ${childName} mid-conversation, treat it as evidence she has earned the right to add to the picture — don't argue with it, build on it.
```

Three notes on this draft:
- It names the section headers the model will actually see in the system prompt above (`EVALUATION HISTORY BY DOMAIN`, `DISPOSITION PROFILE`, `RECENT WEEKLY REVIEWS`, `RECENT TEACH-BACKS`) so the model can ground claims rather than confabulate.
- The "fluency, and phonics" extension comes from `EVAL_DOMAINS` (`chatTypes.ts:207`) — the actual 4 domains the loader returns. Not just reading/math/speech as the original draft said.
- "Don't argue with it, build on it" is preserved verbatim from Nathan's original draft.

---

### Child scoping decision

Confirmed from Step 0: `shellyChat` is single-child-scoped via the active tab in `ShellyChatPage.tsx:523`, with a separate no-child general-conversation branch.

**Phase 1 rule:** all new loaders (disposition cache, weekly-review strip, recent teach-backs) take `childId` and are only invoked when `childId` is present. The no-child branch keeps today's behavior (no eval/disposition/teach-back context loaded) and does not get the PLANNING-PARTNER MODE addendum. Lincoln data never leaks into a London chat; London data never leaks into a Lincoln chat.

---

### Empty-state handling

For each new section, define behavior when the underlying data is absent:

| Section | Empty trigger | Behavior |
|---|---|---|
| Disposition profile | `dispositionCache` field absent on child doc | **Omit the section entirely.** Do not emit "No disposition profile yet" — the model already gets ample context and we don't want to invite confabulation about why it's missing. |
| Weekly-review strip | No `weeklyReviews` docs for child, or all 5 have `status === "no-data"` | **Omit entirely.** Same reasoning. |
| `recentHistoryByDomain` per-domain | A given domain has no completed sessions in `evaluationSessions` | Already-correct existing behavior in `loadRecentEvalHistoryByDomain` (`chatTypes.ts:283-284`): that domain's block is omitted. No change needed. |
| `recentHistoryByDomain` whole | Child has zero completed sessions across all 4 domains | Existing behavior: `formatEvalHistoryByDomain` returns `""` and the section is dropped (`contextSlices.ts:569-571`). No change needed — this is London's reality today. |
| Recent teach-backs | Zero artifacts in window | **Omit entirely** (loader returns `""`). |
| PLANNING-PARTNER MODE addendum | When the new sections are all empty | Append unconditionally on the child-scoped branch. It costs little and primes the model to use the sections when they are present in future turns. |

Rationale for "omit, don't explain absence" across the board: today's `shellyChat` prompt already includes explicit instructions for the model to tell Shelly when data is missing (`shellyChat.ts:248-249` — "If data is missing, tell her specifically what's not there yet and how to populate it"). That guidance is the right channel for "no evals yet for London"; injecting empty headers would just give the model two places to talk about absence, and risk dueling phrasings.

---

### Type changes needed

Goal from Step 0: zero new types. Status against goal:

- `recentHistoryByDomain`: no change. Already wired.
- Disposition fix: reuse `DispositionCache` / `DispositionResult` / `DispositionOverrides` from `src/core/types/disposition.ts`. The functions side does not currently import these — they live in `src/` and the functions tree imports from its own files only. Two acceptable options: **(i)** declare a local minimal shape inside the `shellyChat` handler (mirroring the read fields), or **(ii)** add a small `functions/src/ai/types/disposition.ts` that re-declares the shape. Prefer (i) in Phase 1 — keeps the cross-tree boundary clean and matches how `shellyChat` already declares local read shapes (e.g., the inline `{ exists, data() }` shapes throughout `shellyChat.ts`).
- Weekly-review trajectory: reuse the inline shape `shellyChat.ts:131-141` already uses for the `review.dispositionNarrative` read. Add the actual fields the doc has (`weekKey`, `status`, `celebration`, `summary`, `growthAreas`, `createdAt`). No new shared type.
- Recent teach-backs: `TeachBacksWeekSummary` already exists and is the natural return type. Either import it from `functions/src/ai/evaluate.ts` into the new loader, or declare a minimal duplicate. Prefer **import** — keeps the reducer and the shape coupled.

**Net: 0 new shared types.** Decision met.

---

### Test plan

Tests to add/update in `functions/src/ai/contextSlices.test.ts` (and a new `shellyChat.test.ts` if no existing file — Step 0 confirmed none):

1. **Slice list invariants (existing tests)** — no slice-list changes for `shellyChat`, so the existing assertion at `contextSlices.test.ts:68` ("shellyChat wires the added context slices") still passes unchanged. If we add `recentTeachBacks` as a proper slice in `TASK_CONTEXT` (vs. living only as a supplemental query in `shellyChat.ts`), extend that test.
   - **Recommendation: keep teach-backs as a supplemental query in `shellyChat.ts`**, not a generic slice. Reasoning: only `shellyChat` needs it; we already chose the same pattern for completion-patterns and chapter responses; making it a slice forces every other consumer to consider opting out.

2. **New test: `shellyChat` disposition block populates from `dispositionCache`** — mock a child doc with a realistic `dispositionCache.result.dispositions.{curiosity, …}` payload, mock `dispositionOverrides` for one disposition, run the supplemental-block formatter, assert the output contains all 5 disposition lines, the override text wins where present, and the AI text wins everywhere else.

3. **New test: disposition block omitted cleanly** — mock a child doc with no `dispositionCache` field, assert the output does not contain `DISPOSITION PROFILE`.

4. **New test: weekly-review strip surfaces 5 docs** — mock `weeklyReviews` returning 5 docs with `status: "draft"` and 1 with `status: "no-data"`. Assert the output contains 5 review rows (no-data skipped, replaced by the next-oldest if 6 fetched), most-recent row carries `celebration` + 2 `growthAreas`, older rows carry only `weekKey + summary`.

5. **New test: weekly-review strip omitted cleanly** — empty `weeklyReviews` query → no `RECENT WEEKLY REVIEWS` header.

6. **New test: recent teach-backs loader** — mock 12 `artifacts` matching the filter (more than the 10-limit), assert the loader respects `limit(10)`, asserts `summarizeTeachBacks` shape passes through, and asserts the formatter renders subject breakdown + audio/text count + ≤3 examples.

7. **New test: recent teach-backs omitted cleanly** — zero matching artifacts → no `RECENT TEACH-BACKS` header.

8. **New test: child-scoping for the addendum** — call the supplemental-block builder with `childId = ""` (no-child branch); assert PLANNING-PARTNER MODE addendum is not present and that the disposition/weekly-review/teach-back sections are not present.

9. **No regression on existing slice tests** — re-run `contextSlices.test.ts` after changes; everything else stays green (no `TASK_CONTEXT` changes for `shellyChat`).

10. **Token-budget sanity** — add a coarse test using a synthetic Lincoln-shaped fixture, assert the assembled system prompt char-count stays below a generous bound (propose ~25000 chars ≈ ~6250 tokens for the full `shellyChat` prompt post-Phase 1, well below model context limits and giving headroom for the actual user turn + conversation history).

---

### Token cost estimate (revised post-contradictions)

| Block | Before tokens | After tokens | Delta |
|---|---|---|---|
| `recentHistoryByDomain` (shared slice) | ~150-400 | ~150-400 | 0 (already loaded) |
| Disposition profile block | 0 (silently empty) | ~75-125 (when populated) | +75-125 |
| Weekly-review trajectory (5 rows) | 0 (silently empty) | ~375-625 | +375-625 |
| Recent teach-backs | n/a | ~75-200 | +75-200 |
| PLANNING-PARTNER MODE addendum | n/a | ~125 | +125 |
| **`shellyChat` system prompt total** | **~2075-3750** | **~2725-4825** | **+650-1075 (+25-29%)** |

Lands at the upper edge of the prompt's "above 30%" surface-for-review threshold but under it. If Step 2 measurements come in over the line we drop the weekly-review strip to 3 rows (~225-375 token savings) before reconsidering anything else.

---

### What changed vs. the original prompt

The original Phase 1 prompt was scoped on a partial picture of the code. Differences this plan introduces, with reasoning:

1. **Target moved from `chat` task to `shellyChat` task.** The original prompt assumed `chat` was Shelly's UI chat; it isn't. (Confirmed Step 0; Decision 1.)
2. **Disposition trajectory shape adjusted.** Original prompt proposed "expand from 1 to 5 weekly review narratives." Those narratives don't exist (Contradiction A). Replaced with a 5-row strip of actual `weeklyReviews` doc fields (`summary` + most-recent `celebration` + most-recent 2 `growthAreas`). Provides true week-over-week trajectory using what's actually written.
3. **Disposition fix is multi-line, not one-line.** `dispositionCache` is nested (`result.dispositions`) and parent overrides need to be applied. (Contradiction B.) Same scope, just acknowledging the actual size.
4. **Original prompt mentioned "reading, math, and speech."** Replaced with the actual 4 domains the loader returns (`phonics`, `comprehension`, `math`, `fluency` — `chatTypes.ts:207`). The addendum's section-naming is corrected.
5. **Original prompt said the chat slice today reads curated `findings` on the skill snapshot.** Neither `chat` (which reads only `charter + childProfile`) nor `shellyChat` (which reads the full snapshot incl. `prioritySkills/supports/stopRules/conceptualBlocks` via the `skillSnapshot` slice) match that description literally. `shellyChat` already gets much more than just `findings` — the `recentHistoryByDomain` block IS where findings flow in today.
6. **`recentHistoryByDomain` is already wired into `shellyChat`** (`contextSlices.ts:65-70`). No code change needed for that part of the prompt's data ask. The Phase 1 work concentrates on the three sections that are actually missing or broken: disposition, weekly-review strip, teach-backs.
7. **PLANNING-PARTNER MODE addendum positioned inside the existing `roleSection`** rather than as a top-level new section, to minimize disruption to the existing prompt structure (which already has well-defined SHELLY-SPECIFIC GUIDELINES bullets).
8. **Teach-backs implemented as a `shellyChat`-local supplemental query**, not a generic slice in `TASK_CONTEXT`. Matches the pattern already established for completion-patterns, conundrum count, and chapter responses (`shellyChat.ts:46-84`).
9. **No new shared types** — confirmed achievable via local read shapes and importing `summarizeTeachBacks` from `evaluate.ts`.

---

### Scope guardrails (from the prompt, restated)

This plan does NOT touch:
- Any task type other than `shellyChat` (no changes to `plan`, `scan`, `evaluate`, `chat`, `quest`, `conundrum`, `workshop`, `weeklyFocus`, `weeklyReview`, `analyzePatterns`).
- The schema of `evaluationSessions`, `evaluations`, `dispositionCache`, `weeklyReviews`, `artifacts`, or any other Firestore collection (read-side only).
- Tool use in chat (deferred).
- Write-back from chat to `skillSnapshot` (Phase 2).
- `recentHistoryByDomain`'s window in planner or scan (chat inherits, doesn't reverse the flow).
- Phase 1b (eval-to-eval trajectory narratives at eval-close time).
- Any feature flag — change is additive context + a localized prompt edit + a localized bug fix. Reverting is `git revert`.

---

## STOP — STEP 1 GATE

Step 1 is read-only. No production code touched in this commit.

**Outstanding for Nathan before Step 2:**

1. **Confirm Decision 3 re-aim.** OK to surface a 5-row strip of `weeklyReviews` doc fields (`weekKey + summary + most-recent celebration + most-recent 2 growthAreas`) in place of the proposed-but-non-existent disposition narratives? (Recommended: yes.)
2. **Confirm "omit on empty, don't explain absence"** as the universal empty-state rule for the three new sections.
3. **Confirm teach-backs stays a `shellyChat`-local supplemental query** (no new entry in `TASK_CONTEXT`).
4. **Confirm the addendum text** — Nathan tune the PLANNING-PARTNER MODE paragraph if any wording lands wrong; the implementation will use whatever Nathan signs off on here.
5. **Optional:** if the +25-29% token estimate is the wrong tradeoff for any reason, say so now so Step 2 can ship the 3-row weekly-review strip instead of 5.

Step 2 (implementation) is blocked until Nathan reviews this.
