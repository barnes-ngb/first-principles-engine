# Hero Hub Animation Tuning (Debug Workflow)

## Quick debug mode

Use `?heroDebug=1` on the Hero Hub URL to enable the temporary tuning panel.

Example:

- `/avatar?heroDebug=1`

The panel exposes the primary hero-motion controls in one place and applies changes live.

## Centralized config

All default animation tuning values now live in:

- `src/features/avatar/voxel/heroAnimationTuning.ts`

This includes:

- stance/feet controls
- torso + shoulder motion controls
- arm clearance guardrails
- head turn amount
- emote intensity
- slider metadata for debug controls

## Highest-impact parameters

### Foot collision prevention (idle + common emotes)

1. `footSeparation` (hard minimum spacing)
2. `stanceWidth` (baseline width)
3. `footSway` (sideways drift amount)
4. `footLift` (vertical pickup, helps avoid visual overlap)

### Arm clipping prevention (arms into torso)

1. `torsoClearance` (minimum hand/forearm distance from torso)
2. `elbowOutBias` (forces elbow silhouette outward)
3. `shoulderSwing` (if too high, can push paths toward limits)

Guardrails in the same config still clamp risky arm ranges per side.

## Conservative defaults

Defaults are intentionally moderate so the character remains stable/heroic on mobile:

- limited torso twist
- small head turn
- low foot lift + sway
- collision-first arm spacing
- emote intensity at `1.0` (no extra exaggeration)
