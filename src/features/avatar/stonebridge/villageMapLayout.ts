/**
 * The village overview's geometry and palette — pure data, no components.
 *
 * Lives in its own module for two reasons. The practical one is Fast Refresh:
 * a file that exports both components and non-components loses its refresh
 * boundary (`react-refresh/only-export-components`), and these constants are
 * shared by `LocationScenes`, `VillageScene` and their tests. The better one is
 * that the drawing's coordinate system is a *fact* about the picture, and tests
 * assert against it directly rather than re-deriving it.
 */

/**
 * The local box every location's structure is composed in.
 *
 * `ground` is the line the structure stands on. Nothing is drawn below it; the
 * band underneath is the terrain in front of the building, which is what lets
 * the overview place these boxes on a grid and draw one continuous landscape
 * through them.
 */
export const STRUCTURE_BOX = { width: 100, height: 70, ground: 50 } as const

export type StructureState = 'damaged' | 'repaired'

/**
 * The land, and the things on it that a repair does not touch.
 *
 * Shared by the overview and the single-location scenes so the two agree, and
 * **identical in both states** — the river, the banks and the roads are the
 * same river, banks and roads before and after.
 */
export const TERRAIN = {
  sky: '#bfe0f2',
  skyGlow: '#ffeccb',
  farHill: '#93b291',
  highland: '#6e9460',
  highlandTop: '#8bb173',
  grass: '#7aa567',
  grassTop: '#94bd7c',
  lowGrass: '#6f9b5e',
  lowGrassTop: '#89b471',
  bank: '#b99d6f',
  bankTop: '#cfb586',
  water: '#5ca0c2',
  ripple: '#aedaec',
  road: '#c9ae83',
  cobble: '#b7b2a6',
} as const

/** The overview's grid of {@link STRUCTURE_BOX}-sized cells. */
export const VILLAGE_MAP_GRID = {
  columns: 3,
  rows: 4,
  unitWidth: STRUCTURE_BOX.width,
  unitHeight: STRUCTURE_BOX.height,
} as const

export const MAP_WIDTH = VILLAGE_MAP_GRID.columns * VILLAGE_MAP_GRID.unitWidth
export const MAP_HEIGHT = VILLAGE_MAP_GRID.rows * VILLAGE_MAP_GRID.unitHeight

/** Where the Square sits. Row 2, middle — everything else is a walk from here. */
export const SQUARE_CELL = { col: 2, row: 2 } as const

/**
 * Where each location stands in the overview.
 *
 * The arrangement follows the Bible rather than taste: the Watchtower is on a
 * ridge *above* the village and Beacon Hill *rises above the valley*, so both
 * are on the high ground along the top; the Library Hut, the Forge and Banner
 * Hall are the village around the Square; the Lantern Path winds *toward
 * outlying homes*, so it leaves by the right-hand edge; and the Old Bridge
 * crosses the river at the bottom, which is the way to the farms.
 */
export const VILLAGE_MAP: readonly { missionId: string; col: number; row: number }[] = [
  { missionId: 'watchtower', col: 1, row: 1 },
  { missionId: 'beacon_hill', col: 3, row: 1 },
  { missionId: 'library_hut', col: 1, row: 2 },
  { missionId: 'the_forge', col: 3, row: 2 },
  { missionId: 'banner_hall', col: 1, row: 3 },
  { missionId: 'lantern_path', col: 3, row: 3 },
  { missionId: 'old_bridge', col: 2, row: 4 },
]

/** The mission ids this vocabulary can draw. Keyed by id, never by emoji. */
export const DRAWN_LOCATION_IDS: readonly string[] = VILLAGE_MAP.map((cell) => cell.missionId)

export const cellTransform = (col: number, row: number) =>
  `translate(${(col - 1) * VILLAGE_MAP_GRID.unitWidth} ${(row - 1) * VILLAGE_MAP_GRID.unitHeight})`

/**
 * How far a tap target is held back from its cell's edges, in map units.
 *
 * Two jobs, both structural rather than taste: in this geometry it keeps two
 * neighbouring targets from sharing an edge (so a tap near the boundary cannot
 * be ambiguous, and two focus rings are not drawn on top of each other), and it
 * holds a focused target's ring off the picture's own rounded border. How both
 * then look on a real screen is a browser reading, not something these numbers
 * establish.
 */
export const MAP_TARGET_INSET = { x: 5, y: 4 } as const

/** A target's box over the picture, as percentages of the picture's own size. */
export interface MapTargetRect {
  leftPct: number
  topPct: number
  widthPct: number
  heightPct: number
}

/**
 * One location's tap target, derived from the cell its structure is drawn in.
 *
 * Percentages, deliberately: the picture is locked to the viewBox's aspect
 * ratio, so a percentage box over it is the SAME box as the cell the building is
 * drawn in at every width — there is no second coordinate system to keep in step
 * and nothing to recompute on resize. The target is the whole cell (the building
 * and the ground it stands on), inset by {@link MAP_TARGET_INSET}, because a
 * child aims at a place rather than at a silhouette.
 */
