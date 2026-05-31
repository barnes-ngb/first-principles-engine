# ARCH-10 — Firestore Rules Hardening: Feasibility + Plan (recon)

> **Status:** Recon complete, build pending. **This document changes nothing** — no rules edit, no
> code edit. It answers the gating question ("can we even test rules here?"), establishes the
> regression baseline ("what must not break"), and proposes the hardened structure.
> **Ledger row:** ARCH-10 (stays OPEN).
> **Run context:** Executed in Claude Code web on the repo. All probes were run by Claude Code; the
> human ran nothing.
> **Pairs with:** the now-live Shelly write portal (FEAT-01 Tier B — `editProfileField` +
> sight words). Extends `docs/review/prompts/PROMPT_FIX.md` guardrails and the ARCH-10 note in
> `docs/SHELLY_PORTAL_CONTEXT.md §6`.

---

## 0. The problem in one paragraph

`firestore.rules` grants writes through a single **recursive blanket match**:

```
match /families/{familyId}/{document=**} {
  allow read, write: if request.auth != null && request.auth.uid == familyId;
}
```
(`firestore.rules:11-14` — note the ledger's "`:29-31`" pointer is stale; `:28-33` is the redundant
shellyChat block, not the blanket grant.)

Any authenticated family session — **including a kid-tablet session, which shares the same family
UID** — can write *any* document under `families/{uid}/` with *any* shape. That database holds
Lincoln's **legal Missouri homeschool record** (`hours`, `evaluations`, `skillSnapshots`). A kid-UI
bug (or a future write-capable AI portal) can silently corrupt the compliance record and nothing in
the rules would stop it. ARCH-10 narrows that grant with per-collection **shape validation**.

---

## 1. Can we even test rules here? (the gating answer)

**Yes — Firestore rules unit tests run end-to-end inside Claude Code web. Proven, not assumed.**

| Probe | Result |
|---|---|
| `java -version` | **OpenJDK 21.0.10** present |
| `node --version` | v22.22.2 |
| `firebase` on PATH | absent — but `npx firebase-tools@latest` works (same pattern `deploy.yml` already uses) |
| `firebase emulators:exec --only firestore "true"` | **Emulator downloaded (`cloud-firestore-emulator-v1.21.0.jar`) and started successfully** |
| Full harness: `@firebase/rules-unit-testing` + `vitest` against the **actual `firestore.rules`** | **3/3 assertions ran** in 2.7s through the emulator |

The end-to-end probe (temp dir, since discarded) confirmed all three behaviors a real test suite
needs:
1. `assertSucceeds` — owning family writes its own `hours` doc → **passes** (golden writer stays green).
2. `assertFails` — a different UID writes `families/fam1/...` → **denied** (cross-family isolation holds).
3. `assertSucceeds` — owning family writes `xpLedger` with a **garbage shape** (`totalXp: 'not-a-number'`)
   → **passes today.** This is the gap ARCH-10 closes; after hardening this exact assertion flips to
   `assertFails`.

**Environment caveat (non-blocking):** the emulator logs IPv6 bind warnings
(`EAFNOSUPPORT ::1:8080/4400/4500`) because the sandbox has no IPv6 loopback. It binds `127.0.0.1`
and works fine. Pin `"host": "127.0.0.1"` for the emulator in the test `firebase.json` to silence
these and avoid any client that prefers `::1`.

### Recommendation: **both** — author + run in CC web, gate in CI

- **(a) Primary home = Claude Code web.** The full harness runs here, so the ARCH-10 build run can
  author rules + tests and prove every golden writer stays green *before* opening a PR. This is the
  authoring/iteration loop.
- **(b) Regression gate = a new CI job.** Add a `test-rules` job so the suite runs on every PR and
  no future change can silently re-open the gap. GitHub-hosted `ubuntu-latest` runners have Java and
  run the emulator (the deploy workflow already uses `npx firebase-tools@latest`).
- **(c) Local box is *not* a fallback.** The human develops on **Windows, no-admin, no Docker** — the
  Java-backed emulator is impractical there. "Run it locally" is explicitly off the table; CC web +
  CI carry the load.

**CI placement nuance (correcting the brief):** the brief pointed at `deploy.yml`. That workflow
only runs on pushes to the `deploy` branch (post-merge). A rules **regression gate** belongs in
`ci.yml`, which already runs `test` + `test-functions` on every PR to `main`/`deploy`. The new
`test-rules` job should live in **`ci.yml`** (PR gate), not `deploy.yml`. See §5.2 for the
shared-infra coordination flag.

