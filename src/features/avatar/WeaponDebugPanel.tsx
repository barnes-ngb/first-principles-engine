// TEMPORARY debug panel for tuning shield + sword position/rotation on-device.
// Remove this file (and DEBUG_WEAPONS in MyAvatarPage) once final values are
// hardcoded into the shield/sword builders.
import type { ChangeEvent } from 'react'
import Box from '@mui/material/Box'
import Typography from '@mui/material/Typography'

import type { WeaponDebugValues, WeaponTransform } from './weaponDebug'
import { WEAPON_DEBUG_DEFAULTS } from './weaponDebug'

interface SliderDef {
  key: keyof WeaponTransform
  min: number
  max: number
  step: number
}

const POS_DEFS: SliderDef[] = [
  { key: 'posX', min: -3, max: 3, step: 0.1 },
  { key: 'posY', min: -4, max: 1, step: 0.1 },
  { key: 'posZ', min: -2, max: 3, step: 0.1 },
]

const ROT_DEFS: SliderDef[] = [
  { key: 'rotX', min: -3.14, max: 3.14, step: 0.05 },
  { key: 'rotY', min: -3.14, max: 3.14, step: 0.05 },
  { key: 'rotZ', min: -3.14, max: 3.14, step: 0.05 },
]

const ALL_DEFS: SliderDef[] = [...POS_DEFS, ...ROT_DEFS]

interface WeaponSectionProps {
  label: string
  accent: string
  values: WeaponTransform
  onChange: (next: WeaponTransform) => void
  onReset: () => void
}

function WeaponSection({ label, accent, values, onChange, onReset }: WeaponSectionProps) {
  const finalLine = `pos(${values.posX.toFixed(2)}, ${values.posY.toFixed(2)}, ${values.posZ.toFixed(2)}) rot(${values.rotX.toFixed(2)}, ${values.rotY.toFixed(2)}, ${values.rotZ.toFixed(2)})`
  return (
    <Box sx={{ mb: 1 }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 0.5 }}>
        <Typography sx={{ fontFamily: '"Press Start 2P", monospace', fontSize: '10px', color: accent }}>
          {label}
        </Typography>
        <Box
          component="button"
          onClick={onReset}
          sx={{
            fontSize: '9px',
            px: 0.75,
            py: 0.25,
            borderRadius: 0.5,
            border: `1px solid ${accent}`,
            background: 'transparent',
            color: accent,
            cursor: 'pointer',
          }}
        >
          reset
        </Box>
      </Box>
      <Box sx={{ display: 'grid', gridTemplateColumns: '1fr', gap: 0.25 }}>
        {ALL_DEFS.map((def) => {
          const v = values[def.key]
          return (
            <Box key={def.key} sx={{ display: 'flex', alignItems: 'center', gap: 1, fontSize: '11px', color: 'rgba(255,255,255,0.85)' }}>
              <Box sx={{ width: 36, fontFamily: 'monospace' }}>{def.key}</Box>
              <Box sx={{ width: 44, fontFamily: 'monospace', textAlign: 'right' }}>{v.toFixed(2)}</Box>
              <Box
                component="input"
                type="range"
                min={def.min}
                max={def.max}
                step={def.step}
                value={v}
                onChange={(e: ChangeEvent<HTMLInputElement>) => {
                  onChange({ ...values, [def.key]: Number(e.target.value) })
                }}
                sx={{ flex: 1 }}
              />
            </Box>
          )
        })}
      </Box>
      <Box sx={{ mt: 0.5, fontSize: '11px', fontFamily: 'monospace', color: accent, fontWeight: 700 }}>
        {finalLine}
      </Box>
    </Box>
  )
}

interface WeaponDebugPanelProps {
  values: WeaponDebugValues
  onChange: (next: WeaponDebugValues) => void
}

export default function WeaponDebugPanel({ values, onChange }: WeaponDebugPanelProps) {
  return (
    <Box sx={{ mx: 1, mb: 1, p: 1.25, borderRadius: 1.5, border: '1px solid rgba(126,252,32,0.25)', background: 'rgba(8,12,18,0.85)' }}>
      <Typography sx={{ fontFamily: '"Press Start 2P", monospace', fontSize: '10px', color: '#7EFC20', mb: 1 }}>
        Weapon Debug (temporary)
      </Typography>
      <WeaponSection
        label="SHIELD"
        accent="#7EFC20"
        values={values.shield}
        onChange={(next) => onChange({ ...values, shield: next })}
        onReset={() => onChange({ ...values, shield: WEAPON_DEBUG_DEFAULTS.shield })}
      />
      <WeaponSection
        label="SWORD"
        accent="#FFB347"
        values={values.sword}
        onChange={(next) => onChange({ ...values, sword: next })}
        onReset={() => onChange({ ...values, sword: WEAPON_DEBUG_DEFAULTS.sword })}
      />
    </Box>
  )
}
