import * as THREE from 'three'

function box(
  w: number,
  h: number,
  d: number,
  material: THREE.Material,
): THREE.Mesh {
  return new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material)
}

export function buildHair(
  style: string,
  length: string,
  material: THREE.Material,
  headY: number,
): THREE.Group {
  const hair = new THREE.Group()
  hair.name = 'hairGroup'

  // Top cap (always present)
  const top = box(1.05, 0.3, 1.05, material)
  top.position.y = headY + 0.65
  hair.add(top)

  // Sides
  const sideL = box(0.15, 0.4, 1.05, material)
  sideL.position.set(-0.5, headY + 0.5, 0)
  hair.add(sideL)

  const sideR = box(0.15, 0.4, 1.05, material)
  sideR.position.set(0.5, headY + 0.5, 0)
  hair.add(sideR)

  // Back — length varies
  if (length === 'above_ear') {
    const back = box(1.05, 0.4, 0.2, material)
    back.position.set(0, headY + 0.5, -0.45)
    hair.add(back)
  } else if (length === 'ear_length') {
    const back = box(1.05, 0.6, 0.25, material)
    back.position.set(0, headY + 0.35, -0.45)
    hair.add(back)
  } else if (length === 'shoulder') {
    const back = box(1.05, 1.0, 0.25, material)
    back.position.set(0, headY + 0.15, -0.45)
    hair.add(back)
  } else if (length === 'below_shoulder') {
    const back = box(1.05, 1.4, 0.25, material)
    back.position.set(0, headY - 0.05, -0.45)
    hair.add(back)
  }

  // Curly: add extra small cubes around the edges for texture
  if (style === 'curly') {
    for (let i = 0; i < 8; i++) {
      const curl = box(0.2, 0.2, 0.2, material)
      const angle = (i / 8) * Math.PI * 2
      curl.position.set(
        Math.cos(angle) * 0.55,
        headY + 0.5 + Math.sin(angle) * 0.2,
        Math.sin(angle) * 0.55,
      )
      hair.add(curl)
    }
  }

  // Medium style: slightly thicker sides
  if (style === 'medium') {
    const extraL = box(0.12, 0.5, 1.05, material)
    extraL.position.set(-0.55, headY + 0.4, 0)
    hair.add(extraL)

    const extraR = box(0.12, 0.5, 1.05, material)
    extraR.position.set(0.55, headY + 0.4, 0)
    hair.add(extraR)
  }

  // Long style: front bangs
  if (style === 'long') {
    const bangs = box(0.9, 0.15, 0.15, material)
    bangs.position.set(0, headY + 0.42, 0.48)
    hair.add(bangs)
  }

  return hair
}
