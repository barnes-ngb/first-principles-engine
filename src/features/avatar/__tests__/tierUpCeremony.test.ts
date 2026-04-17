import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import * as THREE from 'three'
import { calculateTier, TIERS, TIER_MATERIALS, getTierTint } from '../voxel/tierMaterials'
import {
  shatterArmor,
  showTierUpBanner,
  updateArmorMaterials,
  showNewTierGhosts,
  updatePlatformColor,
  triggerTierUpCeremony,
} from '../voxel/tierUpCeremony'
import type { TierUpCeremonyConfig } from '../voxel/tierUpCeremony'
import type { VoxelArmorPieceId } from '../../../core/types'

// ── Tier boundary detection (drives ceremony trigger) ───────────────

describe('Tier boundary detection for ceremony', () => {
  it('detects Iron→Gold transition at 1499→1500 XP', () => {
    expect(calculateTier(1499)).toBe('IRON')
    expect(calculateTier(1500)).toBe('GOLD')
    expect(calculateTier(1499)).not.toBe(calculateTier(1500))
  })

  it('detects Wood→Stone transition at 99→100 XP', () => {
    expect(calculateTier(99)).toBe('WOOD')
    expect(calculateTier(100)).toBe('STONE')
    expect(calculateTier(99)).not.toBe(calculateTier(100))
  })

  it('detects Stone→Iron transition at 749→750 XP', () => {
    expect(calculateTier(749)).toBe('STONE')
    expect(calculateTier(750)).toBe('IRON')
  })

  it('detects Gold→Diamond transition at 2499→2500 XP', () => {
    expect(calculateTier(2499)).toBe('GOLD')
    expect(calculateTier(2500)).toBe('DIAMOND')
  })

  it('detects Diamond→Netherite transition at 4999→5000 XP', () => {
    expect(calculateTier(4999)).toBe('DIAMOND')
    expect(calculateTier(5000)).toBe('NETHERITE')
  })

  it('handles large XP jumps that skip tiers', () => {
    // Wood → Gold (skip Stone and Iron)
    const oldTier = calculateTier(50)
    const newTier = calculateTier(1500)
    expect(oldTier).toBe('WOOD')
    expect(newTier).toBe('GOLD')
    expect(oldTier).not.toBe(newTier)
  })

  it('does not trigger ceremony within same tier', () => {
    expect(calculateTier(750)).toBe(calculateTier(1499))
    expect(calculateTier(1500)).toBe(calculateTier(2499))
  })
})

// ── Tier material palette consistency ───────────────────────────────

describe('Tier materials for ceremony phases', () => {
  it('every tier in TIERS has a matching TIER_MATERIALS entry', () => {
    for (const tierName of Object.keys(TIERS)) {
      const tint = getTierTint(tierName)
      expect(TIER_MATERIALS[tint]).toBeDefined()
    }
  })

  it('all tier materials have required color properties', () => {
    for (const [, mat] of Object.entries(TIER_MATERIALS)) {
      expect(typeof mat.primary).toBe('number')
      expect(typeof mat.accent).toBe('number')
      expect(typeof mat.secondary).toBe('number')
      expect(typeof mat.emissive).toBe('number')
      expect(typeof mat.emissiveIntensity).toBe('number')
    }
  })

  it('accent color is available for banner flash (non-zero for non-wood tiers)', () => {
    // Gold, Diamond, Netherite should have distinct accent colors for dramatic flash
    expect(TIER_MATERIALS.gold.accent).not.toBe(0)
    expect(TIER_MATERIALS.diamond.accent).not.toBe(0)
    expect(TIER_MATERIALS.netherite.accent).not.toBe(0)
  })

  it('tier labels exist for TTS announcement', () => {
    for (const [, def] of Object.entries(TIERS)) {
      expect(def.label).toBeTruthy()
      expect(typeof def.label).toBe('string')
    }
  })
})

// ── Tier progression order ──────────────────────────────────────────

describe('Tier progression order', () => {
  const tierOrder = ['WOOD', 'STONE', 'IRON', 'GOLD', 'DIAMOND', 'NETHERITE']

  it('tiers have strictly increasing minXp values', () => {
    for (let i = 1; i < tierOrder.length; i++) {
      expect(TIERS[tierOrder[i]].minXp).toBeGreaterThan(TIERS[tierOrder[i - 1]].minXp)
    }
  })

  it('all 6 tiers are defined', () => {
    expect(Object.keys(TIERS)).toHaveLength(6)
    for (const name of tierOrder) {
      expect(TIERS[name]).toBeDefined()
    }
  })
})

// ── Ceremony function tests ─────────────────────────────────────────

/** Create a minimal THREE.Group with a visible child mesh for testing */
function createMockArmorGroup(): THREE.Group {
  const group = new THREE.Group()
  const childMesh = new THREE.Mesh(
    new THREE.BoxGeometry(1, 1, 1),
    new THREE.MeshLambertMaterial({ color: 0x808080 }),
  )
  childMesh.userData.materialRole = 'primary'
  group.add(childMesh)
  group.visible = true
  return group
}

