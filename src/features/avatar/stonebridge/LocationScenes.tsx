/**
 * Every Stonebridge location, drawn in two states — one structural vocabulary.
 *
 * ── Why these are hand-written SVG and not styled emoji ──────────────────────
 *
 * `OldBridgeScene` made the argument for one location: "broken" as a greyscale
 * filter and "fixed" as a glow is a **colour** change, and a colour change is
 * not a picture of a repaired building. A child who cannot tell
 * `grayscale(0.85)` from `drop-shadow` saw the same tower twice. This file
 * finishes the job for the other six, and holds the same bar the bridge holds:
 *
 *   • **the difference is geometry** — treads, a balcony, a roof ridge, a tool
 *     rack, lantern heads, a flame, a row of banners. Take all the colour out
 *     and the two states are still obviously different pictures;
 *   • **the composition is identical** between the two renders. Same camera,
 *     same ground line, same shaft, same hearth, same beacon bowl. Nothing
 *     moves except what the repair actually changed, because a before-and-after
 *     that re-frames the scene is two drawings, not a before and after;
 *   • **nothing is a ruin.** The unfinished state is a job waiting to be done:
 *     an absence (treads that stop short, a gap at the ridge, bare posts) plus
 *     the temporary measures the village has *already* made — the plank over
 *     the widest gap, the near lanterns lit, the bells ringing, the hearth
 *     burning. STONEBRIDGE_BIBLE › Tone Guidelines, and the canon the Bible
 *     already fixes: the Forge's "main hearth is burning again", the
 *     Watchtower's "bells work", the Square's fountain that "runs again".
 *
 * ── One drawing, two sizes ───────────────────────────────────────────────────
 *
 * {@link LocationStructure} is the structure alone, composed in a local
 * `STRUCTURE_BOX`. The connected village overview places those boxes on a grid
 * and draws the land between them; {@link LocationScene} scales ONE of them up
 * into a framed card/dialog picture. So the silhouette a child sees in the
 * overview is the same silhouette they then see large when they open that place
 * from the list — not a second drawing of it.
 *
 * No remote asset, no generated image, no new dependency, no emoji, and no
 * state of its own: `state` comes from the caller, which derives it from the
 * existing completed-mission list. **No image here defines progress.**
 *
 * Static by design — the one exception is the celebration's banner flourish
 * (`animateBanner`), which a reduced-motion preference switches off while
 * keeping the banner.
 */
import Box from '@mui/material/Box'
import type { ReactElement } from 'react'

import { STRUCTURE_BOX, TERRAIN, type StructureState } from './villageMapLayout'

/**
 * Warm light on a finished job, cool overcast on an unfinished one.
 *
 * The palette follows the state; it is never what *tells* you the state. The
 * hearth flame is outside it on purpose — it burns in both, because the Bible
 * says it already does.
 */
function palette(repaired: boolean) {
  return {
    stone: repaired ? '#9a9183' : '#88857f',
    stoneLit: repaired ? '#bdb29c' : '#a09c94',
    timber: repaired ? '#8a5a33' : '#6f6459',
    timberLit: repaired ? '#b07a45' : '#877b6d',
    roof: repaired ? '#8c4a38' : '#6a5f58',
    roofLit: repaired ? '#ad6049' : '#80746b',
    cloth: repaired ? '#7BC8FF' : '#90959d',
    clothWarm: repaired ? '#F5C542' : '#9b968a',
    glass: repaired ? '#FFD98A' : '#9aa0a8',
    iron: '#4f4842',
    dark: '#2a2420',
  } as const
}

type Ink = ReturnType<typeof palette>

/** What every location's drawing is handed: its state, its ink, its flourish. */
interface StructureInk {
  repaired: boolean
  ink: Ink
  animate: boolean
}

/**
 * The raised banner — the canon mark of a finished repair, on every location.
 *
 * A `Box component="g"` rather than a bare `<g>` so the celebration's one
 * flourish can be expressed as a keyframe with a reduced-motion rule beside
 * it, in the same place, instead of a second animation mechanism.
 */