export const mapTargetRect = (col: number, row: number): MapTargetRect => {
  const { unitWidth, unitHeight } = VILLAGE_MAP_GRID
  return {
    leftPct: (((col - 1) * unitWidth + MAP_TARGET_INSET.x) / MAP_WIDTH) * 100,
    topPct: (((row - 1) * unitHeight + MAP_TARGET_INSET.y) / MAP_HEIGHT) * 100,
    widthPct: ((unitWidth - MAP_TARGET_INSET.x * 2) / MAP_WIDTH) * 100,
    heightPct: ((unitHeight - MAP_TARGET_INSET.y * 2) / MAP_HEIGHT) * 100,
  }
}

/**
 * What a target really MEASURES, at a picture of this CSS width.
 *
 * The percentages above are only half of a 44 × 44 claim: what matters is the
 * pixels they come out as on a real phone. This is the arithmetic that turns one
 * into the other — the picture's height follows the viewBox, so a width is all
 * it takes — and it is exported so a test can assert the sizes at the widths the
 * board is actually shown at rather than trusting the percentages.
 *
 * It is NOT a measurement: a unit test of this function proves the geometry, not
 * the layout. Whether the picture really is this wide at 390 / 768 / 1280, and
 * whether anything overlaps it, is a browser pass.
 */
export const mapTargetSizeAt = (pictureWidthPx: number) => ({
  width: (pictureWidthPx * (VILLAGE_MAP_GRID.unitWidth - MAP_TARGET_INSET.x * 2)) / MAP_WIDTH,
  // The picture's height is `width × MAP_HEIGHT / MAP_WIDTH`, and the target
  // takes `(unitHeight − inset) / MAP_HEIGHT` of it — so `MAP_HEIGHT` cancels.
  height: (pictureWidthPx * (VILLAGE_MAP_GRID.unitHeight - MAP_TARGET_INSET.y * 2)) / MAP_WIDTH,
})

/**
 * The width at which the FRACTIONAL target box reaches 44 × 44 CSS px.
 *
 * Derived from {@link mapTargetSizeAt}, not chosen: the height is the binding
 * dimension (a cell is wider than it is tall), so this is the picture width at
 * which a target's percentage height works out to 44.
 *
 * ── What it is, and what it is not ──────────────────────────────────────────
 *
 * It is a **reading of the arithmetic** and a threshold a geometry test can
 * name. It is **not enforced anywhere**: nothing in this module or in
 * `VillageScene` sets a minimum picture width, watches the box, or switches
 * views by size, and this constant is read by no styling. A picture narrower
 * than this is therefore possible — the targets keep the unconditional 44px
 * CSS floor each one carries, which holds the SIZE and says nothing about
 * where the percentage-positioned boxes then sit relative to each other.
 * Whether any pair would then touch, and at what width, is a real layout
 * question this number does not answer and this file does not claim.
 *
 * And it is not a measurement of anything: the sizes targets really come out
 * as — at 390 × 844, 768 × 1024, 1280 × 900 and at enlarged text — are read in
 * a browser, independently. That pass is the evidence for 44 × 44; this is the
 * arithmetic it agrees or disagrees with.
 */
export const MAP_TARGET_MIN_PICTURE_WIDTH = Math.ceil(
  (44 * MAP_WIDTH) / (VILLAGE_MAP_GRID.unitHeight - MAP_TARGET_INSET.y * 2),
)

/** The ground line of a row, in map coordinates. Terrain is drawn to meet these. */
export const groundOf = (row: number) =>
  (row - 1) * VILLAGE_MAP_GRID.unitHeight + STRUCTURE_BOX.ground

export const RIDGE = groundOf(1) // 50  — the high ground, above the village
export const TERRACE = groundOf(2) // 120 — the village floor
export const LOWER = groundOf(3) // 190 — the lower terrace, down toward the water
export const FAR_BANK = groundOf(4) // 260 — the far side, and the road to the farms
export const BANK_EDGE = 222
export const WATER_TOP = 232

/** The ridge line the Watchtower and Beacon Hill stand on. */
export const RIDGE_LINE =
  `M0 54 L28 51 L50 ${RIDGE} L78 53 L112 60 L150 57 L186 52 L220 48 L250 ${RIDGE} L276 52 L300 56`

/**
 * The roads. Every one of them starts or ends at the Square, which is the
 * point: *most village decisions begin here*.
 */
export const ROADS = [
  'M132 124 L76 124',
  'M168 124 L216 124',
  'M140 122 C 112 108, 76 82, 52 54',
  'M162 122 C 192 108, 226 76, 246 52',
  'M144 126 C 118 142, 80 168, 54 190',
  'M150 126 L150 190',
  'M150 190 C 176 190, 190 188, 202 186',
  'M150 192 C 140 204, 128 216, 117 226',
  'M200 262 C 236 264, 268 268, 298 270',
]
