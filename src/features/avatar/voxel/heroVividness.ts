// ── Hero Hub vividness tuning ────────────────────────────────────────
//
// ONE place to dial the Minecraft-Legends "heroic" look up or down. This is
// pure data (no THREE imports) so both the material layer (`tierMaterials.ts`)
// and the scene layer (`VoxelCharacter.tsx` lighting / sword / glow) read the
// same source. Tune — or fully dial back to the old flat look — here without
// touching any scene code:
//
//   • material.saturationBoost = 0, material.emissiveBoost = 1,
//     material.specularBoost = 0, every tierTint entry = {0,0,0}  → original
//     flat armor materials.
//   • set each lighting intensity back to the pre-Legends values to restore the
//     old, softer lighting.
//
// Per-tier BASE colors still live in `TIER_MATERIALS` (tierMaterials.ts) — that
// is each tier's identity palette. The `tierTint` map below is the heroic
// *vividness* nudge layered on top of those base colors (HSL saturate/lighten +
// an emissive accent for the "lit from within" look on higher tiers).

export interface HeroLightSpec {
  /** Hex color, e.g. 0xFFF1DC */
  color: number
  intensity: number
}

export interface HeroLightingSet {
  key: HeroLightSpec
  fill: HeroLightSpec
  rim: HeroLightSpec
  ambient: HeroLightSpec
  bounce: HeroLightSpec
}

export interface HeroTierTint {
  /** HSL saturation added to armor colors for this tier (0..1). */
  saturate: number
  /** HSL lightness added to armor colors for this tier (-1..1). */
  lighten: number
  /** Emissive intensity added on top of the tier's base emissive (lit look). */
  emissive: number
}

export const HERO_VIVIDNESS = {
  /** Global material punch applied on top of every tier's base palette. */
  material: {
    /** Global HSL saturation lift on armor primary/secondary/accent colors. */
    saturationBoost: 0.1,
    /** Multiplier on the combined (base + per-tier) emissive intensity. */
    emissiveBoost: 1.5,
    /** Fraction toward white added to specular for crisper hero highlights (0..1). */
    specularBoost: 0.18,
    /** Per-face brightness jitter range — keeps the blocky, layered read. */
    faceVariation: 0.12,
  },

  /**
   * Heroic per-tier tint layered on the TIER_MATERIALS base colors.
   * Higher tiers read richer and glow more; Wood/Stone stay grounded and matte.
   */
  tierTint: {
    wood: { saturate: 0.06, lighten: 0.02, emissive: 0 },
    stone: { saturate: 0.05, lighten: 0.03, emissive: 0 },
    iron: { saturate: 0.08, lighten: 0.04, emissive: 0.05 },
    gold: { saturate: 0.14, lighten: 0.03, emissive: 0.16 },
    diamond: { saturate: 0.16, lighten: 0.05, emissive: 0.3 },
    netherite: { saturate: 0.12, lighten: 0.0, emissive: 0.24 },
  } as Record<string, HeroTierTint>,

  /**
   * Night scene lighting — stronger warm key + cool rim for heroic edge
   * contrast (warm/cool split is the Legends signature).
   */
  nightLighting: {
    key: { color: 0xfff1dc, intensity: 1.35 },
    fill: { color: 0xb8ceea, intensity: 0.32 },
    rim: { color: 0x9fd0ff, intensity: 1.05 },
    ambient: { color: 0xffffff, intensity: 0.3 },
    bounce: { color: 0xffe3c8, intensity: 0.14 },
  } as HeroLightingSet,

  /** Room scene lighting — cozy, warmer, lower-contrast. */
  roomLighting: {
    key: { color: 0xfff1d8, intensity: 1.0 },
    fill: { color: 0xffe2c2, intensity: 0.3 },
    rim: { color: 0xffd0a0, intensity: 0.55 },
    ambient: { color: 0xffffff, intensity: 0.4 },
    // Room mode reuses the night bounce light (no dedicated bounce); kept for
    // type symmetry so callers can read one shape.
    bounce: { color: 0xffe3c8, intensity: 0.1 },
  } as HeroLightingSet,

  /** Enchantment aura (Iron+) pulse — see enchantmentGlow.ts. */
  glow: {
    baseOpacity: 0.08,
    pulseAmplitude: 0.22,
    /** Aura shell scale relative to the source mesh. */
    scale: 1.1,
  },

  /** Sword blade ("Word of God") emissive pulse — the special blue beat. */
  sword: {
    baseEmissive: 0.42,
    pulseAmplitude: 0.22,
    /** Point-light glow at the blade. */
    lightBase: 0.7,
    lightAmplitude: 0.35,
  },

  /** Background / platform atmosphere. */
  atmosphere: {
    /** Backdrop gradient (top→bottom) behind the night terrain. */
    skyTop: 0x141430,
    skyBottom: 0x2a2348,
    /** Moon glow halo opacity. */
    moonGlowOpacity: 0.22,
    /** Tier-tinted platform front-edge glow opacity. */
    platformEdgeOpacity: 0.7,
  },
} as const

/** Resolve the heroic tint for a tier tint key (wood/stone/…); safe fallback. */
export function getHeroTierTint(tintKey: string): HeroTierTint {
  return HERO_VIVIDNESS.tierTint[tintKey] ?? { saturate: 0, lighten: 0, emissive: 0 }
}
