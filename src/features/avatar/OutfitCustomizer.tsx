import { useState } from 'react'
import Box from '@mui/material/Box'
import Typography from '@mui/material/Typography'

import type { OutfitCustomization } from '../../core/types'

interface OutfitCustomizerProps {
  customization: OutfitCustomization | undefined
  ageGroup: 'older' | 'younger'
  onColorChange: (slot: 'shirt' | 'pants' | 'shoes', hexColor: string) => void
}

type OutfitSlot = 'shirt' | 'pants' | 'shoes'

const PALETTE = [
  { hex: '#B0B0B0', name: 'Gray' },
  { hex: '#FFFFFF', name: 'White' },
  { hex: '#222222', name: 'Black' },
  { hex: '#C62828', name: 'Red' },
  { hex: '#1565C0', name: 'Blue' },
  { hex: '#2E7D32', name: 'Green' },
  { hex: '#F9A825', name: 'Yellow' },
  { hex: '#6A1B9A', name: 'Purple' },
  { hex: '#E65100', name: 'Orange' },
  { hex: '#00838F', name: 'Teal' },
  { hex: '#4E342E', name: 'Brown' },
  { hex: '#AD1457', name: 'Pink' },
] as const

const DEFAULT_SHIRT_OLDER = '#BBBBBB'
const DEFAULT_SHIRT_YOUNGER = '#4A90C2'
const DEFAULT_PANTS = '#2A3A52'
const DEFAULT_SHOES_OLDER = '#F5D6B8' // barefoot (skin)
const DEFAULT_SHOES_YOUNGER = '#444444'

const SLOT_ICONS: Record<OutfitSlot, string> = {
  shirt: '👕',
  pants: '👖',
  shoes: '👟',
}

export default function OutfitCustomizer({
  customization,
  ageGroup,
  onColorChange,
}: OutfitCustomizerProps) {
  const [activeSlot, setActiveSlot] = useState<OutfitSlot | null>(null)
  const isLincoln = ageGroup === 'older'

  const slots: { id: OutfitSlot; label: string; current: string }[] = [
    {
      id: 'shirt',
      label: 'Shirt',
      current: customization?.shirtColor || (isLincoln ? DEFAULT_SHIRT_OLDER : DEFAULT_SHIRT_YOUNGER),
    },
    {
      id: 'pants',
      label: 'Pants',
      current: customization?.pantsColor || DEFAULT_PANTS,
    },
    {
      id: 'shoes',
      label: 'Shoes',
      current: customization?.shoeColor || (isLincoln ? DEFAULT_SHOES_OLDER : DEFAULT_SHOES_YOUNGER),
    },
  ]

  const accentColor = isLincoln ? '#7EFC20' : '#E8A0BF'
  const titleFont = isLincoln ? '"Press Start 2P", monospace' : '"Fredoka", cursive'

  return (
    <Box
      sx={{
        background: isLincoln ? 'rgba(26,26,46,0.95)' : 'rgba(255,254,249,0.95)',
        border: `1px solid ${isLincoln ? 'rgba(126,252,32,0.12)' : 'rgba(232,160,191,0.2)'}`,
        borderRadius: isLincoln ? '6px' : '16px',
        p: 2,
        mt: 2,
        mx: 1,
      }}
    >
      <Typography
        sx={{
          fontFamily: titleFont,
          fontSize: isLincoln ? '0.42rem' : '15px',
          color: accentColor,
          mb: 1.5,
          fontWeight: 600,
        }}
      >
        Customize Outfit
      </Typography>

      {/* Slot selector — pill buttons with color preview */}
      <Box sx={{ display: 'flex', gap: '8px', mb: 1.5 }}>
        {slots.map((slot) => {
          const isActive = activeSlot === slot.id
          return (
            <Box
              key={slot.id}
              component="button"
              onClick={() => setActiveSlot(slot.id === activeSlot ? null : slot.id)}
              sx={{
                flex: 1,
                py: 1,
                px: 0.5,
                borderRadius: isLincoln ? '4px' : '12px',
                border: isActive
                  ? `2px solid ${accentColor}`
                  : `1.5px solid ${isLincoln ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.08)'}`,
                background: isActive
                  ? (isLincoln ? 'rgba(126,252,32,0.1)' : 'rgba(232,160,191,0.1)')
                  : 'transparent',
                cursor: 'pointer',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: '4px',
                minHeight: '52px',
                transition: 'all 0.2s ease',
                '&:active': { transform: 'scale(0.96)' },
              }}
            >
              {/* Color preview circle */}
              <Box
                sx={{
                  width: 20,
                  height: 20,
                  borderRadius: '50%',
                  background: slot.current,
                  border: `2px solid ${isActive ? accentColor : (isLincoln ? 'rgba(255,255,255,0.2)' : 'rgba(0,0,0,0.12)')}`,
                  boxShadow: isActive ? `0 0 8px ${accentColor}44` : 'none',
                  transition: 'all 0.2s ease',
                }}
              />
              <Typography
                sx={{
                  fontFamily: isLincoln ? '"Press Start 2P", monospace' : '"Fredoka", cursive',
                  fontSize: isLincoln ? '0.28rem' : '11px',
                  color: isActive
                    ? accentColor
                    : (isLincoln ? 'rgba(255,255,255,0.5)' : 'rgba(0,0,0,0.45)'),
                  lineHeight: 1,
                }}
              >
                {SLOT_ICONS[slot.id]} {slot.label}
              </Typography>
            </Box>
          )
        })}
      </Box>

      {/* Color palette — round swatches */}
      {activeSlot && (
        <Box
          sx={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: '8px',
            justifyContent: 'center',
            py: 1,
            animation: 'outfitSlideUp 0.2s ease-out',
            '@keyframes outfitSlideUp': {
              '0%': { opacity: 0, transform: 'translateY(6px)' },
              '100%': { opacity: 1, transform: 'translateY(0)' },
            },
          }}
        >
          {PALETTE.map((color) => {
            const isSelected = slots.find((s) => s.id === activeSlot)?.current === color.hex
            return (
              <Box
                key={color.hex}
                component="button"
                onClick={() => onColorChange(activeSlot, color.hex)}
                title={color.name}
                sx={{
                  width: 40,
                  height: 40,
                  borderRadius: '50%',
                  background: color.hex,
                  border: isSelected
                    ? `3px solid ${accentColor}`
                    : `2px solid ${isLincoln ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.1)'}`,
                  cursor: 'pointer',
                  transition: 'all 0.15s ease',
                  p: 0,
                  boxShadow: isSelected
                    ? `0 0 0 2px ${isLincoln ? '#0d1117' : '#faf5ef'}, 0 0 0 4px ${accentColor}`
                    : 'none',
                  transform: isSelected ? 'scale(1.1)' : 'scale(1)',
                  '&:hover': {
                    transform: 'scale(1.12)',
                  },
                  '&:active': { transform: 'scale(0.95)' },
                }}
              />
            )
          })}
        </Box>
      )}
    </Box>
  )
}
