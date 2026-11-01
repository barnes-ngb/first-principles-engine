/**
 * What each location's picture SHOWS, not what it means — pure strings.
 *
 * Every location's two states differ structurally, and that is the whole point
 * of the drawing: a screen-reader user is told about the treads that stop
 * short, the gap at the ridge, the bare posts and the empty bowl — not just
 * "fixed" or "not fixed".
 *
 * Its own module so the art component can keep a Fast Refresh boundary
 * (`react-refresh/only-export-components`) and so the sentences can be asserted
 * as data rather than scraped out of a render.
 */
const DESCRIPTIONS: Record<string, { damaged: string; repaired: string }> = {
  old_bridge: {
    damaged: 'planks missing from the deck, no rails, one board laid across the gap',
    repaired: 'a full deck with rails all the way across, and the banner flying',
  },
  watchtower: {
    damaged: 'the bells still hang at the top, the upper stair stops short, and there is no balcony',
    repaired: 'a full stair climbing to a railed signal balcony, with its banner raised',
  },
  library_hut: {
    damaged: 'a gap in the roof at the ridge, and one short leaning shelf inside',
    repaired: 'an unbroken roof over three full shelves of books, with its banner raised',
  },
  the_forge: {
    damaged: 'the hearth burning, and a workshop bay of bare posts with no roof and no tool rack',
    repaired: 'the hearth burning under a roofed workshop, a braced tool rack, and its banner raised',
  },
  lantern_path: {
    damaged: 'the near posts carrying lanterns and the far posts standing bare',
    repaired: 'a lantern on each post the whole way along, with its banner raised',
  },
  beacon_hill: {
    damaged: 'the beacon bowl standing empty and cold, with one torn flag on a slack line',
    repaired: 'a tall flame in the beacon bowl and the full signal flags on a taut line',
  },
  banner_hall: {
    damaged: 'a gap in the roof, two banners hanging, and the rest of the hooks empty',
    repaired: 'an unbroken roof over a full row of banners, with its own banner raised',
  },
}

/**
 * The text alternative for one location's art.
 *
 * The generic fallback at the end is a safety net for a location with no
 * drawing yet; a test asserts that no mission lands on it.
 */
export function describeArt(missionId: string, locationName: string, repaired: boolean): string {
  const described = DESCRIPTIONS[missionId]
  if (described) {
    return `${locationName}: ${repaired ? described.repaired : described.damaged}.`
  }
  return repaired
    ? `${locationName}: fixed, with its banner raised.`
    : `${locationName}: still waiting to be fixed.`
}

/**
 * The whole overview, in one sentence pair.
 *
 * Names the landmarks a child would point at — the Square and its fountain, the
 * river, the Old Bridge, the ridge — because the picture carries no labels and
 * no controls, and then says plainly what has been rebuilt so far. Truthful by
 * construction: the repaired list is the caller's completed-mission list.
 */
export function describeVillageOverview(repairedNames: string[]): string {
  const layout =
    'Stonebridge village: the Square and its running fountain in the middle, ' +
    'roads climbing to the Watchtower and Beacon Hill on the ridge, the Library Hut, ' +
    'the Forge, Banner Hall and the Lantern Path around the Square, and the river ' +
    'with the Old Bridge below.'
  const fixed =
    repairedNames.length === 0
      ? 'Nothing is fixed yet.'
      : `Fixed so far: ${repairedNames.join(', ')}.`
  return `${layout} ${fixed}`
}
