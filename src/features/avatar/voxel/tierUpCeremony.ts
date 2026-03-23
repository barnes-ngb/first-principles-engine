import * as THREE from 'three'

import type { TierMaterials } from './tierMaterials'
import { getTierTint, TIER_MATERIALS, TIERS } from './tierMaterials'
import type { VoxelArmorPieceId } from '../../../core/types'

// ── Types ───────────────────────────────────────────────────────────

export interface TierUpCeremonyConfig {
  scene: THREE.Scene
  armorMeshes: Map<VoxelArmorPieceId, THREE.Group>
  equippedPieces: string[]
  oldTier: string
  newTier: string
  containerEl: HTMLElement
}

// ── Phase 1: Shatter (0–1.5s) ──────────────────────────────────────

export function shatterArmor(
  scene: THREE.Scene,
  armorMeshes: Map<string, THREE.Group>,
  equippedPieces: string[],
  oldTierMaterials: TierMaterials,
): void {
  const allFragments: THREE.Mesh[] = []

  equippedPieces.forEach((pieceId) => {
    const mesh = armorMeshes.get(pieceId as VoxelArmorPieceId)
    if (!mesh?.visible) return

    mesh.traverse((child) => {
      if (!(child instanceof THREE.Mesh)) return

      const worldPos = new THREE.Vector3()
      child.getWorldPosition(worldPos)

      // Determine the fragment color from the child's material
      let fragColor = oldTierMaterials.primary
      if (child.material) {
        const mat = Array.isArray(child.material) ? child.material[0] : child.material
        if (mat instanceof THREE.MeshLambertMaterial && mat.color) {
          fragColor = mat.color.getHex()
        }
      }

      const fragCount = 8 + Math.floor(Math.random() * 8)
      for (let i = 0; i < fragCount; i++) {
        const size = 0.06 + Math.random() * 0.1
        const frag = new THREE.Mesh(
          new THREE.BoxGeometry(size, size, size),
          new THREE.MeshLambertMaterial({
            color: fragColor,
            transparent: true,
            opacity: 1,
          }),
        )

        frag.position.copy(worldPos).add(
          new THREE.Vector3(
            (Math.random() - 0.5) * 0.5,
            (Math.random() - 0.5) * 0.5,
            (Math.random() - 0.5) * 0.5,
          ),
        )

        // Outward velocity — away from character center
        const dir = frag.position.clone().normalize()
        frag.userData.velocity = new THREE.Vector3(
          dir.x * (0.05 + Math.random() * 0.15),
          0.05 + Math.random() * 0.12,
          dir.z * (0.05 + Math.random() * 0.15),
        )
        frag.userData.rotSpeed = new THREE.Vector3(
          Math.random() * 0.15,
          Math.random() * 0.15,
          Math.random() * 0.15,
        )

        scene.add(frag)
        allFragments.push(frag)
      }
    })

    // Hide original piece
    mesh.visible = false
  })

  // Animate fragments over 1.5s
  const startTime = performance.now()
  const duration = 1500

  function animateFragments(now: number) {
    const elapsed = now - startTime
    const t = Math.min(elapsed / duration, 1)

    allFragments.forEach((frag) => {
      const vel = frag.userData.velocity as THREE.Vector3
      const rot = frag.userData.rotSpeed as THREE.Vector3

      frag.position.add(vel)
      vel.y -= 0.004 // gravity
      frag.rotation.x += rot.x
      frag.rotation.y += rot.y
      frag.rotation.z += rot.z
      ;(frag.material as THREE.MeshLambertMaterial).opacity = 1 - t

      const scale = 1 - t * 0.5
      frag.scale.set(scale, scale, scale)
    })

    if (t < 1) {
      requestAnimationFrame(animateFragments)
    } else {
      // Cleanup — dispose geometry + material to prevent memory leaks
      allFragments.forEach((f) => {
        scene.remove(f)
        f.geometry.dispose()
        ;(f.material as THREE.Material).dispose()
      })
    }
  }
  requestAnimationFrame(animateFragments)
}

