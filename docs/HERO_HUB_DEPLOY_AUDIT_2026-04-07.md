# Hero Hub Animation Deploy Audit — 2026-04-07

## Request

Validate whether merged Hero Hub animation guardrails/tuning are actually in production, and explain why live behavior may still look unchanged.

## 1) Exact merged PRs/commits for guardrails + tuning

From git merge history (`git log --merges --grep='Hero Hub|hero|animation'`) and merge parent SHAs:

| PR | Merge commit | PR head commit | Focus |
|---|---|---|---|
| #921 | `198d0a9` | `f7339e5` | first pass tightening idle pose + collision spacing |
| #924 | `cd40494` | `6cda108` | tighten self-clipping constraints |
| #925 | `1663925` | `f011bdf` | explicit animation guardrails for stance + arm clearance |
| #929 | `cfd5b0e` | `de1e6a2` | idle motion refinement for stronger silhouette/weight |
| #933 | `2c5d2b7` | `cf7c614` | centralized animation tuning config + debug controls |
| #936 | `33220ec` | `264d15d` | additional self-clipping constraint tightening |

These changes land mainly in:

- `src/features/avatar/VoxelCharacter.tsx`
- `src/features/avatar/voxel/heroAnimationTuning.ts`
- `docs/HERO_HUB_ANIMATION_TUNING.md`

## 2) Are those commits present on production deploy branch?

### Confirmed

- Production deploy workflow runs on pushes to `deploy` branch (`.github/workflows/deploy.yml`).
- All of the PR commits listed above are present in this local branch history (`work`).

### Not provable from this environment

- `.git/config` has no remote configured, and no local `deploy` ref is available.
- Outbound GitHub API checks are blocked in this runtime (HTTP 403 tunnel/egress failure), so remote `deploy` HEAD cannot be queried.

**Conclusion:** The fixes are definitely merged into this checked-out history, but I cannot conclusively prove the currently deployed production commit SHA from this environment alone.

## 3) Are stronger follow-up PRs still open and not deployed?

### What local evidence shows

- The latest merged Hero Hub animation tightening in history is PR #936 (`264d15d`) after the tuning-system PR #933.
- There is also an audit merge PR #940 (`79cf40d`) but that is reporting/validation work, not stronger animation behavior changes.

### What cannot be confirmed here

- Open PR state (merged vs open) requires remote GitHub metadata.
- Because this clone has no remote and egress is blocked, open follow-up PRs cannot be authoritatively enumerated.

## 4) Why it can still look unchanged even when merged

The current defaults are conservative by design (stability-first), so visual delta can be subtle:

- Feet motion amplitudes are small (`footSway: 0.006`, `footLift: 0.003`).
- Torso/head motion remains subtle (`torsoTwist: 0.03`, `headTurnAmount: 0.055`).
- Most arm improvements are guardrail clamps preventing bad poses, which are mostly seen as “absence of clipping,” not dramatic new motion.

So users may perceive “no big change” unless they compare side-by-side or hit previous edge cases (crossed feet / arm-in-torso moments).

## 5) Smallest next code change for a clearly visible mobile improvement

Recommended minimal default-tuning tweak (single file):

- `stanceWidth: 0.22 -> 0.25`
- `footSeparation: 0.20 -> 0.23`
- optional: `footCenterLineGap: 0.07 -> 0.085`

Why this is the smallest high-impact move:

- Directly addresses feet staying separated in idle + emote transitions.
- Creates a visibly more planted/heroic base on small screens.
- Much lower regression risk than increasing arm swing amplitudes (which can reintroduce torso clipping).

If only one line is allowed, increase `footSeparation` first.

## Commands run

- `git status -sb`
- `git branch -vv`
- `git log --oneline -n 20`
- `git log --oneline --decorate --merges --grep='Hero Hub\|hero\|animation' -n 30`
- `for m in ...; git show -s --pretty=format:'...'; done`
- `sed -n '1,220p' .github/workflows/deploy.yml`
- `cat .git/config`
- `curl -I https://api.github.com -m 15` (failed due egress restriction)