function Banner({
  x,
  y,
  pole,
  span,
  ink,
  animate,
}: {
  /** Pole left edge. */
  x: number
  /** Pole top. */
  y: number
  /** Pole height. */
  pole: number
  /** How far the pennant flies. */
  span: number
  ink: Ink
  animate: boolean
}) {
  return (
    <Box
      component="g"
      data-testid="structure-banner"
      sx={{
        transformOrigin: `${x}px ${y + pole}px`,
        animation: animate ? 'sbStructureBanner 0.9s cubic-bezier(0.34,1.56,0.64,1) forwards' : 'none',
        '@keyframes sbStructureBanner': {
          '0%': { transform: 'translateY(14px) scale(0.5)', opacity: 0 },
          '60%': { opacity: 1 },
          '100%': { transform: 'translateY(0) scale(1)', opacity: 1 },
        },
        // A banner that flies up is the celebration's one flourish; a person who
        // asked for less motion still gets the banner, it is simply already up.
        '@media (prefers-reduced-motion: reduce)': { animation: 'none' },
      }}
    >
      <rect x={x} y={y} width={2} height={pole} rx={1} fill={ink.timberLit} />
      <path
        d={`M${x + 2} ${y + 2} L${x + 2 + span} ${y + 2 + span * 0.26} L${x + 2} ${y + 2 + span * 0.52} Z`}
        fill={ink.cloth}
      />
      <path
        d={`M${x + 2} ${y + 2} L${x + 2 + span} ${y + 2 + span * 0.26} L${x + 2} ${y + 2 + span * 0.26} Z`}
        fill={ink.clothWarm}
      />
    </Box>
  )
}

/** Evenly spaced plank slots along the Old Bridge deck — both states use these. */
const BRIDGE_PLANKS = 12
const bridgePlankX = (i: number) => 16 + i * 5.7
/** The holes. Two are adjacent, which is the gap the temporary plank bridges. */
const BRIDGE_MISSING = new Set([4, 5, 9])
/** Rail posts, repaired only — the whole way across the span. */
const BRIDGE_RAIL_POSTS = [18, 30.4, 42.8, 55.2, 67.6, 80]

/** Lantern posts along the path: x, the road edge it stands on, and its height. */
const LANTERN_POSTS = [
  { x: 10, base: 42.6, height: 20 },
  { x: 30, base: 39.7, height: 18 },
  { x: 50, base: 36.9, height: 16 },
  { x: 70, base: 34.0, height: 14 },
  { x: 88, base: 31.4, height: 12 },
]
/** How many of them are lit today — the near ones, per the Bible. */
const LANTERNS_LIT_WHILE_UNFINISHED = 2

function LanternHead({ x, top, ink }: { x: number; top: number; ink: Ink }) {
  return (
    <g data-testid="lantern-head">
      <path d={`M${x - 4} ${top} L${x} ${top - 3.4} L${x + 4} ${top} Z`} fill={ink.timber} />
      <rect x={x - 3} y={top} width={6} height={5} rx={1} fill={ink.glass} />
      <rect x={x - 3} y={top + 5} width={6} height={1.2} fill={ink.timber} />
    </g>
  )
}

/* ── The seven locations ─────────────────────────────────────────────────── */

