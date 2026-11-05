/**
 * The village's cosmetic surfaces — background AND foreground, together.
 *
 * ── Why this exists ──────────────────────────────────────────────────────────
 *
 * Each village view paints itself from the child's cosmetic `themeStyle`: the
 * retro look gets a near-black panel, the softer one a near-white panel. Most of
 * the text inside those panels sets no colour at all — the board's subtitle,
 * *Your Village*, *Pick a place from the list.*, *Each Place*, every tile's
 * condition line and counter, the Banner Hall body, each banner's name — and so
 * inherited whatever sat above the panel, which is the APP THEME's text colour.
 *
 * The two choices are independent: the panel follows the child's look, the
 * inherited text followed the parent's theme. A parent on the light theme
 * looking at a child whose look is the retro one therefore got
 * `rgba(0,0,0,0.87)` on `rgba(6,10,16,0.97)` — black on black, confirmed in a
 * browser against the real page, not inferred. The same pair is wrong in the
 * mirror case (a dark app theme behind the soft near-white panel).
 *
 * So a surface is a PAIR here, declared in one place and used by every frame
 * that paints a background: a view cannot pick one half and inherit the other.
 * The values are the Hero Hub's own two text colours, so the town, the board and
 * the hub read alike.
 *
 * It is cosmetic and nothing else: no size, no font, no layout, no theme or
 * palette change, and nothing here gates, derives or stores anything.
 * `villageSurface.contrast.test.ts` computes the real WCAG contrast of each pair
 * over both possible page backgrounds rather than taking the choice on trust.
 */

/** A background and the foreground that is readable on it. */
export interface VillageSurface {
  /** `bgcolor` for the frame. Near-opaque, so the page under it barely shows. */
  readonly bg: string
  /** `color` for the frame — inherited by everything that names no colour. */
  readonly fg: string
}

/**
 * Which frame is being painted.
 *
 * `board` is the Stonebridge board, in both of its presentations (the Hero Hub's
 * full-screen dialog and the canonical town page's region). `visit` is the
 * location dialog that opens over either of them, a shade deeper on purpose.
 */
export type VillageSurfaceKind = 'board' | 'visit'

const SURFACES: Record<VillageSurfaceKind, Record<'minecraft' | 'platformer', VillageSurface>> = {
  board: {
    minecraft: { bg: 'rgba(6,10,16,0.97)', fg: '#e0e0e0' },
    platformer: { bg: 'rgba(255,247,252,0.98)', fg: '#3d3d3d' },
  },
  visit: {
    minecraft: { bg: 'rgba(10,16,24,0.98)', fg: '#e0e0e0' },
    platformer: { bg: 'rgba(255,250,253,0.99)', fg: '#3d3d3d' },
  },
}

/**
 * The pair for this view and this child's look.
 *
 * `isLincoln` is the cosmetic retro flag every village component already takes —
 * personality, never access (ARCH-15). It selects a look and nothing else.
 */
export function villageSurface(isLincoln: boolean, kind: VillageSurfaceKind): VillageSurface {
  return SURFACES[kind][isLincoln ? 'minecraft' : 'platformer']
}

/** Every pair, for a test that wants to hold all of them to the same bar. */
export function allVillageSurfaces(): VillageSurface[] {
  return Object.values(SURFACES).flatMap((byLook) => Object.values(byLook))
}