---

## 2. Golden-writer inventory (the "must not regress" set)

Every client-side write path, grouped by collection. **Cloud Functions write via the admin SDK and
bypass rules entirely** — they are listed separately in §2.2 and are *not* a regression risk for
rules changes, but they tell us which shapes the rules must continue to accept (a CF and a client can
write the same collection).

Actor classes: **kid** = kid-tablet nav pages (quest, workshop, kid books, armor, today-kid,
KidLabView); **parent** = planner/evaluation/records/settings/shelly-chat/progress/weekly+monthly
review; **shared** = `src/core/` hooks/utils reachable from either UI. **Rules cannot tell these
apart** — all three run under the same family UID (see §4.0).

### 2.1 Client writers (subject to rules)

| Collection | Writer file(s) | Ops | Actor class(es) |
|---|---|---|---|
| `children` | `AddChildDialog.tsx`; `progress/DispositionProfile.tsx`, `core/family/updateChildSoftProfile.ts` (soft fields) | add, update | parent, shared |
| `hours` | `records/QuickAddHours.tsx`, `records/RecordsPage.tsx`; `quest/useQuestSession.ts`; `evaluate/EvaluateChatPage.tsx`; `books/BookReaderPage.tsx`, `books/useBook.ts`; `workshop/workshopUtils.ts`, `workshop/VoiceRecordingStep.tsx`; `core/hooks/useCreativeTimer.ts` | add, batch.set | **kid**, parent, shared |
| `hoursAdjustments` | `records/RecordsPage.tsx`, `records/QuickAddHours.tsx` | add | parent |
| `evaluations` | `records/EvaluationsPage.tsx` | add, update | parent |
| `evaluationSessions` | `quest/useQuestSession.ts` | set, update | **kid** |
| `skillSnapshots` | `evaluate/skillSnapshotWrites.ts`, `evaluate/EvaluateChatPage.tsx`; `quest/useQuestSession.ts`; `evaluation/WorkingLevelsSection.tsx`; `today/TodayChecklist.tsx`; `core/curriculum/updateSkillMapFromFindings.ts`; `settings/backfillWorkingLevels.ts`, `settings/backfillBlockIds.ts` | set, update | parent, **kid**, shared |
| `childSkillMaps` | `core/curriculum/updateSkillMapFromFindings.ts` | set | shared |
| `xpLedger` | `core/xp/addXpEvent.ts` | set, update | shared (reached from kid + parent flows) |
| `dailyArmorSessions` | `core/avatar/getDailyArmorSession.ts` | batch.set, batch.update | shared (kid armor) |
| `avatarProfiles` | `avatar/safeProfileWrite.ts`, `core/xp/addXpEvent.ts`, `core/avatar/getDailyArmorSession.ts` | set, update | **kid**, shared |
| `days` | `quest/useQuestSession.ts`; `planner-chat/PlannerChatPage.tsx`; `today/useDayLog.ts`, `today/TodayChecklist.tsx` | set, update | **kid**, parent, shared |
| `artifacts` | `today/useUnifiedCapture.ts`, `today/KidCaptureForm.tsx`, `today/KidTeachBack.tsx`, `today/KidConundrumResponse.tsx`, `today/KidChapterPool.tsx`, `today/WeekFocusCard.tsx`; `books/useBook.ts`; `records/PortfolioPage.tsx`; `dad-lab/KidLabView.tsx`, `dad-lab/LabReportForm.tsx`; `planner-chat/PlannerChatPage.tsx` | add, update, delete | **kid**, parent, shared |
| `dailyPlans` | `planner-chat/PlannerChatPage.tsx`; `today/useDailyPlan.ts` | set, update | parent, shared |
| `weeks` | `planner-chat/PlannerChatPage.tsx` | set, update | parent |
| `weeklyReviews` | `weekly-review/WeeklyReviewPage.tsx` | set | parent |
| `lessonCards` | `planner-chat/PlannerChatPage.tsx`, `planner/TeachHelperDialog.tsx` | add, set | parent |
| `plannerConversations` | `planner-chat/PlannerChatPage.tsx` | set | parent |
| `scans` | `components/ScanAnalysisPanel.tsx`, `today/TodayPage.tsx`, `core/hooks/useScan.ts` | add, update | parent, **kid**, shared |
| `books` | `books/useBook.ts`, `books/useBookGenerator.ts`, `books/CreateSightWordBook.tsx` | add, set | **kid** |
| `bookThemes` | `books/CreateThemeDialog.tsx` | add | **kid** |
| `bookProgress` | `today/useBookProgress.ts`, `today/TodayPage.tsx` | set, update | **kid**, shared |
| `stickerLibrary` | `books/BookEditorPage.tsx`, `books/useBackgroundReimagine.ts`, `books/SketchScanner.tsx`, `settings/StickerLibraryTab.tsx` | add, set, delete | **kid**, shared |
| `storyGames` | `workshop/WorkshopPage.tsx`, `workshop/workshopUtils.ts`, `workshop/VoiceRecordingStep.tsx` | add, update | **kid** |
| `chapterResponses` | `today/KidChapterPool.tsx`, `records/ChapterResponsesTab.tsx` | add, delete | **kid**, parent |
| `dadLabReports` | `dad-lab/LabReportForm.tsx`, `dad-lab/KidLabView.tsx` | add, update | parent, **kid** |
| `activityConfigs` | `core/hooks/useActivityConfigs.ts`, `core/firebase/migrateActivityConfigs.ts`, `core/firebase/updateActivityPosition.ts`, `settings/mergeDuplicateConfigs.ts` | batch.set/update, update, delete | shared, parent |
| `workbookConfigs` (legacy) | `core/hooks/useCertificateProgress.ts` | set, update | shared |
| `sightWordProgress` | `books/useSightWordProgress.ts` (incl. portal `addSightWord`/`removeSightWord`), `progress/useWordWall.ts` | set, delete | **kid**, parent (portal), shared |
| `children/{childId}/wordProgress` (subcol) | `quest/useQuestSession.ts` | set | **kid** |
| `shellyChatThreads` + `…/messages` (subcol) | `shelly-chat/useShellyChatFlows.ts`, `shelly-chat/openChatWithContext.ts` | add, update, batch.update | parent |
| `settings/plannerDefaults{,_childId}` (subcol) | `planner-chat/PlannerChatPage.tsx` | set | parent |
| `monthlyReviews` | *(client: publish/unpublish go through CFs; no direct client write found)* | — | — |
| `ladderProgress` | *(no live writer — historical data only, per ARCH-07)* | — | — |
| **global `chapterBooks`** | `planner-chat/ChapterBookPicker.tsx` | add | parent |