function Watchtower({ repaired, ink, animate }: StructureInk) {
  return (
    <>
      {/* Shaft, batter and the bell cap: the same tower in both states. The
          bells are drawn in BOTH because the Bible says they already work. */}
      <rect x={40} y={16} width={20} height={34} fill={ink.stone} />
      <rect x={40} y={16} width={20} height={2.4} fill={ink.stoneLit} />
      <path d="M36 50 L40 43 L60 43 L64 50 Z" fill={ink.stone} />
      <rect x={46} y={30} width={8} height={9} rx={1} fill={ink.dark} />
      <path d="M33 16 L50 5 L67 16 Z" fill={ink.roof} />
      <g data-testid="watchtower-bells">
        <path d="M46.5 9 L53.5 9 L55 14 L45 14 Z" fill={ink.iron} />
        <circle cx={50} cy={14.8} r={1.2} fill={ink.iron} />
      </g>

      {repaired ? (
        <>
          {/* The stair climbs the whole way, and the signal balcony stands:
              the silhouette widens near the top, which is the thing a child
              reads at thumbnail size and in black and white. */}
          <g data-testid="watchtower-stair-full">
            <path d="M29 50 L50 29 L52.6 31.6 L31.6 50 Z" fill={ink.timber} />
            <rect x={29} y={47} width={9} height={2.2} fill={ink.timberLit} />
            <rect x={32.4} y={43} width={9} height={2.2} fill={ink.timberLit} />
            <rect x={35.8} y={39} width={9} height={2.2} fill={ink.timberLit} />
            <rect x={39.2} y={35} width={9} height={2.2} fill={ink.timberLit} />
            <rect x={42.6} y={31} width={9} height={2.2} fill={ink.timberLit} />
          </g>
          <g data-testid="watchtower-balcony">
            <rect x={30} y={26} width={40} height={4} rx={1} fill={ink.timber} />
            <rect x={30} y={20} width={40} height={1.8} rx={0.9} fill={ink.timberLit} />
            <rect x={31} y={21} width={1.6} height={5} fill={ink.timber} />
            <rect x={39.5} y={21} width={1.6} height={5} fill={ink.timber} />
            <rect x={48} y={21} width={1.6} height={5} fill={ink.timber} />
            <rect x={56.5} y={21} width={1.6} height={5} fill={ink.timber} />
            <rect x={65} y={21} width={1.6} height={5} fill={ink.timber} />
          </g>
          <Banner x={71} y={6} pole={24} span={14} ink={ink} animate={animate} />
        </>
      ) : (
        <>
          {/* Three treads and then nothing: the flight stops short of the top,
              so there is no way up and no balcony to stand on. The two stubs
              are where it goes — drawn, rather than left to be noticed. */}
          <g data-testid="watchtower-stair-short">
            <path d="M30 50 L47 36 L48.6 38 L31.6 50 Z" fill={ink.timber} />
            <rect x={31} y={45} width={9} height={2.2} fill={ink.timberLit} />
            <rect x={33.5} y={41} width={9} height={2.2} fill={ink.timberLit} />
            <rect x={36} y={37} width={9} height={2.2} fill={ink.timberLit} />
          </g>
          <g data-testid="watchtower-balcony-posts">
            <rect x={38} y={28} width={2.4} height={6} fill={ink.timber} />
            <rect x={59.6} y={28} width={2.4} height={6} fill={ink.timber} />
          </g>
        </>
      )}
    </>
  )
}

function LibraryHut({ repaired, ink, animate }: StructureInk) {
  return (
    <>
      {/* The timber hall, its door and the opening the shelves stand behind —
          identical in both states. */}
      {!repaired && <rect x={44} y={22} width={12} height={10} fill={ink.dark} />}
      <rect x={24} y={32} width={52} height={18} fill={ink.timber} />
      <rect x={24} y={32} width={52} height={2} fill={ink.timberLit} />
      <rect x={44} y={40} width={12} height={10} rx={1} fill={ink.roof} />
      <rect x={28} y={35} width={13} height={12} fill={ink.dark} />

      {repaired ? (
        <>
          {/* One unbroken ridge, and three full shelves behind the opening. */}
          <g data-testid="library-roof-whole">
            <path d="M17 34 L50 18 L83 34 Z" fill={ink.roof} />
            <rect x={46} y={16} width={8} height={3} rx={1} fill={ink.roofLit} />
          </g>
          <g data-testid="library-shelves">
            <rect x={28.5} y={37} width={12} height={1.6} fill={ink.timberLit} />
            <rect x={28.5} y={41} width={12} height={1.6} fill={ink.timberLit} />
            <rect x={28.5} y={45} width={12} height={1.6} fill={ink.timberLit} />
          </g>
          <g data-testid="library-books" aria-hidden="true">
            <rect x={29.5} y={38.6} width={2} height={2.4} fill={ink.cloth} />
            <rect x={32} y={38.6} width={2} height={2.4} fill={ink.clothWarm} />
            <rect x={34.5} y={38.6} width={2} height={2.4} fill={ink.roofLit} />
            <rect x={29.5} y={42.6} width={2} height={2.4} fill={ink.clothWarm} />
            <rect x={32} y={42.6} width={2} height={2.4} fill={ink.cloth} />
            <rect x={36} y={42.6} width={2} height={2.4} fill={ink.cloth} />
          </g>
          <Banner x={85} y={8} pole={22} span={12} ink={ink} animate={animate} />
        </>
      ) : (
        <>
          {/* The ridge dips away where the leaks came in: one roof line with a
              notch out of the middle of it, open to the loft behind. One shelf
              is in, and it is not straight yet. */}
          <g data-testid="library-roof-gap">
            <path d="M17 34 L40 20 L45 28 L55 28 L60 20 L83 34 Z" fill={ink.roof} />
          </g>
          <g data-testid="library-shelves">
            <rect
              x={29}
              y={43}
              width={11}
              height={1.8}
              fill={ink.timberLit}
              transform="rotate(-7 34.5 43.9)"
            />
          </g>
        </>
      )}
    </>
  )
}