// ── Phase 2: Flash + Banner (1.0s–3.0s) ────────────────────────────

export function showTierUpBanner(
  containerEl: HTMLElement,
  newTier: string,
  onComplete: () => void,
): void {
  const tint = getTierTint(newTier)
  const materials = TIER_MATERIALS[tint] ?? TIER_MATERIALS.wood
  const sheenHex = materials.accent.toString(16).padStart(6, '0')
  const tierLabel = TIERS[newTier]?.label ?? newTier

  // Full-screen flash
  const flash = document.createElement('div')
  flash.style.cssText = `
    position: absolute; inset: 0; z-index: 100;
    background: #${sheenHex};
    opacity: 0; pointer-events: none; border-radius: inherit;
    transition: opacity 0.3s;
  `
  containerEl.appendChild(flash)

  requestAnimationFrame(() => {
    flash.style.opacity = '0.6'
  })
  setTimeout(() => {
    flash.style.opacity = '0'
  }, 500)
  setTimeout(() => {
    flash.remove()
  }, 1000)

  // Banner overlay
  const banner = document.createElement('div')
  banner.style.cssText = `
    position: absolute; inset: 0; z-index: 101;
    display: flex; flex-direction: column; align-items: center; justify-content: center;
    pointer-events: none;
  `
  banner.innerHTML = `
    <div style="
      font-family: 'Press Start 2P', monospace; font-size: 28px; font-weight: bold;
      color: #${sheenHex};
      text-shadow: 0 2px 8px rgba(0,0,0,0.8);
      animation: tierBannerIn 0.5s ease-out;
      text-align: center;
    ">
      ${tierLabel.toUpperCase()} TIER
    </div>
    <div style="
      font-family: 'Press Start 2P', monospace; font-size: 14px;
      color: rgba(255,255,255,0.8);
      margin-top: 8px;
      text-shadow: 0 1px 4px rgba(0,0,0,0.8);
      animation: tierBannerIn 0.5s ease-out 0.2s both;
    ">
      Armor reforged!
    </div>
  `
  containerEl.appendChild(banner)

  // Inject keyframe animation (idempotent via id check)
  if (!document.getElementById('tier-banner-keyframes')) {
    const style = document.createElement('style')
    style.id = 'tier-banner-keyframes'
    style.textContent = `
      @keyframes tierBannerIn {
        from { opacity: 0; transform: scale(0.5) translateY(20px); }
        to { opacity: 1; transform: scale(1) translateY(0); }
      }
    `
    document.head.appendChild(style)
  }

  // Remove banner after 2 seconds
  setTimeout(() => {
    banner.style.transition = 'opacity 0.5s'
    banner.style.opacity = '0'
    setTimeout(() => {
      banner.remove()
      onComplete()
    }, 500)
  }, 2000)
}

// ── Phase 3: Update materials ───────────────────────────────────────

export function updateArmorMaterials(
  armorMeshes: Map<string, THREE.Group>,
  newTier: string,
): void {
  const tint = getTierTint(newTier)
  const materials = TIER_MATERIALS[tint] ?? TIER_MATERIALS.wood

  for (const [, mesh] of armorMeshes) {
    mesh.traverse((child) => {
      if (!(child instanceof THREE.Mesh)) return
      const isAccent = child.userData.isAccent || child.userData.materialRole === 'accent'
      const color = isAccent ? materials.accent : materials.primary
      child.userData.originalColor = new THREE.Color(color)
    })
  }
}

// ── Phase 4: Ghost pieces appear (3.0s–5.0s) ───────────────────────

const PIECE_ORDER: VoxelArmorPieceId[] = ['belt', 'breastplate', 'shoes', 'shield', 'helmet', 'sword']

