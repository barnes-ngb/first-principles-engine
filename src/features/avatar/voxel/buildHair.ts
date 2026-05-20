import * as THREE from 'three'

function box(
  w: number,
  h: number,
  d: number,
  material: THREE.Material,
): THREE.Mesh {
  return new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material)
}

/** Linearly interpolate between two hex colors */
function lerpColor(a: number, b: number, t: number): number {
  const ca = new THREE.Color(a)
  const cb = new THREE.Color(b)
  ca.lerp(cb, t)
  return ca.getHex()
}

/**
 * Build hair geometry.
 * @param headY  – Y position of the head center (0 when hair is a child of headGroup)
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
    // Extract base color for shade variations
    const baseMat = material as THREE.MeshPhongMaterial
    const baseHex = baseMat.color.getHex()
    const lightMat = new THREE.MeshPhongMaterial({
      color: lerpColor(baseHex, 0xFFFFFF, 0.1),
      specular: 0x332211,
      shininess: 12,
      flatShading: true,
    })
    const darkMat = new THREE.MeshPhongMaterial({
      color: lerpColor(baseHex, 0x000000, 0.12),
      specular: 0x332211,
      shininess: 12,
      flatShading: true,
    })

    // ── Lincoln-specific hair: medium style + ear_length ────────────
    // Parted on the LEFT, most volume sweeps to the RIGHT,
    // falls to about ear level, slightly tousled, medium warm brown.
    if (style === 'medium' && length === 'ear_length') {
      // Head block is 8U×8U×8U, centered at headY (typically 0 in local space)
      // Head top = headY+4U, head bottom = headY-4U
      // Head sides = ±4U, head front = +4U Z, head back = -4U Z

      // === TOP — sits flush on head, offset RIGHT (hair parts left) ===
      const top = box(U * 8.2, U * 1.0, U * 8.2, material)
      top.position.set(U * 0.5, headY + U * 4.5, 0)
      hair.add(top)

      // Part line — thin darker strip on the LEFT side of the top
      const partLine = box(U * 0.8, U * 1.1, U * 6.0, darkMat)
      partLine.position.set(-U * 2.5, headY + U * 4.55, 0)
      hair.add(partLine)

      // === LEFT SIDE — the PART side (thinner, less volume) ===
      const sideL = box(U * 0.8, U * 4.5, U * 6.0, material)
      sideL.position.set(-U * 4.1, headY + U * 1.8, 0)
      hair.add(sideL)

      // Small wisp below — just reaches ear level (headY-4U = ear)
      const sideL_tip = box(U * 0.7, U * 2.0, U * 4.0, darkMat)
      sideL_tip.position.set(-U * 4.1, headY - U * 0.5, U * 0.4)
      hair.add(sideL_tip)

      // === RIGHT SIDE — the VOLUME side (thicker, hair sweeps this way) ===
      const sideR = box(U * 1.6, U * 5.0, U * 6.8, material)
      sideR.position.set(U * 4.2, headY + U * 1.6, 0)
      hair.add(sideR)

      // Extra volume layer — hair puffs out on this side
      const sideR_vol = box(U * 0.8, U * 3.5, U * 4.8, lightMat)
      sideR_vol.position.set(U * 4.8, headY + U * 1.2, U * 0.6)
      hair.add(sideR_vol)

      // Lower wisp — reaches ear level
      const sideR_tip = box(U * 1.2, U * 2.5, U * 4.4, material)
      sideR_tip.position.set(U * 4.3, headY - U * 0.8, U * 0.4)
      hair.add(sideR_tip)

      // === BANGS — sweep from left part across forehead toward right ===
      const bangs = box(U * 6.0, U * 1.6, U * 1.4, material)
      bangs.position.set(U * 0.6, headY + U * 3.0, U * 3.8)
      hair.add(bangs)

      // Extra bang chunk on right side (hair sweeps this way)
      const bangTip = box(U * 1.6, U * 1.2, U * 1.2, lightMat)
      bangTip.position.set(U * 2.8, headY + U * 2.8, U * 3.7)
      hair.add(bangTip)

      // === BACK — covers back of head, reaches to neck ===
      const back = box(U * 8.2, U * 6.5, U * 1.2, material)
      back.position.set(0, headY + U * 1.2, -U * 4.2)
      hair.add(back)

      // Lower back — slight taper
      const backLow = box(U * 6.4, U * 2.5, U * 1.0, darkMat)
      backLow.position.set(0, headY - U * 2.2, -U * 4.2)
      hair.add(backLow)

      return hair
    }

    // ── London-specific hair: long_wavy + ear_length ────────────────
    // Sandy blonde, longer than Lincoln's, wavy, past ears, center-parted / messy.
    if (style === 'long_wavy') {
      // === TOP — thicker cap, slight center-part feel (no hard part line) ===
      const top = box(U * 8.4, U * 1.2, U * 8.4, material)
      top.position.set(0, headY + U * 4.6, 0)
      hair.add(top)

      // Inner volume layer
      const innerTop = box(U * 8.0, U * 0.8, U * 7.8, lightMat)
      innerTop.position.set(0, headY + U * 5.3, U * 0.3)
      hair.add(innerTop)

      // === LEFT SIDE — wavy, past ears ===
      const sideL = box(U * 1.4, U * 5.5, U * 6.4, material)
      sideL.position.set(-U * 4.2, headY + U * 1.2, 0)
      hair.add(sideL)
      // Wave bump on left
      const waveBumpL = box(U * 0.7, U * 2.5, U * 3.5, lightMat)
      waveBumpL.position.set(-U * 4.7, headY + U * 0.5, U * 0.8)
      hair.add(waveBumpL)
      // Lower wisps past ears (1-2 blocks further down than Lincoln)
      const sideL_tip = box(U * 1.0, U * 3.0, U * 4.5, material)
      sideL_tip.position.set(-U * 4.2, headY - U * 1.8, U * 0.3)
      hair.add(sideL_tip)
      // Extra wisp below ear level
      const sideL_low = box(U * 0.8, U * 1.5, U * 3.0, darkMat)
      sideL_low.position.set(-U * 4.1, headY - U * 3.5, U * 0.5)
      hair.add(sideL_low)

      // === RIGHT SIDE — wavy, past ears (roughly symmetric, slightly messy) ===
      const sideR = box(U * 1.4, U * 5.5, U * 6.4, material)
      sideR.position.set(U * 4.2, headY + U * 1.2, 0)
      hair.add(sideR)
      // Wave bump on right
      const waveBumpR = box(U * 0.7, U * 2.8, U * 3.8, lightMat)
      waveBumpR.position.set(U * 4.7, headY + U * 0.2, U * 0.6)
      hair.add(waveBumpR)
      // Lower wisps past ears
      const sideR_tip = box(U * 1.0, U * 3.0, U * 4.5, material)
      sideR_tip.position.set(U * 4.2, headY - U * 1.8, U * 0.3)
      hair.add(sideR_tip)
      // Extra wisp below ear level
      const sideR_low = box(U * 0.8, U * 1.8, U * 3.2, darkMat)
      sideR_low.position.set(U * 4.1, headY - U * 3.6, U * 0.4)
      hair.add(sideR_low)

      // === BANGS — messy/natural, falls across forehead ===
      const bangs = box(U * 6.5, U * 1.8, U * 1.4, material)
      bangs.position.set(0, headY + U * 2.8, U * 3.8)
      hair.add(bangs)
      // Messy bang chunks (natural kid hair)
      const bangChunkL = box(U * 1.5, U * 1.0, U * 1.0, lightMat)
      bangChunkL.position.set(-U * 2.0, headY + U * 2.2, U * 3.9)
      hair.add(bangChunkL)
      const bangChunkR = box(U * 1.3, U * 1.2, U * 1.0, material)
      bangChunkR.position.set(U * 1.8, headY + U * 2.4, U * 3.8)
      hair.add(bangChunkR)

      // === BACK — covers back of head, reaches below ears ===
      const back = box(U * 8.4, U * 7.0, U * 1.3, material)
      back.position.set(0, headY + U * 0.8, -U * 4.2)
      hair.add(back)
      // Lower back extension — wavy taper
      const backLow = box(U * 7.0, U * 3.5, U * 1.1, darkMat)
      backLow.position.set(0, headY - U * 2.8, -U * 4.2)
      hair.add(backLow)
      // Wave texture on back
      const backWave = box(U * 5.0, U * 1.5, U * 0.6, lightMat)
      backWave.position.set(U * 0.5, headY - U * 1.0, -U * 4.8)
      hair.add(backWave)

      return hair
    }

    // ── Generic hair (other style/length combos) ────────────────────

    // Top cap — thick layer covering entire top of head
    const top = box(U * 8.6, U * 2.5, U * 8.6, material)
    top.position.y = headY + U * 3.8
    hair.add(top)

    // Extra volume layer on top — slightly lighter shade hint
    const innerTop = box(U * 8.2, U * 1.5, U * 8.2, material)
    innerTop.position.y = headY + U * 5.2
    hair.add(innerTop)

    // Back panel — thicker base
    const back = box(U * 8.6, U * 5, U * 1.4, material)
    back.position.set(0, headY + U * 0.5, -U * 3.8)
    hair.add(back)

    // Side panels — base volume
    const sideL = box(U * 1.4, U * 4, U * 8.4, material)
    sideL.position.set(-U * 4.4, headY + U * 1.5, 0)
    hair.add(sideL)

    const sideR = box(U * 1.4, U * 4, U * 8.4, material)
    sideR.position.set(U * 4.4, headY + U * 1.5, 0)
    hair.add(sideR)

    // Length-dependent back extensions + side panels
    if (length === 'ear_length') {
      // Back hair — extends well below head to neck/collar area
      const backExt = box(U * 8.6, U * 8, U * 1.6, material)
      backExt.position.set(0, headY - U * 3.5, -U * 3.8)
      hair.add(backExt)

      // Side panels — extend PAST the ears (head bottom at headY - U*4)
      const sideExtL = box(U * 1.6, U * 8, U * 7, material)
      sideExtL.position.set(-U * 4.4, headY - U * 2, U * 0.3)
      hair.add(sideExtL)
      const sideExtR = box(U * 1.6, U * 8, U * 7, material)
      sideExtR.position.set(U * 4.4, headY - U * 2, U * 0.3)
      hair.add(sideExtR)

      // Bangs — hangs over forehead
      const bangs = box(U * 7, U * 2.5, U * 1.6, material)
      bangs.position.set(0, headY + U * 2, U * 3.8)
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

    // Short style: shorter sides, no extensions, messy tousled chunks on top (kid hair)
    if (style === 'short') {
      // Trim side panels shorter (override the default ones above)
      sideL.scale.y = 0.6
      sideL.position.y = headY + U * 2.0
      sideR.scale.y = 0.6
      sideR.position.y = headY + U * 2.0

      // Messy chunks on top — kids' hair is rarely neat
      const chunk1 = box(U * 2.0, U * 1.5, U * 2.5, material)
      chunk1.position.set(-U * 2, headY + U * 5.5, U * 1.5)
      hair.add(chunk1)
      const chunk2 = box(U * 1.8, U * 1.2, U * 2.2, material)
      chunk2.position.set(U * 2.5, headY + U * 5.3, -U * 1)
      hair.add(chunk2)
      const chunk3 = box(U * 1.5, U * 1.8, U * 2.0, material)
      chunk3.position.set(0, headY + U * 5.8, U * 0.5)
      hair.add(chunk3)

      // Short bangs — doesn't hang over eyes
      const bangs = box(U * 5, U * 1.2, U * 1.4, material)
      bangs.position.set(0, headY + U * 3.0, U * 3.8)
      hair.add(bangs)
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

    // Medium style (non-ear_length): thicker sides with more volume
    if (style === 'medium' && length !== 'ear_length') {
      const extraL = box(U * 1.6, U * 7, U * 8.4, material)
      extraL.position.set(-U * 4.8, headY - U * 1, 0)
      hair.add(extraL)
      const extraR = box(U * 1.6, U * 7, U * 8.4, material)
      extraR.position.set(U * 4.8, headY - U * 1, 0)
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

// ── Helmet-compatible hair ──────────────────────────────────────────

/**
 * Build trimmed hair strands that peek from under a helmet.
 * Only shows hair at the edges where it would naturally stick out.
 * @param headY  – Y position of the head center (0 when child of headGroup)
 * @param U      – pixel unit (0.125 * scale)
 */
export function buildHelmHair(
  material: THREE.Material,
  headY: number,
  U: number,
): THREE.Group {
  const g = new THREE.Group()
  g.name = 'helmHairGroup'

  // Helmet side guards at ±U*4.4, bottom at ~headY-U*3.6
  // Hair peeks from UNDER the helmet edges

  // Side strands peeking below the helmet side guards
  const strandL = box(U * 1.2, U * 2.8, U * 4.0, material)
  strandL.position.set(-U * 4.4, headY - U * 3.8, U * 0.5)
  g.add(strandL)

  const strandR = box(U * 1.3, U * 3.0, U * 4.2, material)
  strandR.position.set(U * 4.4, headY - U * 3.9, U * 0.5)
  g.add(strandR)

  // Back hair peeking below helmet back plate
  const backStrand = box(U * 7.0, U * 3.0, U * 1.4, material)
  backStrand.position.set(0, headY - U * 3.8, -U * 4.0)
  g.add(backStrand)

  // Wisp of bangs peeking from under the brow ridge
  const bangWisp = box(U * 4.0, U * 0.8, U * 0.6, material)
  bangWisp.position.set(U * 0.4, headY + U * 1.2, U * 4.5)
  g.add(bangWisp)

  return g
}
