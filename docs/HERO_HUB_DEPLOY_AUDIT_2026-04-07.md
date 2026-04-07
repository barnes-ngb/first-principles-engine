# Hero Hub Animation Deploy Audit — 2026-04-07

## Scope

Validated repository evidence for:

1. Merged Hero Hub animation guardrails/tuning work
2. Whether those commits are present in the branch available in this environment
3. Whether stronger follow-up work appears merged vs. potentially still open
4. Why live behavior can still look unchanged even when merged
5. Smallest high-impact next mobile-visible code tweak

## 1) Merged PRs/commits related to guardrails + tuning

From merge history and commit subjects:

- PR #921 → `f7339e5` — Tighten hero idle pose constraints and collision spacing
- PR #924 → `6cda108` — Tighten hero idle pose constraints to prevent self-clipping
- PR #925 → `f011bdf` — Add lightweight hero animation guardrails for stance and arm clearance
- PR #929 → `de1e6a2` — Refine Hero Hub idle motion for stronger silhouette and weight
- PR #933 → `cf7c614` — Add Hero Hub animation tuning config and debug controls
- PR #936 → `264d15d` — Tighten hero idle pose constraints to prevent self-clipping

These are all merged in local history and include updates in:

- `VoxelCharacter.tsx`
- `heroAnimationTuning.ts`
- `poseSystem.ts`
- plus debug panel/docs additions in PR #933

## 2) Are those commits present on production deploy branch?

### What is known from repo config

- Production deploy workflow triggers on pushes to `deploy` branch.

### What is known from local git state

- The current branch in this environment is `work` and already contains all commit SHAs listed above.

### What is unknown (cannot be proven from this environment alone)

- There is no configured git remote in `.git/config` and no local `deploy` ref is present.
- Therefore, we cannot directly verify whether remote `deploy` currently contains these SHAs.

## 3) Any stronger follow-up PRs still open and therefore not deployed?

Within local history, the strongest animation tightening appears to be PR #936 (`264d15d`) after #933 and #929.

However, open PR state is not derivable from this clone alone:

- remote metadata is unavailable here
- no origin configured
- no remote branch refs fetched

So: there may be open follow-ups, but this environment cannot confirm open-vs-merged status.

## 4) Why live behavior may still look almost unchanged

Even with merged code, defaults are intentionally conservative:

- docs explicitly describe conservative defaults for mobile stability
- idle amplitudes are low by design (small torso twist, head turn, foot sway/lift)
- constraints are guardrails/clamps (prevent worst cases) rather than dramatic pose restyling

Concretely in current defaults:

- `footSway: 0.006`, `footLift: 0.003` (very small visible movement)
- `torsoTwist: 0.03`, `headTurnAmount: 0.055` (subtle upper-body motion)
- arm constraints are mostly minimum-clearance clamps, so improvements are “absence of clipping” not stronger silhouette changes

Result: if prior behavior was already near constraints, viewers may perceive little visible change while collision edge-cases are reduced.

## 5) Smallest next code change for clearly visible mobile improvement

### Recommendation: increase baseline stance and hard foot spacing slightly

Single-file tweak in `heroAnimationTuning.ts` defaults:

- `stanceWidth`: `0.22 -> 0.25`
- `footSeparation`: `0.20 -> 0.23`
- optional micro-support: `footCenterLineGap`: `0.07 -> 0.085`

Why this is the smallest high-leverage change:

- Directly targets “feet stay separated” in idle + emote transitions.
- Produces a visibly wider, more heroic planted stance on mobile without changing animation architecture.
- Lower risk than increasing arm motion amplitudes (which can reintroduce torso clipping).

If only one line is allowed, change `footSeparation` first.

## Verification commands used

- `git log --oneline --decorate -n 30`
- `git log --oneline --decorate --merges --grep='hero-hub\|Hero Hub\|hero animation\|character animation' -n 20`
- `git show --stat --oneline <sha>` for the six SHAs above
- `sed -n` / `nl -ba` reads of deploy workflow and animation tuning source/docs
