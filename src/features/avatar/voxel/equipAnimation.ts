import * as THREE from 'three'

/** Spawn a burst of cube particles from a position, then clean up */
function createEquipParticles(scene: THREE.Scene, position: THREE.Vector3, color: number) {
  const particles: THREE.Mesh[] = []
  const particleCount = 12

  for (let i = 0; i < particleCount; i++) {
    const size = 0.06 + Math.random() * 0.06
    const particle = new THREE.Mesh(
      new THREE.BoxGeometry(size, size, size),
      new THREE.MeshBasicMaterial({
        color: i % 2 === 0 ? color : 0x4caf50,
        transparent: true,
        opacity: 1,
      }),
    )
    particle.position.copy(position)
    particle.userData.velocity = new THREE.Vector3(
      (Math.random() - 0.5) * 0.15,
      Math.random() * 0.1 + 0.05,
      (Math.random() - 0.5) * 0.15,
    )
    scene.add(particle)
    particles.push(particle)
  }

  const startTime = performance.now()
  const duration = 800

  function step(now: number) {
    const t = (now - startTime) / duration
    if (t >= 1) {
      particles.forEach((p) => {
        scene.remove(p)
        p.geometry.dispose()
        ;(p.material as THREE.MeshBasicMaterial).dispose()
      })
      return
    }
    particles.forEach((p) => {
      p.position.add(p.userData.velocity as THREE.Vector3)
      ;(p.userData.velocity as THREE.Vector3).y -= 0.003
      ;(p.material as THREE.MeshBasicMaterial).opacity = 1 - t
      p.scale.setScalar(1 - t * 0.5)
    })
    requestAnimationFrame(step)
  }
  requestAnimationFrame(step)
}

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

  // Particle burst
  if (pieceGroup.parent) {
    const pieceColor = pieceGroup.children[0] instanceof THREE.Mesh
      && pieceGroup.children[0].material instanceof THREE.MeshLambertMaterial
      ? pieceGroup.children[0].material.color.getHex()
      : 0xffffff
    createEquipParticles(pieceGroup.parent, center, pieceColor)
  }

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
