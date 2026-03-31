import * as THREE from 'three'
import type { HelmetCrest } from '../../../core/types'

/**
 * Build a helmet crest group from small BoxGeometry shapes.
 * Positioned in helmet-local coordinates (headGroup space).
 * Sits on top of the helmet dome.
 *
 * @param type - Crest type identifier
 * @param U - One Minecraft pixel unit (0.125 * scale)
 * @param color - Crest color (hex number)
 * @param headPx - Head size in pixels (default 9 for Legends proportions)
 * @returns Group or null if type is 'none'
 */
export function buildHelmetCrest(
  type: HelmetCrest,
  U: number,
  color: number,
  headPx = 9,
): THREE.Group | null {
  if (type === 'none') return null

  const group = new THREE.Group()
  group.name = 'helmet_crest_custom'

  const mat = () => new THREE.MeshLambertMaterial({ color })

  // Base Y: top of helmet dome. Dome is (headPx + 1.6)U with center at 0.4U.
  // Top = 0.4 + (headPx + 1.6) / 2
  const domeSize = headPx + 1.6
  const baseY = U * (0.4 + domeSize / 2)

  switch (type) {
    case 'fin': {
      // Single tall thin box running front-to-back (Spartan/mohawk style)
      const fin = new THREE.Mesh(new THREE.BoxGeometry(U * 1.0, U * 5.0, U * 8.0), mat())
      fin.position.set(0, baseY + U * 2.5, 0)
      group.add(fin)
      break
    }
    case 'plume': {
      // 3 thin boxes fanning backward from top (feather plume)
      for (let i = 0; i < 3; i++) {
        const feather = new THREE.Mesh(new THREE.BoxGeometry(U * 0.6, U * 1.2, U * 6.0), mat())
        const yOffset = baseY + U * (2.0 - i * 0.8)
        const zOffset = -U * (1.0 + i * 1.2)
        feather.position.set(0, yOffset, zOffset)
        feather.rotation.x = -0.15 * (i + 1) // Fan backward
        group.add(feather)
      }
      break
    }
    case 'horns': {
      // Two angled boxes going up-outward from sides (Viking style)
      const hornL = new THREE.Mesh(new THREE.BoxGeometry(U * 1.2, U * 5.0, U * 1.2), mat())
      hornL.position.set(-U * 3.5, baseY + U * 2.0, U * 0.5)
      hornL.rotation.z = 0.4 // Angle outward
      group.add(hornL)
      const hornR = new THREE.Mesh(new THREE.BoxGeometry(U * 1.2, U * 5.0, U * 1.2), mat())
      hornR.position.set(U * 3.5, baseY + U * 2.0, U * 0.5)
      hornR.rotation.z = -0.4 // Angle outward
      group.add(hornR)
      break
    }
    case 'crown': {
      // 3 small vertical boxes on top (king style)
      for (let i = -1; i <= 1; i++) {
        const point = new THREE.Mesh(new THREE.BoxGeometry(U * 1.2, U * 3.0, U * 1.2), mat())
        point.position.set(i * U * 2.5, baseY + U * 1.5, U * 0.5)
        group.add(point)
      }
      break
    }
  }

  // Tag all children for tier material system
  group.traverse((child) => {
    if (child instanceof THREE.Mesh) {
      child.userData.materialRole = 'accent'
      child.userData.isAccent = true
    }
  })

  return group
}

/** All valid helmet crest types, in display order */
export const HELMET_CREST_OPTIONS: { id: HelmetCrest; label: string; icon: string }[] = [
  { id: 'none', label: 'None', icon: '—' },
  { id: 'fin', label: 'Fin', icon: '🦈' },
  { id: 'plume', label: 'Plume', icon: '🪶' },
  { id: 'horns', label: 'Horns', icon: '🐂' },
  { id: 'crown', label: 'Crown', icon: '👑' },
]
