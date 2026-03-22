import * as THREE from 'three'

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
  emissive: number
  emissiveIntensity: number
  roughnessHint: string
}

export const TIER_MATERIALS: Record<string, TierMaterials> = {
  wood: {
    primary: 0x8B6914,
    accent: 0xA0824A,
    detail: 0x6B4F12,
    emissive: 0x000000,
    emissiveIntensity: 0,
    roughnessHint: 'rough, natural wood planks',
  },
  stone: {
    primary: 0x808080,
    accent: 0x999999,
    detail: 0x666666,
    emissive: 0x000000,
    emissiveIntensity: 0,
    roughnessHint: 'rough cobblestone',
  },
  iron: {
    primary: 0xB0B0B0,
    accent: 0xD4D4D4,
    detail: 0x888888,
    emissive: 0x000000,
    emissiveIntensity: 0,
    roughnessHint: 'smooth metal',
  },
  gold: {
    primary: 0xDAA520,
    accent: 0xFFD700,
    detail: 0xB8860B,
    emissive: 0x332200,
    emissiveIntensity: 0.15,
    roughnessHint: 'polished, gleaming',
  },
  diamond: {
    primary: 0x4DD6E8,
    accent: 0x7DF9FF,
    detail: 0x2CB5C6,
    emissive: 0x114455,
    emissiveIntensity: 0.25,
    roughnessHint: 'crystalline, translucent edges',
  },
  netherite: {
    primary: 0x3D3535,
    accent: 0x5C4A4A,
    detail: 0x2A2222,
    emissive: 0x331111,
    emissiveIntensity: 0.2,
    roughnessHint: 'ancient, dark, with ember glow',
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

export function applyTierToArmor(
  armorMeshes: Map<string, THREE.Group>,
  tier: string,
  equippedPieces: string[],
): void {
  const tint = getTierTint(tier)
  const materials = TIER_MATERIALS[tint] ?? TIER_MATERIALS.wood

  for (const [pieceId, mesh] of armorMeshes) {
    if (!equippedPieces.includes(pieceId)) continue

    mesh.traverse((child) => {
      if (!(child instanceof THREE.Mesh)) return

      const role: string = (child.userData.materialRole as string) ?? 'primary'

      // Skip sword blade meshes — they keep their blue glow color
      if (role === 'sword_blade') return

      let baseColor: number
      switch (role) {
        case 'accent': baseColor = materials.accent; break
        case 'detail': baseColor = materials.detail; break
        default: baseColor = materials.primary
      }

      // Create per-face textured materials for visual depth
      const color = new THREE.Color(baseColor)
      const faceMats: THREE.MeshLambertMaterial[] = []
      for (let i = 0; i < 6; i++) {
        const variation = 0.95 + Math.random() * 0.1
        faceMats.push(new THREE.MeshLambertMaterial({
          color: color.clone().multiplyScalar(variation),
          emissive: new THREE.Color(materials.emissive),
          emissiveIntensity: materials.emissiveIntensity,
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
    case 'IRON':      return 'rgba(176, 176, 176, 0.3)'
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
    case 'IRON':      return '#D4D4D4'
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

  equippedPieces.forEach((pieceId) => {
    const maybeMesh = armorMeshes.get(pieceId)
    if (!maybeMesh) return
    const mesh: THREE.Group = maybeMesh

    // Phase 1: Flash bright white (0-400ms)
    mesh.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        const mats = Array.isArray(child.material) ? child.material : [child.material]
        for (const m of mats) {
          if (m instanceof THREE.MeshLambertMaterial) {
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
              if (m instanceof THREE.MeshLambertMaterial) {
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
