import * as THREE from 'three'

function box(
  w: number,
  h: number,
  d: number,
  material: THREE.Material,
): THREE.Mesh {
  return new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material)
}

/**
 * Build hair geometry.
 * @param headY  – Y position of the head center
 * @param U      – pixel unit (0.125 * scale). If omitted, uses legacy absolute sizes.
 */
export function buildHair(
  style: string,
  length: string,
  material: THREE.Material,
  headY: number,
  U?: number,
): THREE.Group {
  const hair = new THREE.Group()
  hair.name = 'hairGroup'

  // If U is provided, use pixel-unit based sizing (new Steve proportions)
  // Head is 8U×8U×8U, centered at headY
  if (U) {
    // Top cap — sits on top of head (slightly bigger for overhang)
    const top = box(U * 8.4, U * 2, U * 8.4, material)
    top.position.y = headY + U * 3.5
    hair.add(top)

    // Back panel
    const back = box(U * 8.4, U * 4, U * 1, material)
    back.position.set(0, headY + U * 1, -U * 3.8)
    hair.add(back)

    // Side panels
    const sideL = box(U * 1, U * 3, U * 8.4, material)
    sideL.position.set(-U * 4.2, headY + U * 1.5, 0)
    hair.add(sideL)

    const sideR = box(U * 1, U * 3, U * 8.4, material)
    sideR.position.set(U * 4.2, headY + U * 1.5, 0)
    hair.add(sideR)

    // Length-dependent back extensions + side panels
    if (length === 'ear_length') {
      // Back hair — extends below head to neck
      const backExt = box(U * 8.4, U * 6, U * 1.2, material)
      backExt.position.set(0, headY - U * 3, -U * 3.8)
      hair.add(backExt)

      // Side panels — extend past the ears (below head bottom at headY - U*4)
      const sideExtL = box(U * 1.2, U * 6, U * 6, material)
      sideExtL.position.set(-U * 4.2, headY - U * 1.5, U * 0.5)
      hair.add(sideExtL)
      const sideExtR = box(U * 1.2, U * 6, U * 6, material)
      sideExtR.position.set(U * 4.2, headY - U * 1.5, U * 0.5)
      hair.add(sideExtR)

      // Bangs — across forehead
      const bangs = box(U * 6.5, U * 1.5, U * 1.2, material)
      bangs.position.set(0, headY + U * 2.5, U * 3.8)
      hair.add(bangs)
    } else if (length === 'shoulder') {
      const backExt = box(U * 8.4, U * 7, U * 1.2, material)
      backExt.position.set(0, headY - U * 3, -U * 3.8)
      hair.add(backExt)
    } else if (length === 'below_shoulder') {
      const backExt = box(U * 8.4, U * 11, U * 1.2, material)
      backExt.position.set(0, headY - U * 5, -U * 3.8)
      hair.add(backExt)
    }

    // Curly: add extra small cubes for texture
    if (style === 'curly') {
      for (let i = 0; i < 8; i++) {
        const curl = box(U * 1.5, U * 1.5, U * 1.5, material)
        const angle = (i / 8) * Math.PI * 2
        curl.position.set(
          Math.cos(angle) * U * 4.5,
          headY + U * 2 + Math.sin(angle) * U * 1.5,
          Math.sin(angle) * U * 4.5,
        )
        hair.add(curl)
      }
    }

    // Medium style: thicker sides with more volume, extending below head
    if (style === 'medium') {
      const extraL = box(U * 1.4, U * 6, U * 8.4, material)
      extraL.position.set(-U * 4.7, headY - U * 0.5, 0)
      hair.add(extraL)
      const extraR = box(U * 1.4, U * 6, U * 8.4, material)
      extraR.position.set(U * 4.7, headY - U * 0.5, 0)
      hair.add(extraR)
    }

    // Long style: front bangs
    if (style === 'long') {
      const bangs = box(U * 7, U * 1.2, U * 1.2, material)
      bangs.position.set(0, headY + U * 2.5, U * 3.8)
      hair.add(bangs)
    }

    return hair
  }

  // ── Legacy fallback (absolute sizes) ──────────────────────────────

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
