import type { ChangeEvent } from 'react'
import Box from '@mui/material/Box'
import Typography from '@mui/material/Typography'

import {
  HERO_ANIMATION_CONTROL_DEFS,
  HERO_ANIMATION_TUNING_DEFAULTS,
  type HeroAnimationTuningOverride,
} from './voxel/heroAnimationTuning'

interface HeroAnimationDebugPanelProps {
  values: HeroAnimationTuningOverride
  onChange: (next: HeroAnimationTuningOverride) => void
}

export default function HeroAnimationDebugPanel({ values, onChange }: HeroAnimationDebugPanelProps) {
  return (
    <Box sx={{ mx: 1, mb: 1, p: 1.25, borderRadius: 1.5, border: '1px solid rgba(126,252,32,0.25)', background: 'rgba(8,12,18,0.78)' }}>
      <Typography sx={{ fontFamily: '"Press Start 2P", monospace', fontSize: '10px', color: '#7EFC20', mb: 1 }}>
        Hero Animation Debug
      </Typography>
      <Box sx={{ display: 'grid', gridTemplateColumns: '1fr', gap: 0.75 }}>
        {HERO_ANIMATION_CONTROL_DEFS.map((def) => {
          const value = values[def.key] ?? HERO_ANIMATION_TUNING_DEFAULTS[def.key]
          return (
            <Box key={def.key}>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', fontSize: '10px', color: 'rgba(255,255,255,0.8)' }}>
                <span>{def.label}</span>
                <span>{Number(value).toFixed(3)}</span>
              </Box>
              <Box
                component="input"
                type="range"
                min={def.min}
                max={def.max}
                step={def.step}
                value={value}
                onChange={(e: ChangeEvent<HTMLInputElement>) => {
                  onChange({ ...values, [def.key]: Number(e.target.value) })
                }}
                sx={{ width: '100%' }}
              />
            </Box>
          )
        })}
      </Box>
      <Box
        component="button"
        onClick={() => onChange({})}
        sx={{ mt: 1, px: 1.25, py: 0.5, borderRadius: 1, border: '1px solid rgba(126,252,32,0.4)', background: 'transparent', color: '#7EFC20', cursor: 'pointer' }}
      >
        Reset defaults
      </Box>
    </Box>
  )
}
