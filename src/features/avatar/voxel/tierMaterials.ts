import * as THREE from 'three'
import type { ArmorColors } from '../../../core/types'

// ── Tier definitions ─────────────────────────────────────────────

export interface TierDefinition {
  minXp: number
  label: string
  armorTint: string
}

export const TIERS: Record<string, TierDefinition> = {
  WOOD:      { minXp: 0,    label: 'Wood',      armorTint: 'wood' },
  STONE:     { minXp: 100,  label: 'Stone',     armorTint: 'stone' },
  IRON:      { minXp: 750,  label: 'Iron',      armorTint: 'iron' },
  GOLD:      { minXp: 1500, label: 'Gold',      armorTint: 'gold' },
  DIAMOND:   { minXp: 2500, label: 'Diamond',   armorTint: 'diamond' },
  NETHERITE: { minXp: 5000, label: 'Netherite', armorTint: 'netherite' },
}

// ── Material palettes per tier ───────────────────────────────────

export interface TierMaterials {
  primary: number
  secondary: number
  accent: number
  shininess: number
  specular: number
  emissive: number
  emissiveIntensity: number
  colorJitter: number
  edgeOpacity: number
}

export const TIER_MATERIALS: Record<string, TierMaterials> = {
  wood: {
    primary: 0xB8865B,      // warm light brown
    secondary: 0x6B4423,    // darker brown trim
    accent: 0xD4B896,       // rope/tan accent
    shininess: 5,           // very matte
    specular: 0x111111,     // almost no specular
    emissive: 0x000000,
    emissiveIntensity: 0,
    colorJitter: 0,
    edgeOpacity: 0.15,
  },
  stone: {
    primary: 0x8A8A8A,      // medium gray
    secondary: 0x4A4A4A,    // charcoal trim
    accent: 0x5A6B52,       // moss green hint
    shininess: 8,
    specular: 0x222222,
    emissive: 0x000000,
    emissiveIntensity: 0,
    colorJitter: 0.08,      // block-to-block gray variation
    edgeOpacity: 0.2,
  },
  iron: {
    primary: 0xC0C8D0,      // polished steel
    secondary: 0x3A4048,    // dark iron trim
    accent: 0x8899AA,       // blue-gray undertone
    shininess: 40,          // polished!
    specular: 0x666666,     // real specular highlights
    emissive: 0x000000,
    emissiveIntensity: 0,
    colorJitter: 0.03,      // very subtle variation
    edgeOpacity: 0.25,
  },
  // Gold/Diamond/Netherite — Phase B redesign. Keep functional placeholders.
  gold: {
    primary: 0xF4C430,
    secondary: 0x4A2871,
    accent: 0xFFF8E7,
    shininess: 60,
    specular: 0x888888,
    emissive: 0x3A2800,
    emissiveIntensity: 0.15,
    colorJitter: 0,
    edgeOpacity: 0.2,
  },
  diamond: {
    primary: 0x6FD8E8,
    secondary: 0x2A9DB8,
    accent: 0xE8F4F8,
    shininess: 80,
    specular: 0xAAAAAA,
    emissive: 0x1A4A5A,
    emissiveIntensity: 0.3,
    colorJitter: 0,
    edgeOpacity: 0.3,
  },
  netherite: {
    primary: 0x1A1618,
    secondary: 0xFF4A1F,
    accent: 0x8B3FBE,
    shininess: 15,
    specular: 0x333333,
    emissive: 0x331108,
    emissiveIntensity: 0.25,
    colorJitter: 0,
    edgeOpacity: 0.35,
  },
}

// ── Tier calculation ─────────────────────────────────────────────

export function calculateTier(totalXp: number): string {
  if (totalXp >= 5000) return 'NETHERITE'
  if (totalXp >= 2500) return 'DIAMOND'
  if (totalXp >= 1500) return 'GOLD'
  if (totalXp >= 750) return 'IRON'
  if (totalXp >= 100) return 'STONE'
  return 'WOOD'
}

export function getTierTint(tierName: string): string {
  const def = TIERS[tierName.toUpperCase()]
  return def?.armorTint ?? 'wood'
}

// ── Build a MeshPhongMaterial from tier config ──────────────────

/**
 * Build a MeshPhongMaterial for the given tier + variant.
 * For Stone-like per-block jitter, call this once per block (not shared).
 * For uniform pieces, call once and reuse.
 */
export function buildTierMaterial(
  tier: string,
  variant: 'primary' | 'secondary' | 'accent' = 'primary',
): THREE.MeshPhongMaterial {
  const tint = getTierTint(tier)
  const t = TIER_MATERIALS[tint] ?? TIER_MATERIALS.wood
  const color = t[variant]
  const mat = new THREE.MeshPhongMaterial({
    color,
    shininess: t.shininess,
    specular: new THREE.Color(t.specular),
    emissive: new THREE.Color(t.emissive),
    emissiveIntensity: t.emissiveIntensity,
    flatShading: true,
  })

  // Apply color jitter for stone-like variation
  if (t.colorJitter > 0) {
    const c = new THREE.Color(color)
    const jitter = (Math.random() - 0.5) * t.colorJitter
    c.offsetHSL(0, 0, jitter)
    mat.color = c
  }

  return mat
}

// ── Apply tier materials to armor meshes ─────────────────────────

