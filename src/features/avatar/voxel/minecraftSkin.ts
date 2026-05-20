import type { AvatarProfile, CharacterFeatures, VoxelArmorPieceId } from '../../../core/types'
import { TIER_MATERIALS } from './tierMaterials'

// ── Minecraft 64×64 Skin UV Map ─────────────────────────────────────
//
// Reference: https://minecraft.wiki/w/Skin#Skin_map
//
// Each body part has 6 faces laid out in a T-shape cross pattern:
//   [top] sits above [front], with [left][front][right][back] in a row
//   [bottom] sits below [front] (or above, depending on part)
//
// All coordinates are (x, y, width, height) in the 64×64 pixel space.

interface UVRect { x: number; y: number; w: number; h: number }

interface BodyPartUV {
  top: UVRect
  bottom: UVRect
  front: UVRect
  back: UVRect
  left: UVRect
  right: UVRect
}

// ── Base layer regions ──────────────────────────────────────────────

const HEAD: BodyPartUV = {
  top:    { x: 8,  y: 0,  w: 8, h: 8 },
  bottom: { x: 16, y: 0,  w: 8, h: 8 },
  right:  { x: 0,  y: 8,  w: 8, h: 8 },
  front:  { x: 8,  y: 8,  w: 8, h: 8 },
  left:   { x: 16, y: 8,  w: 8, h: 8 },
  back:   { x: 24, y: 8,  w: 8, h: 8 },
}

const BODY: BodyPartUV = {
  top:    { x: 20, y: 16, w: 8, h: 4 },
  bottom: { x: 28, y: 16, w: 8, h: 4 },
  right:  { x: 16, y: 20, w: 4, h: 12 },
  front:  { x: 20, y: 20, w: 8, h: 12 },
  left:   { x: 28, y: 20, w: 4, h: 12 },
  back:   { x: 32, y: 20, w: 8, h: 12 },
}

const RIGHT_ARM: BodyPartUV = {
  top:    { x: 44, y: 16, w: 4, h: 4 },
  bottom: { x: 48, y: 16, w: 4, h: 4 },
  right:  { x: 40, y: 20, w: 4, h: 12 },
  front:  { x: 44, y: 20, w: 4, h: 12 },
  left:   { x: 48, y: 20, w: 4, h: 12 },
  back:   { x: 52, y: 20, w: 4, h: 12 },
}

const LEFT_ARM: BodyPartUV = {
  top:    { x: 36, y: 48, w: 4, h: 4 },
  bottom: { x: 40, y: 48, w: 4, h: 4 },
  right:  { x: 32, y: 52, w: 4, h: 12 },
  front:  { x: 36, y: 52, w: 4, h: 12 },
  left:   { x: 40, y: 52, w: 4, h: 12 },
  back:   { x: 44, y: 52, w: 4, h: 12 },
}

const RIGHT_LEG: BodyPartUV = {
  top:    { x: 4,  y: 16, w: 4, h: 4 },
  bottom: { x: 8,  y: 16, w: 4, h: 4 },
  right:  { x: 0,  y: 20, w: 4, h: 12 },
  front:  { x: 4,  y: 20, w: 4, h: 12 },
  left:   { x: 8,  y: 20, w: 4, h: 12 },
  back:   { x: 12, y: 20, w: 4, h: 12 },
}

const LEFT_LEG: BodyPartUV = {
  top:    { x: 20, y: 48, w: 4, h: 4 },
  bottom: { x: 24, y: 48, w: 4, h: 4 },
  right:  { x: 16, y: 52, w: 4, h: 12 },
  front:  { x: 20, y: 52, w: 4, h: 12 },
  left:   { x: 24, y: 52, w: 4, h: 12 },
  back:   { x: 28, y: 52, w: 4, h: 12 },
}

// ── Overlay (second) layer regions ──────────────────────────────────

const HEAD_OVERLAY: BodyPartUV = {
  top:    { x: 40, y: 0,  w: 8, h: 8 },
  bottom: { x: 48, y: 0,  w: 8, h: 8 },
  right:  { x: 32, y: 8,  w: 8, h: 8 },
  front:  { x: 40, y: 8,  w: 8, h: 8 },
  left:   { x: 48, y: 8,  w: 8, h: 8 },
  back:   { x: 56, y: 8,  w: 8, h: 8 },
}

const BODY_OVERLAY: BodyPartUV = {
  top:    { x: 20, y: 32, w: 8, h: 4 },
  bottom: { x: 28, y: 32, w: 8, h: 4 },
  right:  { x: 16, y: 36, w: 4, h: 12 },
  front:  { x: 20, y: 36, w: 8, h: 12 },
  left:   { x: 28, y: 36, w: 4, h: 12 },
  back:   { x: 32, y: 36, w: 8, h: 12 },
}

