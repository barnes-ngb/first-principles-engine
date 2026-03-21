import * as THREE from 'three'

/** Animate a piece scaling in with glow light + elastic overshoot */
export function animateEquip(
  pieceGroup: THREE.Group,
  onComplete?: () => void,
): void {
  pieceGroup.visible = true
  pieceGroup.scale.set(0.01, 0.01, 0.01)

  // Store original colors for emissive reset
  pieceGroup.traverse((child) => {
    if (child instanceof THREE.Mesh && child.material instanceof THREE.MeshLambertMaterial) {
      child.userData.originalColor = child.material.color.clone()
    }
  })

  // Create temporary glow light at the piece's center
  const bounds = new THREE.Box3().setFromObject(pieceGroup)
  const center = bounds.getCenter(new THREE.Vector3())
  const glow = new THREE.PointLight(0x4caf50, 2, 3)
  glow.position.copy(center)
  pieceGroup.parent?.add(glow)

  const duration = 700
  const startTime = performance.now()

  function step(now: number) {
    const elapsed = now - startTime
    const t = Math.min(elapsed / duration, 1)

    // Elastic overshoot: piece pops past 1.0 then settles
    let ease: number
    if (t < 0.6) {
      ease = (t / 0.6) * 1.15
    } else {
      ease = 1.15 - 0.15 * ((t - 0.6) / 0.4)
    }

    pieceGroup.scale.set(ease, ease, ease)

    // Glow fades out
    glow.intensity = 2 * (1 - t)

    // Flash the materials bright then settle
    const brightness = Math.max(0, 1 - t * 1.5)
    pieceGroup.traverse((child) => {
      if (child instanceof THREE.Mesh && child.material instanceof THREE.MeshLambertMaterial) {
        const origColor = child.userData.originalColor as THREE.Color | undefined
        if (origColor) {
          child.material.emissive = origColor.clone().multiplyScalar(brightness * 0.6)
        }
      }
    })

    if (t < 1) {
      requestAnimationFrame(step)
    } else {
      // Cleanup
      pieceGroup.parent?.remove(glow)
      pieceGroup.scale.set(1, 1, 1)
      pieceGroup.traverse((child) => {
        if (child instanceof THREE.Mesh && child.material instanceof THREE.MeshLambertMaterial) {
          child.material.emissive = new THREE.Color(0x000000)
        }
      })
      onComplete?.()
    }
  }
  requestAnimationFrame(step)
}

/** Animate a piece scaling out */
export function animateUnequip(
  pieceGroup: THREE.Group,
  onComplete?: () => void,
): void {
  const duration = 300
  const startTime = performance.now()

  function step(now: number) {
    const elapsed = now - startTime
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
  requestAnimationFrame(step)
}
