import { describe, it, expect } from 'vitest'
import * as THREE from 'three'

import { HERO_VIVIDNESS, getHeroTierTint } from './heroVividness'
import { buildTierMaterial, TIER_MATERIALS } from './tierMaterials'

describe('HERO_VIVIDNESS tuning object', () => {
  it('defines a heroic tint for every tier tint key in TIER_MATERIALS', () => {
    for (const tintKey of Object.keys(TIER_MATERIALS)) {
      expect(HERO_VIVIDNESS.tierTint[tintKey]).toBeDefined()
    }
  })

  it('provides night and room lighting sets with all five lights', () => {
    for (const set of [HERO_VIVIDNESS.nightLighting, HERO_VIVIDNESS.roomLighting]) {
      for (const light of ['key', 'fill', 'rim', 'ambient', 'bounce'] as const) {
        expect(set[light].intensity).toBeGreaterThanOrEqual(0)
        expect(typeof set[light].color).toBe('number')
      }
    }
  })

  it('higher tiers carry more emissive than grounded ones (heroic glow ramp)', () => {
    expect(HERO_VIVIDNESS.tierTint.diamond.emissive).toBeGreaterThan(HERO_VIVIDNESS.tierTint.iron.emissive)
    expect(HERO_VIVIDNESS.tierTint.gold.emissive).toBeGreaterThan(HERO_VIVIDNESS.tierTint.stone.emissive)
    expect(HERO_VIVIDNESS.tierTint.wood.emissive).toBe(0)
  })
})

describe('getHeroTierTint', () => {
  it('returns a zeroed tint for unknown keys (safe dial-back fallback)', () => {
    expect(getHeroTierTint('nonsense')).toEqual({ saturate: 0, lighten: 0, emissive: 0 })
  })
})

describe('buildTierMaterial applies vividness boosts', () => {
  it('boosts diamond emissive intensity above its flat base palette value', () => {
    const mat = buildTierMaterial('DIAMOND')
    const base = TIER_MATERIALS.diamond.emissiveIntensity
    // (base + tierTint.emissive) * emissiveBoost should exceed the flat base.
    const expected =
      (base + HERO_VIVIDNESS.tierTint.diamond.emissive) * HERO_VIVIDNESS.material.emissiveBoost
    expect(mat.emissiveIntensity).toBeCloseTo(expected, 5)
    expect(mat.emissiveIntensity).toBeGreaterThan(base)
  })

  it('keeps wood matte (no emissive) even with the boost applied', () => {
    const mat = buildTierMaterial('WOOD')
    // Wood base emissiveIntensity is 0 and tierTint.emissive is 0 → stays 0.
    expect(mat.emissiveIntensity).toBe(0)
  })

  it('lifts specular toward white for crisper hero highlights', () => {
    const mat = buildTierMaterial('IRON')
    const flatSpecular = new THREE.Color(TIER_MATERIALS.iron.specular)
    // specularBoost lerps toward white, so the result is brighter than flat.
    expect(mat.specular.r).toBeGreaterThan(flatSpecular.r)
  })
})