function Forge({ repaired, ink, animate }: StructureInk) {
  return (
    <>
      {/* Hearth, chimney and anvil: the same in both. The fire is drawn in BOTH
          because the Bible has the main hearth burning again already — so the
          repair cannot be "the fire comes on", and is not drawn as if it were. */}
      <rect x={16} y={32} width={26} height={18} fill={ink.stone} />
      <rect x={16} y={32} width={26} height={2.2} fill={ink.stoneLit} />
      <rect x={22} y={16} width={9} height={16} fill={ink.stone} />
      <rect x={20} y={14} width={13} height={3} rx={1} fill={ink.stoneLit} />
      <path d="M23 50 L23 41 Q 29 36 35 41 L35 50 Z" fill={ink.dark} />
      <g data-testid="forge-hearth-fire">
        <path d="M25 50 L28.5 41 L30.5 45 L33 40 L35 50 Z" fill="#FFB347" />
        <path d="M28 50 L30 44 L32 47 L33 50 Z" fill="#FFE9A8" />
      </g>
      <path d="M44 50 L44 46 L41.5 45 L41.5 43 L53 43 L53 45 L50.5 46 L50.5 50 Z" fill={ink.iron} />

      {repaired ? (
        <>
          {/* The bay is framed and roofed, and the tool rack is up on its
              braces with the tools hanging where Finn can reach them. */}
          <g data-testid="forge-canopy">
            <rect x={58} y={34} width={3} height={16} fill={ink.timber} />
            <rect x={80} y={34} width={3} height={16} fill={ink.timber} />
            <rect x={55} y={31} width={31} height={3} fill={ink.timberLit} />
            <path d="M53 31 L70 22 L88 31 Z" fill={ink.roof} />
          </g>
          <g data-testid="forge-tool-rack">
            <rect x={60} y={38} width={20} height={2} rx={1} fill={ink.timberLit} />
            <path d="M60 40 L64 44 L62.6 45.2 L58.6 41.2 Z" fill={ink.timber} />
            <path d="M80 40 L76 44 L77.4 45.2 L81.4 41.2 Z" fill={ink.timber} />
            <rect x={63} y={40} width={1.8} height={8} fill={ink.iron} />
            <rect x={61.5} y={47} width={4.8} height={2} rx={0.8} fill={ink.iron} />
            <rect x={69} y={40} width={1.8} height={9} fill={ink.iron} />
            <rect x={68} y={46.5} width={3.8} height={2.6} rx={0.8} fill={ink.iron} />
            <rect x={75} y={40} width={1.8} height={7} fill={ink.iron} />
            <rect x={73.8} y={46} width={4.2} height={1.8} rx={0.8} fill={ink.iron} />
          </g>
          <Banner x={88} y={12} pole={20} span={9} ink={ink} animate={animate} />
        </>
      ) : (
        /* Two bare uprights and open sky between them: no beam, no roof over
           the bay and nowhere yet to hang a tool. The work is waiting, not
           falling down. */
        <g data-testid="forge-bay-open">
          <rect x={58} y={34} width={3} height={16} fill={ink.timber} />
          <rect x={80} y={34} width={3} height={16} fill={ink.timber} />
        </g>
      )}
    </>
  )
}