export function applyTierToArmor(
  armorMeshes: Map<string, THREE.Group>,
  tier: string,
  equippedPieces: string[],
  armorColors?: ArmorColors,
): void {
  const tint = getTierTint(tier)
  const materials = TIER_MATERIALS[tint] ?? TIER_MATERIALS.wood

  const safeEquipped = equippedPieces ?? []
  for (const [pieceId, mesh] of armorMeshes) {
    if (!safeEquipped.includes(pieceId)) continue

    // Check for custom dye color for this piece
    const dyeHex = armorColors?.[pieceId as keyof ArmorColors]
    const dyeColor = dyeHex ? new THREE.Color(dyeHex) : null

    mesh.traverse((child) => {
      if (!(child instanceof THREE.Mesh)) return

      const role: string = (child.userData.materialRole as string) ?? 'primary'

      // Skip sword blade meshes — they keep their blue glow color
      if (role === 'sword_blade') return

      let baseColor: number

      if (dyeColor) {
        // Custom dye: use dye color for primary, darker shade for secondary/accent
        switch (role) {
          case 'secondary': baseColor = dyeColor.clone().multiplyScalar(0.65).getHex(); break
          case 'accent': baseColor = dyeColor.clone().multiplyScalar(0.85).getHex(); break
          case 'detail': baseColor = dyeColor.clone().multiplyScalar(0.65).getHex(); break
          default: baseColor = dyeColor.getHex()
        }
      } else {
        switch (role) {
          case 'secondary': baseColor = materials.secondary; break
          case 'accent': baseColor = materials.accent; break
          case 'detail': baseColor = materials.secondary; break // legacy 'detail' maps to secondary
          default: baseColor = materials.primary
        }
      }

      // Apply per-face color jitter for tier variation (stone-like effect)
      const color = new THREE.Color(baseColor)
      if (!dyeColor && materials.colorJitter > 0 && role === 'primary') {
        const jitter = (Math.random() - 0.5) * materials.colorJitter
        color.offsetHSL(0, 0, jitter)
      }

      // Create per-face textured materials with Phong shading for armor shine
      const faceMats: THREE.MeshPhongMaterial[] = []
      for (let i = 0; i < 6; i++) {
        const variation = 0.95 + Math.random() * 0.1
        faceMats.push(new THREE.MeshPhongMaterial({
          color: color.clone().multiplyScalar(variation),
          specular: new THREE.Color(materials.specular),
          shininess: materials.shininess,
          emissive: new THREE.Color(materials.emissive),
          emissiveIntensity: materials.emissiveIntensity,
          flatShading: true,
        }))
      }
      child.material = faceMats
    })
  }
}

// ── Tier badge colors (for UI) ───────────────────────────────────

export function getTierBadgeColor(tier: string): string {
  switch (tier.toUpperCase()) {
    case 'WOOD':      return 'rgba(139, 105, 20, 0.3)'
    case 'STONE':     return 'rgba(128, 128, 128, 0.3)'
    case 'IRON':      return 'rgba(110, 110, 110, 0.3)'
    case 'GOLD':      return 'rgba(218, 165, 32, 0.3)'
    case 'DIAMOND':   return 'rgba(77, 214, 232, 0.2)'
    case 'NETHERITE': return 'rgba(61, 53, 53, 0.5)'
    default:          return 'rgba(128, 128, 128, 0.3)'
  }
}

export function getTierTextColor(tier: string): string {
  switch (tier.toUpperCase()) {
    case 'WOOD':      return '#B8922E'
    case 'STONE':     return '#AAAAAA'
    case 'IRON':      return '#8A8A8A'
    case 'GOLD':      return '#FFD700'
    case 'DIAMOND':   return '#7DF9FF'
    case 'NETHERITE': return '#8B7777'
    default:          return '#AAAAAA'
  }
}

// ── Tier upgrade animation ───────────────────────────────────────

export function animateTierUpgrade(
  armorMeshes: Map<string, THREE.Group>,
  equippedPieces: string[],
  newTier: string,
): void {
  const tint = getTierTint(newTier)
  const materials = TIER_MATERIALS[tint] ?? TIER_MATERIALS.wood

  ;(equippedPieces ?? []).forEach((pieceId) => {
    const maybeMesh = armorMeshes.get(pieceId)
    if (!maybeMesh) return
    const mesh: THREE.Group = maybeMesh

    // Phase 1: Flash bright white (0-400ms)
    mesh.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        const mats = Array.isArray(child.material) ? child.material : [child.material]
        for (const m of mats) {
          if (m instanceof THREE.MeshPhongMaterial || m instanceof THREE.MeshLambertMaterial) {
            m.emissive = new THREE.Color(0xffffff)
            m.emissiveIntensity = 1.0
          }
        }
      }
    })

    // Phase 2: Transition to new tier colors (400-1000ms)
    setTimeout(() => {
      applyTierToArmor(armorMeshes, newTier, [pieceId])

      // Fade emissive from bright back to tier default
      const startTime = performance.now()
      function fade(now: number) {
        const t = Math.min((now - startTime) / 600, 1)
        mesh.traverse((child) => {
          if (child instanceof THREE.Mesh) {
            const mats = Array.isArray(child.material) ? child.material : [child.material]
            for (const m of mats) {
              if (m instanceof THREE.MeshPhongMaterial || m instanceof THREE.MeshLambertMaterial) {
                m.emissiveIntensity =
                  materials.emissiveIntensity + (1 - t) * (0.8 - materials.emissiveIntensity)
              }
            }
          }
        })
        if (t < 1) requestAnimationFrame(fade)
      }
      requestAnimationFrame(fade)
    }, 400)
  })
}
