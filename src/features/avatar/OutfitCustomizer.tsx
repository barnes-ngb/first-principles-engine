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
        border: `1px solid ${isLincoln ? 'rgba(76,175,80,0.2)' : 'rgba(232,160,191,0.3)'}`,
        borderRadius: isLincoln ? '2px' : '12px',
        p: 2,
        mt: 1.5,
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

      {/* Slot selector */}
      <Box sx={{ display: 'flex', gap: 1, mb: 1.5 }}>
        {slots.map((slot) => (
          <Box
            key={slot.id}
            component="button"
            onClick={() => setActiveSlot(slot.id === activeSlot ? null : slot.id)}
            sx={{
              flex: 1,
              p: 1,
              borderRadius: isLincoln ? '2px' : '8px',
              border: activeSlot === slot.id
                ? `2px solid ${accentColor}`
                : `1px solid ${isLincoln ? 'rgba(255,255,255,0.15)' : 'rgba(0,0,0,0.1)'}`,
              background: activeSlot === slot.id
                ? (isLincoln ? 'rgba(76,175,80,0.15)' : 'rgba(232,160,191,0.15)')
                : (isLincoln ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.03)'),
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              justifyContent: 'center',
              minHeight: '44px',
            }}
          >
            <Box
              sx={{
                width: 16,
                height: 16,
                borderRadius: '3px',
                background: slot.current,
                border: `1px solid ${isLincoln ? 'rgba(255,255,255,0.2)' : 'rgba(0,0,0,0.15)'}`,
                flexShrink: 0,
              }}
            />
            <Typography
              sx={{
                fontFamily: isLincoln ? '"Press Start 2P", monospace' : '"Fredoka", cursive',
                fontSize: isLincoln ? '0.3rem' : '13px',
                color: activeSlot === slot.id
                  ? accentColor
                  : (isLincoln ? 'rgba(255,255,255,0.7)' : 'rgba(0,0,0,0.6)'),
              }}
            >
              {slot.label}
            </Typography>
          </Box>
        ))}
      </Box>

      {/* Color palette */}
      {activeSlot && (
        <Box
          sx={{
            display: 'grid',
            gridTemplateColumns: 'repeat(6, 1fr)',
            gap: '6px',
            animation: 'slideUp 0.2s ease-out',
            '@keyframes slideUp': {
              '0%': { opacity: 0, transform: 'translateY(8px)' },
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
                  width: '100%',
                  aspectRatio: '1',
                  minHeight: '44px',
                  borderRadius: isLincoln ? '2px' : '6px',
                  background: color.hex,
                  border: isSelected
                    ? `3px solid ${accentColor}`
                    : `2px solid ${isLincoln ? 'rgba(255,255,255,0.15)' : 'rgba(0,0,0,0.12)'}`,
                  cursor: 'pointer',
                  transition: 'transform 0.1s',
                  p: 0,
                  '&:active': { transform: 'scale(0.92)' },
                }}
              />
            )
          })}
        </Box>
      )}
    </Box>
  )
}