function LanternPath({ repaired, ink, animate }: StructureInk) {
  const lit = repaired ? LANTERN_POSTS.length : LANTERNS_LIT_WHILE_UNFINISHED
  return (
    <>
      {/* The road itself, winding out of town — the same road in both states. */}
      <path d="M0 44 L98 30 L98 35 L0 50 Z" fill={TERRAIN.road} />
      <path d="M0 44 L98 30 L98 31.4 L0 45.4 Z" fill={TERRAIN.cobble} opacity={0.55} />

      <g data-testid={repaired ? 'lantern-posts-full' : 'lantern-posts-partial'}>
        {LANTERN_POSTS.map((post, i) => {
          // A post that has no lantern yet is a short marker, not a ruin: the
          // far ones were never finished, so they stand half-height and bare.
          const standing = i < lit
          const height = standing ? post.height : post.height * 0.45
          const top = post.base - height
          return (
            <g key={post.x}>
              <rect x={post.x - 1.2} y={top} width={2.4} height={height} fill={ink.timber} />
              {standing ? (
                <LanternHead x={post.x} top={top} ink={ink} />
              ) : (
                <rect x={post.x - 1.8} y={top} width={3.6} height={1.4} fill={ink.timberLit} />
              )}
            </g>
          )
        })}
      </g>

      {/* The path's banner flies from its own mast at the near end, clear of
          the first lantern rather than crowding it. */}
      {repaired && <Banner x={2} y={26} pole={18} span={10} ink={ink} animate={animate} />}
    </>
  )
}

function BeaconHill({ repaired, ink, animate }: StructureInk) {
  return (
    <>
      {/* The hill, and the beacon bowl on its legs: intact in both states,
          because the Bible says the bowl is intact and cold. */}
      <path d="M4 50 C 24 40, 56 38, 96 50 Z" fill={TERRAIN.highlandTop} />
      <path d="M41 38 L44 38 L41 47 L38 47 Z" fill={ink.timber} />
      <path d="M59 38 L62 38 L65 47 L62 47 Z" fill={ink.timber} />
      <rect x={48.7} y={38} width={2.6} height={9} fill={ink.timber} />
      <path d="M36 30 L64 30 L60 38 L40 38 Z" fill={ink.stone} />
      <rect x={34} y={28} width={32} height={2.6} rx={1} fill={ink.stoneLit} />

      {repaired ? (
        <>
          {/* A tall flame standing above the rim, and the signal code flying
              complete on a taut line: both are silhouette, not light. */}
          <g data-testid="beacon-flame">
            <path d="M41 30 C 43 21, 47 19, 48 9 C 53 16, 58 21, 58 30 Z" fill="#FFB347" />
            <path d="M46 30 C 47 24, 49 22, 50 16 C 53 21, 54 26, 53.5 30 Z" fill="#FFE9A8" />
          </g>
          <g data-testid="beacon-signal-assembly">
            <rect x={74} y={16} width={2.6} height={31} fill={ink.timber} />
            <path d="M60 22 L75 19" stroke={ink.timberLit} strokeWidth={1.2} fill="none" />
            <path d="M61 22.4 L65.4 21.5 L63.2 26.6 Z" fill={ink.cloth} />
            <path d="M66.5 21.3 L70.9 20.4 L68.7 25.5 Z" fill={ink.clothWarm} />
            <path d="M72 20.2 L76.4 19.3 L74.2 24.4 Z" fill={ink.cloth} />
          </g>
          <Banner x={76.6} y={15} pole={10} span={12} ink={ink} animate={animate} />
        </>
      ) : (
        <>
          {/* The bowl is swept and empty, and one weathered flag hangs from a
              slack line — the code is incomplete, so it cannot be read yet. */}
          <g data-testid="beacon-bowl-cold">
            <rect x={40} y={32} width={20} height={2.2} rx={1} fill={ink.dark} />
          </g>
          <g data-testid="beacon-signal-torn">
            <rect x={74} y={32} width={2.4} height={15} fill={ink.timber} />
            <path d="M66 29 Q 71 35 75 33" stroke={ink.timberLit} strokeWidth={1.2} fill="none" />
            <path d="M67 30 L73 32 L70.5 34 L72.5 35.6 L67 35 Z" fill={ink.cloth} />
          </g>
        </>
      )}
    </>
  )
}

/** Where the repaired hall's banners hang — clear of the doorway. */
const HALL_BANNERS = [12, 23, 34, 58, 69, 80]
/** Hooks with nothing on them yet. */
const HALL_EMPTY_HOOKS = [30, 42, 54, 66]