const RIGHT_ARM_OVERLAY: BodyPartUV = {
  top:    { x: 44, y: 32, w: 4, h: 4 },
  bottom: { x: 48, y: 32, w: 4, h: 4 },
  right:  { x: 40, y: 36, w: 4, h: 12 },
  front:  { x: 44, y: 36, w: 4, h: 12 },
  left:   { x: 48, y: 36, w: 4, h: 12 },
  back:   { x: 52, y: 36, w: 4, h: 12 },
}

const LEFT_ARM_OVERLAY: BodyPartUV = {
  top:    { x: 52, y: 48, w: 4, h: 4 },
  bottom: { x: 56, y: 48, w: 4, h: 4 },
  right:  { x: 48, y: 52, w: 4, h: 12 },
  front:  { x: 52, y: 52, w: 4, h: 12 },
  left:   { x: 56, y: 52, w: 4, h: 12 },
  back:   { x: 60, y: 52, w: 4, h: 12 },
}

const RIGHT_LEG_OVERLAY: BodyPartUV = {
  top:    { x: 4,  y: 32, w: 4, h: 4 },
  bottom: { x: 8,  y: 32, w: 4, h: 4 },
  right:  { x: 0,  y: 36, w: 4, h: 12 },
  front:  { x: 4,  y: 36, w: 4, h: 12 },
  left:   { x: 8,  y: 36, w: 4, h: 12 },
  back:   { x: 12, y: 36, w: 4, h: 12 },
}

const LEFT_LEG_OVERLAY: BodyPartUV = {
  top:    { x: 4,  y: 48, w: 4, h: 4 },
  bottom: { x: 8,  y: 48, w: 4, h: 4 },
  right:  { x: 0,  y: 52, w: 4, h: 12 },
  front:  { x: 4,  y: 52, w: 4, h: 12 },
  left:   { x: 8,  y: 52, w: 4, h: 12 },
  back:   { x: 12, y: 52, w: 4, h: 12 },
}

// ── Color helpers ───────────────────────────────────────────────────

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '')
  return [
    parseInt(h.substring(0, 2), 16),
    parseInt(h.substring(2, 4), 16),
    parseInt(h.substring(4, 6), 16),
  ]
}

function darken(hex: string, amount: number): string {
  const [r, g, b] = hexToRgb(hex)
  const f = 1 - amount
  const toHex = (n: number) => Math.max(0, Math.min(255, Math.round(n * f))).toString(16).padStart(2, '0')
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`
}

function lighten(hex: string, amount: number): string {
  const [r, g, b] = hexToRgb(hex)
  const toHex = (n: number) => Math.min(255, Math.round(n + (255 - n) * amount)).toString(16).padStart(2, '0')
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`
}

function numToHex(n: number): string {
  return '#' + n.toString(16).padStart(6, '0')
}

// ── Fill helpers ────────────────────────────────────────────────────

function fillRect(ctx: CanvasRenderingContext2D, rect: UVRect, color: string) {
  ctx.fillStyle = color
  ctx.fillRect(rect.x, rect.y, rect.w, rect.h)
}

function fillAllFaces(ctx: CanvasRenderingContext2D, part: BodyPartUV, color: string) {
  for (const face of Object.values(part)) {
    fillRect(ctx, face, color)
  }
}

// ── Paint the base skin (body + skin tone) ──────────────────────────

function paintSkinBase(ctx: CanvasRenderingContext2D, skinTone: string) {
  const skinDark = darken(skinTone, 0.08)

  // Head — all faces get skin tone
  fillAllFaces(ctx, HEAD, skinTone)
  // Slightly darker on sides/back for depth
  fillRect(ctx, HEAD.left, skinDark)
  fillRect(ctx, HEAD.right, skinDark)
  fillRect(ctx, HEAD.back, skinDark)

  // Body
  fillAllFaces(ctx, BODY, skinTone)

  // Arms
  fillAllFaces(ctx, RIGHT_ARM, skinTone)
  fillAllFaces(ctx, LEFT_ARM, skinTone)

  // Legs
  fillAllFaces(ctx, RIGHT_LEG, skinTone)
  fillAllFaces(ctx, LEFT_LEG, skinTone)
}

// ── Paint clothes ───────────────────────────────────────────────────

