/**
 * The child's own hero, drawn flat — SVG shapes, one `<g>`, no renderer.
 *
 * ── What it is ───────────────────────────────────────────────────────────────
 *
 * A **simplified 2D paper-doll of the saved record**, in the village's own
 * coordinate system. It is not the 3D character and does not claim to be: see
 * `heroAppearance.ts` for the honest list of what the saved fields do and do not
 * reach. In particular there is no voxel geometry, no material, no texture and
 * no photo — nothing here loads a URL of any kind, and no image is generated.
 *
 * Everything it paints has been validated to a plain hex literal first, so a
 * stored `url(...)` or `var(...)` can neither be fetched nor rendered.
 *
 * ── Local coordinates ────────────────────────────────────────────────────────
 *
 * The origin is the figure's **feet, centred** — so the caller positions it by
 * translating to a point on the road and nothing in here needs to know where
 * that is. Up is negative y, as everywhere in SVG. The figure stands inside
 * `HERO_FIGURE` (20 × 34 map units), which is what `heroFigureBox` measures when
 * a test proves the hero clears every tap target.
 *
 * ── Decoration, structurally ─────────────────────────────────────────────────
 *
 * No control, no focus target, no accessible name and no live region: the
 * wrapper that mounts this is `aria-hidden` and `pointer-events: none`, so the
 * hero cannot take a tap meant for a place, cannot take the keyboard and cannot
 * announce itself over and over. The village's own readable list is unchanged
 * and remains the way a child who is not looking at the picture finds a place.
 */
import Box from '@mui/material/Box'

import { HERO_MOTION_MS } from './heroEntranceMotion'
import type { HeroAppearance, HeroPiecePaint } from './heroAppearance'
import type { HelmetCrest, ShieldEmblem, VoxelArmorPieceId } from '../../../core/types'

/** How far the hair falls, by saved `hairLength`. In figure units. */
const HAIR_DROP: Record<HeroAppearance['hairLength'], number> = {
  above_ear: 1.5,
  ear_length: 3,
  shoulder: 5.5,
  below_shoulder: 7.5,
}

/** What the saved `hairStyle` does to the silhouette. */
const HAIR_SHAPE: Record<HeroAppearance['hairStyle'], 'flat' | 'tuft' | 'curly' | 'wavy'> = {
  short: 'flat',
  medium: 'tuft',
  long: 'flat',
  curly: 'curly',
  long_wavy: 'wavy',
}

/**
 * The emblem marks, simplified.
 *
 * One small shape each, in the shield's own box — a readable MARK rather than a
 * reproduction of the 3D emblem art. `lion` and `fish` are the two the flat
 * vocabulary cannot really say, and they are drawn as a plain disc rather than
 * as a worse drawing of an animal.
 */
const EMBLEM_MARK: Record<ShieldEmblem, string> = {
  cross: 'M-0.5 -3 h1 v2 h2 v1 h-2 v2 h-1 v-2 h-2 v-1 h2 z',
  star: 'M0 -3.4 L0.9 -1.4 L3 -1.1 L1.4 0.3 L1.9 2.4 L0 1.3 L-1.9 2.4 L-1.4 0.3 L-3 -1.1 L-0.9 -1.4 Z',
  heart: 'M0 2 C -3 0, -3 -2.6, -1.4 -2.6 C -0.6 -2.6, 0 -1.9, 0 -1.4 C 0 -1.9, 0.6 -2.6, 1.4 -2.6 C 3 -2.6, 3 0, 0 2 Z',
  sword: 'M-0.5 -3.2 h1 v4 h1 v1 h-1 v1.4 h-1 v-1.4 h-1 v-1 h1 z',
  crown: 'M-2.6 1 L-2.6 -2 L-1.3 -0.8 L0 -2.6 L1.3 -0.8 L2.6 -2 L2.6 1 Z',
  fish: 'M0 -0.6 a2.2 1.6 0 1 0 0.1 0 Z',
  lion: 'M0 -0.6 a2.4 2.4 0 1 0 0.1 0 Z',
  flame: 'M0 2.2 C -2 0.6, -1.6 -1.4, 0 -3.2 C 1.6 -1.4, 2 0.6, 0 2.2 Z',
}