**Count:** ~30 client write call-sites across **28 family-scoped collections/subcollections** + 1
global collection. **~11 of those collections receive kid-tablet writes**, including the
compliance-adjacent `hours`, `skillSnapshots`, `days`, and `evaluationSessions`. This is the headline
constraint for §4.

### 2.2 Cloud Function writers (admin SDK — **bypass rules**, separate column)

CFs are not gated by rules, but their write shapes must remain *acceptable* to any hardened rule on a
collection a client also writes. Notable CF writers (from `functions/src/`):
`evaluate.ts` → `weeklyReviews`; `monthlyReview.ts` → `monthlyReviews`; `tasks/disposition.ts`,
`tasks/conundrum.ts`, `tasks/weeklyFocus.ts` → day/snapshot context; `contextSlices.ts` +
`chat.ts` → assorted; `tasks/transcribeAudio.ts` → `aiUsage` + `children/{childId}/transcriptionEvents`;
`workbookActivityConfigBackfill.ts` → `activityConfigs`. **Implication:** because CFs bypass rules,
ARCH-10 can be strict on the client side without breaking any CF write — but the chosen shape checks
must still describe documents the CF legitimately produces (e.g. a CF-written `skillSnapshot` must
pass the same shape gate a client write does, since both land in the same doc).

---

## 3. Collection classification by stakes

### 3.1 Authoritative / compliance — shape-validate (the legal record)

