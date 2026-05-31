# Shelly Chat Control Portal — Design

> **Status:** Design landed 2026-05-30. Docs-only. No app code changed by this run.
> **Ledger:** `FEAT-01` (Band 2) in `docs/review/REVIEW_HOME_BASE.md` §6.
> **Builds on:** `docs/review/DECISION_FUNC-01_source_of_truth.md` (Model 2 — layered
> ownership + named write-through; Tier C green-lit).
> **Grounded against:** `docs/SHELLY_PORTAL_CONTEXT.md` (code-verified surface recon) and
> `docs/SHELLY_PORTAL_FEEDBACK_LOOP.md` (friction-log → GitHub-issue recon).
> **Closes along the way:** `ARCH-09` (decompose `ShellyChatPage`), `TEST-01` (first
> shelly-chat tests), `ETHOS-01` (charter preamble on the chat task). Pairs with `ARCH-10`.

This doc was written against the **actual current code**, not the stale `MASTER_OUTLINE` v14
(DOC-01). Where the originating brief's assumptions differed from the code, the corrections are
called out inline and in §8.

---

## 1. Vision

"Ask AI" (Shelly Chat) becomes **Shelly's control portal** for the homeschool. Instead of hunting
through tabs to see where a child is or to fix a stale detail, she asks in plain language and the
portal answers — and, when she wants, *acts*:

- *"Where is Lincoln on phonics right now?"* → reads the skill snapshot, working levels, and the
  Learning Map and answers in one place.
- *"Add 'because' and 'friend' to London's sight words."* → proposes the change, shows a confirm
  card, writes on one tap.
- *"Lincoln's grade should say 4th now."* → proposes a profile edit, confirm, write.
- *"It's annoying that I can't reorder the checklist."* → silently logged as a feature request for
  Nathan; no interruption to the conversation.

**Principles:** voice-first, low-friction (usable in seconds from a phone), no-shame, charter-aligned.
The portal **never** silently mutates a child's record — every write is *talk → preview → confirm →
write*. It extends what Shelly already does in chat; it does not replace any existing tab.

---

## 2. Pattern — extend the proven loop, do **not** invent tool-use

There is **no tool-use / function-calling in the backend today** (verified: zero `tool_use` /
`tools:` / `tool_choice` references across `functions/src/ai/`). We will **not** add it. Instead we
extend the **"AI proposes → human confirms → one writer commits"** loop the app already runs in two
places:

- **Planner "Lock In"** — the AI drafts a week; Shelly reviews; one tap applies it.
- **Evaluation "Apply to Skill Snapshot"** — `EvaluateChatPage` has the AI emit `<finding>` /
  `<complete>` blocks (`extractFindings` / `extractComplete` / `stripTags`), renders a live panel,
  and `handleSaveAndApply` is the single confirm-and-write button into `skillSnapshots`.

The portal mirrors this exactly:

1. The `shellyChat` system prompt teaches the model to emit a trailing **`<action>{…json…}</action>`**
   block (grammar mirrors the existing `[FOLLOWUP]` markers already emitted at
   `shellyChat.ts:457-462`).
2. The client **extracts** action blocks (regex like `extractFindings`'
   `/<finding>([\s\S]*?)<\/finding>/g`), parses the JSON robustly, maps onto a discriminated-union
   `ChatAction` type, and **strips the tags** from the rendered reply (exactly as `parseFollowUps` /
   `stripTags` do).
3. The UI shows a **confirm card** per proposed action.
4. On confirm, **one typed mutation path** (`applyChatAction`) writes — routing each action to the
   correct owning store per the FUNC-01 authority table.

**Nothing auto-writes to a child's record without a tap.** This matches the home-base
"propose-and-stop" rule for anything touching a child's record (REVIEW_HOME_BASE §8).

---

## 3. Three tiers

### Tier A — Knowing (now, **no writes**) — ✅ DONE (FUNC-03, PR #1275)

Add the one missing read slice so the portal can *talk about* where a child is across every truth
surface.

- **Already readable today** (the brief's claim that the chat sees "only charter + childProfile" is
  wrong for `shellyChat` — that describes the generic `chat` task at `contextSlices.ts:52`). The
  `shellyChat` task already pulls **14 shared slices** (`contextSlices.ts:67-72`) — including
  `skillSnapshot` (priority skills, supports, stop rules, conceptual blocks, working levels),
  `sightWords`, `recentEval`, `weekFocus`, `recentHistoryByDomain`, `recentScans`, `dadLabReports` —
  **plus 8 supplemental queries** in `handleShellyChat` (all children, disposition profile, recent
  weekly reviews, conundrum, completion patterns, conundrum responses, chapter responses,
  teach-backs).