function paintClothes(
  ctx: CanvasRenderingContext2D,
  profile: AvatarProfile,
) {
  const ageGroup = profile.ageGroup ?? 'older'
  const isLincoln = ageGroup === 'older'

  // Default outfit colors (matching buildCharacter.ts)
  const shirtColor = profile.customization?.shirtColor ?? (isLincoln ? '#BBBBBB' : '#E8A838')
  const pantsColor = profile.customization?.pantsColor ?? (isLincoln ? '#2A3A52' : '#C4B998')
  const skinTone = profile.characterFeatures?.skinTone ?? '#F5D6B8'
  const shoeColor = profile.customization?.shoeColor ?? (isLincoln ? skinTone : '#8B7355')

  const shirtDark = darken(shirtColor, 0.12)
  const pantsDark = darken(pantsColor, 0.12)
  const shoeDark = darken(shoeColor, 0.15)

  // Shirt — torso all faces
  fillAllFaces(ctx, BODY, shirtColor)
  fillRect(ctx, BODY.left, shirtDark)
  fillRect(ctx, BODY.right, shirtDark)
  fillRect(ctx, BODY.back, shirtDark)

  // Sleeves — upper portion of arms (top 8 of 12 rows)
  const armParts = [RIGHT_ARM, LEFT_ARM]
  for (const arm of armParts) {
    // Sleeve on front/back/sides — top 8 rows
    for (const faceKey of ['front', 'back', 'left', 'right'] as const) {
      const face = arm[faceKey]
      ctx.fillStyle = faceKey === 'back' || faceKey === 'left' ? shirtDark : shirtColor
      ctx.fillRect(face.x, face.y, face.w, 8)
    }
    // Top/bottom of arm
    fillRect(ctx, arm.top, shirtColor)
  }

  // Pants — legs, top 9 of 12 rows
  const legParts = [RIGHT_LEG, LEFT_LEG]
  for (const leg of legParts) {
    for (const faceKey of ['front', 'back', 'left', 'right'] as const) {
      const face = leg[faceKey]
      ctx.fillStyle = faceKey === 'back' || faceKey === 'left' ? pantsDark : pantsColor
      ctx.fillRect(face.x, face.y, face.w, 9)
    }
    fillRect(ctx, leg.top, pantsColor)
  }

  // Shoes — bottom 3 rows of legs + leg bottom face
  for (const leg of legParts) {
    for (const faceKey of ['front', 'back', 'left', 'right'] as const) {
      const face = leg[faceKey]
      ctx.fillStyle = faceKey === 'back' || faceKey === 'left' ? shoeDark : shoeColor
      ctx.fillRect(face.x, face.y + 9, face.w, 3)
    }
    fillRect(ctx, leg.bottom, shoeDark)
  }
}

// ── Paint face (8×8 front of head) ──────────────────────────────────

function paintFace(ctx: CanvasRenderingContext2D, features: Partial<CharacterFeatures>) {
  const skin = features.skinTone ?? '#F5D6B8'
  const hair = features.hairColor ?? '#6B4C32'
  const eyeColor = features.eyeColor ?? '#3D5A6B'

  const cheek = lighten(skin, 0.05)
  const mouth = darken(skin, 0.15)
  const noseShadow = darken(skin, 0.08)
  const mouthCorner = darken(skin, 0.05)
  const chinShadow = darken(skin, 0.06)

  // Same 8×8 grid as pixelFace.ts buildPaintedFace
  const grid: string[][] = [
    [hair, hair, hair, hair, hair, hair, hair, hair],
    [hair, hair, hair, hair, hair, hair, hair, hair],
    [hair, skin, skin, skin, skin, skin, skin, hair],
    [skin, '#FFFFFF', eyeColor, skin, skin, '#FFFFFF', eyeColor, skin],
    [skin, cheek, skin, noseShadow, noseShadow, skin, cheek, skin],
    [skin, skin, mouthCorner, mouth, mouth, mouthCorner, skin, skin],
    [skin, skin, skin, skin, skin, skin, skin, skin],
    [skin, skin, skin, chinShadow, chinShadow, skin, skin, skin],
  ]

  const { x: fx, y: fy } = HEAD.front
  grid.forEach((row, y) => {
    row.forEach((color, x) => {
      ctx.fillStyle = color
      ctx.fillRect(fx + x, fy + y, 1, 1)
    })
  })
}

// ── Paint hair ──────────────────────────────────────────────────────