export function showNewTierGhosts(
  armorMeshes: Map<string, THREE.Group>,
  newTier: string,
): void {
  const tint = getTierTint(newTier)
  const materials = TIER_MATERIALS[tint] ?? TIER_MATERIALS.wood

  for (const [pieceId, mesh] of armorMeshes) {
    mesh.visible = true
    mesh.scale.set(0.01, 0.01, 0.01)

    const delay = PIECE_ORDER.indexOf(pieceId as VoxelArmorPieceId) * 200
    const startTime = performance.now()

    function scaleIn(now: number) {
      const elapsed = now - startTime - delay
      if (elapsed < 0) {
        requestAnimationFrame(scaleIn)
        return
      }

      const t = Math.min(elapsed / 500, 1)
      const ease = 1 - Math.pow(1 - t, 3) // ease-out cubic

      mesh.scale.set(ease, ease, ease)

      // Ghost material — very faint, new tier color
      mesh.traverse((child) => {
        if (child instanceof THREE.Mesh) {
          const ghostMat = new THREE.MeshLambertMaterial({
            color: materials.primary,
            transparent: true,
            opacity: 0.08 * ease,
            depthWrite: false,
          })
          // Dispose the old material first
          const old = child.material
          if (Array.isArray(old)) {
            old.forEach((m) => m.dispose())
          } else if (old) {
            old.dispose()
          }
          child.material = ghostMat
        }
      })

      if (t < 1) requestAnimationFrame(scaleIn)
    }
    requestAnimationFrame(scaleIn)
  }
}

// ── Platform color update ───────────────────────────────────────────

export function updatePlatformColor(scene: THREE.Scene, newTier: string): void {
  const tint = getTierTint(newTier)
  const materials = TIER_MATERIALS[tint] ?? TIER_MATERIALS.wood
  const baseColor = new THREE.Color(materials.primary)

  const platform = scene.getObjectByName('platform')
  if (!platform) return

  platform.traverse((child) => {
    if (!(child instanceof THREE.Mesh)) return
    const mats = Array.isArray(child.material) ? child.material : [child.material]
    for (const m of mats) {
      if (m instanceof THREE.MeshLambertMaterial) {
        const variation = 0.7 + Math.random() * 0.15
        m.color.copy(baseColor).multiplyScalar(variation)
      }
    }
  })
}

// ── TTS announcement ────────────────────────────────────────────────

function speakTierUp(tierName: string): void {
  if (!('speechSynthesis' in window)) return
  window.speechSynthesis.cancel()

  const label = TIERS[tierName]?.label ?? tierName
  const utterance = new SpeechSynthesisUtterance(
    `${label} tier unlocked! Your armor has been reforged!`,
  )
  utterance.rate = 0.85
  window.speechSynthesis.speak(utterance)
}

// ── Full ceremony orchestrator ──────────────────────────────────────

export function triggerTierUpCeremony(config: TierUpCeremonyConfig): void {
  const { scene, armorMeshes, equippedPieces, oldTier, newTier, containerEl } = config

  const oldTint = getTierTint(oldTier)
  const oldMaterials = TIER_MATERIALS[oldTint] ?? TIER_MATERIALS.wood

  // Phase 1: Shatter old armor (0ms)
  shatterArmor(scene, armorMeshes, equippedPieces, oldMaterials)

  // Phase 2: Flash + Banner (starts at 1s)
  setTimeout(() => {
    showTierUpBanner(containerEl, newTier, () => {
      // Phase 4: Ghost pieces appear (after banner fades at ~3.5s)
      showNewTierGhosts(armorMeshes, newTier)
    })
  }, 1000)

  // Phase 3: Update material metadata (at 2.5s)
  setTimeout(() => {
    updateArmorMaterials(armorMeshes, newTier)
    updatePlatformColor(scene, newTier)
  }, 2500)

  // TTS announcement (at 1.5s)
  setTimeout(() => {
    speakTierUp(newTier)
  }, 1500)
}
