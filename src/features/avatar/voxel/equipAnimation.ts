import * as THREE from 'three'

/** Animate a piece scaling in with a glow effect */
export function animateEquip(
  pieceGroup: THREE.Group,
  onComplete?: () => void,
): void {
  pieceGroup.visible = true
  pieceGroup.scale.set(0.01, 0.01, 0.01)

  const duration = 600
  const startTime = Date.now()

  function step() {
    const elapsed = Date.now() - startTime
    const progress = Math.min(elapsed / duration, 1)

    // Elastic ease-out for satisfying snap
    const ease = 1 - Math.pow(1 - progress, 3) * Math.cos(progress * Math.PI * 0.5)

    pieceGroup.scale.set(ease, ease, ease)

    // Glow: brighten materials during animation, settle to normal
    pieceGroup.traverse((child) => {
      if (child instanceof THREE.Mesh && child.material instanceof THREE.MeshLambertMaterial) {
        const mat = child.material
        if (mat.color) {
          mat.emissive = mat.color.clone().multiplyScalar(
            Math.max(0, (1 - progress) * 0.5),
          )
        }
      }
    })

    if (progress < 1) {
      requestAnimationFrame(step)
    } else {
      // Reset emissive to 0 on complete
      pieceGroup.traverse((child) => {
        if (child instanceof THREE.Mesh && child.material instanceof THREE.MeshLambertMaterial) {
          child.material.emissive = new THREE.Color(0x000000)
        }
      })
      onComplete?.()
    }
  }
  step()
}

/** Animate a piece scaling out */
export function animateUnequip(
  pieceGroup: THREE.Group,
  onComplete?: () => void,
): void {
  const duration = 300
  const startTime = Date.now()

  function step() {
    const elapsed = Date.now() - startTime
    const progress = Math.min(elapsed / duration, 1)
    const ease = 1 - progress

    pieceGroup.scale.set(ease, ease, ease)

    if (progress < 1) {
      requestAnimationFrame(step)
    } else {
      pieceGroup.visible = false
      pieceGroup.scale.set(1, 1, 1) // Reset for next equip
      onComplete?.()
    }
  }
  step()
}