function paintHair(ctx: CanvasRenderingContext2D, features: Partial<CharacterFeatures>) {
  const hair = features.hairColor ?? '#6B4C32'
  const hairDark = darken(hair, 0.15)
  const hairStyle = features.hairStyle ?? 'medium'
  const isLong = hairStyle === 'long' || hairStyle === 'long_wavy'

  // Head top — full hair
  fillRect(ctx, HEAD.top, hair)

  // Hair on sides — top rows
  const sideRows = isLong ? 5 : 3
  for (const faceKey of ['left', 'right'] as const) {
    const face = HEAD[faceKey]
    // Fill top rows with hair
    ctx.fillStyle = faceKey === 'left' ? hairDark : hair
    ctx.fillRect(face.x, face.y, face.w, sideRows)
    // Add single-pixel fringe along front edge
    ctx.fillStyle = hair
    if (faceKey === 'right') {
      // Right side: front edge is at x + w - 1
      for (let r = sideRows; r < sideRows + 2 && r < face.h; r++) {
        ctx.fillRect(face.x + face.w - 1, face.y + r, 1, 1)
      }
    } else {
      // Left side: front edge is at x
      for (let r = sideRows; r < sideRows + 2 && r < face.h; r++) {
        ctx.fillRect(face.x, face.y + r, 1, 1)
      }
    }
  }

  // Back of head — hair color (top portion)
  const backRows = isLong ? 6 : 4
  ctx.fillStyle = hairDark
  ctx.fillRect(HEAD.back.x, HEAD.back.y, HEAD.back.w, backRows)
}

// ── Paint armor overlay ─────────────────────────────────────────────

function getArmorColor(
  tier: string,
  pieceId: VoxelArmorPieceId,
  armorColors?: AvatarProfile['customization'],
): { primary: string; accent: string } {
  // Check for custom dye color
  const dyeHex = armorColors?.armorColors?.[pieceId as keyof typeof armorColors.armorColors]
  if (dyeHex) {
    return { primary: dyeHex, accent: lighten(dyeHex, 0.2) }
  }

  // Use tier material colors
  const tint = tier.toLowerCase()
  const mat = TIER_MATERIALS[tint] ?? TIER_MATERIALS.wood
  return {
    primary: numToHex(mat.primary),
    accent: numToHex(mat.accent),
  }
}

