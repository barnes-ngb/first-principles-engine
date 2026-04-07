# Hero Hub Animation Tuning Guide

All core Hero Hub motion tuning lives in `heroAnimationTuning.ts`.

## Quick debug workflow

1. Open Hero Hub with `?heroDebug=1` once.
2. A temporary **Hero Anim Debug** slider panel appears over the character preview.
3. Slider changes update live and persist in `localStorage` (`heroHubAnimationTuning`).
4. To return to conservative defaults, clear local storage for:
   - `heroHubAnimationDebug`
   - `heroHubAnimationTuning`

## High-impact parameters

### Most important for foot collision

- `stanceWidth`
  - Base leg placement at build time. Increase first if feet feel crowded.
- `footSeparation`
  - Runtime minimum gap. Hard floor against feet intersecting during idle sway.
- `footCenterLineGap`
  - Secondary guardrail that keeps each leg on its own side of center.
- `footSway`
  - Lateral motion amplitude; lower this before reducing separation.
- `footLift`
  - Vertical micro-lift; subtle value keeps a grounded heroic read.

### Most important for arm clipping into torso

- `elbowOutBias`
  - Primary outward bias for both idle and emote paths.
- `handToTorsoClearance`
  - Minimum torso clearance contribution used by arm constraints.
- `guardrails.armBySide.*.rotZMin`
  - Hard lower bounds for arm outward rotation.
- `guardrails.torsoSoftCollision.*`
  - Adds extra outward push when arms swing forward.
- `emoteIntensity`
  - Scales non-idle keyframes. Keep near `1.0` for clean clipping behavior.

## Conservative defaults philosophy

Current defaults favor:

- stable, planted feet
- clear arm silhouettes
- subtle head/torso motion readable on mobile
- low-risk emote amplitude for armor and accessory combinations
