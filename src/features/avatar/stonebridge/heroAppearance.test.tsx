import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import type { CharacterFeatures } from '../../../core/types'
import { normalizeAvatarProfile } from '../normalizeProfile'
import { buildHeroAppearance, HERO_OUTFIT_DEFAULTS, readHeroFaceGrid, safeHexColor } from './heroAppearance'
import StonebridgeHero from './StonebridgeHero'
import { HERO_ROAD, MAP_HEIGHT, MAP_WIDTH, VILLAGE_MAP, heroFigureBox, mapTargetRect } from './villageMapLayout'

const features: CharacterFeatures = {
  skinTone: '#dba581', hairColor: '#231121', hairStyle: 'curly', hairLength: 'below_shoulder', eyeColor: '#035cab',
}
const appearance = (raw: Record<string, unknown> = {}) => buildHeroAppearance({
  profile: normalizeAvatarProfile({ characterFeatures: features, ...raw }), hasSavedFeatures: true,
})

describe('saved appearance reaches the actual flat drawing', () => {
  it('uses equipped pieces at their own forged tiers and saved dyes, never the current suit tier', () => {
    const view = appearance({
      currentTier: 'netherite', equippedPieces: ['helmet', 'breastplate', 'shield'],
      forgedPieces: { wood: { helmet: {} }, iron: { breastplate: {} }, diamond: { shield: {}, sword: {} } },
      customization: { armorColors: { helmet: '#ab1234' }, capeColor: '#ff1122', shieldEmblem: 'star', helmetCrest: 'plume' },
    })
    expect(view.pieces.map((piece) => [piece.pieceId, piece.tier])).toEqual([
      ['breastplate', 'iron'], ['shield', 'diamond'], ['helmet', 'wood'],
    ])
    const { container } = render(<svg><StonebridgeHero appearance={view} waving={false} /></svg>)
    expect(screen.getByTestId('hero-piece-helmet').querySelector('rect')).toHaveAttribute('fill', '#ab1234')
    expect(screen.getByTestId('hero-piece-breastplate').querySelector('rect')).toHaveAttribute('fill', '#d9dde4')
    expect(screen.getByTestId('hero-piece-shield').querySelector('rect')).toHaveAttribute('fill', '#7fe3df')
    expect(screen.queryByTestId('hero-piece-sword')).not.toBeInTheDocument()
    expect(screen.getByTestId('hero-shield-emblem')).toHaveAttribute('data-hero-emblem', 'star')
    expect(screen.getByTestId('hero-helmet-crest')).toBeInTheDocument()
    expect(container.querySelector('image')).toBeNull()
  })

  it.each(['older', 'younger'] as const)('mirrors the hub %s outfit defaults, with explicit customization winning', (ageGroup) => {
    const view = appearance({ ageGroup })
    expect({ shirt: view.shirt, pants: view.pants, shoes: view.shoes }).toEqual(HERO_OUTFIT_DEFAULTS[ageGroup])
    const custom = appearance({ ageGroup, customization: { shirtColor: '#123456', pantsColor: '#abcdef', shoeColor: '#987654' } })
    expect([custom.shirt, custom.pants, custom.shoes]).toEqual(['#123456', '#abcdef', '#987654'])
  })

  it('uses resolved age for legacy documents lacking a saved age, and qualifies default features', () => {
    const view = buildHeroAppearance({ profile: normalizeAvatarProfile({}), hasSavedFeatures: false,
      hasSavedAgeGroup: false, fallbackAgeGroup: 'younger' })
    expect(view.shirt).toBe('#E8A838')
    expect(view.defaulted).toContain('features')
  })

  it('accepts only a complete row-major face and literal safe colors; URL fields never become media', () => {
    const face = Array.from({ length: 64 }, (_, index) => index % 2 ? '#123456' : '#abcdef')
    expect(readHeroFaceGrid(face)).toEqual(face)
    expect(readHeroFaceGrid(face.slice(1))).toBeNull()
    expect(readHeroFaceGrid([...face.slice(1), 'url(https://invalid.test/pixel)'])).toBeNull()
    for (const invalid of ['url(#paint)', 'var(--color)', '#abcd', 'red', {}, 123]) expect(safeHexColor(invalid)).toBeNull()
    const view = appearance({ faceGrid: face, photoUrl: 'https://invalid.test/photo', skinTextureUrl: 'https://invalid.test/texture',
      characterFeatures: { ...features, skinTone: 'url(https://invalid.test/skin)' } })
    expect(view.skin).toMatch(/^#[0-9a-f]+$/i)
    expect(view.defaulted).toContain('skinTone')
    render(<svg><StonebridgeHero appearance={view} waving={false} /></svg>)
    const cells = screen.getByTestId('hero-face-grid').querySelectorAll('rect')
    expect(cells).toHaveLength(64)
    expect(cells[9]).toHaveAttribute('x', '-3')
    expect(cells[9]).toHaveAttribute('y', '-31')
    expect(cells[9]).toHaveAttribute('fill', face[9])
    expect(document.querySelector('image, img')).toBeNull()
  })

  it.each(['short', 'medium', 'long', 'curly', 'long_wavy'] as const)('honors the %s silhouette and every saved hair length', (hairStyle) => {
    const { rerender } = render(<svg />)
    const heights: number[] = []
    for (const hairLength of ['above_ear', 'ear_length', 'shoulder', 'below_shoulder'] as const) {
      const view = appearance({ characterFeatures: { ...features, hairStyle, hairLength } })
      rerender(<svg><StonebridgeHero appearance={view} waving={false} /></svg>)
      const hair = screen.getByTestId('hero-hair')
      expect(hair).toHaveAttribute('data-hero-hair', `${hairStyle}:${hairLength}`)
      expect(hair.querySelectorAll('circle').length).toBe(hairStyle === 'curly' ? 3 : hairStyle === 'long_wavy' ? 2 : 0)
      heights.push(Number(hair.querySelectorAll('rect')[1].getAttribute('height')))
    }
    expect(heights).toEqual([1.5, 3, 5.5, 7.5])
  })

  it.each([false, true])('keeps central face/eyes visibly uncovered by equipped helmet (grid=%s)', (grid) => {
    const view = appearance({ equippedPieces: ['helmet'], faceGrid: grid ? Array(64).fill('#c123ab') : undefined })
    render(<svg><StonebridgeHero appearance={view} waving={false} /></svg>)
    const helmetRects = [...screen.getByTestId('hero-piece-helmet').querySelectorAll('rect')]
    // Actual painted rectangles, rather than existence of hidden face nodes.
    // Both eye centres and central grid cells are outside every helmet fill.
    for (const [x, y] of [[-1.7, -27.9], [1.7, -27.9], [0, -29], [0, -26]]) {
      for (const rect of helmetRects) {
        const left = Number(rect.getAttribute('x')), top = Number(rect.getAttribute('y'))
        expect(x >= left && x <= left + Number(rect.getAttribute('width')) &&
          y >= top && y <= top + Number(rect.getAttribute('height'))).toBe(false)
      }
    }
  })

  it('keeps the conservative complete animated bounds clear of every native target throughout travel', () => {
    const x = HERO_ROAD.stopX
    for (let ground = HERO_ROAD.startGround; ground <= HERO_ROAD.ground; ground += 1) {
      const box = heroFigureBox(x, ground)
      // Crest y=-36.4, shield left=-10.35, swept hand right<16,
      // and stepping feet below the standing ground are all inside this box.
      expect(box.top).toBeLessThan(ground - 36.4)
      expect(box.right - x).toBeGreaterThan(16)
      expect(box.bottom).toBeGreaterThan(ground)
      for (const cell of VILLAGE_MAP) {
        const target = mapTargetRect(cell.col, cell.row)
        const left = target.leftPct * MAP_WIDTH / 100, top = target.topPct * MAP_HEIGHT / 100
        const right = left + target.widthPct * MAP_WIDTH / 100, bottom = top + target.heightPct * MAP_HEIGHT / 100
        expect(box.right < left || box.left > right || box.bottom < top || box.top > bottom, cell.missionId).toBe(true)
      }
    }
  })
})