function BannerHall({ repaired, ink, animate }: StructureInk) {
  return (
    <>
      {/* The long wooden chamber and its door: the same hall in both states. */}
      {!repaired && <rect x={37} y={22} width={26} height={8} fill={ink.dark} />}
      <rect x={10} y={32} width={80} height={18} fill={ink.timber} />
      <rect x={10} y={32} width={80} height={2} fill={ink.timberLit} />
      <rect x={8} y={47.6} width={84} height={2.4} fill={ink.stoneLit} />
      <rect x={45} y={40} width={10} height={10} rx={1} fill={ink.roof} />

      {repaired ? (
        <>
          {/* One unbroken roof over a full row of colours — six hanging, none
              of them torn, and the hero's own banner on the ridge. */}
          <g data-testid="hall-roof-whole">
            <path d="M6 34 L50 20 L94 34 Z" fill={ink.roof} />
            <rect x={46} y={18} width={8} height={3} rx={1} fill={ink.roofLit} />
          </g>
          <g data-testid="hall-banners">
            {HALL_BANNERS.map((x, i) => (
              <path
                key={x}
                d={`M${x} 35 L${x + 9} 35 L${x + 9} 46 L${x + 4.5} 43 L${x} 46 Z`}
                fill={i % 2 === 0 ? ink.cloth : ink.clothWarm}
              />
            ))}
          </g>
          <Banner x={50} y={6} pole={14} span={12} ink={ink} animate={animate} />
        </>
      ) : (
        <>
          {/* A notch out of the roof where the weather got in, two banners
              still hanging — one of them torn — and the rest of the hooks
              waiting with nothing on them. */}
          <g data-testid="hall-roof-gap">
            <path d="M6 34 L30 21 L37 29 L63 29 L70 21 L94 34 Z" fill={ink.roof} />
          </g>
          <g data-testid="hall-banners">
            <path d="M16 35 L25 35 L25 46 L20.5 43 L16 46 Z" fill={ink.cloth} />
            <path d="M68 35 L77 35 L77 44 L74 41 L73 45 L70 42 L68 45 Z" fill={ink.clothWarm} />
          </g>
          <g data-testid="hall-empty-hooks">
            {HALL_EMPTY_HOOKS.map((x) => (
              <rect key={x} x={x} y={34.4} width={2} height={2.2} fill={ink.timberLit} />
            ))}
          </g>
        </>
      )}
    </>
  )
}

function OldBridge({ repaired, ink, animate }: StructureInk) {
  return (
    <>
      {/* The crossing, from the same place in both states: the same water, the
          same two timber piers, the same brace and the same ramp up the far
          bank. The village map's river runs straight through this band, so
          these colours are the terrain's and not the state's. */}
      <rect x={0} y={22} width={100} height={28} fill={TERRAIN.water} />
      <rect x={8} y={30} width={24} height={1.8} rx={0.9} fill={TERRAIN.ripple} opacity={0.5} />
      <rect x={62} y={41} width={26} height={1.8} rx={0.9} fill={TERRAIN.ripple} opacity={0.45} />
      <path d="M84 18 Q 96 30 99 50" stroke={TERRAIN.road} strokeWidth={6} fill="none" />
      <g data-testid="bridge-piers">
        <rect x={13} y={20} width={8} height={9} fill={ink.stone} />
        <rect x={79} y={20} width={8} height={9} fill={ink.stone} />
        <rect x={36} y={20} width={5} height={24} fill={ink.timber} />
        <rect x={60} y={20} width={5} height={24} fill={ink.timber} />
        <rect x={34} y={18} width={9} height={3} fill={ink.timberLit} />
        <rect x={58} y={18} width={9} height={3} fill={ink.timberLit} />
        <rect x={40} y={34} width={22} height={2.2} fill={ink.timber} opacity={0.85} />
      </g>

      {repaired ? (
        <>
          {/* One unbroken deck, a rail the whole way across on its posts, and
              the banner flying from the far end. */}
          <g data-testid="bridge-deck-continuous">
            <rect x={16} y={16} width={68} height={4.4} fill={ink.timberLit} />
            <rect x={16} y={14.6} width={68} height={1.7} fill={ink.timber} />
            {Array.from({ length: BRIDGE_PLANKS - 1 }, (_, i) => (
              <rect
                key={i}
                x={bridgePlankX(i) + 5}
                y={16}
                width={0.8}
                height={4.4}
                fill={ink.timber}
                opacity={0.7}
              />
            ))}
          </g>
          <g data-testid="bridge-rails">
            <rect x={16} y={6} width={68} height={2.2} rx={1} fill={ink.timberLit} />
            {BRIDGE_RAIL_POSTS.map((x) => (
              <rect key={x} x={x} y={6} width={2.4} height={10} fill={ink.timber} />
            ))}
          </g>
          <Banner x={86} y={0} pole={18} span={10} ink={ink} animate={animate} />
        </>
      ) : (
        <>
          {/* Plank by plank, with three slots simply not there — the river
              shows through the holes because nothing is drawn over them — and
              the one board the village already laid over the widest gap. */}
          <g data-testid="bridge-deck-gapped">
            {Array.from({ length: BRIDGE_PLANKS }, (_, i) =>
              BRIDGE_MISSING.has(i) ? null : (
                <rect
                  key={i}
                  x={bridgePlankX(i)}
                  y={16}
                  width={5}
                  height={4.4}
                  rx={0.8}
                  fill={ink.timberLit}
                />
              ),
            )}
            <rect
              data-testid="bridge-temporary-plank"
              x={37}
              y={14.6}
              width={24}
              height={2.4}
              rx={1}
              fill={ink.timber}
              transform="rotate(-3 49 15.8)"
            />
          </g>
          <g data-testid="bridge-rail-stubs">
            {/* Two surviving posts and no rail between them. */}
            <rect x={17} y={10} width={2.4} height={6} fill={ink.timber} />
            <rect x={80.6} y={10} width={2.4} height={6} fill={ink.timber} />
          </g>
        </>
      )}
    </>
  )
}

