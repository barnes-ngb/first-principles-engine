/**
 * Stonebridge, as one connected village — a picture, and only a picture.
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
 * ── Why there is nothing to tap on it ────────────────────────────────────────
 *
 * It was built with a hotspot per location: a grid of native buttons over the
 * drawing, each with a readable label. Independent verification in a real
 * browser at 390 × 400 **with enlarged text** (20px / 1.6) found what that
 * costs — the labels covered the buildings they were labelling, and
 * "Watchtower" broke mid-word. The fix is not a smaller label, because enlarged
 * text is a setting a child is entitled to and shrinking it is the defect.
 *
 * So the overview is deliberately **noninteractive**, which the task allowed
 * for exactly this case, and the readable location list below it is the whole
 * navigation: native buttons, full-size targets, each one naming its place and
 * its condition. One picture to recognise the village by, one list to move
 * around it with — rather than two sets of controls for the same seven places,
 * one of which is unusable at the text size that needed it most.
 *
 * The picture therefore carries **no label, no button and no hover
 * affordance**, and the caption says plainly where the way in is. Its text
 * alternative names the Square, the river, the Old Bridge and the ridge — the
 * things a child would point at — and then says what has been rebuilt so far.
 *
 * Presentational only. `board` is derived read-only from the existing
 * completed-mission state; nothing here reads or writes progress, and the
 * drawing is completely static — there is no motion for a reduced-motion
 * preference to have to switch off.
 */
import Box from '@mui/material/Box'
import Typography from '@mui/material/Typography'

import LocationStructure, { VillageSquareStructure } from './LocationScenes'
import { describeVillageOverview } from './locationArtDescriptions'
import { VillageLocationState, type VillageLocation } from './computeStonebridgeProgress'
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
} from './villageMapLayout'

interface VillageSceneProps {
  /** Every location and its state, from `deriveVillageBoard`. Read-only. */
  board: VillageLocation[]
  isLincoln: boolean
}

export default function VillageScene({ board, isLincoln }: VillageSceneProps) {
  const titleFont = isLincoln ? '"Press Start 2P", monospace' : '"Fredoka", cursive'
  const bodyFont = isLincoln ? undefined : '"Fredoka", cursive'
  const byId = new Map(board.map((entry) => [entry.mission.id, entry]))
  const repairedNames = board
    .filter((entry) => entry.state === VillageLocationState.Repaired)
    .map((entry) => entry.mission.locationName)

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
        {/* In normal flow, above the picture and at a readable size: the
            picture is not the way in, and this is where the way in is. */}
        Pick a place from the list.
      </Typography>

      <Box
        // ONE accessible name for the whole drawing, and nothing inside it is a
        // control or a second label.
        role="img"
        aria-label={describeVillageOverview(repairedNames)}
        sx={{
          position: 'relative',
          width: '100%',
          // Capped so the village stays a picture on a tablet rather than
          // growing into a wall, and centred under the board's own column.
          maxWidth: 460,
          mx: 'auto',
          // Locked to the viewBox, so the landscape never distorts and the
          // buildings keep their proportions at every width.
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
          {/* ── The valley ─────────────────────────────────────────── */}
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

          {/* ── The river, and the far side of it ───────────────────── */}
          <g data-testid="village-river">
            <rect x={0} y={WATER_TOP} width={MAP_WIDTH} height={FAR_BANK - WATER_TOP} fill={TERRAIN.water} />
            <rect x={14} y={240} width={46} height={2} rx={1} fill={TERRAIN.ripple} opacity={0.5} />
            <rect x={212} y={238} width={52} height={2} rx={1} fill={TERRAIN.ripple} opacity={0.45} />
            <rect x={0} y={FAR_BANK} width={MAP_WIDTH} height={MAP_HEIGHT - FAR_BANK} fill={TERRAIN.bank} />
            <rect x={0} y={FAR_BANK} width={MAP_WIDTH} height={2.2} fill={TERRAIN.bankTop} />
          </g>

          {/* ── The roads that make it one village ─────────────────── */}
          <g data-testid="village-roads" strokeLinecap="round">
            {ROADS.map((d) => (
              <path key={d} d={d} stroke={TERRAIN.road} strokeWidth={5} fill="none" />
            ))}
          </g>

          {/* ── The Square, then every location in its own cell ──────
              The Square has no mission and no state: the Bible has its
              fountain running already, so there is nothing here for a repair
              to turn on and nothing that could read as "fix the Square next". */}
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
    </Box>
  )
}
