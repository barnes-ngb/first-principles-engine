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
  STONE:     { minXp: 200,  label: 'Stone',     armorTint: 'stone' },
  IRON:      { minXp: 500,  label: 'Iron',      armorTint: 'iron' },
  GOLD:      { minXp: 1000, label: 'Gold',      armorTint: 'gold' },
  DIAMOND:   { minXp: 2000, label: 'Diamond',   armorTint: 'diamond' },
  NETHERITE: { minXp: 5000, label: 'Netherite', armorTint: 'netherite' },
}

// ── Material palettes per tier ───────────────────────────────────

export interface TierMaterials {
  primary: number
  accent: number
  detail: number
  specular: number
  emissive: number
  emissiveIntensity: number
  shininess: number
  roughnessHint: string
  rust?: number
  weathering?: number
}

export const TIER_MATERIALS: Record<string, TierMaterials> = {
  wood: {
    primary: 0x8B7332,       // Warm golden-brown (treated wood planks)
    accent: 0xA08A4A,
    detail: 0x6B5522,        // Darker wood grain
    specular: 0x554422,
    emissive: 0x000000,
    emissiveIntensity: 0,
    shininess: 15,
    roughnessHint: 'rough, natural wood planks',
    weathering: 0.05,
  },
  stone: {
    primary: 0x808080,
    accent: 0x999999,
    detail: 0x666666,
    specular: 0x444444,
    emissive: 0x000000,
    emissiveIntensity: 0,
    shininess: 20,
    roughnessHint: 'rough cobblestone',
    weathering: 0.1,
  },
  leather: {
    primary: 0x8B5E3C,
    accent: 0xA07050,
    detail: 0x6B4428,
    specular: 0x443322,
    emissive: 0x000000,
    emissiveIntensity: 0,
    shininess: 10,
    roughnessHint: 'worn leather',
    weathering: 0.15,
  },
  iron: {
    primary: 0xA0A0A8,      // Brighter iron for Legends look
    accent: 0x4E4E4E,       // Dark iron — shadows, edges
    detail: 0x8A8A8A,       // Lighter spots — highlights, buckles
    specular: 0x888888,
    emissive: 0x000000,
    emissiveIntensity: 0,
    shininess: 45,
    roughnessHint: 'smooth metal',
    rust: 0x7A5C3C,         // Warm brown-gray for weathering spots
    weathering: 0.2,        // Moderate weathering
  },
  gold: {
    primary: 0xDAA520,
    accent: 0xFFD700,
    detail: 0xB8860B,
    specular: 0xFFD700,
    emissive: 0x1a1400,
    emissiveIntensity: 0.1,
    shininess: 65,
    roughnessHint: 'polished, gleaming',
    weathering: 0.1,
  },
  diamond: {
    primary: 0x4ECDC4,
    accent: 0x7DF9FF,
    detail: 0x2CB5C6,
    specular: 0x88FFFF,
    emissive: 0x0a1a1a,
    emissiveIntensity: 0.15,
    shininess: 80,
    roughnessHint: 'crystalline, translucent edges',
    weathering: 0.0,     // Pristine, no weathering
  },
  netherite: {
    primary: 0x3C2A4A,
    accent: 0x5C4A4A,
    detail: 0x2A2222,
    specular: 0x6644AA,
    emissive: 0x0a0515,
    emissiveIntensity: 0.1,
    shininess: 50,
    roughnessHint: 'ancient, dark, with ember glow',
    rust: 0x4A2020,
    weathering: 0.3,     // Heavy ancient wear
  },
}

// ── Tier calculation ─────────────────────────────────────────────

export function calculateTier(totalXp: number): string {
  if (totalXp >= 5000) return 'NETHERITE'
  if (totalXp >= 2000) return 'DIAMOND'
  if (totalXp >= 1000) return 'GOLD'
  if (totalXp >= 500) return 'IRON'
  if (totalXp >= 200) return 'STONE'
  return 'WOOD'
}

export function getTierTint(tierName: string): string {
  const def = TIERS[tierName.toUpperCase()]
  return def?.armorTint ?? 'wood'
}

// ── Apply tier materials to armor meshes ─────────────────────────

/** Linearly interpolate between two hex colors */
function lerpColor(a: number, b: number, t: number): number {
  const ca = new THREE.Color(a)
  const cb = new THREE.Color(b)
  ca.lerp(cb, t)
  return ca.getHex()
}

export function applyTierToArmor(
  armorMeshes: Map<string, THREE.Group>,
  tier: string,
  equippedPieces: string[],
  armorColors?: ArmorColors,
): void {
  const tint = getTierTint(tier)
  const materials = TIER_MATERIALS[tint] ?? TIER_MATERIALS.wood
  const weathering = materials.weathering ?? 0

  const safeEquipped = equippedPieces ?? []
  for (const [pieceId, mesh] of armorMeshes) {
    if (!safeEquipped.includes(pieceId)) continue

    // Check for custom dye color for this piece
    const dyeHex = armorColors?.[pieceId as keyof ArmorColors]
    const dyeColor = dyeHex ? new THREE.Color(dyeHex) : null

    let meshIndex = 0
    mesh.traverse((child) => {
      if (!(child instanceof THREE.Mesh)) return

      const role: string = (child.userData.materialRole as string) ?? 'primary'

      // Skip sword blade meshes — they keep their blue glow color
      if (role === 'sword_blade') return

      meshIndex++
      let baseColor: number

      if (dyeColor) {
        // Custom dye: use dye color for primary, darker shade for accent/detail
        switch (role) {
          case 'accent': baseColor = dyeColor.clone().multiplyScalar(0.85).getHex(); break
          case 'detail': baseColor = dyeColor.clone().multiplyScalar(0.65).getHex(); break
          default: baseColor = dyeColor.getHex()
        }
      } else {
        switch (role) {
          case 'accent': baseColor = materials.accent; break
          case 'detail': baseColor = materials.detail; break
          default: baseColor = materials.primary
        }
      }

      // Apply weathering — alternate between base, darker, and rust-tinted variations
      // Skip weathering on dyed pieces to keep colors clean
      if (!dyeColor && weathering > 0 && role === 'primary' && !child.userData.isAccent) {
        const rustTarget = materials.rust ?? materials.accent
        const variations = [
          baseColor,
          lerpColor(baseColor, materials.accent, weathering),
          baseColor,
          lerpColor(baseColor, rustTarget, weathering),
          baseColor,
          lerpColor(baseColor, materials.accent, weathering * 1.5),
        ]
        baseColor = variations[meshIndex % variations.length]
      }

      // Create per-face textured materials with Phong shading for armor shine
      const color = new THREE.Color(baseColor)
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