- **The one genuine Tier-A gap:** `childSkillMaps/{childId}` (Learning Map node states:
  `not-started` / `in-progress` / `mastered`) is **read by no AI task** (confirmed in the FUNC-01
  authority table and recon §1). Tier A adds a `childSkillMap` read slice to `shellyChat` so the
  portal can answer milestone-map / curriculum-coverage questions. **This is tracked as `FUNC-03`**
  and is the first build step.

### Tier B — Safe assisted writes (now)

Writes that are low-stakes and not compliance-bearing, each behind a confirm card:

- **Sight words** — add / remove for a child. (Note: there is **no "add a brand-new word" writer**
  today — words enter `sightWordProgress` implicitly via reading encounters; `SightWordDashboard`
  only calls `confirmMastery`. Tier B adds an `addSightWord` helper to `useSightWordProgress`,
  shared by the dashboard and the portal.)
- **Soft profile fields** — edit `grade`, `description`, `notes`, `baselineReading`, `baselineMath`
  on `children/{childId}` via confirm cards. **No compliance numbers.**

  ⚠️ **Reality check (from recon §2-3):** the soft identity fields the originating brief assumed —
  `motivators`, `interests`, `strengths`, `supports`, *level band* — **do not exist on the `children`
  doc** and have no editor. `supports` exists **only** on `skillSnapshots` (Tier C). So the *real*
  Tier-B editable set today is the short allowlist above. Either the build adds a `children`
  soft-field schema + write helper first, or the first portal release ships **Tier A + sight-word
  Tier B only** and defers `editProfileField`. The action surface is **allowlist-validated**: any
  field not on the list (especially any `skillSnapshots` / `childSkillMaps` path) is rejected before
  the write — a Tier-B action must be *structurally incapable* of writing a Tier-C path.

### Tier C — Authoritative writes (after FUNC-02 lands)

Per the FUNC-01 ruling, behind a confirm step and routed by owning store:

- **Identity** (name, grade, and — once modeled — strengths / motivators / level band) →
  `children/{childId}`, human-confirmed.
- **Academic state / "what to teach next"** (priority skills, supports, stop rules, conceptual
  blocks, working levels) → `skillSnapshots/{childId}` **only via the central writer that FUNC-02
  creates** (`skillSnapshotWrites.ts`). That chokepoint does not exist yet — it is the dependency.
- **Curriculum position** ("we're on lesson N") → `activityConfigs/{childId}` (a Tier-B convenience
  per the FUNC-01 contract).
- **Shelly NEVER writes:** `dispositionCache` / `dispositionOverrides` (derived — the portal offers
  *"regenerate"*, not *"edit"*) or **Milestones** (computed at render, not a store).

---

## 4. Feedback to Nathan (both channels)

The chat **silently** logs friction / unmet requests in the background — **no interruption**, no
"want to file a request?" prompt, no change to the rendered reply. Capture is a fire-and-forget
Firestore write fired right after the assistant reply returns (the `handleSend` path in
`ShellyChatPage.tsx`).

**Collection (net-new):** `families/{familyId}/featureRequests/{id}`

| Field | Type | Notes |
|---|---|---|
| `quote` | `string` | Shelly's own words, verbatim. |
| `interpretedWant` | `string` | AI one-line restatement. |
| `childId` | `string?` | Present when child-scoped. |
| `context` | `string` | Page/topic where it surfaced (e.g. `"shelly-chat"`). |
| `createdAt` | `string` | `YYYY-MM-DD` (repo date convention). |
| `status` | `'new' \| 'filed' \| 'done'` | Routine reads `'new'`. `as const` + companion type — no `enum` (`erasableSyntaxOnly`). |
| `dedupKey` | `string` | Hash of normalized `interpretedWant` (lowercased / trimmed / whitespace-collapsed) — mirrors the `xpLedger` idempotency pattern. |
| `githubIssueUrl` | `string?` | Written back after the issue opens. |

**Dad/Settings view:** a reviewable list of `featureRequests` (Settings → Dev tab is the natural
home, admin-only).

