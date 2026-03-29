import { useState } from 'react'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Tooltip from '@mui/material/Tooltip'
import LockIcon from '@mui/icons-material/Lock'

import type { ShieldEmblem } from '../../core/types'
import { SHIELD_EMBLEM_OPTIONS } from './voxel/buildShieldEmblem'

interface ShieldEmblemPickerProps {
  currentEmblem: ShieldEmblem | undefined
  isIronOrAbove: boolean
  isLincoln: boolean
  onSelect: (emblem: ShieldEmblem) => void
}

export default function ShieldEmblemPicker({
  currentEmblem,
  isIronOrAbove,
  isLincoln,
  onSelect,
}: ShieldEmblemPickerProps) {
  const [open, setOpen] = useState(false)

  const accentColor = isLincoln ? '#7EFC20' : '#E8A0BF'
  const titleFont = isLincoln ? '"Press Start 2P", monospace' : '"Fredoka", cursive'
  const selected = currentEmblem ?? 'cross'

  if (!isIronOrAbove) {
    return (
      <Tooltip title="Unlock at Iron tier" arrow placement="top">
        <span>
          <Button
            disabled
            size="small"
            startIcon={<LockIcon sx={{ fontSize: 14 }} />}
            sx={{
              fontFamily: titleFont,
              fontSize: isLincoln ? '7px' : '11px',
              color: isLincoln ? 'rgba(255,255,255,0.3)' : 'rgba(0,0,0,0.25)',
              textTransform: 'none',
              borderRadius: isLincoln ? '4px' : '10px',
              border: `1px dashed ${isLincoln ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.08)'}`,
              py: 0.5,
              px: 1,
              minWidth: 0,
              '&.Mui-disabled': {
                color: isLincoln ? 'rgba(255,255,255,0.3)' : 'rgba(0,0,0,0.25)',
              },
            }}
          >
            Emblem
          </Button>
        </span>
      </Tooltip>
    )
  }

  return (
    <Box sx={{ display: 'inline-block' }}>
      <Button
        size="small"
        onClick={() => setOpen(!open)}
        sx={{
          fontFamily: titleFont,
          fontSize: isLincoln ? '7px' : '11px',
          color: open ? accentColor : (isLincoln ? '#ccc' : '#555'),
          textTransform: 'none',
          borderRadius: isLincoln ? '4px' : '10px',
          border: `1px solid ${open ? accentColor : (isLincoln ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.08)')}`,
          background: open
            ? (isLincoln ? 'rgba(126,252,32,0.08)' : 'rgba(232,160,191,0.08)')
            : 'transparent',
          py: 0.5,
          px: 1,
          minWidth: 0,
          transition: 'all 0.2s ease',
          '&:hover': {
            borderColor: accentColor,
            background: isLincoln ? 'rgba(126,252,32,0.05)' : 'rgba(232,160,191,0.05)',
          },
        }}
      >
        Emblem
      </Button>

      {open && (
        <Box
          sx={{
            display: 'flex',
            gap: '6px',
            mt: 1,
            flexWrap: 'wrap',
            justifyContent: 'center',
            animation: 'emblemSlideUp 0.2s ease-out',
            '@keyframes emblemSlideUp': {
              '0%': { opacity: 0, transform: 'translateY(6px)' },
              '100%': { opacity: 1, transform: 'translateY(0)' },
            },
          }}
        >
          {SHIELD_EMBLEM_OPTIONS.map((opt) => {
            const isActive = selected === opt.id
            return (
              <Box
                key={opt.id}
                component="button"
                onClick={() => onSelect(opt.id)}
                title={opt.label}
                sx={{
                  width: 38,
                  height: 38,
                  borderRadius: isLincoln ? '4px' : '10px',
                  border: isActive
                    ? `2px solid ${accentColor}`
                    : `1.5px solid ${isLincoln ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.08)'}`,
                  background: isActive
                    ? (isLincoln ? 'rgba(126,252,32,0.12)' : 'rgba(232,160,191,0.12)')
                    : 'transparent',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '18px',
                  p: 0,
                  transition: 'all 0.15s ease',
                  transform: isActive ? 'scale(1.1)' : 'scale(1)',
                  boxShadow: isActive
                    ? `0 0 8px ${accentColor}33`
                    : 'none',
                  '&:hover': {
                    transform: 'scale(1.12)',
                    borderColor: isLincoln ? 'rgba(255,255,255,0.2)' : 'rgba(0,0,0,0.15)',
                  },
                  '&:active': { transform: 'scale(0.95)' },
                }}
              >
                {opt.icon}
              </Box>
            )
          })}
        </Box>
      )}
    </Box>
  )
}
