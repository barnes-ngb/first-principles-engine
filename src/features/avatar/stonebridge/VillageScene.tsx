/**
 * Stonebridge, as one connected village — the picture, and the way into it.
 *
 * ── What it is for ───────────────────────────────────────────────────────────
 *
 * The board used to show seven locations as seven separate cards. Each one was
 * truthful, and together they said nothing: there was no river, no square, no
 * road from one place to the next, so "Stonebridge" was a list of nouns rather
 * than somewhere a child could recognise. This is the same seven places, drawn
 * once, in one landscape, with the roads that join them — the Square and its
 * running fountain in the middle, the ridge above, the river and the Old Bridge
 * below, and the Lantern Path heading out of town past the edge of the map.
 *
 * ── What you tap, and what the old hotspot grid got wrong ────────────────────
 *
 * A child who is looking at their village wants to tap their village. This file
 * once had that, as a grid of native buttons over the drawing **each carrying a
 * readable label**, and independent verification in a real browser at 390 × 400
 * with enlarged text (20px / 1.6) found what the labels cost: they covered the
 * buildings they were labelling, and "Watchtower" broke mid-word. The picture
 * was then made entirely noninteractive, with the readable list below it as the
 * whole navigation — which fixed the labels by removing the tapping.
 *
 * What was wrong was the **labels on the art**, not the targets. So the targets
 * are back and the labels are not:
 *
 *   • a target is a native `<button>` in a layer that is a **sibling** of the
 *     `role="img"` drawing, never a shape inside it — so it is a real control
 *     with real Enter / Space, and the drawing stays one `aria-hidden` picture
 *     under one name rather than becoming a pile of named shapes;
 *   • it carries **no visible text at all**. Its whole name — *Visit The
 *     Library Hut. Being fixed now.* — is its accessible name, in the same
 *     words the Places list uses, so nothing can grow over a building at any
 *     text size. Enlarged text makes the names bigger *in the list*, which is
 *     where names belong;
 *   • its box is the **cell the building is drawn in**, inset a little
 *     (`mapTargetRect`), so neighbours never share an edge, a focus ring is
 *     never clipped, and every target measures at least 44 × 44 CSS px at every
 *     width the board shows the picture at;
 *   • and it is never the only way in. The caller keeps a **Places** control
 *     set — the readable list — one tap away, and only one of the two sets is
 *     interactive at a time, so there are never two tab stops for one place.
 *
 * `interactive` is what decides which this render is. Default `false`: a scene
 * rendered with no opener handed to it is the picture alone, exactly as before.
 *
 * Presentational only. `board` is derived read-only from the existing
 * completed-mission state; nothing here reads or writes progress, the drawing is
 * completely static — there is no motion for a reduced-motion preference to have
 * to switch off, and the targets have none either.
 */
import Box from '@mui/material/Box'
import Typography from '@mui/material/Typography'

import LocationStructure, { VillageSquareStructure } from './LocationScenes'
import { describeVillageOverview } from './locationArtDescriptions'
import { VillageLocationState, type VillageLocation } from './computeStonebridgeProgress'
import { placeControlName } from './villageOpeners'
import {
  BANK_EDGE,
  FAR_BANK,
  LOWER,
  MAP_HEIGHT,
  MAP_WIDTH,
  RIDGE_LINE,
  ROADS,
  SQUARE_CELL,
  TERRACE,
  TERRAIN,
  VILLAGE_MAP,
  WATER_TOP,
  cellTransform,
  mapTargetRect,
} from './villageMapLayout'
import { kidPalette } from '../../../app/tokens'

interface VillageSceneProps {
  /** Every location and its state, from `deriveVillageBoard`. Read-only. */
  board: VillageLocation[]
  isLincoln: boolean
  /**
   * Put a tap target on each building — the Map control set.
   *
   * The caller owns this: it is the half of a two-way presentation choice, and
   * the caller is the one that knows whether its own Places list is currently
   * carrying the tab stops. Targets render only when an `onOpenLocation` came
   * with it, so an interactive picture always has somewhere to go.
   */
  interactive?: boolean
  /** Open this place's visit — the SAME opener the Places list calls. */
  onOpenLocation?: (missionId: string) => void
  /**
   * A target mounted (`node`) or unmounted (`null`), for the caller's one
   * registry of visible place controls — the thing a closing visit returns the
   * focus to.
   */
  registerTarget?: (missionId: string, node: HTMLElement | null) => void
}

