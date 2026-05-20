import { useState } from 'react'
import Box from '@mui/material/Box'
import Typography from '@mui/material/Typography'

import type { CharacterProportions } from '../../core/types'

interface SliderDef {
  key: keyof CharacterProportions
  label: string
  min: number
  max: number
  step: number
  group: 'body' | 'outfit'
}

const BODY_SLIDERS: SliderDef[] = [
  { key: 'headSize', label: 'Head size', min: 1.4, max: 2.4, step: 0.1, group: 'body' },
  { key: 'torsoW', label: 'Body width', min: 1.2, max: 2.2, step: 0.1, group: 'body' },
  { key: 'torsoH', label: 'Body height', min: 1.8, max: 3.2, step: 0.1, group: 'body' },
  { key: 'torsoD', label: 'Body depth', min: 0.6, max: 1.4, step: 0.1, group: 'body' },
  { key: 'armW', label: 'Arm size', min: 0.5, max: 1.2, step: 0.05, group: 'body' },
  { key: 'legW', label: 'Leg size', min: 0.5, max: 1.0, step: 0.05, group: 'body' },
  { key: 'legH', label: 'Leg length', min: 2.0, max: 3.6, step: 0.1, group: 'body' },
]

const OUTFIT_SLIDERS: SliderDef[] = [
  { key: 'sleeveRatio', label: 'Sleeve length', min: 0, max: 0.7, step: 0.05, group: 'outfit' },
  { key: 'bootRatio', label: 'Boot height', min: 0, max: 0.5, step: 0.05, group: 'outfit' },
]

const COLOR_SLOTS = [
  { key: 'shirtColor' as const, label: 'Shirt' },
  { key: 'pantsColor' as const, label: 'Pants' },
  { key: 'shoeColor' as const, label: 'Boots' },
  { key: 'capeColor' as const, label: 'Cape' },
]

interface CharacterTunerPanelProps {
  proportions: CharacterProportions
  isLincoln: boolean
  outfitColors: {
    shirtColor: string
    pantsColor: string
    shoeColor: string
    capeColor: string
  }
  onProportionsChange: (proportions: CharacterProportions) => void
  onOutfitColorChange: (slot: 'shirt' | 'pants' | 'shoes', hex: string) => void
  onCapeColorChange: (hex: string) => void
  onDone: () => void
  onReset: () => void
}

