# Learning Map "Missing-but-Learned" — Diagnosis

> **What this is:** a read-only diagnosis of why Lincoln's Learning Map (Progress → learning-map) shows skills
> he has demonstrably learned as "Not Started"/"Working On". No code or behavior changed by this write-up; it
> inspects and reports, and proposes the fix for a later run.
> **Created:** 2026-06-20 · **Companion to:** the eventual fix run; `docs/review/REVIEW_HOME_BASE.md` (ledger).
> **Lens:** no-shame / coverage-not-pace — the map must never under-credit what a child has truly covered.

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
1. **(Primary) Working levels never reach the map.** Zero `workingLevel` references in
   `src/core/curriculum/`. Lincoln's climb through quest/Knowledge-Mine levels
   (`skillSnapshot.workingLevels.{phonics,comprehension,math,writing,sentence}`) is his strongest mastery
   signal and is invisible here. At working level N, levels 1..N-1 are demonstrably past but never marked →
   "missing-but-learned."
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