/**
 * Which drawing belongs to which location, **keyed by mission id**.
 *
 * Never by emoji: `art.emoji` is presentation and two locations may
 * legitimately share one, so matching on it would be a silent
 * mis-identification waiting to happen.
 */
const STRUCTURES: Record<string, (props: StructureInk) => ReactElement> = {
  watchtower: Watchtower,
  library_hut: LibraryHut,
  the_forge: Forge,
  lantern_path: LanternPath,
  beacon_hill: BeaconHill,
  banner_hall: BannerHall,
  old_bridge: OldBridge,
}

interface LocationStructureProps {
  missionId: string
  /** 'damaged' = the job waiting; 'repaired' = the finished structure. */
  state: StructureState
  /** Placement inside the caller's SVG — the village map's grid cell, or a scale. */
  transform?: string
  /** The celebration's one flourish: the banner flies up on mount. */
  animateBanner?: boolean
}

/**
 * One location's structure, composed in {@link STRUCTURE_BOX}.
 *
 * Returns SVG content, so it must be rendered inside an `<svg>` — either the
 * village map or {@link LocationScene}. Presentational only: `state` is handed
 * down by the caller from existing completed-mission state. This reads nothing
 * and writes nothing.
 */
export default function LocationStructure({
  missionId,
  state,
  transform,
  animateBanner = false,
}: LocationStructureProps) {
  const Structure = STRUCTURES[missionId]
  if (!Structure) return null
  const repaired = state === 'repaired'
  return (
    <g transform={transform} data-testid={`structure-${missionId}-${state}`}>
      <Structure repaired={repaired} ink={palette(repaired)} animate={animateBanner} />
    </g>
  )
}

/**
 * Where a single structure sits inside {@link LocationScene}'s frame.
 *
 * Chosen so the drawing survives the `slice` crop at every size this art is
 * used at — a 96px list tile (≈1.24:1), a 110px card, a 200px dialog panel
 * (≈2.5:1) — and so the ground line lands on {@link SCENE_GROUND}.
 */
const SCENE_PLACEMENT = 'translate(57.5 21.5) scale(1.25)'
const SCENE_GROUND = 21.5 + STRUCTURE_BOX.ground * 1.25

/**
 * One location, framed as a picture — the card, the list tile, the visit and
 * the celebration all use this.
 *
 * Same viewBox as `OldBridgeScene`, so the Old Bridge's own scene and these sit
 * in the same frame at the same sizes, and the sky and ground around them are
 * the shared {@link TERRAIN} rather than a second palette.
 */