function createMockArmorMeshes(): Map<VoxelArmorPieceId, THREE.Group> {
  const map = new Map<VoxelArmorPieceId, THREE.Group>()
  const pieceIds: VoxelArmorPieceId[] = ['belt', 'breastplate', 'shoes', 'shield', 'helmet', 'sword']
  for (const id of pieceIds) {
    map.set(id, createMockArmorGroup())
  }
  return map
}

describe('shatterArmor', () => {
  let scene: THREE.Scene

  beforeEach(() => {
    scene = new THREE.Scene()
    // Mock requestAnimationFrame to run synchronously
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((cb) => {
      cb(performance.now() + 2000) // Simulate after duration
      return 0
    })
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('hides equipped armor pieces', () => {
    const meshes = createMockArmorMeshes()
    const equipped = ['helmet', 'breastplate']

    shatterArmor(scene, meshes, equipped, TIER_MATERIALS.iron)

    expect(meshes.get('helmet')!.visible).toBe(false)
    expect(meshes.get('breastplate')!.visible).toBe(false)
  })

  it('does not hide unequipped pieces', () => {
    const meshes = createMockArmorMeshes()

    shatterArmor(scene, meshes, ['helmet'], TIER_MATERIALS.iron)

    expect(meshes.get('belt')!.visible).toBe(true)
    expect(meshes.get('shoes')!.visible).toBe(true)
  })

  it('cleans up fragments after animation completes', () => {
    const meshes = createMockArmorMeshes()
    const initialChildCount = scene.children.length

    shatterArmor(scene, meshes, ['helmet'], TIER_MATERIALS.iron)

    // After rAF runs with time past duration, fragments should be cleaned up
    expect(scene.children.length).toBe(initialChildCount)
  })

  it('handles empty equipped list gracefully', () => {
    const meshes = createMockArmorMeshes()
    expect(() => shatterArmor(scene, meshes, [], TIER_MATERIALS.iron)).not.toThrow()
  })
})

describe('showTierUpBanner', () => {
  let container: HTMLDivElement

  beforeEach(() => {
    container = document.createElement('div')
    document.body.appendChild(container)
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
    container.remove()
    // Clean up keyframe style if injected
    document.getElementById('tier-banner-keyframes')?.remove()
  })

  it('adds flash and banner elements to container', () => {
    showTierUpBanner(container, 'GOLD', vi.fn())

    // Flash div + banner div = 2 children
    expect(container.children.length).toBe(2)
  })

  it('displays correct tier label in banner', () => {
    showTierUpBanner(container, 'GOLD', vi.fn())

    expect(container.innerHTML).toContain('GOLD TIER')
  })

  it('injects keyframe animation stylesheet', () => {
    showTierUpBanner(container, 'DIAMOND', vi.fn())

    const style = document.getElementById('tier-banner-keyframes')
    expect(style).not.toBeNull()
    expect(style?.textContent).toContain('tierBannerIn')
  })

  it('calls onComplete after banner fades (~2.5s)', () => {
    const onComplete = vi.fn()
    showTierUpBanner(container, 'GOLD', onComplete)

    // Fast-forward past flash (1s) + banner display (2s) + fade (0.5s)
    vi.advanceTimersByTime(3000)

    expect(onComplete).toHaveBeenCalledOnce()
  })

  it('removes banner from DOM after completion', () => {
    showTierUpBanner(container, 'GOLD', vi.fn())

    vi.advanceTimersByTime(3000)

    // Flash removed at 1s, banner removed at 2.5s → container should be empty
    expect(container.children.length).toBe(0)
  })
})

describe('updateArmorMaterials', () => {
  it('sets originalColor userData to new tier colors', () => {
    const meshes = createMockArmorMeshes()

    updateArmorMaterials(meshes, 'GOLD')

    const goldPrimary = TIER_MATERIALS.gold.primary
    for (const [, mesh] of meshes) {
      mesh.traverse((child) => {
        if (child instanceof THREE.Mesh) {
          expect(child.userData.originalColor).toBeDefined()
          expect(child.userData.originalColor.getHex()).toBe(goldPrimary)
        }
      })
    }
  })

  it('applies accent color to accent-tagged meshes', () => {
    const meshes = new Map<string, THREE.Group>()
    const group = new THREE.Group()
    const accentMesh = new THREE.Mesh(
      new THREE.BoxGeometry(1, 1, 1),
      new THREE.MeshLambertMaterial({ color: 0x000000 }),
    )
    accentMesh.userData.materialRole = 'accent'
    group.add(accentMesh)
    meshes.set('belt', group)

    updateArmorMaterials(meshes, 'DIAMOND')

    expect(accentMesh.userData.originalColor.getHex()).toBe(TIER_MATERIALS.diamond.accent)
  })
})

describe('showNewTierGhosts', () => {
  let rafCallbacks: FrameRequestCallback[]

  beforeEach(() => {
    rafCallbacks = []
    // Collect rAF callbacks instead of running them immediately (avoids recursion)
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((cb) => {
      rafCallbacks.push(cb)
      return rafCallbacks.length
    })
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  /** Drain all queued rAF callbacks at the given timestamp, including newly-queued ones */
  function flushRaf(timestamp: number, maxIterations = 50) {
    for (let i = 0; i < maxIterations && rafCallbacks.length > 0; i++) {
      const batch = rafCallbacks.splice(0)
      for (const cb of batch) cb(timestamp)
    }
  }

  it('makes all pieces visible', () => {
    const meshes = createMockArmorMeshes()
    for (const [, mesh] of meshes) mesh.visible = false

    showNewTierGhosts(meshes, 'GOLD')
    // Run enough frames to complete all staggered scale-ins (6 pieces × 200ms delay + 500ms anim)
    flushRaf(performance.now() + 3000)

    for (const [, mesh] of meshes) {
      expect(mesh.visible).toBe(true)
    }
  })

  it('applies transparent ghost materials to child meshes', () => {
    const meshes = createMockArmorMeshes()

    showNewTierGhosts(meshes, 'GOLD')
    flushRaf(performance.now() + 3000)

    for (const [, mesh] of meshes) {
      mesh.traverse((child) => {
        if (child instanceof THREE.Mesh) {
          const mat = child.material as THREE.MeshLambertMaterial
          expect(mat.transparent).toBe(true)
          expect(mat.opacity).toBeLessThan(0.15) // Ghost opacity ≤ 0.08
          expect(mat.depthWrite).toBe(false)
        }
      })
    }
  })
})

describe('updatePlatformColor', () => {
  it('updates platform mesh colors to new tier', () => {
    const scene = new THREE.Scene()
    const platform = new THREE.Group()
    platform.name = 'platform'
    const block = new THREE.Mesh(
      new THREE.BoxGeometry(1, 1, 1),
      new THREE.MeshLambertMaterial({ color: 0x808080 }),
    )
    platform.add(block)
    scene.add(platform)

    updatePlatformColor(scene, 'GOLD')

    // The platform block color should have changed from gray
    const mat = block.material as THREE.MeshLambertMaterial
    expect(mat.color.getHex()).not.toBe(0x808080)
  })

  it('does nothing if platform not found', () => {
    const scene = new THREE.Scene()
    expect(() => updatePlatformColor(scene, 'GOLD')).not.toThrow()
  })
})

describe('triggerTierUpCeremony orchestration', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((cb) => {
      cb(performance.now() + 2000)
      return 0
    })
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
    document.getElementById('tier-banner-keyframes')?.remove()
  })

  it('runs all ceremony phases without errors', () => {
    const scene = new THREE.Scene()
    const platform = new THREE.Group()
    platform.name = 'platform'
    scene.add(platform)

    const container = document.createElement('div')
    document.body.appendChild(container)

    const config: TierUpCeremonyConfig = {
      scene,
      armorMeshes: createMockArmorMeshes(),
      equippedPieces: ['helmet', 'breastplate', 'belt'],
      oldTier: 'IRON',
      newTier: 'GOLD',
      containerEl: container,
    }

    const cleanup = triggerTierUpCeremony(config)
    expect(typeof cleanup).toBe('function')

    // Advance through all ceremony phases
    vi.advanceTimersByTime(5000)

    container.remove()
  })

  it('returns cleanup function that cancels pending timers', () => {
    const scene = new THREE.Scene()
    const container = document.createElement('div')
    document.body.appendChild(container)

    const cleanup = triggerTierUpCeremony({
      scene,
      armorMeshes: createMockArmorMeshes(),
      equippedPieces: ['helmet'],
      oldTier: 'IRON',
      newTier: 'GOLD',
      containerEl: container,
    })

    // Call cleanup before timers fire — banner should NOT appear
    cleanup()
    vi.advanceTimersByTime(5000)

    // Banner would have been added at 1s, but cleanup cancelled it
    expect(container.innerHTML).not.toContain('GOLD TIER')

    container.remove()
  })

  it('hides equipped armor during shatter phase', () => {
    const scene = new THREE.Scene()
    const container = document.createElement('div')
    document.body.appendChild(container)
    const meshes = createMockArmorMeshes()

    triggerTierUpCeremony({
      scene,
      armorMeshes: meshes,
      equippedPieces: ['helmet', 'sword'],
      oldTier: 'IRON',
      newTier: 'GOLD',
      containerEl: container,
    })

    // Shatter runs immediately — equipped pieces should be hidden
    expect(meshes.get('helmet')!.visible).toBe(false)
    expect(meshes.get('sword')!.visible).toBe(false)

    vi.advanceTimersByTime(5000)
    container.remove()
  })

  it('shows tier-up banner after 1s delay', () => {
    const scene = new THREE.Scene()
    const container = document.createElement('div')
    document.body.appendChild(container)

    triggerTierUpCeremony({
      scene,
      armorMeshes: createMockArmorMeshes(),
      equippedPieces: ['helmet'],
      oldTier: 'STONE',
      newTier: 'IRON',
      containerEl: container,
    })

    // Before 1s — no banner
    expect(container.innerHTML).not.toContain('TIER')

    // After 1s — banner appears
    vi.advanceTimersByTime(1100)
    expect(container.innerHTML).toContain('IRON TIER')

    vi.advanceTimersByTime(5000)
    container.remove()
  })
})
