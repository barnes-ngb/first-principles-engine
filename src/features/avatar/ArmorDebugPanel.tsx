import type { ChangeEvent } from 'react'
import Box from '@mui/material/Box'
import Typography from '@mui/material/Typography'

// ── Armor debug tuning types ────────────────────────────────────────

export interface ArmorDebugPieceValues {
  posX: number
  posY: number
  posZ: number
  rotX: number
  rotY: number
  rotZ: number
  scale: number
}

export interface ArmorDebugOverrides {
  helmet: ArmorDebugPieceValues
  shoes: ArmorDebugPieceValues
}

export const ARMOR_DEBUG_DEFAULTS: ArmorDebugOverrides = {
  helmet: { posX: 0, posY: 0, posZ: 0, rotX: 0, rotY: 0, rotZ: 0, scale: 1 },
  shoes: { posX: 0, posY: 0, posZ: 0, rotX: 0, rotY: 0, rotZ: 0, scale: 1 },
}

// ── Slider definitions ──────────────────────────────────────────────

type PieceId = 'helmet' | 'shoes'
type SliderKey = keyof ArmorDebugPieceValues

interface SliderDef {
  key: SliderKey
  label: string
  min: number
  max: number
  step: number
}

const POS_SLIDERS: SliderDef[] = [
  { key: 'posX', label: 'posX', min: -3, max: 3, step: 0.05 },
  { key: 'posY', label: 'posY', min: -3, max: 3, step: 0.05 },
  { key: 'posZ', label: 'posZ', min: -3, max: 3, step: 0.05 },
]

const ROT_SLIDERS: SliderDef[] = [
  { key: 'rotX', label: 'rotX', min: -Math.PI, max: Math.PI, step: 0.02 },
  { key: 'rotY', label: 'rotY', min: -Math.PI, max: Math.PI, step: 0.02 },
  { key: 'rotZ', label: 'rotZ', min: -Math.PI, max: Math.PI, step: 0.02 },
]

const SCALE_SLIDER: SliderDef = { key: 'scale', label: 'scale', min: 0.5, max: 1.5, step: 0.05 }

interface ArmorDebugPanelProps {
  values: ArmorDebugOverrides
  onChange: (next: ArmorDebugOverrides) => void
}

export default function ArmorDebugPanel({ values, onChange }: ArmorDebugPanelProps) {
  function updatePiece(piece: PieceId, key: SliderKey, value: number) {
    onChange({
      ...values,
      [piece]: { ...values[piece], [key]: value },
    })
  }

  function renderSliderSet(
    piece: PieceId,
    sliders: SliderDef[],
  ) {
    return sliders.map((def) => {
      const current = values[piece][def.key]
      return (
        <Box key={def.key}>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', fontSize: '10px', color: 'rgba(255,255,255,0.8)' }}>
            <span>{def.label}</span>
            <span>{Number(current).toFixed(3)}</span>
          </Box>
          <Box
            component="input"
            type="range"
            min={def.min}
            max={def.max}
            step={def.step}
            value={current}
            onChange={(e: ChangeEvent<HTMLInputElement>) => {
              updatePiece(piece, def.key, Number(e.target.value))
            }}
            sx={{ width: '100%' }}
          />
        </Box>
      )
    })
  }

  return (
    <Box sx={{ mx: 1, mb: 1, p: 1.25, borderRadius: 1.5, border: '1px solid rgba(126,252,32,0.25)', background: 'rgba(8,12,18,0.78)' }}>
      <Typography sx={{ fontFamily: '"Press Start 2P", monospace', fontSize: '10px', color: '#7EFC20', mb: 1 }}>
        Armor Debug
      </Typography>

      {/* Helmet */}
      <Typography sx={{ fontFamily: '"Press Start 2P", monospace', fontSize: '9px', color: '#DAA520', mb: 0.5 }}>
        Helmet
      </Typography>
      <Box sx={{ display: 'grid', gridTemplateColumns: '1fr', gap: 0.5, mb: 1.25 }}>
        {renderSliderSet('helmet', POS_SLIDERS)}
        {renderSliderSet('helmet', ROT_SLIDERS)}
        {renderSliderSet('helmet', [SCALE_SLIDER])}
      </Box>

      {/* Shoes */}
      <Typography sx={{ fontFamily: '"Press Start 2P", monospace', fontSize: '9px', color: '#DAA520', mb: 0.5 }}>
        Shoes
      </Typography>
      <Box sx={{ display: 'grid', gridTemplateColumns: '1fr', gap: 0.5 }}>
        {renderSliderSet('shoes', POS_SLIDERS)}
        {renderSliderSet('shoes', ROT_SLIDERS)}
      </Box>

      <Box
        component="button"
        onClick={() => onChange(ARMOR_DEBUG_DEFAULTS)}
        sx={{ mt: 1, px: 1.25, py: 0.5, borderRadius: 1, border: '1px solid rgba(126,252,32,0.4)', background: 'transparent', color: '#7EFC20', cursor: 'pointer' }}
      >
        Reset defaults
      </Box>
    </Box>
  )
}