export function LocationScene({
  missionId,
  state,
  animateBanner = false,
}: {
  missionId: string
  state: StructureState
  animateBanner?: boolean
}) {
  return (
    <svg
      viewBox="0 0 240 110"
      // `slice` so the scene fills a short card tile and a tall dialog panel
      // alike without distorting; every load-bearing part of the drawing sits
      // inside the band that survives either crop (see SCENE_PLACEMENT).
      preserveAspectRatio="xMidYMid slice"
      width="100%"
      height="100%"
      // The accessible name lives on the wrapper in StonebridgeLocationArt, so
      // this is decorative to a screen reader rather than a second label.
      aria-hidden="true"
      focusable="false"
      style={{ display: 'block' }}
    >
      <g data-testid="location-scene-setting">
        <rect x={0} y={0} width={240} height={SCENE_GROUND} fill={TERRAIN.sky} />
        <ellipse cx={120} cy={SCENE_GROUND} rx={130} ry={34} fill={TERRAIN.skyGlow} opacity={0.5} />
        <path d="M0 84 L34 58 L70 84 Z" fill={TERRAIN.farHill} />
        <path d="M168 84 L206 54 L240 84 Z" fill={TERRAIN.farHill} />
        <rect x={0} y={SCENE_GROUND} width={240} height={110 - SCENE_GROUND} fill={TERRAIN.grass} />
        <rect x={0} y={SCENE_GROUND} width={240} height={2.4} fill={TERRAIN.grassTop} />
      </g>
      <LocationStructure
        missionId={missionId}
        state={state}
        transform={SCENE_PLACEMENT}
        animateBanner={animateBanner}
      />
    </svg>
  )
}

/**
 * The Village Square at the centre of the map — a landmark, not a mission.
 *
 * It has ONE state, on purpose: the Bible has the fountain running already and
 * the Square active again, so there is nothing here for a repair to turn on and
 * nothing that could read as "fix the Square next". It is drawn in the warm
 * palette for the same reason.
 */
export function VillageSquareStructure({ transform }: { transform?: string }) {
  const ink = palette(true)
  return (
    <g transform={transform} data-testid="village-square">
      <ellipse cx={50} cy={48} rx={42} ry={7} fill={TERRAIN.cobble} />
      {/* A shopfront still waiting for its repairs, with the crew's scaffold
          already standing against it — canon, and the same in every state. */}
      <rect x={70} y={36} width={22} height={14} fill={ink.timber} />
      <path d="M68 36 L81 29 L94 36 Z" fill={ink.roof} />
      <rect x={74} y={41} width={6} height={9} fill={ink.dark} />
      <rect x={69} y={32} width={1.6} height={18} fill={ink.timberLit} />
      <rect x={92} y={32} width={1.6} height={18} fill={ink.timberLit} />
      <rect x={69} y={38} width={24.6} height={1.4} fill={ink.timberLit} />
      {/* The notice board, where most village decisions begin. */}
      <rect x={13} y={38} width={2.4} height={12} fill={ink.timber} />
      <rect x={6} y={30} width={17} height={9} rx={1} fill={ink.timber} />
      <rect x={8} y={32} width={13} height={1.4} fill={ink.stoneLit} />
      <rect x={8} y={35} width={9} height={1.4} fill={ink.stoneLit} />
      {/* The fountain — running in both states and in every render. */}
      <path d="M34 42 L66 42 L62 50 L38 50 Z" fill={ink.stone} />
      <rect x={32} y={39.6} width={36} height={3} rx={1.2} fill={ink.stoneLit} />
      <rect x={35} y={42.6} width={30} height={2} fill={TERRAIN.water} />
      <rect x={48} y={28} width={4} height={12} fill={ink.stone} />
      <path d="M42 28 L58 28 L55 32 L45 32 Z" fill={ink.stoneLit} />
      <g data-testid="square-fountain-water">
        <path d="M50 27 C 42 30, 37 36, 36.5 41" stroke={TERRAIN.water} strokeWidth={1.6} fill="none" />
        <path d="M50 27 C 58 30, 63 36, 63.5 41" stroke={TERRAIN.water} strokeWidth={1.6} fill="none" />
        <circle cx={50} cy={25.6} r={1.8} fill={TERRAIN.ripple} />
      </g>
    </g>
  )
}
