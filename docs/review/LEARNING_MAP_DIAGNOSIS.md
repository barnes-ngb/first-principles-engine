# Learning Map "Missing-but-Learned" — Diagnosis

> **What this is:** a read-only diagnosis of why Lincoln's Learning Map (Progress → learning-map) shows skills
> he has demonstrably learned as "Not Started"/"Working On". No code or behavior changed by this write-up; it
> inspects and reports, and proposes the fix for a later run.
> **Created:** 2026-06-20 · **Companion to:** the eventual fix run; `docs/review/REVIEW_HOME_BASE.md` (ledger).
> **Lens:** no-shame / coverage-not-pace — the map must never under-credit what a child has truly covered.
>
> **STATUS: FULLY RESOLVED (FEAT-35 chunk 1 + FEAT-36 chunk 2).** All three "learned" signals now feed the
> re-derivation engine: **working levels + completed programs** (FEAT-35), and **sight-word list mastery +
> snapshot priority-skill mastery** (FEAT-36) — upgrade-only, manual-frozen, persist-delta, per-child clean.

## TL;DR
The map is fed only by per-skill *findings* (eval/quest/scan/capture) plus a one-time init. It **never reads
working levels**, where most of Lincoln's "I'm past this" signal lives. So skills below his current working
level stay unmarked and read as missing. The fix reuses maps that already exist.

## How the map is fed (today)
- Stored per-child doc `childSkillMaps/{childId}` (`skillStatus.ts`: `ChildSkillMap`,
  `SkillNodeStatus{ status, source: manual|evaluation|program }`).
- `useSkillMap.ts`: on first load with no doc, calls `initializeSkillMapFromHistory` **once**
  (`useSkillMap.ts:50`); thereafter status changes only via `updateNodeStatus` (default `manual`,
  `useSkillMap.ts:88`) or `updateSkillMapFromFindings`. `getNodeStatus` returns the stored entry
  (`useSkillMap.ts:77`); UI defaults missing → Not Started. `domainSummaries` counts per domain
  (`useSkillMap.ts:116`).
- `updateSkillMapFromFindings.ts`: maps each finding → node (`mapFindingToNode`), converts status
  (`findingStatusToSkillStatus`), **upgrade-only** (mastered > in-progress > not-started, `applyFindings`
  at `updateSkillMapFromFindings.ts:23`). Wired at `EvaluateChatPage.tsx:619` (fire-and-forget),
  `useQuestSession.ts:1159` (fire-and-forget), `CertificateScanSection.tsx:74` (await),
  `CurriculumTab.tsx:274` (await), `useUnifiedCapture.ts:118` (await), and `TodayPage.tsx:569` (await).
- `initializeSkillMapFromHistory` (one-time, `updateSkillMapFromFindings.ts:102`): reads **eval-session
  findings** + skill-snapshot **completedPrograms** only.

## The bug — root causes
1. **(Primary) Working levels never reach the map. — RESOLVED by FEAT-35 (chunk 1).** Zero `workingLevel`
   references in `src/core/curriculum/`. Lincoln's climb through quest/Knowledge-Mine levels
   (`skillSnapshot.workingLevels.{phonics,comprehension,math,writing,sentence}`) is his strongest mastery
   signal and was invisible here. At working level N, levels 1..N-1 are demonstrably past but were never
   marked → "missing-but-learned." **Fixed** by the re-derivation engine
   (`src/core/curriculum/deriveWorkingLevelMastery.ts`) + the self-healing pass on every map load in
   `useSkillMap.ts`: working levels (and `completedPrograms`) now fold into the map as implied mastery,
   upgrade-only, manual-frozen, persist-delta. The **sight-word + snapshot priority-skill mastery** inputs
   were added in the **chunk-2 follow-up (FEAT-36)** on the same terms — all three learned signals now feed
   the map (see "Chunk-2 follow-up — DONE" below).
2. **"Mastered" findings are rare.** Quest/eval mostly emit frontier findings (emerging/not-yet →
   "Working On" via `findingStatusToSkillStatus`); skills rarely flip to "Mastered" unless explicitly checked
   off. The map under-reports systematically.
3. **The build is one-time and frozen.** `initializeSkillMapFromHistory` runs only when the doc is absent and
   never reads working levels, so the map can't self-heal to current reality.
4. **(Minor) Fire-and-forget writes.** eval + quest call the sync un-awaited; the read-modify-write can drop a
   concurrent same-node upgrade. Low impact vs (1)–(3).

## The fix (proposed — for a later run)
The bridge already exists in `src/features/quest/workingLevels.ts`: per-domain **skill-tag → level** maps
(`PHONICS_SKILL_LEVEL_MAP`, `COMPREHENSION_SKILL_LEVEL_MAP`, `MATH_SKILL_LEVEL_MAP`, `WRITING_SKILL_LEVEL_MAP`,
`SENTENCE_SKILL_LEVEL_MAP` — each `Record<string, number>`), and `mapFindingToNode` turns tags → nodes. So
implied mastery derives with **no new taxonomy** by *inverting* those maps:
- For each domain, given `workingLevels.{domain} = N`: take every skill-tag whose mapped level is `< N`, run it
  through `mapFindingToNode` → node, and mark those nodes **Mastered**; tags at level `N` → **Working On**.
