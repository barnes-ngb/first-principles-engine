import * as THREE from 'three'

/** Spawn a burst of cube particles from a position, then clean up */
function createEquipParticles(scene: THREE.Object3D, position: THREE.Vector3, color: number) {
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
    if (child instanceof THREE.Mesh) {
      const mats = Array.isArray(child.material) ? child.material : [child.material]
      if (mats[0] instanceof THREE.MeshLambertMaterial || mats[0] instanceof THREE.MeshPhongMaterial) {
        child.userData.originalColor = mats[0].color.clone()
      }
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
    let pieceColor = 0xffffff
    if (pieceGroup.children[0] instanceof THREE.Mesh) {
      const mat = Array.isArray(pieceGroup.children[0].material)
        ? pieceGroup.children[0].material[0]
        : pieceGroup.children[0].material
      if (mat instanceof THREE.MeshLambertMaterial || mat instanceof THREE.MeshPhongMaterial) {
        pieceColor = mat.color.getHex()
      }
    }
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
      if (child instanceof THREE.Mesh) {
        const origColor = child.userData.originalColor as THREE.Color | undefined
        if (origColor) {
          const emissive = origColor.clone().multiplyScalar(brightness * 0.6)
          const mats = Array.isArray(child.material) ? child.material : [child.material]
          for (const m of mats) {
            if (m instanceof THREE.MeshLambertMaterial || m instanceof THREE.MeshPhongMaterial) {
              m.emissive = emissive.clone()
            }
          }
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
        if (child instanceof THREE.Mesh) {
          const mats = Array.isArray(child.material) ? child.material : [child.material]
          for (const m of mats) {
            if (m instanceof THREE.MeshLambertMaterial || m instanceof THREE.MeshPhongMaterial) {
              m.emissive = new THREE.Color(0x000000)
            }
          }
        }
      })
      onComplete?.()
    }
  }
  requestAnimationFrame(step)
}

// ── Equip ceremony animations ────────────────────────────────────────

/** Character does a small jump (shoes equip) */
export function animateJump(group: THREE.Object3D, height: number, duration: number) {
  const baseY = group.position.y
  const start = performance.now()
  function step(now: number) {
    const t = Math.min((now - start) / duration, 1)
    group.position.y = baseY + height * Math.sin(t * Math.PI)
    if (t < 1) requestAnimationFrame(step)
  }
  requestAnimationFrame(step)
}

/** Character nods head (helmet equip) */
export function animateNod(head: THREE.Object3D, duration: number) {
  const start = performance.now()
  function step(now: number) {
    const t = Math.min((now - start) / duration, 1)
    head.rotation.x = Math.sin(t * Math.PI * 2) * 0.15
    if (t < 1) requestAnimationFrame(step)
    else head.rotation.x = 0
  }
  requestAnimationFrame(step)
}

/** Sword does a quick flourish rotation (sword equip) */
export function animateSwordFlourish(swordGroup: THREE.Object3D, duration: number) {
  const restZ = swordGroup.rotation.z
  const start = performance.now()
  function step(now: number) {
    const t = Math.min((now - start) / duration, 1)
    swordGroup.rotation.z = restZ + Math.sin(t * Math.PI * 2) * 0.3
    if (t < 1) requestAnimationFrame(step)
    else swordGroup.rotation.z = restZ
  }
  requestAnimationFrame(step)
}

/** Character does a small hip turn (belt equip) */
export function animateHipTurn(character: THREE.Object3D, duration: number) {
  const start = performance.now()
  const baseRotY = character.rotation.y
  function step(now: number) {
    const t = Math.min((now - start) / duration, 1)
    // Quick left-right-center
    character.rotation.y = baseRotY + Math.sin(t * Math.PI * 3) * 0.15 * (1 - t)
    if (t < 1) requestAnimationFrame(step)
    else character.rotation.y = baseRotY
  }
  requestAnimationFrame(step)
}

/** Torso puffs up briefly (breastplate equip) */
export function animateTorsoPuff(torso: THREE.Object3D, duration: number) {
  const start = performance.now()
  function step(now: number) {
    const t = Math.min((now - start) / duration, 1)
    const puff = 1 + Math.sin(t * Math.PI) * 0.1
    torso.scale.set(puff, puff, puff)
    if (t < 1) requestAnimationFrame(step)
    else torso.scale.set(1, 1, 1)
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
