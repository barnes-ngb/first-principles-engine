import { describe, it, expect } from 'vitest'
import type { AvatarProfile } from '../../../core/types'
import { LINCOLN_FEATURES, LONDON_FEATURES } from '../../../core/types'
import { generateMinecraftSkin } from '../voxel/minecraftSkin'

// Minimal canvas polyfill for Node (vitest + jsdom)
function createMockCanvas(): HTMLCanvasElement {
  const pixels = new Map<string, string>()
  const ctx = {
    fillStyle: '#000000',
    imageSmoothingEnabled: true,
    clearRect: () => {},
    fillRect: (x: number, y: number, w: number, h: number) => {
      for (let px = x; px < x + w; px++) {
        for (let py = y; py < y + h; py++) {
          pixels.set(`${px},${py}`, ctx.fillStyle)
        }
      }
    },
    getImageData: (_x: number, _y: number, w: number, h: number) => ({
      data: new Uint8ClampedArray(w * h * 4),
    }),
    drawImage: () => {},
    // Expose pixels for assertions
    _pixels: pixels,
  }
  const canvas = {
    width: 64,
    height: 64,
    getContext: () => ctx,
    toDataURL: () => 'data:image/png;base64,mock',
    _ctx: ctx,
  } as unknown as HTMLCanvasElement & { _ctx: typeof ctx }
  return canvas
}

// Patch document.createElement to return our mock canvas
const origCreateElement = document.createElement.bind(document)
document.createElement = ((tag: string) => {
  if (tag === 'canvas') return createMockCanvas()
  return origCreateElement(tag)
}) as typeof document.createElement

function getPixel(canvas: HTMLCanvasElement, x: number, y: number): string | undefined {
  const ctx = (canvas as unknown as { _ctx: { _pixels: Map<string, string> } })._ctx
  return ctx._pixels.get(`${x},${y}`)
}

describe('generateMinecraftSkin', () => {
  const baseProfile: AvatarProfile = {
    childId: 'lincoln',
    themeStyle: 'minecraft',
    pieces: [],
    currentTier: 'stone',
    characterFeatures: { ...LINCOLN_FEATURES },
    ageGroup: 'older',
    equippedPieces: [],
    totalXp: 300,
    updatedAt: '2026-01-01',
  }

  it('returns a 64×64 canvas', () => {
    const canvas = generateMinecraftSkin(baseProfile)
    expect(canvas.width).toBe(64)
    expect(canvas.height).toBe(64)
  })

  it('paints skin tone on head front', () => {
    const canvas = generateMinecraftSkin(baseProfile)
    // Head front face is at (8,8) — row 6 (chin) should be skin tone
    const pixel = getPixel(canvas, 10, 14)
    expect(pixel).toBe(LINCOLN_FEATURES.skinTone)
  })

  it('paints eye color on face', () => {
    const canvas = generateMinecraftSkin(baseProfile)
    // Row 3 of face: eyes at (8+2, 8+3) = (10, 11) is eyeColor
    const pixel = getPixel(canvas, 10, 11)
    expect(pixel).toBe(LINCOLN_FEATURES.eyeColor)
  })

  it('paints hair on head top', () => {
    const canvas = generateMinecraftSkin(baseProfile)
    // Head top is at (8,0) — should be hair color
    const pixel = getPixel(canvas, 10, 2)
    expect(pixel).toBe(LINCOLN_FEATURES.hairColor)
  })

  it('paints shirt color on body front', () => {
    const canvas = generateMinecraftSkin(baseProfile)
    // Body front is at (20,20) to (27,31) — Lincoln default shirt is #BBBBBB
    const pixel = getPixel(canvas, 24, 25)
    expect(pixel).toBe('#BBBBBB')
  })

  it('uses London features and outfit colors', () => {
    const londonProfile: AvatarProfile = {
      ...baseProfile,
      childId: 'london',
      characterFeatures: { ...LONDON_FEATURES },
      ageGroup: 'younger',
    }
    const canvas = generateMinecraftSkin(londonProfile)
    // Body front should have London's mustard shirt #E8A838
    const pixel = getPixel(canvas, 24, 25)
    expect(pixel).toBe('#E8A838')
  })

  it('paints helmet overlay when equipped', () => {
    const profileWithHelmet: AvatarProfile = {
      ...baseProfile,
      equippedPieces: ['helmet'],
    }
    const canvas = generateMinecraftSkin(profileWithHelmet)
    // Head overlay top is at (40,0) — should have armor color painted
    const pixel = getPixel(canvas, 44, 2)
    expect(pixel).toBeDefined()
    // Should NOT be skin tone (it should be armor color)
    expect(pixel).not.toBe(LINCOLN_FEATURES.skinTone)
  })

  it('paints breastplate overlay when equipped', () => {
    const profileWithArmor: AvatarProfile = {
      ...baseProfile,
      equippedPieces: ['breastplate'],
    }
    const canvas = generateMinecraftSkin(profileWithArmor)
    // Body overlay front is at (20,36) — should have armor color
    const pixel = getPixel(canvas, 22, 38)
    expect(pixel).toBeDefined()
  })

  it('no overlay pixels when no armor equipped', () => {
    const canvas = generateMinecraftSkin(baseProfile)
    // Head overlay at (40,0) should be undefined (not painted = transparent)
    const pixel = getPixel(canvas, 44, 2)
    expect(pixel).toBeUndefined()
  })

  it('respects custom outfit colors', () => {
    const customProfile: AvatarProfile = {
      ...baseProfile,
      customization: {
        shirtColor: '#FF0000',
        pantsColor: '#0000FF',
        shoeColor: '#00FF00',
      },
    }
    const canvas = generateMinecraftSkin(customProfile)
    // Body front should be red shirt
    const pixel = getPixel(canvas, 24, 25)
    expect(pixel).toBe('#FF0000')
  })

  it('respects custom armor dye colors', () => {
    const dyedProfile: AvatarProfile = {
      ...baseProfile,
      equippedPieces: ['helmet'],
      customization: {
        armorColors: { helmet: '#FF00FF' },
      },
    }
    const canvas = generateMinecraftSkin(dyedProfile)
    // Head overlay should use the dye color
    const pixel = getPixel(canvas, 44, 2)
    expect(pixel).toBe('#FF00FF')
  })

  it('toDataURL returns a png data url', () => {
    const canvas = generateMinecraftSkin(baseProfile)
    expect(canvas.toDataURL('image/png')).toContain('data:image/png')
  })
})