- Wrap into a **re-derivation pass on map load** that folds working levels + eval/session findings + completed
  programs (+ optionally snapshot priority-skill mastery), **upgrade-only**, and **never overrides a manual
  mark** (manual stays authoritative). Self-healing — reflects current state on every load.

### Scope options for the fix run
- **A (targeted, recommended):** working-levels → implied mastery + re-derive on load; upgrade-only; manual
  wins. Fixes the core bug with low risk by reusing existing maps. Optionally `await` the two fire-and-forget
  calls (trivial).
- **B (fuller):** A + fold snapshot priority-skill mastery gates into the derivation + a visible "unmapped
  findings / refresh map" diagnostic so silent gaps surface.

### Guardrails for the fix
- Read-only consumer of `workingLevels` / `skillSnapshot` — do **not** write them or change quest finding
  emission.
- Upgrade-only; never downgrade; **manual marks are authoritative** and untouched.
- Per-child clean (no name/`isLincoln`) — the same derivation lights up London's map once he has working levels.

### Verify-in-fix (resolved during this diagnosis; re-confirm at fix time)
- **Domain coverage is partial — by design, handle the gap.** The map's four domains are
  `reading` / `math` / `speech` / `writing` (`curriculumMap.ts`). Working levels cover **reading** (via
  `phonics` + `comprehension`), **math**, and **writing** (via `writing`/spelling + `sentence`) — but there is
  **no speech working level** (`WorkingLevels` in `core/types/evaluation.ts` has no `speech` field). So speech
  must **fall back to findings-only** (no regression), and reading is fed by *two* working levels that both
  derive into reading nodes.
- Confirm the level→node ordering aligns with the curriculum node order per domain (the tag→level maps are
  approximate/substring-matched; inverting them must not assert mastery a node ordering would contradict).

### Tag-resolution recon (FEAT-35) — which of the 5 maps' tags resolve via `mapFindingToNode`
Confirmed at fix time by routing every tag in the five maps through `mapFindingToNode`:
- **Many tags resolve cleanly** to the expected domain node (e.g. phonics `cvc`→`reading.phonics.cvc`,
  math `counting`→`math.number.counting`, all sentence tags→`writing.composition.sentence`).
- **Some tags don't resolve at all** (return `null`) — e.g. phonics `letter-recognition`/`short-vowel`/
  `silent-e`/`diphthong*`/`le-ending*`/`final-stable`; most comprehension tags (`literal-recall`/`recall`/
  `sequencing`/`character`/`cause-effect`/`compare-contrast`/`theme`/`critical-thinking`/`evaluation`/
  `synthesis`); several math tags (`number-sense`/`doubles`/`making-10`/`fact-family`/`borrowing`/…); writing
  `phonetic`/`conventional`. These simply **contribute nothing** to the derivation (safe, additive) — the
  node still gets covered when a *lower* resolving tag in the same key implies it mastered.
- **One genuine cross-domain mismapping:** math `multiplication.fluency` (L8) substring-matches `…fluency`
  → `reading.fluency.accuracy`. FEAT-35's **per-key domain guard** drops this (the `math` key only permits
  `math` nodes), so a math-8 child never lights a reading-fluency node. The spelling (`writing`) key
  deliberately permits both `reading`+`writing` (spelling a CVC implies decoding it).

### Chunk-2 follow-up — DONE (FEAT-36)
Sight-word mastery (`sightWordProgress`) and snapshot **priority-skill** mastery gates folded into the same
re-derivation engine (Option B's signal-folding), on the chunk-1 terms (upgrade-only, manual-freeze,
persist-delta, read-only, per-child clean):
- **Sight words → `reading.phonics.sightWords`.** `deriveSightWordMastery` reads the child's active
  `sightWordProgress` list: mastered share `>= SIGHT_WORD_MASTERED_THRESHOLD` (proposed **0.8 / 80%**) →
  node **Mastered**; else `>= SIGHT_WORD_INPROGRESS_MIN` (proposed **1**) word past `new` → **InProgress**;
  empty/all-`new` list → nothing. **Both thresholds are named, exported consts flagged for Nathan to tune.**
- **Snapshot priority skills → mapped nodes.** `deriveSnapshotPrioritySkillMastery` marks every priority skill
  at the top mastery gate (`MasteryGate.IndependentConsistent` = 3) **Mastered**, routing its tag via
  `mapFindingToNode` (tags resolving to no node contribute nothing).
- Both are stamped `source: 'evaluation'`, fold in via `applyReDerivedMastery` (Mastered-wins on node
  collision), and `useSkillMap` reads the sight-word list + snapshot priority skills read-only (never writes
  `sightWordProgress`/snapshot). Speech still falls back to findings-only (no working/sight-word/priority
  signal). **All three learned signals now feed the map — this diagnosis is fully resolved.**