export default function CharacterTunerPanel({
  proportions,
  isLincoln,
  outfitColors,
  onProportionsChange,
  onOutfitColorChange,
  onCapeColorChange,
  onDone,
  onReset,
}: CharacterTunerPanelProps) {
  const [activeGroup, setActiveGroup] = useState<'body' | 'outfit' | 'colors'>('body')

  const accentColor = isLincoln ? '#7EFC20' : '#E8A0BF'
  const titleFont = isLincoln ? '"Press Start 2P", monospace' : '"Fredoka", cursive'
  const bodyFont = isLincoln ? '"Press Start 2P", monospace' : '"Fredoka", cursive'
  const borderColor = isLincoln ? 'rgba(218,165,32,0.35)' : 'rgba(232,160,191,0.25)'
  const panelBg = isLincoln
    ? 'linear-gradient(135deg, rgba(15,15,25,0.97) 0%, rgba(25,22,18,0.97) 100%)'
    : 'linear-gradient(135deg, rgba(255,254,249,0.97) 0%, rgba(250,245,240,0.97) 100%)'

  function handleSliderChange(key: keyof CharacterProportions, value: number) {
    onProportionsChange({ ...proportions, [key]: value })
  }

  function handleCapeToggle() {
    onProportionsChange({ ...proportions, cape: !proportions.cape })
  }

  const sliders = activeGroup === 'body' ? BODY_SLIDERS : OUTFIT_SLIDERS

  const tabs: { id: 'body' | 'outfit' | 'colors'; label: string }[] = [
    { id: 'body', label: 'Body' },
    { id: 'outfit', label: 'Outfit' },
    { id: 'colors', label: 'Colors' },
  ]

  return (
    <Box
      sx={{
        background: panelBg,
        border: `2px solid ${borderColor}`,
        borderRadius: isLincoln ? '8px' : '18px',
        p: 2,
        mt: 2,
        mx: 1,
        boxShadow: isLincoln
          ? '0 4px 24px rgba(0,0,0,0.4), inset 0 1px 0 rgba(218,165,32,0.1)'
          : '0 4px 16px rgba(0,0,0,0.06)',
        animation: 'tunerSlideIn 0.3s ease-out',
        '@keyframes tunerSlideIn': {
          '0%': { opacity: 0, transform: 'translateY(12px)' },
          '100%': { opacity: 1, transform: 'translateY(0)' },
        },
      }}
    >
      {/* Header */}
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1.5 }}>
        <Typography
          sx={{
            fontFamily: titleFont,
            fontSize: isLincoln ? '11px' : '17px',
            color: isLincoln ? '#DAA520' : accentColor,
            fontWeight: 600,
          }}
        >
          Edit Character
        </Typography>
        <Box
          component="button"
          onClick={onDone}
          sx={{
            px: 2,
            py: 0.75,
            borderRadius: isLincoln ? '4px' : '12px',
            border: `1.5px solid ${accentColor}`,
            background: isLincoln ? 'rgba(126,252,32,0.12)' : 'rgba(232,160,191,0.12)',
            color: accentColor,
            fontFamily: bodyFont,
            fontSize: isLincoln ? '10px' : '14px',
            fontWeight: 600,
            cursor: 'pointer',
            transition: 'all 0.15s ease',
            '&:hover': { background: isLincoln ? 'rgba(126,252,32,0.2)' : 'rgba(232,160,191,0.2)' },
            '&:active': { transform: 'scale(0.95)' },
          }}
        >
          Done
        </Box>
      </Box>

      {/* Tab selector */}
      <Box sx={{ display: 'flex', gap: 1, mb: 2 }}>
        {tabs.map((tab) => {
          const isActive = activeGroup === tab.id
          return (
            <Box
              key={tab.id}
              component="button"
              onClick={() => setActiveGroup(tab.id)}
              sx={{
                flex: 1,
                py: 0.75,
                borderRadius: isLincoln ? '4px' : '12px',
                border: isActive
                  ? `1.5px solid ${isLincoln ? '#DAA520' : accentColor}`
                  : `1px solid ${isLincoln ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.05)'}`,
                background: isActive
                  ? (isLincoln ? 'rgba(218,165,32,0.12)' : 'rgba(232,160,191,0.1)')
                  : 'transparent',
                color: isActive
                  ? (isLincoln ? '#DAA520' : accentColor)
                  : (isLincoln ? 'rgba(255,255,255,0.4)' : 'rgba(0,0,0,0.35)'),
                fontFamily: bodyFont,
                fontSize: isLincoln ? '10px' : '14px',
                fontWeight: isActive ? 600 : 400,
                cursor: 'pointer',
                transition: 'all 0.15s ease',
                '&:active': { transform: 'scale(0.95)' },
              }}
            >
              {tab.label}
            </Box>
          )
        })}
      </Box>

      {/* Sliders (body / outfit tabs) */}
      {activeGroup !== 'colors' && (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
          {sliders.map((slider) => {
            const value = proportions[slider.key] as number
            return (
              <Box key={slider.key} sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                <Typography
                  sx={{
                    fontFamily: bodyFont,
                    fontSize: isLincoln ? '9px' : '13px',
                    color: isLincoln ? 'rgba(255,255,255,0.6)' : 'rgba(0,0,0,0.55)',
                    width: isLincoln ? 100 : 90,
                    flexShrink: 0,
                    lineHeight: 1.2,
                  }}
                >
                  {slider.label}
                </Typography>
                <Box
                  component="input"
                  type="range"
                  min={slider.min}
                  max={slider.max}
                  step={slider.step}
                  value={value}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                    handleSliderChange(slider.key, parseFloat(e.target.value))
                  }
                  sx={{
                    flex: 1,
                    height: 6,
                    appearance: 'none',
                    background: isLincoln
                      ? 'linear-gradient(90deg, rgba(218,165,32,0.3), rgba(126,252,32,0.3))'
                      : 'linear-gradient(90deg, rgba(232,160,191,0.2), rgba(232,160,191,0.4))',
                    borderRadius: '3px',
                    outline: 'none',
                    cursor: 'pointer',
                    '&::-webkit-slider-thumb': {
                      appearance: 'none',
                      width: 20,
                      height: 20,
                      borderRadius: isLincoln ? '3px' : '50%',
                      background: isLincoln ? '#DAA520' : accentColor,
                      border: `2px solid ${isLincoln ? '#0d1117' : '#fff'}`,
                      boxShadow: `0 0 6px ${isLincoln ? 'rgba(218,165,32,0.4)' : 'rgba(232,160,191,0.4)'}`,
                      cursor: 'grab',
                    },
                    '&::-moz-range-thumb': {
                      width: 20,
                      height: 20,
                      borderRadius: isLincoln ? '3px' : '50%',
                      background: isLincoln ? '#DAA520' : accentColor,
                      border: `2px solid ${isLincoln ? '#0d1117' : '#fff'}`,
                    },
                  }}
                />
                <Typography
                  sx={{
                    fontFamily: '"JetBrains Mono", monospace',
                    fontSize: isLincoln ? '10px' : '12px',
                    color: isLincoln ? 'rgba(218,165,32,0.7)' : 'rgba(0,0,0,0.4)',
                    width: 38,
                    textAlign: 'right',
                    flexShrink: 0,
                  }}
                >
                  {value.toFixed(slider.step < 0.1 ? 2 : 1)}
                </Typography>
              </Box>
            )
          })}

          {/* Cape toggle (outfit tab only) */}
          {activeGroup === 'outfit' && (
            <Box
              sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mt: 0.5 }}
            >
              <Typography
                sx={{
                  fontFamily: bodyFont,
                  fontSize: isLincoln ? '9px' : '13px',
                  color: isLincoln ? 'rgba(255,255,255,0.6)' : 'rgba(0,0,0,0.55)',
                  width: isLincoln ? 100 : 90,
                  flexShrink: 0,
                }}
              >
                Cape
              </Typography>
              <Box
                component="button"
                onClick={handleCapeToggle}
                sx={{
                  width: 44,
                  height: 24,
                  borderRadius: '12px',
                  border: 'none',
                  background: proportions.cape
                    ? (isLincoln ? '#DAA520' : accentColor)
                    : (isLincoln ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)'),
                  position: 'relative',
                  cursor: 'pointer',
                  transition: 'background 0.2s ease',
                  p: 0,
                  '&::after': {
                    content: '""',
                    position: 'absolute',
                    top: 2,
                    left: proportions.cape ? 22 : 2,
                    width: 20,
                    height: 20,
                    borderRadius: '50%',
                    background: '#fff',
                    transition: 'left 0.2s ease',
                    boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
                  },
                }}
              />
            </Box>
          )}
        </Box>
      )}

      {/* Colors tab */}
      {activeGroup === 'colors' && (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
          {COLOR_SLOTS.map((slot) => {
            const currentColor = outfitColors[slot.key]
            return (
              <Box key={slot.key} sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                <Typography
                  sx={{
                    fontFamily: bodyFont,
                    fontSize: isLincoln ? '9px' : '13px',
                    color: isLincoln ? 'rgba(255,255,255,0.6)' : 'rgba(0,0,0,0.55)',
                    width: isLincoln ? 100 : 90,
                    flexShrink: 0,
                  }}
                >
                  {slot.label}
                </Typography>
                <Box
                  component="input"
                  type="color"
                  value={currentColor}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                    const hex = e.target.value
                    if (slot.key === 'capeColor') {
                      onCapeColorChange(hex)
                    } else {
                      const outfitSlot = slot.key === 'shirtColor' ? 'shirt'
                        : slot.key === 'pantsColor' ? 'pants'
                        : 'shoes'
                      onOutfitColorChange(outfitSlot, hex)
                    }
                  }}
                  sx={{
                    width: 40,
                    height: 32,
                    border: `2px solid ${isLincoln ? 'rgba(218,165,32,0.3)' : 'rgba(0,0,0,0.1)'}`,
                    borderRadius: isLincoln ? '4px' : '8px',
                    cursor: 'pointer',
                    p: 0,
                    background: 'transparent',
                    '&::-webkit-color-swatch-wrapper': { p: 0 },
                    '&::-webkit-color-swatch': {
                      border: 'none',
                      borderRadius: isLincoln ? '2px' : '6px',
                    },
                  }}
                />
                <Typography
                  sx={{
                    fontFamily: '"JetBrains Mono", monospace',
                    fontSize: isLincoln ? '10px' : '12px',
                    color: isLincoln ? 'rgba(218,165,32,0.5)' : 'rgba(0,0,0,0.3)',
                  }}
                >
                  {currentColor}
                </Typography>
              </Box>
            )
          })}
        </Box>
      )}

      {/* Reset button */}
      <Box sx={{ display: 'flex', justifyContent: 'center', mt: 2 }}>
        <Box
          component="button"
          onClick={onReset}
          sx={{
            px: 2,
            py: 0.75,
            borderRadius: isLincoln ? '4px' : '12px',
            border: `1px solid ${isLincoln ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)'}`,
            background: 'transparent',
            color: isLincoln ? 'rgba(255,255,255,0.35)' : 'rgba(0,0,0,0.3)',
            fontFamily: bodyFont,
            fontSize: isLincoln ? '9px' : '13px',
            cursor: 'pointer',
            transition: 'all 0.15s ease',
            '&:hover': {
              color: isLincoln ? 'rgba(255,255,255,0.6)' : 'rgba(0,0,0,0.5)',
              borderColor: isLincoln ? 'rgba(255,255,255,0.15)' : 'rgba(0,0,0,0.1)',
            },
            '&:active': { transform: 'scale(0.95)' },
          }}
        >
          Reset to Default
        </Box>
      </Box>
    </Box>
  )
}
