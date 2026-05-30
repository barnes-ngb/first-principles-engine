# Shelly Portal — Context & Surface Recon

> **What this is:** a grounded, code-verified reference for the "Shelly Chat as Control Portal"
> build. The design brief (`docs/barnes-*-design.md`) was written against stale context
> (`MASTER_OUTLINE` v14 — see DOC-01). This doc corrects it against the *actual* current code so
> the portal extends what exists instead of rebuilding it.
> **Status:** read-only recon (2026-05-30). No code or data changed by this run.
> **Touches ledger:** ARCH-09, ARCH-10, TEST-01, ETHOS-01, FUNC-01/FUNC-02 (records findings only).
> **Scope note:** the app holds Lincoln's legal Missouri school record. `skillSnapshots`,
> `childSkillMaps`, hours, compliance and the XP ledger are authoritative truth surfaces —
> documented here, never touched by recon.

---

## 0. TL;DR — where the live code differs from the design brief

1. **FUNC-01 is already RESOLVED (decided 2026-05-30).** The brief's Step 7 says
   `docs/review/FUNC-01_source_of_truth_decision.md` does *not* exist and gates Tier C on writing
   it. **It exists** as `docs/review/DECISION_FUNC-01_source_of_truth.md`, adopts **Model 2
   (layered ownership + named write-through)**, and **green-lights the Tier C portal** with an
   explicit routing contract. The gate is open, not closed.
2. **The chat is NOT fed "only charter + childProfile."** That describes the generic `chat` task.
   The portal surface is the `shellyChat` task, which already pulls **14 context slices + 8
   supplemental queries** (full list in §1). The *only* Tier-A read gap is `childSkillMaps`.
3. **The "soft profile fields on `children`" that Tier B would edit mostly don't exist yet.**
   The `Child` type and the live children docs have **no** `motivators`, `interests`, `strengths`,
   `supports`, or `level band` fields, and there is **no profile-editor UI** that writes them.
   `supports` lives **only** on `skillSnapshots`. So the FUNC-01 authority table's "children owns
   motivators/supports/strengths/level band" is *aspirational* — those fields are unmodeled. This
   reshapes the Tier-B action surface (see §3 and §5).

Minor corrections: `useSkillMapWrite.ts` (named in the FUNC-01 decision) **does not exist** — the
real write paths are `useSkillMap.ts#updateNodeStatus` and `updateSkillMapFromFindings.ts`. The
ARCH-10 blanket write grant is at `firestore.rules:11-14`, **not** 29-31 (those are the
shellyChat-specific rules). `sanitizeAndParseJson` is **server-only** — there is no client copy.

**Is the brief's build sequence still correct as written? 🟡 Partly.** Read-context recon and the
extraction-plumbing reuse plan hold. But two premises are wrong: Tier C is *unblocked* (FUNC-01
resolved), and the Tier-B `editProfileField` action has *almost no real fields to edit* until a
profile schema + editor exist. Re-sequence accordingly (§5, §7).

---

## 1. Current read context (what works / what's missing)

### The `shellyChat` task→slices entry (`functions/src/ai/contextSlices.ts:67-72`)

```ts
shellyChat: [
  "charter", "childProfile", "engagement", "gradeResults",
  "recentEval", "sightWords", "weekFocus", "wordMastery", "workbookPaces",
  "skillSnapshot", "recentHistoryByDomain", "recentScans",
  "dayToday", "dadLabReports",
],
```

That is **14 shared slices**, assembled in parallel by `buildContextForTask`. On top of those,
`handleShellyChat` (`functions/src/ai/tasks/shellyChat.ts:253-300`) runs **8 supplemental
queries** in a `Promise.allSettled`:

| Supplemental | Source collection | Formatter |
|---|---|---|
| All children | `families/{fid}/children` | inline `ALL CHILDREN:` block |
| Disposition profile | `children/{childId}.dispositionCache` + `.dispositionOverrides` | `formatDispositionProfile` |
| Recent weekly reviews (≤5) | `weeklyReviews` where `childId==` | `formatRecentWeeklyReviews` |
| Conundrum title | `weeks/{weekId}.conundrum.title` | `formatConundrumTitle` |
| Completion patterns (14d) | `days` where `childId==`, `date>=` | inline `TEACHING REFLECTION DATA` |
| Conundrum responses | `artifacts` where `tags.domain=="conundrum"` | count line |
| Chapter responses (14d) | `chapterResponses` where `childId==` | count + books line |
| Recent teach-backs (14d) | `artifacts` where `tags.engineStage=="Explain"` | `formatRecentTeachBacks` |

### Tier-A reads that already work today ✅

- **Sight words** — `sightWords` slice (`loadSightWordSummary`).
- **Skill snapshot** — `skillSnapshot` slice (`loadSkillSnapshotContext`, `contextSlices.ts:822`):
  priority skills, supports, stop rules, conceptual blocks (ADDRESS_NOW / RESOLVING / DEFER),
  working levels, completed programs.
- **Supports / stop rules** — surfaced via the snapshot slice (they live on `skillSnapshots`).
- **Workbook / curriculum position** — `workbookPaces` + `activityConfigs` + `recentScans` slices.
- **Disposition, weekly-review trajectory, teach-backs, conundrum, day-today** — all present.

### Genuinely missing (Tier-A gap) ❌