export default function VillageScene({
  board,
  isLincoln,
  interactive = false,
  onOpenLocation,
  registerTarget,
}: VillageSceneProps) {
  const titleFont = isLincoln ? '"Press Start 2P", monospace' : '"Fredoka", cursive'
  const bodyFont = isLincoln ? undefined : '"Fredoka", cursive'
  const byId = new Map(board.map((entry) => [entry.mission.id, entry]))
  const repairedNames = board
    .filter((entry) => entry.state === VillageLocationState.Repaired)
    .map((entry) => entry.mission.locationName)
  /** Targets need somewhere to go, so an opener is part of being interactive. */
  const targetsOn = interactive && !!onOpenLocation
  /** The one accent the ring, the hover and the pressed state are drawn in. */
  const ring = isLincoln ? kidPalette.xpGreen : '#7a3f67'

  return (
    <Box sx={{ mb: 2 }}>
      <Typography
        sx={{ fontFamily: titleFont, fontSize: isLincoln ? '12px' : '17px', fontWeight: 700 }}
      >
        🗺️ Your Village
      </Typography>
      <Typography
        sx={{ fontFamily: bodyFont, fontSize: '14px', lineHeight: 1.45, opacity: 0.8, mt: 0.5, mb: 1 }}
      >
        {/* In normal flow, above the picture and at a readable size: whichever
            control set is live, this is the sentence that says where to tap.
            It is text in the document, never a tooltip and never on the art. */}
        {targetsOn ? 'Tap a place on the map.' : 'Pick a place from the list.'}
      </Typography>

      {/* The frame the picture and its target layer share.
          It does NOT clip: the drawing's own box keeps `overflow: hidden` for
          its rounded corners, and a focus ring on an edge target would be cut
          off by it. The layer is a sibling of the drawing, outside that box. */}
      <Box
        sx={{
          position: 'relative',
          width: '100%',
          // Capped so the village stays a picture on a tablet rather than
          // growing into a wall, and centred under the board's own column.
          maxWidth: 460,
          mx: 'auto',
        }}
      >
        <Box
          // ONE accessible name for the whole drawing, and nothing inside it is
          // a control or a second label.
          role="img"
          aria-label={describeVillageOverview(repairedNames)}
          sx={{
            position: 'relative',
            width: '100%',
            // Locked to the viewBox, so the landscape never distorts, the
            // buildings keep their proportions at every width, and a percentage
            // box over the picture is the same box as the cell underneath it.
            aspectRatio: `${MAP_WIDTH} / ${MAP_HEIGHT}`,
            borderRadius: isLincoln ? '8px' : '16px',
            overflow: 'hidden',
            border: `1px solid ${isLincoln ? 'rgba(247,215,116,0.4)' : 'rgba(122,63,103,0.3)'}`,
          }}
        >
          <svg
            viewBox={`0 0 ${MAP_WIDTH} ${MAP_HEIGHT}`}
            preserveAspectRatio="xMidYMid meet"
            width="100%"
            height="100%"
            // The name lives on the wrapper above, so this is decorative to a
            // screen reader rather than a second label.
            aria-hidden="true"
            focusable="false"
            style={{ display: 'block', position: 'absolute', inset: 0 }}
          >
            {/* ── The valley ───────────────────────────────────────── */}
            <g data-testid="village-land">
              <rect x={0} y={0} width={MAP_WIDTH} height={56} fill={TERRAIN.sky} />
              <ellipse cx={150} cy={56} rx={160} ry={30} fill={TERRAIN.skyGlow} opacity={0.5} />
              <path d="M96 56 L128 30 L152 44 L176 24 L208 56 Z" fill={TERRAIN.farHill} />
              <path d={`${RIDGE_LINE} L300 ${TERRACE + 4} L0 ${TERRACE + 4} Z`} fill={TERRAIN.highland} />
              <path d={RIDGE_LINE} stroke={TERRAIN.highlandTop} strokeWidth={2.6} fill="none" />
              <path
                d="M10 84 C 70 76, 150 94, 290 80"
                stroke={TERRAIN.highlandTop}
                strokeWidth={1.4}
                fill="none"
                opacity={0.45}
              />
              <rect x={0} y={TERRACE} width={MAP_WIDTH} height={LOWER - TERRACE} fill={TERRAIN.grass} />
              <rect x={0} y={TERRACE} width={MAP_WIDTH} height={2.6} fill={TERRAIN.grassTop} />
              <rect x={0} y={LOWER} width={MAP_WIDTH} height={BANK_EDGE - LOWER} fill={TERRAIN.lowGrass} />
              <rect x={0} y={LOWER} width={MAP_WIDTH} height={2.6} fill={TERRAIN.lowGrassTop} />
              <rect x={0} y={BANK_EDGE} width={MAP_WIDTH} height={WATER_TOP - BANK_EDGE} fill={TERRAIN.bank} />
              <rect x={0} y={BANK_EDGE} width={MAP_WIDTH} height={2.2} fill={TERRAIN.bankTop} />
            </g>

            {/* ── The river, and the far side of it ─────────────────── */}
            <g data-testid="village-river">
              <rect x={0} y={WATER_TOP} width={MAP_WIDTH} height={FAR_BANK - WATER_TOP} fill={TERRAIN.water} />
              <rect x={14} y={240} width={46} height={2} rx={1} fill={TERRAIN.ripple} opacity={0.5} />
              <rect x={212} y={238} width={52} height={2} rx={1} fill={TERRAIN.ripple} opacity={0.45} />
              <rect x={0} y={FAR_BANK} width={MAP_WIDTH} height={MAP_HEIGHT - FAR_BANK} fill={TERRAIN.bank} />
              <rect x={0} y={FAR_BANK} width={MAP_WIDTH} height={2.2} fill={TERRAIN.bankTop} />
            </g>

            {/* ── The roads that make it one village ───────────────── */}
            <g data-testid="village-roads" strokeLinecap="round">
              {ROADS.map((d) => (
                <path key={d} d={d} stroke={TERRAIN.road} strokeWidth={5} fill="none" />
              ))}
            </g>

            {/* ── The Square, then every location in its own cell ────
                The Square has no mission and no state: the Bible has its
                fountain running already, so there is nothing here for a repair
                to turn on and nothing that could read as "fix the Square
                next" — and so it is the one cell with no tap target over it. */}
            <VillageSquareStructure transform={cellTransform(SQUARE_CELL.col, SQUARE_CELL.row)} />
            {VILLAGE_MAP.map((cell) => {
              const entry = byId.get(cell.missionId)
              if (!entry) return null
              return (
                <LocationStructure
                  key={cell.missionId}
                  missionId={cell.missionId}
                  state={entry.state === VillageLocationState.Repaired ? 'repaired' : 'damaged'}
                  transform={cellTransform(cell.col, cell.row)}
                />
              )
            })}
          </svg>
        </Box>

        {/* ── The way in: one native button per building ──────────────
            A SIBLING of the drawing above, so the picture keeps its single
            name and its `aria-hidden` subtree while these are ordinary
            controls — focusable, operable by Enter and Space, and announced
            as buttons. No text, no icon, nothing painted over a building:
            each one's whole name is its accessible name, in the same words
            the Places list uses. */}
        {targetsOn && (
          <Box
            role="group"
            aria-label="Places on the map"
            sx={{ position: 'absolute', inset: 0 }}
          >
            {VILLAGE_MAP.map((cell) => {
              const entry = byId.get(cell.missionId)
              if (!entry) return null
              const rect = mapTargetRect(cell.col, cell.row)
              return (
                <Box
                  key={cell.missionId}
                  component="button"
                  type="button"
                  data-testid={`map-target-${cell.missionId}`}
                  ref={(node: HTMLElement | null) => {
                    registerTarget?.(cell.missionId, node)
                  }}
                  onClick={() => onOpenLocation?.(cell.missionId)}
                  // Which place, and what is true of it — the one vocabulary.
                  aria-label={placeControlName(entry.mission.locationName, entry.state)}
                  // The derived box, inline: it is a different value for every
                  // target and a per-target style class for each of them buys
                  // nothing. It also means the geometry a test reads is the
                  // geometry the browser was given.
                  style={{
                    left: `${rect.leftPct}%`,
                    top: `${rect.topPct}%`,
                    width: `${rect.widthPct}%`,
                    height: `${rect.heightPct}%`,
                  }}
                  sx={{
                    position: 'absolute',
                    // The percentages already measure well over this at every
                    // width the board shows the picture at
                    // (`MAP_TARGET_MIN_PICTURE_WIDTH`); the floor is here so
                    // that a narrower picture than this design allows would
                    // keep its targets tappable rather than shrink them.
                    minWidth: 44,
                    minHeight: 44,
                    p: 0,
                    m: 0,
                    font: 'inherit',
                    color: 'inherit',
                    background: 'transparent',
                    // A quiet edge, so the places read as tappable without a
                    // word of text or a change to the drawing underneath.
                    border: `1px solid ${ring}3d`,
                    borderRadius: isLincoln ? '6px' : '12px',
                    cursor: 'pointer',
                    // Static like the drawing: nothing here animates, so a
                    // reduced-motion preference has nothing to switch off.
                    '&:hover': { background: `${ring}1f` },
                    '&:active': { background: `${ring}33` },
                    '&:focus-visible': {
                      outline: `3px solid ${ring}`,
                      outlineOffset: 2,
                      background: `${ring}1f`,
                    },
                  }}
                />
              )
            })}
          </Box>
        )}
      </Box>
    </Box>
  )
}