**Scheduled routine → GitHub issue:** a new scheduled Cloud Function (cloned from
`generateMonthlyReview` — the only scheduled-CF template in the repo) reads `featureRequests` where
`status == 'new'`, dedups by `dedupKey`, and opens **one** labeled issue each via the GitHub REST API
(`POST /repos/barnes-ngb/first-principles-engine/issues`, labels `feature-request`,
`source:shelly-chat`, + optional child label), then writes back `status: 'filed'` +
`githubIssueUrl`. Auth is a **fine-grained PAT** (Issues: R/W, this repo only) stored in Secret
Manager exactly like the AI keys (`defineSecret("GITHUB_PAT")`), called with `fetch` — **no new
dependency, no export pipeline.** (There is no GitHub-issue automation in the repo today — verified.)

> **The one human console step (Nathan, once):** create the fine-grained PAT and run
> `firebase functions:secrets:set GITHUB_PAT`. The build agent never runs this.

This is a **follow-on run** (Phase 5), not part of the Tier A+B build prompt below. Full plumbing
recon: `docs/SHELLY_PORTAL_FEEDBACK_LOOP.md`.

---

## 5. Prerequisites (folded in — not separate work)

These ledger items are part of the portal build, not parallel tracks:

- **`ARCH-09` — decompose `ShellyChatPage.tsx`** (63 KB, 23+ `useState`). Split into
  `useShellyChatState` (thread/message/image state + thread CRUD — about half the file) and the
  **new** `useShellyChatActions` (the propose/confirm/write layer + confirm-card state). Parsers
  (`parseFollowUps`, new `parseChatActions`) move to small unit-testable sibling modules.
- **`TEST-01` — first shelly-chat tests** (`src/features/shelly-chat/` has **0** test files; the
  existing `shellyChat.test.ts` is *server-side*). First client tests: `parseChatActions.test.ts`
  (valid block → typed action; malformed JSON → skipped, no throw; tags stripped; multiple blocks;
  Tier-C field rejected by allowlist) and `useShellyChatActions.logic.test.ts` (routing +
  confirm-gating + disallowed-field rejection).
- **`ETHOS-01` — charter preamble on the chat task.** `shellyChat` already prepends the `charter`
  slice (`contextSlices.ts:68`), but verify `CHARTER_PREAMBLE` is actually carried end-to-end and
  add it if the path drops it — a **write-capable** chat must stay charter-aligned and
  human-confirmed.
- **`ARCH-10` — pair the rules tightening.** The blanket family write grant
  (`firestore.rules:11-14`: `allow read, write: if request.auth.uid == familyId`) has **no
  field-level validation**. A write-capable parent chat is no *more* dangerous than today (everything
  is already writable) but is also unprotected. Scope writes by collection and validate
  `skillSnapshots` / `childSkillMaps` shapes when the portal becomes write-capable. (Rules edit is
  part of the Tier C run, not Tier A+B.)

---

## 6. Build sequence

1. **Decompose + first tests** (`ARCH-09` + `TEST-01`) — `useShellyChatState` /
   `useShellyChatActions` split; `parseChatActions` + `useShellyChatActions.logic` tests.
2. **Tier A read slice** (`FUNC-03`) — add `childSkillMap` slice to `shellyChat` (copy
   `loadSkillSnapshotContext`); prompt addendum so the model can ground milestone-map claims.
3. **`applyChatAction` mutation path + confirm-card UI** — the typed write chokepoint + the
   propose/confirm surface (no writes wired yet beyond the safe ones in step 4).
4. **Tier B** — `addSightWord` / `removeSightWord` (+ allowlisted `editProfileField` once the soft
   schema exists).
5. **Feedback log + Dad view + GitHub-issue routine** (`featureRequests` collection + silent capture
   + scheduled CF). *Follow-on run.*
6. **Tier C** — after FUNC-02's central `skillSnapshots` writer exists; route snapshot edits through
   it, human-confirmed; pair the `ARCH-10` rules tightening; never touch `dispositionCache` or
   Milestones. *Follow-on run.*

---

## 7. Verified file / collection targets (reference for build prompts)