- **`childSkillMaps` (the Learning Map / milestone-map node states)** is **not** in the slice list
  and is **not read by any AI task** (the FUNC-01 authority table confirms: "*not read directly by
  any AI task*"). The portal can already *talk about* working levels and snapshot skills, but it
  cannot see per-node curriculum coverage (`not-started` / `in-progress` / `mastered`).
  **This is the one confirmed Tier-A read gap** — matching the brief's hypothesis.

### Where to add the `childSkillMaps` read slice

- Add a `ChildSkillMap` member to the `ContextSlice` const (`contextSlices.ts:19-40`), add
  `"childSkillMap"` to the `shellyChat` array, register a `fetches.push({...})` + a format block in
  `buildContextForTask`, and write a `loadChildSkillMapContext(db, familyId, childId)` loader.
- **Closest template to copy:** `loadSkillSnapshotContext` (`contextSlices.ts:822-920`) — same
  shape: single doc keyed by `childId`, `if (!snap.exists) return ""`, build summary lines. The
  server loader must read the raw doc directly (the client `useSkillMap` hook and `CURRICULUM_MAPS`
  node catalog live in `src/core/curriculum/` and aren't importable from `functions/`), so it would
  summarize counts per domain + list ADDRESS-worthy `in-progress` nodes rather than re-derive the
  full graph.

---

## 2. Data shapes (exact field names — quoted from code)

### `childSkillMaps/{childId}` — Learning Map nodes
`src/core/curriculum/skillStatus.ts:19-38`, collection ref `firestore.ts:464-467`
(`childSkillMapsCollection`, **no converter** — raw cast).

```ts
interface SkillNodeStatus {
  nodeId: string          // e.g. 'reading.phonics.cvc'
  status: SkillStatus     // 'not-started' | 'in-progress' | 'mastered'
  source: 'manual' | 'evaluation' | 'program'
  updatedAt: string       // ISO
  notes?: string
}
interface ChildSkillMap {
  id?: string
  childId: string
  skills: Record<string, SkillNodeStatus>   // nodeId → status entry
  updatedAt: string
}
```
`SkillStatus = { NotStarted: 'not-started', InProgress: 'in-progress', Mastered: 'mastered' }`.
Writers: `useSkillMap.ts#updateNodeStatus` (`source: 'manual'` default, `setDoc(..., {merge:true})`),
`updateSkillMapFromFindings.ts` (`applyFindings` — **upgrade-only**, never downgrades),
`markProgramCompleteOnSkillMap`. **No `useSkillMapWrite.ts` exists** (FUNC-01 decision names a file
that isn't there).

### `sightWordProgress/{childId}_{word}` — sight words
Type `src/core/types/books.ts:374-389`. Collection ref `firestore.ts:360-365`
(`sightWordProgressCollection`, **no converter**). Doc ID helper:
`sightWordProgressDocId(childId, word)` → `${childId}_${word}` (word lowercased by callers).

```ts
interface SightWordProgress {
  word: string
  encounters: number
  selfReportedKnown: number
  helpRequested: number
  shellyConfirmed: boolean
  masteryLevel: 'new' | 'practicing' | 'familiar' | 'mastered'
  firstSeen: string
  lastSeen: string
  lastLevelChange: string
}
```
Writer: `src/features/books/useSightWordProgress.ts` — `recordInteraction` (encounter-driven, via
`recordEncounter`) and `confirmMastery` (parent confirm/unconfirm). **There is no "add a brand-new
word" UI** — words enter the store implicitly via reading encounters. `SightWordDashboard.tsx` only
calls `confirmMastery`.

### `skillSnapshots/{childId}` — current academic state (AUTHORITY)
Type `src/core/types/evaluation.ts:133-149`. Converter `firestore.ts:195-212`
(`skillSnapshotConverter`, `stripUndefined` on write, `id` injected on read). Doc ID = `childId`.

```ts
interface SkillSnapshot {
  id?: string
  childId: string
  prioritySkills: PrioritySkill[]        // { tag, label, level, notes?, masteryGate? }
  supports: SupportDefault[]             // { label, description }
  stopRules: StopRule[]                  // { label, trigger, action }
  evidenceDefinitions: EvidenceDefinition[]
  conceptualBlocks?: ConceptualBlock[]   // lifecycle ADDRESS_NOW→RESOLVING→RESOLVED, merge-by `id`
  blocksUpdatedAt?: string
  completedPrograms?: string[]
  workingLevels?: WorkingLevels          // { phonics?, comprehension?, math? } each { level, updatedAt, source, evidence? }
  createdAt?: string
  updatedAt?: string
}
```
`ConceptualBlock` (`evaluation.ts:67-106`) carries a stable `id?` (slugified skill name) for
merge-by-ID, plus `status?: ConceptualBlockStatus`, `recommendation: 'ADDRESS_NOW'|'DEFER'`,
`affectedSkills`, `rationale`, `evidence?`, `source?`, lifecycle timestamps. Snapshot page:
`src/features/evaluation/` (defaults in `lincolnDefaults.ts`).

### `children/{childId}` — child profile
Type `src/core/types/family.ts:14-29`. Collection ref `firestore.ts:101-102`
(`childrenCollection`, **no converter**).

```ts
interface Child {
  id: string
  name: string
  birthdate?: string
  grade?: string
  settings?: FamilySettings
  dayBlocks?: DayBlockType[]
  routineItems?: RoutineItemKey[]
  voiceInputEnhanced?: boolean
}
```
**The live docs carry ad-hoc fields beyond this type** (the cast is loose). Confirmed in code:
- `age`, `description`, `notes` — read by `shellyChat.ts:322-324` (`ALL CHILDREN:` block).
- `baselineReading`, `baselineMath` — written by `AddChildDialog.tsx:56-61`.
- `dispositionCache`, `dispositionOverrides` — written by `DispositionProfile.tsx` (derived cache).
- avatar-related fields — `AvatarAdminTab.tsx`.

There is **no editor** that writes `description`/`notes`/`grade` after creation — `AddChildDialog`
sets name/birthdate/baselines once; nothing edits them later. **No `motivators`/`interests`/
`strengths`/`supports`/`levelBand` field exists on the children doc anywhere.** (`interests` in
`chat.ts:1918` is derived/age-based for story generation, not a stored field.)

---

## 3. Tier B vs Tier C field boundary (the core safety spec)

The split is by **which document a field lives in**, not by name. This table is the validation spec
for `applyChatAction` — a Tier-B action must be *structurally incapable* of writing a Tier-C path.

| Field / concept | Lives on (exact path) | Tier | Writer today | Portal rule |
|---|---|---|---|---|
| `name` | `children/{childId}.name` | B | `AddChildDialog` | identity, human-confirm |
| `birthdate` / `age` | `children/{childId}.birthdate` (`age` ad-hoc) | B | `AddChildDialog` | identity, human-confirm |
| `grade` | `children/{childId}.grade` | B | (no live editor) | identity, human-confirm |
| `description` | `children/{childId}.description` | B | (no live editor; read only) | identity, human-confirm |
| `notes` | `children/{childId}.notes` | B | (no live editor; read only) | identity, human-confirm |
| `baselineReading` / `baselineMath` | `children/{childId}.baseline*` | B | `AddChildDialog` | identity, human-confirm |
| `voiceInputEnhanced` | `children/{childId}.voiceInputEnhanced` | B | `VoiceInputSection` | settings toggle |
| **`prioritySkills`** | **`skillSnapshots/{childId}.prioritySkills`** | **C** | Eval Apply / quest / snapshot page | snapshot-only, via central helper |
| **`supports`** | **`skillSnapshots/{childId}.supports`** | **C** | Eval Apply | snapshot-only |
| **`stopRules`** | **`skillSnapshots/{childId}.stopRules`** | **C** | Eval Apply | snapshot-only |
| **`conceptualBlocks`** | **`skillSnapshots/{childId}.conceptualBlocks`** | **C** | Eval / quest / scan | snapshot-only, merge-by-`id` |
| **`workingLevels`** | **`skillSnapshots/{childId}.workingLevels`** | **C** | quest / eval | snapshot-only |
| **`completedPrograms`** | **`skillSnapshots/{childId}.completedPrograms`** | **C** | eval / settings | snapshot-only |
| **node `status`** | **`childSkillMaps/{childId}.skills[nodeId].status`** | **C** | `updateSkillMapFromFindings` / `useSkillMap` | coverage-only, upgrade-only |
| curriculum position | `activityConfigs/{childId}.currentPosition` etc. | B* | planner setup / cert scan | position convenience (Tier B per FUNC-01) |
| `dispositionCache` / `dispositionOverrides` | `children/{childId}.dispositionCache` | — | `DispositionProfile` regen | **NEVER write** — offer "regenerate" |
| sight word mastery | `sightWordProgress/{id}.shellyConfirmed` / `.masteryLevel` | B | `useSightWordProgress` | via existing writer |

### ⚠️ The `supports` trap — resolved
The brief warns that a field named `supports` might appear on both a child doc and the snapshot. In
the **actual code, `supports` exists only on `skillSnapshots`** (`evaluation.ts:138`). Even the
"child profile" supports rendered into context come from the snapshot — `formatChildProfile` is
called with `supports: snapshotData?.supports` (`contextSlices.ts:333-336`), never from the children
doc. **Therefore `supports` is unambiguously Tier C.** A Tier-B `editProfileField` must reject
`field === 'supports'` (and `prioritySkills`, `stopRules`, `conceptualBlocks`, `workingLevels`,
`completedPrograms`) — these are snapshot paths. The allowlist approach (enumerate Tier-B fields,
reject everything else) is safer than a denylist here.

### Implication for the Tier-B action surface
Because no `motivators`/`interests`/`strengths`/`supports` field exists on `children`, the only
*real* Tier-B `editProfileField` targets today are `grade`, `description`, `notes`, `baselineReading`,
`baselineMath` — and none of those except baselines/name have an existing editor. **Either** the
portal build adds the profile schema + a write helper for these soft fields first, **or** the
initial portal ships Tier-A (read) + sight-word Tier-B only and defers `editProfileField`.

---

## 4. Structured-block extraction plumbing to reuse

The portal will have the AI emit `<action>{...json...}</action>` blocks. Three proven patterns
already exist; the new extractor should copy the closest one rather than invent parsing.

1. **`[FOLLOWUP]` line markers** — emitted in the shellyChat system prompt
   (`shellyChat.ts:457-462`), parsed client-side by **`parseFollowUps`**
   (`ShellyChatPage.tsx:378-396`). It splits on `\n`, matches `^\[FOLLOWUP\]\s*(.+)`, pushes matches
   to `followUps`, and **strips them from the rendered message** by collecting non-matching lines
   into `cleanText` (then `setFollowUps` / persist `cleanText`). This is the exact "extract a
   trailing structured block, render the rest clean" pattern the `<action>` UI needs — but it's
   line-based, not tag+JSON.
2. **`<finding>` / `<complete>` extraction (evaluation flow)** — client-side in
   `EvaluateChatPage.tsx`: **`extractFindings`** (`:64-83`, regex
   `/<finding>([\s\S]*?)<\/finding>/g` → `JSON.parse(match[1])` in a try/catch, skip unparseable),
   **`extractComplete`** (`:96-124`, single `<complete>` block), and **`stripTags`** (`:126-131`,
   removes both tag families before rendering). Findings populate a live panel
   (`setFindings(...)`); **`handleSaveAndApply`** (`:492-640`) is the "Apply to Skill Snapshot"
   button — it builds `prioritySkills`/`supports`/`stopRules`/`workingLevels`, then
   `setDoc(snapshotRef, JSON.parse(JSON.stringify(updated)), { merge: true })` and fires
   `updateSkillMapFromFindings`. **This is the closest analog to the portal's propose→confirm→write
   loop** and the model for tag-detect + JSON-parse + discriminated mapping.
3. **Robust JSON parsing** — `functions/src/ai/sanitizeJson.ts#sanitizeAndParseJson`: strip code
   fences → remove trailing commas → escape control chars in strings → `JSON.parse`. **It is
   server-only — there is no client copy** (`grep` confirms zero `src/` references). The current
   client JSON extraction is ad-hoc (`ShellyChatPage.tsx:741-744`, regex-grab `{...}` + bare
   `JSON.parse`; `EvaluateChatPage` uses bare `JSON.parse`).

### Cleanest reuse path (for a build prompt)
Tag-detect like `<finding>` (regex `/<action>([\s\S]*?)<\/action>/g`), JSON-parse each payload with
a **client port of `sanitizeAndParseJson`** (or a shared util moved to `src/core/utils/`), map onto
a discriminated-union `ChatAction` type, and strip the tags from the rendered text exactly as
`parseFollowUps`/`stripTags` do. **Files a build prompt would touch:**
`src/features/shelly-chat/` (new `parseChatActions.ts` + the extractor wired into `sendToAI`),
a shared `sanitizeJson` util (port from `functions/src/ai/sanitizeJson.ts`), and
`shellyChat.ts` (system-prompt addendum teaching the model the `<action>` grammar, mirroring the
`[FOLLOWUP]` instructions at `:457`).

---

## 5. `applyChatAction` shape + insertion points

### Current write surfaces to route through (do not bypass with fresh `setDoc`)
- **Sight words:** `useSightWordProgress` (`src/features/books/useSightWordProgress.ts`) —
  `recordInteraction` / `confirmMastery`, persisting via
  `setDoc(doc(sightWordProgressCollection(familyId), sightWordProgressDocId(childId, word)), updated)`.
  Note: **no add-new-word writer exists** — an `addSightWord` action would need a new helper
  (seed a `SightWordProgress` doc with `masteryLevel:'new'`, `encounters:0`, timestamps) added
  alongside `recordInteraction`, ideally exported from `useSightWordProgress` so the dashboard and
  portal share one writer.
- **Soft profile fields:** **no editor exists.** `AddChildDialog.tsx:65` (`addDoc`) is creation-only.
  An `editProfileField` action needs a new `updateDoc(doc(childrenCollection(fid), childId), {...})`
  helper — there is nothing to "route through" yet.
- **Skill snapshot (Tier C, gated):** `EvaluateChatPage.handleSaveAndApply` is the live writer; the
  FUNC-01 decision (implied change #2) wants a single `skillSnapshotWrites.ts` chokepoint before any
  portal writes here.

### Proposed module (ARCH-09)
Create `src/features/shelly-chat/useShellyChatActions.ts` exposing `applyChatAction(action)` over a
discriminated union. **Tier A+B only** (Tier C waits on the `skillSnapshotWrites.ts` chokepoint):

```ts
type ChatAction =
  | { kind: 'addSightWord';    childId: string; word: string }
  | { kind: 'removeSightWord'; childId: string; word: string }
  | { kind: 'editProfileField'; childId: string;
      field: 'grade' | 'description' | 'notes' | 'baselineReading' | 'baselineMath';
      value: string }
```
- `field` is an **allowlist** — anything not listed (esp. `supports`, `prioritySkills`, `stopRules`,
  `conceptualBlocks`, `workingLevels`, `completedPrograms`, any `skillSnapshots`/`childSkillMaps`
  path) is rejected before the write. This is the structural guarantee from §3.
- Every action is **propose → human-confirm → write** (matches the home-base "propose-and-stop"
  rule for anything touching a child's record).
- **Do not include** `dispositionCache` edits (offer "regenerate") or Milestones (computed). Do not
  include Tier-C snapshot actions in this first module.

---

## 6. ARCH-09 decomposition seams + ARCH-10 note

### ARCH-09 — `ShellyChatPage.tsx` (~1,653L, 23+ `useState`)
Clean extraction seams:
- **`useShellyChatState`** — thread/message/image state: `threads`, `activeThreadId`, `messages`,
  `input`, `sending`, `drawerOpen`, the whole image-generation/upload/refinement cluster
  (`uploadPreview`, `pendingAttachment`, `pendingReferenceImage`, `imageFlow*`, `imageQuestions`,
  `imageAnswers`) and the thread CRUD callbacks (`handleNewThread`, `handleSelectThread`,
  `handleArchiveThread`, `handleRenameThread`). Self-contained; ~half the file.
- **`useShellyChatActions`** — the **new** propose/confirm/write layer (§5). It consumes the parsed
  `<action>` blocks from `sendToAI` and owns the confirm UI state. It does not touch image state.
- The `parseFollowUps` parser (`:378`) and a new `parseChatActions` belong in small sibling modules
  so they're unit-testable without the component.

### TEST-01 — first tests to add
`src/features/shelly-chat/` has **0 test files** (confirmed: only `ChatMessageBubble.tsx`,
`ChatThreadDrawer.tsx`, `ShellyChatPage.tsx`, `formatRelativeTime.ts`, `openChatWithContext.ts`,
`index.ts`). (The `shellyChat.test.ts` that exists is **server-side**,
`functions/src/ai/tasks/shellyChat.test.ts`, 424L — it covers the formatters, not the client.)
First client tests:
1. **`parseChatActions.test.ts`** — action-block extraction: valid `<action>` → typed action;
   malformed JSON → skipped (no throw); tags stripped from clean text; multiple blocks; Tier-C field
   rejected by the allowlist.
2. **`useShellyChatActions.logic.test.ts`** — `applyChatAction` routing: `addSightWord` →
   sight-word writer; `editProfileField` with disallowed `field` → rejected before any write;
   confirm-gating.

### ARCH-10 — `firestore.rules`
The blanket family write grant (`firestore.rules:11-14`):
```
match /families/{familyId}/{document=**} {
  allow read, write: if request.auth != null
                     && request.auth.uid == familyId;
}
```
(The brief's "~lines 29-31" actually points at the *shellyChat-specific* rules at `:28-32`.) There
is **no field-level validation** — any authenticated family member (including a kid tablet session)
can write `hours`, `xpLedger`, `evaluations`, `skillSnapshots`. A write-capable parent chat is **no
more dangerous than the current app** under these rules (everything is already writable), but it is
also **not protected** by them. The tightening that should pair with a write portal: scope writes by
collection (e.g. compliance/`hours`/`xpLedger`/`skillSnapshots` write-guarded) and validate the
shape of `skillSnapshots`/`childSkillMaps` writes. **Recorded as a note — rules not edited here.**

---

## 7. FUNC-01 gate status (corrects the brief)

The brief gates Tier C on a decision doc it says is missing. **The decision is made.**
`docs/review/DECISION_FUNC-01_source_of_truth.md` (Status: RESOLVED-WITH-DECISION, 2026-05-30)
adopts **Model 2 — layered ownership with named write-through** and **green-lights Tier C** with
this routing contract:

- **Identity edits** (strengths, motivators, supports, level band) → `children/{childId}`,
  human-confirmed. *(Caveat from §3: these fields are not yet modeled — schema work precedes this.)*
- **"What to teach next" / blocks / supports / stop rules** → `skillSnapshots/{childId}`, **only via
  `skillSnapshotWrites.ts`** (the chokepoint doesn't exist yet — FUNC-01 implied change #2 / the
  FUNC-02 build prompt creates it), human-confirmed.
- **Curriculum position** ("we're on lesson N") → `activityConfigs/{childId}` (Tier B convenience).
- **Never** write `dispositionCache` (derived — offer "regenerate") or Milestones (computed).

The "6 overlapping truth surfaces" named in `first-principles-system-review.md` (Skill Snapshot,
Ladders, Milestones, Learning Map, Curriculum position, Disposition) are exactly what FUNC-01
reconciles; that reconciliation is the authority table in the decision doc (§"Authority table").
**Tier C is unblocked**, but its safe landing depends on two prerequisites that are still open:
(a) the `skillSnapshotWrites.ts` central writer (FUNC-02 build prompt, green-lit, not yet built),
and (b) a `children` profile schema for the soft identity fields it claims to own.

---

## 8. Recommended build sequence (grounded)

1. **Tier-A read gap** — add the `childSkillMaps` slice to `shellyChat` (copy
   `loadSkillSnapshotContext`). Smallest, safest, immediately useful. *(New ledger follow-on; see
   §9.)*
2. **Extraction plumbing** — port `sanitizeAndParseJson` to a shared util; add `parseChatActions` +
   tests (mirrors `extractFindings`/`parseFollowUps`).
3. **Tier-B sight words** — add an `addSightWord` writer to `useSightWordProgress`; wire
   `applyChatAction` for `add/removeSightWord` behind human-confirm.
4. **Tier-B profile fields** — only after a `children` soft-field schema + write helper exist;
   allowlist-validated `editProfileField`.
5. **Tier-C** — after `skillSnapshotWrites.ts` (FUNC-02) lands; route snapshot edits through it,
   human-confirmed, never touching `dispositionCache` or Milestones.

---

## 9. Ledger note

This recon produced one genuinely new, small finding worth a ledger row: **the `childSkillMaps`
Tier-A read gap** (the Learning Map is invisible to every AI task, including `shellyChat`). It's a
narrow `FUNC` follow-on to FUNC-01's authority table ("not read directly by any AI task"). Proposed:
**FUNC-03 — add `childSkillMaps` read slice to AI context (shellyChat first)**, Band 2, OPEN.
ARCH-09 / TEST-01 / ETHOS-01 notes should point at this doc for the Shelly-portal specifics.
</content>
</invoke>