| Collection | Required-field shape a rule should assert (from type + converter) |
|---|---|
| `hours` (`HoursEntry`, `compliance.ts:6`) | `minutes` is a number ≥ 0; `date` is a string. Optional `subjectBucket`/`blockType` if present must be strings. |
| `hoursAdjustments` (`HoursAdjustment`, `compliance.ts:22`) | `minutes` number; `date` string; `reason` string. |
| `evaluations` (`Evaluation`, `evaluation.ts:9`) | `childId` string; `monthStart`/`monthEnd` strings; `wins`/`struggles`/`nextSteps`/`sampleArtifactIds` are lists. |
| `evaluationSessions` (`EvaluationSession`, `evaluation.ts:153`) | `childId` string; `status` in {`in-progress`,`complete`,`resumed`,`abandoned`}; `evaluatedAt` string; `messages`/`findings` lists. |
| `skillSnapshots` (`SkillSnapshot`, `evaluation.ts:133`; doc ID = `childId`) | `childId` string; `prioritySkills`/`supports`/`stopRules`/`evidenceDefinitions` are lists. (`workingLevels`, `conceptualBlocks`, `completedPrograms` optional.) |
| `childSkillMaps` (`ChildSkillMap`, `skillStatus.ts:32`; doc ID = `childId`) | `childId` string; `skills` is a map; `updatedAt` string. |
| `xpLedger` (`XpLedger`, `xp.ts`; doc IDs `{childId}` cumulative + `{childId}_{dedupKey}` per-event) | `childId` string; `totalXp` number; `sources` is a map. Per-event docs additionally carry `dedupKey`/`type`/`amount`(number)/`awardedAt`. **Append-only intent** via dedup doc IDs — see §4.3. |

These are the writes where a malformed value corrupts the MO compliance dashboard or the
progression/economy ledger.

### 3.2 Descriptive / low-stakes — family-scoped, light or no shape validation

`children` (soft fields), `artifacts`, `days`, `dailyPlans`, `weeks`, `weeklyReviews`, `lessonCards`,
`plannerConversations`, `scans`, `books`, `bookThemes`, `bookProgress`, `stickerLibrary`,
`storyGames`, `chapterResponses`, `dadLabReports`, `activityConfigs`, `workbookConfigs`,
`sightWordProgress`, `avatarProfiles`, `dailyArmorSessions`, `shellyChatThreads/*`,
`settings/*`, `wordProgress`. These keep the existing family-scoped grant; corruption here is
recoverable and non-legal. (`avatarProfiles`/`dailyArmorSessions`/`xpLedger` are the economy
boundary — `xpLedger` is promoted to §3.1 because it backs progression; the other two can stay
low-stakes initially and be tightened later.)

---

## 4. Proposed hardened rules structure (sketch — not implemented)

### 4.0 Two hard truths that shape the whole design

1. **The OR-semantics trap.** Firestore evaluates `allow` across *all* matching rules with **OR**: a
   write succeeds if **any** matching rule permits it. While the recursive `:11-14`
   `{document=**}` blanket write grant exists, **every stricter per-collection block is a no-op** —
   the blanket grant already says yes. Therefore hardening is **not additive**: a partial PR that adds
   a strict `hours` block while leaving the blanket write in place changes *nothing*. The blanket
   **write** must be removed/narrowed in the same change that introduces the per-collection blocks.
   (Reads can stay blanket — see 4.1.)
2. **Rules cannot distinguish kid from parent.** Both the kid tablet and the parent phone authenticate
   as the *same* family UID (`request.auth.uid == familyId`). There is no per-user actor claim. So
   ARCH-10 **cannot** lock `hours`/`skillSnapshots` to "parent only" — kid flows legitimately write
   them (quest awards hours; TodayChecklist updates snapshots/days). The only lever rules have is
   **shape validation**, not actor restriction. Actor-level control, if ever wanted, needs custom
   claims (a separate, larger effort — out of scope; note it as a future ARCH item).

### 4.1 Structure

- **Keep** the default deny-all (`:5-7`) and a shared `isFamily(familyId)` helper.
- **Reads stay blanket family-scoped.** Replace `allow read, write` on the recursive match with
  `allow read: if isFamily(familyId)` only. No app reading need is harmed and it sidesteps the OR
  trap for reads.