| Concern | Verified target |
|---|---|
| Task → slice map | `functions/src/ai/contextSlices.ts:67-72` (`shellyChat`); slice const `:19-40`; `chat` (thin) at `:52` |
| Skill-snapshot loader template | `loadSkillSnapshotContext` `contextSlices.ts:822` |
| `shellyChat` handler / supplemental queries | `functions/src/ai/tasks/shellyChat.ts:222-300`; `[FOLLOWUP]` grammar `:457-462` |
| Action-block extraction analog | `EvaluateChatPage.tsx` `extractFindings` `:64-83`, `extractComplete` `:96-124`, `stripTags` `:126-131`; `parseFollowUps` `ShellyChatPage.tsx:378-396` |
| Robust JSON parse (server-only — needs a client port) | `functions/src/ai/sanitizeJson.ts#sanitizeAndParseJson` |
| Send handler / silent-capture hook | `ShellyChatPage.tsx` `handleSend` (writes user msg → `chat({taskType:'shellyChat'})` → `addDoc(shellyChatMessagesCollection…)`) |
| `children` | `childrenCollection` `firestore.ts:101` — type `family.ts:14-29` (no `motivators`/`strengths`/`supports`/level band) |
| `skillSnapshots` (authority) | `skillSnapshotsCollection` `firestore.ts:207`; type `evaluation.ts:133-149`; `supports` lives here only |
| `sightWordProgress` | `sightWordProgressCollection` `firestore.ts:361`; writer `useSightWordProgress.ts` (no add-new-word writer) |
| `childSkillMaps` (Tier-A gap) | `childSkillMapsCollection` `firestore.ts:464`; type `skillStatus.ts:19-38` |
| `activityConfigs` (position) | `activityConfigsCollection` `firestore.ts:285` |
| Scheduled-CF template | `generateMonthlyReview` `functions/src/ai/monthlyReview.ts:96`; secrets `aiConfig.ts` |
| Rules grant to tighten | `firestore.rules:11-14` (blanket); shellyChat-specific `:28-32` |

---

## 8. Corrections to the originating brief (against live code)

1. **"Chat sees only charter + childProfile"** — true for the **generic `chat`** task only.
   `shellyChat` already pulls 14 slices + 8 supplemental queries. The real read gap is
   `childSkillMaps` (FUNC-03), not "sight words / skill snapshot" (those are already fed).
2. **"FUNC-01 decision doc is missing / Tier C is gated on writing it"** — it **exists**
   (`DECISION_FUNC-01_source_of_truth.md`, RESOLVED 2026-05-30) and **green-lights Tier C**. The
   gate is open; the real dependency is FUNC-02's `skillSnapshotWrites.ts` chokepoint + a `children`
   soft-field schema.
3. **"Edit soft profile fields (motivators / supports / interests / strengths / level band) on
   `children`"** — those fields **don't exist** on `children` and have no editor; `supports` lives
   **only** on `skillSnapshots` (Tier C). Real Tier-B set: `grade`, `description`, `notes`,
   `baselineReading`, `baselineMath` — schema/editor work precedes even those.
4. **`useSkillMapWrite.ts`** (named in the FUNC-01 decision) **does not exist** — real write paths are
   `useSkillMap.ts#updateNodeStatus` and `updateSkillMapFromFindings.ts`.
5. **ARCH-10 grant location** — `firestore.rules:11-14`, not `:29-31` (those are the
   shellyChat-specific rules at `:28-32`).

---

## 9. Phase-1 (Tier A + B) build prompt — ready to paste into Claude Code web