/** The crest shapes, over the helmet. `none` draws nothing. */
const CREST_MARK: Record<Exclude<HelmetCrest, 'none'>, string> = {
  fin: 'M0 -3 L1.2 0 L-1.2 0 Z',
  plume: 'M0 -3.4 C 1.6 -2.6, 1.6 -0.6, 0 0 C -1.6 -0.6, -1.6 -2.6, 0 -3.4 Z',
  horns: 'M-3.6 0 L-4.4 -2.6 L-2 -1 Z M3.6 0 L4.4 -2.6 L2 -1 Z',
  crown: 'M-3 0 L-3 -2.4 L-1.5 -1.2 L0 -2.8 L1.5 -1.2 L3 -2.4 L3 0 Z',
}

interface StonebridgeHeroProps {
  appearance: HeroAppearance
  /** Draw the one wave. The caller's motion owner decides; this just draws. */
  waving: boolean
}

export default function StonebridgeHero({ appearance, waving }: StonebridgeHeroProps) {
  const piece = (id: VoxelArmorPieceId): HeroPiecePaint | undefined =>
    appearance.pieces.find((entry) => entry.pieceId === id)
  const helmet = piece('helmet')
  const breastplate = piece('breastplate')
  const belt = piece('belt')
  const shoes = piece('shoes')
  const shield = piece('shield')
  const sword = piece('sword')

  const hairDrop = HAIR_DROP[appearance.hairLength] ?? HAIR_DROP.ear_length
  const hairShape = HAIR_SHAPE[appearance.hairStyle] ?? 'tuft'
  const face = appearance.faceGrid

  return (
    <g data-testid="stonebridge-hero">
      {/* The cape, behind everything, and only when one was saved. */}
      {appearance.cape && (
        <path
          data-testid="hero-cape"
          d="M-4.6 -23.5 L4.6 -23.5 L3.4 -8 L-3.4 -8 Z"
          fill={appearance.cape}
          opacity={0.92}
        />
      )}

      {/* Legs and feet. Shoes, when equipped, are painted over the feet. */}
      <rect x={-4.2} y={-13} width={3.4} height={13} fill={appearance.pants} />
      <rect x={0.8} y={-13} width={3.4} height={13} fill={appearance.pants} />
      {shoes ? (
        <g data-testid="hero-piece-shoes" data-hero-tier={shoes.tier}>
          <rect x={-4.8} y={-3.2} width={4.4} height={3.2} fill={shoes.base} />
          <rect x={0.4} y={-3.2} width={4.4} height={3.2} fill={shoes.base} />
          <rect x={-4.8} y={-0.8} width={4.4} height={0.8} fill={shoes.edge} />
          <rect x={0.4} y={-0.8} width={4.4} height={0.8} fill={shoes.edge} />
        </g>
      ) : (
        <>
          <rect x={-4.8} y={-2} width={4.4} height={2} fill={appearance.shoes} />
          <rect x={0.4} y={-2} width={4.4} height={2} fill={appearance.shoes} />
        </>
      )}

      {/* Torso, then the breastplate over it. */}
      <rect x={-5} y={-24} width={10} height={11} fill={appearance.shirt} />
      {breastplate && (
        <g data-testid="hero-piece-breastplate" data-hero-tier={breastplate.tier}>
          <rect x={-5.4} y={-24} width={10.8} height={9} fill={breastplate.base} />
          <rect x={-5.4} y={-24} width={10.8} height={1.2} fill={breastplate.edge} />
        </g>
      )}
      {belt && (
        <g data-testid="hero-piece-belt" data-hero-tier={belt.tier}>
          <rect x={-5.4} y={-15.4} width={10.8} height={2.4} fill={belt.base} />
          <rect x={-1} y={-15} width={2} height={1.8} fill={belt.edge} />
        </g>
      )}

      {/* The still arm, and the hand that holds the shield. */}
      <rect x={-7} y={-23} width={2} height={9.5} fill={appearance.skin} />
      {shield && (
        <g data-testid="hero-piece-shield" data-hero-tier={shield.tier}>
          <rect x={-10} y={-22} width={5} height={8} rx={1.4} fill={shield.base} />
          <rect x={-10} y={-22} width={5} height={8} rx={1.4} fill="none" stroke={shield.edge} strokeWidth={0.7} />
          {appearance.shieldEmblem && (
            <path
              data-testid="hero-shield-emblem"
              data-hero-emblem={appearance.shieldEmblem}
              d={EMBLEM_MARK[appearance.shieldEmblem]}
              transform="translate(-7.5 -18) scale(0.72)"
              fill={shield.edge}
            />
          )}
        </g>
      )}

      {/* The waving arm. The animation is the only motion in the figure, it is
          finite (two passes), and it is applied only while the caller says the
          hero is waving — a reduced-motion preference never reaches this,
          because the caller's pose never asks for it. */}
      <Box
        component="g"
        data-testid="hero-wave-arm"
        data-hero-waving={waving ? 'true' : 'false'}
        sx={{
          transformOrigin: '6px -23px',
          '@keyframes stonebridgeHeroWave': {
            '0%': { transform: 'rotate(0deg)' },
            '40%': { transform: 'rotate(-58deg)' },
            '70%': { transform: 'rotate(-28deg)' },
            '100%': { transform: 'rotate(0deg)' },
          },
          animation: waving
            ? `stonebridgeHeroWave ${HERO_MOTION_MS.wave / 2}ms ease-in-out 2`
            : 'none',
          '@media (prefers-reduced-motion: reduce)': { animation: 'none' },
        }}
      >
        <rect x={5} y={-23} width={2} height={9.5} fill={appearance.skin} />
        {sword && (
          <g data-testid="hero-piece-sword" data-hero-tier={sword.tier}>
            <rect x={5.2} y={-30} width={1.6} height={11} fill={sword.base} />
            <rect x={4} y={-19.4} width={4} height={1.2} fill={sword.edge} />
          </g>
        )}
      </Box>

      {/* The head: a saved pixel face when there is a valid one, otherwise the
          drawn face from the saved colours. */}
      {face ? (
        <g data-testid="hero-face-grid">
          {face.map((colour, index) => (
            <rect
              key={index}
              x={-4 + (index % 8)}
              y={-32 + Math.floor(index / 8)}
              width={1}
              height={1}
              fill={colour}
            />
          ))}
        </g>
      ) : (
        <g data-testid="hero-face-drawn">
          <rect x={-4} y={-32} width={8} height={8} fill={appearance.skin} />
          <rect x={-2.4} y={-28.6} width={1.4} height={1.4} fill={appearance.eyes} />
          <rect x={1} y={-28.6} width={1.4} height={1.4} fill={appearance.eyes} />
          {/* The mouth is the hair colour at low opacity rather than a new
              colour nobody saved: this figure invents no feature of its own. */}
          <rect x={-1.4} y={-26.2} width={2.8} height={0.7} fill={appearance.hair} opacity={0.5} />
        </g>
      )}

      {/* The hair silhouette — from BOTH saved fields: `hairLength` is how far
          it falls, `hairStyle` is what its edge does. It is drawn even over a
          saved face grid, because the grid is a face and not a haircut. */}
      <g data-testid="hero-hair" data-hero-hair={`${appearance.hairStyle}:${appearance.hairLength}`}>
        <rect x={-4.3} y={-32.6} width={8.6} height={2.6} fill={appearance.hair} />
        <rect x={-4.3} y={-30.4} width={1.5} height={hairDrop} fill={appearance.hair} />
        <rect x={2.8} y={-30.4} width={1.5} height={hairDrop} fill={appearance.hair} />
        {hairShape === 'tuft' && (
          <path d="M-1.6 -32.6 L0.4 -34.2 L2 -32.6 Z" fill={appearance.hair} />
        )}
        {hairShape === 'curly' && (
          <>
            <circle cx={-3} cy={-33} r={1.5} fill={appearance.hair} />
            <circle cx={0} cy={-33.6} r={1.6} fill={appearance.hair} />
            <circle cx={3} cy={-33} r={1.5} fill={appearance.hair} />
          </>
        )}
        {hairShape === 'wavy' && (
          <>
            <circle cx={-3.5} cy={-30.4 + hairDrop} r={1.5} fill={appearance.hair} />
            <circle cx={3.5} cy={-30.4 + hairDrop} r={1.5} fill={appearance.hair} />
          </>
        )}
      </g>

      {/* The helmet goes on last, over the hair, with its crest above it. */}
      {helmet && (
        <g data-testid="hero-piece-helmet" data-hero-tier={helmet.tier}>
          <rect x={-4.6} y={-33} width={9.2} height={6} rx={1} fill={helmet.base} />
          <rect x={-4.6} y={-28.2} width={9.2} height={1.2} fill={helmet.edge} />
          {appearance.helmetCrest && appearance.helmetCrest !== 'none' && (
            <path
              data-testid="hero-helmet-crest"
              data-hero-crest={appearance.helmetCrest}
              d={CREST_MARK[appearance.helmetCrest]}
              transform="translate(0 -33)"
              fill={helmet.edge}
            />
          )}
        </g>
      )}
    </g>
  )
}