- **Remove the blanket recursive `write`.** In its place:
  - A **family-scoped permissive write** for the §3.2 low-stakes collections. Two implementation
    options (decide at build time):
    - **(A) enumerate** low-stakes collections with `allow write: if isFamily()` blocks (explicit,
      verbose, safest — nothing implicitly writable), or
    - **(B) keep a recursive low-stakes write but exclude the authoritative names** — *not possible
      cleanly* under OR semantics (you can't subtract), so **(A) is the recommended approach.**
  - **Explicit per-collection blocks** for each §3.1 authoritative collection with
    `allow write: if isFamily() && <shape check>`.
- This trades brevity for safety: the rules file grows to ~one block per collection, mirroring how
  **`storage.rules` already enumerates per-path blocks with `isValidUpload()`** — a proven in-repo
  pattern to follow.

### 4.2 Worked snippet — `hours` (compliance, shape-validated)

```
function isFamily(familyId) {
  return request.auth != null && request.auth.uid == familyId;
}

match /families/{familyId}/hours/{entryId} {
  allow read: if isFamily(familyId);
  allow write: if isFamily(familyId)
    && request.resource.data.minutes is number
    && request.resource.data.minutes >= 0
    && request.resource.data.date is string;
}
```
*Regression risk:* every `hours` writer in §2.1 (kid quest, creative timer, books, workshop, records)
must send numeric `minutes` + string `date`. The `HoursEntry` type already requires both — a test
replays a representative payload from each writer and asserts `assertSucceeds`.

### 4.3 Worked snippet — `xpLedger` (append-only economy ledger)

```
match /families/{familyId}/xpLedger/{docId} {
  allow read: if isFamily(familyId);
  // Per-event docs are immutable once written (dedup guard already enforces
  // create-once in addXpEvent); the cumulative {childId} doc is update-only.
  allow create: if isFamily(familyId)
    && request.resource.data.childId is string
    && request.resource.data.totalXp is number
    && request.resource.data.sources is map;
  allow update: if isFamily(familyId)
    && request.resource.data.totalXp is number
    && request.resource.data.sources is map;
  allow delete: if false;  // ledger is never deleted
}
```
*Regression risk:* `addXpEvent.ts` both `setDoc`s the per-event doc and `setDoc`/`updateDoc`s the
cumulative doc. Confirm `setDoc` on the cumulative doc counts as create-or-update under the split
`create`/`update` rules; if `addXpEvent` uses `setDoc` with merge semantics on an existing doc the
emulator treats it as `update`. A test exercises both the first award (create) and a subsequent award
(update) for the same child. **This snippet would flip the §1 garbage-shape probe from pass → fail.**

### 4.4 Worked snippet — `skillSnapshots` (compliance, shape-validated)

```
match /families/{familyId}/skillSnapshots/{childId} {
  allow read: if isFamily(familyId);
  allow write: if isFamily(familyId)
    && request.resource.data.childId is string
    && request.resource.data.prioritySkills is list
    && request.resource.data.supports is list
    && request.resource.data.stopRules is list
    && request.resource.data.evidenceDefinitions is list;
}
```
*Regression risk — the sharpest one:* `skillSnapshots` has **8 client writers across kid + parent +
shared**, several of which `updateDoc` only a sub-slice (e.g. `WorkingLevelsSection` writes
`workingLevels`; `TodayChecklist` and `updateSkillMapFromFindings` patch blocks). On a partial
`updateDoc`, `request.resource.data` is the **merged** document, so the required lists must already
exist on the stored doc. **Edge case:** a writer that creates the snapshot doc with a partial shape,
or patches a doc that predates the required fields, would now be rejected. The test suite must replay
**each** of the 8 writers' real payloads (create *and* partial-update) and confirm `assertSucceeds`;
any failure means the rule is too strict (loosen to `is list || !('field' in request.resource.data)`)
rather than breaking the writer.

### 4.5 Where this risks regressing a Step-2 writer (and how tests catch it)

| Risk | Collection(s) | How a test catches it |
|---|---|---|
| Partial `updateDoc` lacks a required field | `skillSnapshots`, `days`, `xpLedger` | Replay each writer's *update* payload against a pre-seeded doc; expect succeed. |
| Pre-existing docs predate a required field | `skillSnapshots`, `evaluationSessions` | Seed a "legacy" doc shape, then replay an update; expect succeed (or rule uses `|| !('f' in data)`). |
| Number stored as string by an older writer | `hours`, `xpLedger` | Replay the actual writer payload; if it ever sent a string, the test fails *before* the rule ships. |
| Low-stakes collection accidentally dropped from the enumerated allow-list | any §3.2 collection | A "every collection has a writer test" sweep — an un-listed collection's write `assertFails` and flags the omission. |
| CF-written shape differs from client shape | `weeklyReviews`, `skillSnapshots` | Include a CF-shaped payload in the succeed set (CFs bypass rules, but the doc they leave behind must still pass a *client* update). |

---

## 5. Build sequence + coordination

### 5.1 Recommended build order (each step independently verifiable)

1. **Harness first (no rules change).** Add `@firebase/rules-unit-testing` + a `firestore.rules`
   test scaffold (emulator `firebase.json` with `"host": "127.0.0.1"`), and add
   `firestore-debug.log` / `firebase-debug.log` / `*-debug.log` + emulator data dirs to
   `.gitignore` (they are currently untracked-but-not-ignored). Wire the `test-rules` CI job (§5.2).
2. **Characterization tests against *current* rules.** Encode the §2 golden writers as
   `assertSucceeds` cases and cross-family isolation as `assertFails`, **plus** the §1 garbage-shape
   cases as *currently-passing* (documents the gap). This suite goes green against today's rules and
   becomes the regression net. **No behavior change yet.**
3. **Narrow the blanket grant + add per-collection blocks (the one real change).** Split `read` from
   `write` on `:11-14`, enumerate low-stakes writes (4.1 option A), add the §3.1 shape-validated
   blocks (4.2–4.4). Flip the garbage-shape tests from `assertSucceeds` → `assertFails`.
4. **Verify all golden writes still pass.** Re-run; every §2 writer payload must stay green. Iterate
   rule strictness until the only newly-failing cases are the intended malformed ones.
5. **Drop the redundant `:28-33` shellyChat block** (now covered by the low-stakes enumeration) to
   keep the file honest.

### 5.2 ⚠️ Shared-infra coordination flag (Step 1b)

The CI job touches **`ci.yml`** (or `deploy.yml`), which sits at the **ownership boundary** with the
home base. Adding a `test-rules` job (installs `firebase-tools`, runs `emulators:exec`) is shared
infra — **flag it for coordination with the home base before the build run edits CI.** A first
emulator run in CI also downloads the emulator jar (~tens of MB); consider caching
`~/.cache/firebase/emulators`. Authoring/iterating in CC web (§1a) does **not** touch shared infra and
can proceed without that coordination; only the CI wiring does.

### 5.3 One PR or staged?

**Stage it.** Three PRs, in order:
- **PR 1 — harness + characterization tests + CI job** (`docs:`/`test:`/`chore:`): adds the suite and
  the gate against *current* rules. Zero behavior change, fully reviewable, and the shared-infra CI
  edit is isolated here for the coordination flag.
- **PR 2 — narrow the blanket write + authoritative shape blocks** (`fix:`/`feat:`): the actual
  hardening, landing only once PR 1's net is green. This is the one with regression risk; keeping it
  separate means the diff under review is *only* the rules change with a passing test wall behind it.
- **PR 3 (optional) — extend shape validation to economy/low-stakes** (`avatarProfiles`,
  `dailyArmorSessions`, deeper `days` checks) once PR 2 is proven safe in production.

Doing it as a single PR is **not recommended**: the harness must demonstrably pass against the *old*
rules first (proving the golden writers are correctly captured) before the rules flip — collapsing
that into one diff loses the "tests were green before *and* after" evidence that makes the change
trustworthy on a legal-record database.

---

## 6. Summary

- **Where rules tests can run (gating answer):** **Claude Code web — proven end-to-end** (Java 21 +
  `npx firebase-tools` emulator + `@firebase/rules-unit-testing`, 3/3 assertions ran, including one
  that demonstrates the current shape gap). Add a `test-rules` job to **`ci.yml`** as the PR
  regression gate. The human's Windows/no-Docker box is *not* a fallback.
- **How many golden writers must stay green:** **~30 client write call-sites across 28 family-scoped
  collections** (+1 global `chapterBooks`); ~11 collections receive kid-tablet writes, including the
  compliance-adjacent `hours`, `skillSnapshots`, `days`, `evaluationSessions`. Cloud Functions write
  via admin SDK and bypass rules (separate column).
- **Safe as one PR or staged:** **Staged — three PRs** (harness+tests+CI → narrow-grant+shape-blocks
  → optional economy/low-stakes), because the OR-semantics trap means the blanket write must be
  removed in lockstep with the per-collection blocks, and a legal-record database warrants proving the
  golden-writer net is green *before* the rules flip. The CI wiring (PR 1) touches shared infra and
  needs home-base coordination first.