> **Run for ISSUE_ID: FEAT-01 (Shelly Chat control portal, Phase 1 — Tier A + B only).**
>
> Per `docs/barnes-shelly-chat-portal-design.md` and the FUNC-01 ruling
> (`docs/review/DECISION_FUNC-01_source_of_truth.md`), turn Ask AI into Shelly's read+assist portal
> using the **AI-proposes → human-confirms → one-writer-commits** loop the planner and
> `EvaluateChatPage` already use. **Do not add tool-use / function-calling** — extend the existing
> `<finding>`/`[FOLLOWUP]` extraction pattern. **Scope: Tier A + B only.** Tier C (snapshot writes),
> the `firestore.rules` tightening (ARCH-10), and the `featureRequests` feedback routine are
> explicit follow-on runs — out of scope here.
>
> **1. Decompose `ShellyChatPage.tsx` (ARCH-09) + first tests (TEST-01).**
>    - Extract `src/features/shelly-chat/useShellyChatState.ts` — thread/message/image state +
>      thread CRUD (`handleNewThread/Select/Archive/Rename`, the image-gen/upload/refinement
>      cluster). Behavior-preserving; no logic change.
>    - Add `src/features/shelly-chat/parseChatActions.ts` — extract `<action>([\s\S]*?)</action>`
>      blocks (mirror `extractFindings` at `EvaluateChatPage.tsx:64-83`), parse each payload with a
>      **client port of `sanitizeAndParseJson`** moved to `src/core/utils/sanitizeJson.ts` (shared
>      with the server copy in `functions/src/ai/sanitizeJson.ts`), map onto the `ChatAction`
>      discriminated union, and strip the tags from rendered text (mirror `parseFollowUps`/`stripTags`).
>      Malformed JSON is skipped, never thrown.
>    - Add tests: `parseChatActions.test.ts` (valid → typed; malformed → skipped; tags stripped;
>      multiple blocks; Tier-C field rejected) and `useShellyChatActions.logic.test.ts` (routing +
>      confirm-gating + disallowed-field rejection).
>
> **2. Tier-A read slice (FUNC-03).** In `functions/src/ai/contextSlices.ts`: add `ChildSkillMap`
>    to the `ContextSlice` const (`:19-40`), add `"childSkillMap"` to the `shellyChat` array
>    (`:67-72`), register the fetch + format block in `buildContextForTask`, and write
>    `loadChildSkillMapContext(db, familyId, childId)` modeled on `loadSkillSnapshotContext` (`:822`).
>    Read the raw `childSkillMapsCollection` doc directly (the client `useSkillMap` hook /
>    `CURRICULUM_MAPS` aren't importable from `functions/`); summarize counts per domain + list
>    `in-progress` nodes. Add a one-line `shellyChat` prompt addendum naming the new section so the
>    model grounds milestone-map claims.
>
> **3. `applyChatAction` mutation path + confirm-card UI.** Create
>    `src/features/shelly-chat/useShellyChatActions.ts` exposing `applyChatAction(action)` over:
>    ```ts
>    type ChatAction =
>      | { kind: 'addSightWord';    childId: string; word: string }
>      | { kind: 'removeSightWord'; childId: string; word: string }
>      | { kind: 'editProfileField'; childId: string;
>          field: 'grade' | 'description' | 'notes' | 'baselineReading' | 'baselineMath';
>          value: string }
>    ```
>    `field` is a strict **allowlist** — reject `supports`, `prioritySkills`, `stopRules`,
>    `conceptualBlocks`, `workingLevels`, `completedPrograms`, and any `skillSnapshots`/
>    `childSkillMaps` path *before* writing (the structural Tier-B/C guarantee). Every action is
>    **propose → confirm card → write**; nothing writes without a tap. No `dispositionCache` edits
>    (offer "regenerate"), no Milestones. Render a confirm card per parsed action in the chat stream.
>
> **4. Tier-B writers.**
>    - Add `addSightWord(childId, word)` to `src/features/books/useSightWordProgress.ts` (seed a
>      `SightWordProgress` doc: `masteryLevel:'new'`, `encounters:0`, timestamps) and a
>      `removeSightWord` deleter; export both so the dashboard and portal share one writer. Route
>      `add/removeSightWord` actions through them.
>    - For `editProfileField`: if a `children` soft-field schema + write helper does **not** yet
>      exist, **ship Tier A + sight-word Tier B only and stub `editProfileField` as not-yet-enabled**
>      (the soft fields `grade`/`description`/`notes` have no live editor today — see design §3/§8).
>      Do not invent a schema in this run; note it as the gating follow-on.
>    - Teach the model the `<action>` grammar in the `shellyChat` system prompt (mirror the
>      `[FOLLOWUP]` instructions at `shellyChat.ts:457`): emit one `<action>{…}</action>` block per
>      proposed change, only for the allowlisted action kinds.
>
> **5. Verify.** Run `npx tsc -b`, `npm run lint`, `npm test` (+ the functions suite, since
>    `contextSlices.ts` is touched). Commit on the working branch with `feat:` prefixes. Do **not**
>    open a PR unless asked.
>
> **Out of scope (follow-on runs):** Tier C snapshot writes (needs FUNC-02's `skillSnapshotWrites.ts`),
> the `firestore.rules` tightening (ARCH-10), and the `featureRequests` silent-capture + scheduled
> GitHub-issue routine (see `docs/SHELLY_PORTAL_FEEDBACK_LOOP.md`).
