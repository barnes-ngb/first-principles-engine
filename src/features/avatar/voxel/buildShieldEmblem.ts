import * as THREE from 'three'
import type { ShieldEmblem } from '../../../core/types'

/**
 * Build a shield emblem group from small BoxGeometry shapes.
 * Positioned at origin — caller must place it on the shield's front face.
 *
 * @param type - Emblem type identifier
 * @param U - One Minecraft pixel unit (0.125 * scale)
 * @param color - Emblem color (hex number)
 */
export function buildShieldEmblem(
  type: ShieldEmblem,
  U: number,
  color: number,
): THREE.Group {
  const group = new THREE.Group()
  group.name = 'shield_emblem'

  const mat = () => new THREE.MeshLambertMaterial({ color })

  switch (type) {
    case 'cross': {
      // Simple + shape — vertical bar + horizontal bar
      const v = new THREE.Mesh(new THREE.BoxGeometry(U * 0.2, U * 8.0, U * 1.0), mat())
      v.position.set(0, 0, 0)
      group.add(v)
      const h = new THREE.Mesh(new THREE.BoxGeometry(U * 0.2, U * 1.0, U * 5.6), mat())
      h.position.set(0, U * 1.4, 0)
      group.add(h)
      break
    }
    case 'star': {
      // 4 small rotated squares forming a star pattern
      const size = U * 2.0
      for (let i = 0; i < 4; i++) {
        const sq = new THREE.Mesh(new THREE.BoxGeometry(U * 0.2, size, size), mat())
        sq.rotation.x = (i * Math.PI) / 4
        group.add(sq)
      }
      break
    }
    case 'heart': {
      // Two small boxes side by side + one below offset (blocky heart)
      const topL = new THREE.Mesh(new THREE.BoxGeometry(U * 0.2, U * 2.0, U * 2.0), mat())
      topL.position.set(0, U * 1.0, -U * 1.2)
      group.add(topL)
      const topR = new THREE.Mesh(new THREE.BoxGeometry(U * 0.2, U * 2.0, U * 2.0), mat())
      topR.position.set(0, U * 1.0, U * 1.2)
      group.add(topR)
      const bottom = new THREE.Mesh(new THREE.BoxGeometry(U * 0.2, U * 2.4, U * 2.4), mat())
      bottom.position.set(0, -U * 1.2, 0)
      bottom.rotation.x = Math.PI / 4
      group.add(bottom)
      break
    }
    case 'sword': {
      // Vertical thin box (blade) + small horizontal crossguard
      const blade = new THREE.Mesh(new THREE.BoxGeometry(U * 0.2, U * 7.0, U * 0.8), mat())
      blade.position.set(0, 0, 0)
      group.add(blade)
      const guard = new THREE.Mesh(new THREE.BoxGeometry(U * 0.2, U * 0.8, U * 3.2), mat())
      guard.position.set(0, -U * 1.5, 0)
      group.add(guard)
      // Small pommel
      const pommel = new THREE.Mesh(new THREE.BoxGeometry(U * 0.2, U * 1.0, U * 1.0), mat())
      pommel.position.set(0, -U * 3.0, 0)
      group.add(pommel)
      break
    }
    case 'crown': {
      // 3 small boxes on top of a horizontal bar (3-point crown)
      const bar = new THREE.Mesh(new THREE.BoxGeometry(U * 0.2, U * 1.2, U * 5.0), mat())
      bar.position.set(0, -U * 0.6, 0)
      group.add(bar)
      for (let i = -1; i <= 1; i++) {
        const point = new THREE.Mesh(new THREE.BoxGeometry(U * 0.2, U * 2.4, U * 1.0), mat())
        point.position.set(0, U * 1.2, i * U * 1.8)
        group.add(point)
      }
      break
    }
    case 'fish': {
      // Ichthys: two angled thin boxes meeting at a point
      const top = new THREE.Mesh(new THREE.BoxGeometry(U * 0.2, U * 0.6, U * 5.0), mat())
      top.position.set(0, U * 0.8, -U * 0.3)
      top.rotation.x = 0.25
      group.add(top)
      const bot = new THREE.Mesh(new THREE.BoxGeometry(U * 0.2, U * 0.6, U * 5.0), mat())
      bot.position.set(0, -U * 0.8, -U * 0.3)
      bot.rotation.x = -0.25
      group.add(bot)
      break
    }
    case 'lion': {
      // Simplified lion: square head + two small triangle ears (3 boxes)
      const head = new THREE.Mesh(new THREE.BoxGeometry(U * 0.2, U * 3.6, U * 3.6), mat())
      head.position.set(0, -U * 0.4, 0)
      group.add(head)
      const earL = new THREE.Mesh(new THREE.BoxGeometry(U * 0.2, U * 1.4, U * 1.4), mat())
      earL.position.set(0, U * 2.0, -U * 1.6)
      group.add(earL)
      const earR = new THREE.Mesh(new THREE.BoxGeometry(U * 0.2, U * 1.4, U * 1.4), mat())
      earR.position.set(0, U * 2.0, U * 1.6)
      group.add(earR)
      break
    }
    case 'flame': {
      // 3 vertical boxes, center taller (blocky fire)
      const center = new THREE.Mesh(new THREE.BoxGeometry(U * 0.2, U * 6.0, U * 1.2), mat())
      center.position.set(0, U * 0.5, 0)
      group.add(center)
      const left = new THREE.Mesh(new THREE.BoxGeometry(U * 0.2, U * 4.0, U * 1.2), mat())
      left.position.set(0, -U * 0.5, -U * 1.6)
      group.add(left)
      const right = new THREE.Mesh(new THREE.BoxGeometry(U * 0.2, U * 4.0, U * 1.2), mat())
      right.position.set(0, -U * 0.5, U * 1.6)
      group.add(right)
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

/** All valid shield emblem types, in display order */
export const SHIELD_EMBLEM_OPTIONS: { id: ShieldEmblem; label: string; icon: string }[] = [
  { id: 'cross', label: 'Cross', icon: '✝' },
  { id: 'star', label: 'Star', icon: '⭐' },
  { id: 'heart', label: 'Heart', icon: '❤' },
  { id: 'sword', label: 'Sword', icon: '⚔' },
  { id: 'crown', label: 'Crown', icon: '👑' },
  { id: 'fish', label: 'Fish', icon: '🐟' },
  { id: 'lion', label: 'Lion', icon: '🦁' },
  { id: 'flame', label: 'Flame', icon: '🔥' },
]