function paintArmorOverlay(
  ctx: CanvasRenderingContext2D,
  equippedPieces: string[],
  tier: string,
  customization?: AvatarProfile['customization'],
) {
  const equipped = new Set(equippedPieces)

  // Helmet → head overlay
  if (equipped.has('helmet')) {
    const { primary, accent } = getArmorColor(tier, 'helmet', customization)
    const dark = darken(primary, 0.15)

    // Fill all head overlay faces
    fillAllFaces(ctx, HEAD_OVERLAY, primary)
    fillRect(ctx, HEAD_OVERLAY.left, dark)
    fillRect(ctx, HEAD_OVERLAY.right, dark)
    fillRect(ctx, HEAD_OVERLAY.back, dark)

    // Accent stripe across the top
    ctx.fillStyle = accent
    ctx.fillRect(HEAD_OVERLAY.top.x + 2, HEAD_OVERLAY.top.y + 3, 4, 2)

    // Visor opening on front (clear middle rows to show face)
    ctx.clearRect(HEAD_OVERLAY.front.x + 1, HEAD_OVERLAY.front.y + 3, 6, 3)

    // Accent trim at bottom of front
    ctx.fillStyle = accent
    ctx.fillRect(HEAD_OVERLAY.front.x, HEAD_OVERLAY.front.y + 7, 8, 1)
  }

  // Breastplate → body overlay
  if (equipped.has('breastplate')) {
    const { primary, accent } = getArmorColor(tier, 'breastplate', customization)
    const dark = darken(primary, 0.15)

    fillAllFaces(ctx, BODY_OVERLAY, primary)
    fillRect(ctx, BODY_OVERLAY.left, dark)
    fillRect(ctx, BODY_OVERLAY.right, dark)
    fillRect(ctx, BODY_OVERLAY.back, dark)

    // Accent cross on front
    ctx.fillStyle = accent
    ctx.fillRect(BODY_OVERLAY.front.x + 3, BODY_OVERLAY.front.y + 1, 2, 8)
    ctx.fillRect(BODY_OVERLAY.front.x + 1, BODY_OVERLAY.front.y + 3, 6, 2)

    // Shoulder pads on arm overlays
    const armOverlays = [RIGHT_ARM_OVERLAY, LEFT_ARM_OVERLAY]
    for (const armOv of armOverlays) {
      ctx.fillStyle = primary
      fillRect(ctx, armOv.top, primary)
      // Top 3 rows of each arm face = shoulder pad
      for (const faceKey of ['front', 'back', 'left', 'right'] as const) {
        ctx.fillStyle = faceKey === 'back' || faceKey === 'left' ? dark : primary
        ctx.fillRect(armOv[faceKey].x, armOv[faceKey].y, armOv[faceKey].w, 3)
      }
    }
  }

  // Belt → body overlay waist area (bottom 2 rows)
  if (equipped.has('belt')) {
    const { primary, accent } = getArmorColor(tier, 'belt', customization)

    // Belt band across the waist (bottom 2 rows of body overlay)
    for (const faceKey of ['front', 'back', 'left', 'right'] as const) {
      const face = BODY_OVERLAY[faceKey]
      ctx.fillStyle = primary
      ctx.fillRect(face.x, face.y + 10, face.w, 2)
    }
    // Belt buckle accent on front center
    ctx.fillStyle = accent
    ctx.fillRect(BODY_OVERLAY.front.x + 3, BODY_OVERLAY.front.y + 10, 2, 2)
  }

  // Shoes → leg overlays (bottom portion)
  if (equipped.has('shoes')) {
    const { primary, accent } = getArmorColor(tier, 'shoes', customization)
    const dark = darken(primary, 0.15)

    const legOverlays = [RIGHT_LEG_OVERLAY, LEFT_LEG_OVERLAY]
    for (const legOv of legOverlays) {
      // Bottom 4 rows of each leg face = boot
      for (const faceKey of ['front', 'back', 'left', 'right'] as const) {
        const face = legOv[faceKey]
        ctx.fillStyle = faceKey === 'back' || faceKey === 'left' ? dark : primary
        ctx.fillRect(face.x, face.y + 8, face.w, 4)
      }
      fillRect(ctx, legOv.bottom, dark)
      // Boot trim accent
      ctx.fillStyle = accent
      const front = legOv.front
      ctx.fillRect(front.x, front.y + 8, front.w, 1)
    }
  }

  // Shield → left arm overlay (simple shield pattern)
  if (equipped.has('shield')) {
    const { primary, accent } = getArmorColor(tier, 'shield', customization)

    // Shield on left arm outer face
    const face = LEFT_ARM_OVERLAY.left
    ctx.fillStyle = primary
    ctx.fillRect(face.x, face.y + 2, face.w, 8)
    // Shield cross
    ctx.fillStyle = accent
    ctx.fillRect(face.x + 1, face.y + 2, 2, 8)
    ctx.fillRect(face.x, face.y + 5, face.w, 2)
  }

  // Sword → right arm overlay (blade hint on outer face)
  if (equipped.has('sword')) {
    const { accent } = getArmorColor(tier, 'sword', customization)

    // Sword blade hint on right arm outer face
    const face = RIGHT_ARM_OVERLAY.right
    ctx.fillStyle = '#87CEEB' // Sky blue blade
    ctx.fillRect(face.x + 1, face.y + 1, 2, 9)
    // Hilt
    ctx.fillStyle = accent
    ctx.fillRect(face.x, face.y + 9, face.w, 1)
    ctx.fillStyle = '#8B4513'
    ctx.fillRect(face.x + 1, face.y + 10, 2, 2)
  }
}

// ── Main export function ────────────────────────────────────────────

export function generateMinecraftSkin(profile: AvatarProfile): HTMLCanvasElement {
  const canvas = document.createElement('canvas')
  canvas.width = 64
  canvas.height = 64
  const ctx = canvas.getContext('2d')!

  // Start fully transparent
  ctx.clearRect(0, 0, 64, 64)

  const features: Partial<CharacterFeatures> = profile.characterFeatures ?? {}
  const skinTone = features.skinTone ?? '#F5D6B8'

  // 1. Paint skin tone on all body parts
  paintSkinBase(ctx, skinTone)

  // 2. Paint clothes over the base
  paintClothes(ctx, profile)

  // 3. Paint face on head front
  paintFace(ctx, features)

  // 4. Paint hair on head top/sides/back
  paintHair(ctx, features)

  // 5. Paint armor overlay layer
  const equipped = profile.equippedPieces ?? []
  if (equipped.length > 0) {
    const tier = (profile.currentTier as string) ?? 'WOOD'
    paintArmorOverlay(ctx, equipped, tier, profile.customization)
  }

  return canvas
}

// ── Download helper ─────────────────────────────────────────────────

export function downloadMinecraftSkin(profile: AvatarProfile, childName: string) {
  const canvas = generateMinecraftSkin(profile)
  const dataUrl = canvas.toDataURL('image/png')

  const link = document.createElement('a')
  link.download = `${childName.toLowerCase()}-armor-of-god-skin.png`
  link.href = dataUrl
  link.click()
}
