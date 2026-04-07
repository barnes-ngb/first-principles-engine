# Hero Hub Animation Tuning (Debug Workflow)

## Where values live
All core Hero Hub motion values are now centralized in:
- `src/features/avatar/voxel/heroAnimationConfig.ts`

Use `HERO_ANIMATION_DEFAULTS` for conservative production defaults and `resolveHeroAnimationConfig(...)` for any runtime override merge.

## Temporary debug controls
Enable in Hero Hub with query param:
- `?heroAnimDebug=1`

When enabled, the single-character view shows a compact debug slider panel (temporary) in `AvatarCharacterDisplay`.

## Most important collision / clipping parameters

### Foot collision prevention
1. `footSeparationMin` (strongest)
   - Enforces minimum left-right spacing at runtime.
   - Increase first if boots overlap in idle/emotes.
2. `stanceWidth`
   - Sets authored neutral leg placement from build step.
   - Increase if character feels narrow/unstable.
3. `footSway`
   - Side-to-side idle foot motion amount.
   - Too high can re-introduce visual crossing pressure.
4. `footLift`
   - Vertical lift in idle micro-motion.
   - Keep subtle on mobile for stable silhouette.

### Arm-to-body clipping prevention
1. `handToTorsoClearance` (strongest)
   - Hard minimum outward clearance to keep hands/forearms off torso.
2. `elbowOutBias`
   - Additional outward set bias for heroic profile.
3. `torsoAvoidanceGain`
   - Adds extra outward push when arm rotates toward torso-risk angles.
4. `shoulderSwing`
   - Idle shoulder lateral sway amplitude.
   - Excess values can cause occasional torso intersection in transitions.
5. `emoteIntensity`
   - Scales expression and emote punch globally.
   - Raise carefully; too high can increase clipping risk in aggressive poses.

## Defaults philosophy
Current defaults are intentionally conservative for mobile readability:
- Stable, broad stance
- Subtle foot and torso motion
- Outward-biased arm constraints
- Slightly reduced emote amplitude (`emoteIntensity: 0.9`)

