import { useState } from 'react'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Tooltip from '@mui/material/Tooltip'
import Typography from '@mui/material/Typography'
import LockIcon from '@mui/icons-material/Lock'

import type { ArmorColors, VoxelArmorPieceId } from '../../core/types'
import { VOXEL_TO_ARMOR_PIECE } from '../../core/types'
import { ArmorIcon } from './icons/ArmorIcons'
import type { ArmorTierColor } from './icons/ArmorIcons'

interface ArmorDyePanelProps {
  armorColors: ArmorColors | undefined
  unlockedPieces: string[]
  tierName: string
  isStoneOrAbove: boolean
  isLincoln: boolean
  onColorChange: (pieceId: VoxelArmorPieceId, hexColor: string) => void
  onReset: () => void
}

const DYE_PALETTE = [
  { hex: '#C62828', name: 'Red' },
  { hex: '#1565C0', name: 'Blue' },
  { hex: '#2E7D32', name: 'Green' },
  { hex: '#6A1B9A', name: 'Purple' },
  { hex: '#E65100', name: 'Orange' },
  { hex: '#F9A825', name: 'Yellow' },
  { hex: '#00838F', name: 'Cyan' },
  { hex: '#AD1457', name: 'Pink' },
  { hex: '#E0E0E0', name: 'White' },
  { hex: '#424242', name: 'Black' },
  { hex: '#5D4037', name: 'Brown' },
  { hex: '#C8A84E', name: 'Gold' },
] as const

const PIECE_ORDER: VoxelArmorPieceId[] = ['belt', 'breastplate', 'shoes', 'shield', 'helmet', 'sword']

const PIECE_LABELS: Record<VoxelArmorPieceId, string> = {
  belt: 'Belt',
  breastplate: 'Chest',
  shoes: 'Shoes',
  shield: 'Shield',
  helmet: 'Helm',
  sword: 'Sword',
}

export default function ArmorDyePanel({
  armorColors,
  unlockedPieces,
  tierName,
  isStoneOrAbove,
  isLincoln,
  onColorChange,
  onReset,
}: ArmorDyePanelProps) {
  const [open, setOpen] = useState(false)
  const [activePiece, setActivePiece] = useState<VoxelArmorPieceId | null>(null)

  const accentColor = isLincoln ? '#7EFC20' : '#E8A0BF'
  const titleFont = isLincoln ? '"Press Start 2P", monospace' : '"Fredoka", cursive'
  const tierColor = tierName.toLowerCase() as ArmorTierColor

  const hasCustomColors = armorColors && Object.values(armorColors).some(Boolean)

  // Locked state for Wood tier
  if (!isStoneOrAbove) {
    return (
      <Tooltip title="Unlock at Stone tier!" arrow placement="top">
        <span>
          <Button
            disabled
            startIcon={<LockIcon sx={{ fontSize: 24 }} />}
            sx={{
              mt: 1,
              mx: 1,
              fontFamily: titleFont,
              fontSize: isLincoln ? '12px' : '16px',
              color: isLincoln ? 'rgba(255,255,255,0.3)' : 'rgba(0,0,0,0.25)',
              textTransform: 'none',
              borderRadius: isLincoln ? '6px' : '14px',
              border: `1px dashed ${isLincoln ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.08)'}`,
              py: 1.5,
              width: '100%',
              '&.Mui-disabled': {
                color: isLincoln ? 'rgba(255,255,255,0.3)' : 'rgba(0,0,0,0.25)',
              },
            }}
          >
            Dye Armor
          </Button>
        </span>
      </Tooltip>
    )
  }

  return (
    <Box sx={{ mt: 1, mx: 1 }}>
      {/* Toggle button */}
      <Button
        onClick={() => setOpen(!open)}
        sx={{
          fontFamily: titleFont,
          fontSize: isLincoln ? '12px' : '16px',
          color: open ? accentColor : (isLincoln ? '#e0e0e0' : '#3d3d3d'),
          textTransform: 'none',
          borderRadius: isLincoln ? '6px' : '14px',
          border: `1px solid ${open ? accentColor : (isLincoln ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.08)')}`,
          background: open
            ? (isLincoln ? 'rgba(126,252,32,0.08)' : 'rgba(232,160,191,0.08)')
            : 'transparent',
          py: 1.5,
          px: 2,
          width: '100%',
          minHeight: '48px',
          transition: 'all 0.2s ease',
          '&:hover': {
            borderColor: accentColor,
            background: isLincoln ? 'rgba(126,252,32,0.05)' : 'rgba(232,160,191,0.05)',
          },
        }}
      >
        Dye Armor
      </Button>

      {/* Expandable panel */}
      {open && (
        <Box
          sx={{
            mt: 1.5,
            p: 2,
            borderRadius: isLincoln ? '8px' : '18px',
            border: `1px solid ${isLincoln ? 'rgba(126,252,32,0.1)' : 'rgba(232,160,191,0.18)'}`,
            background: isLincoln
              ? 'linear-gradient(135deg, rgba(20,22,36,0.95) 0%, rgba(26,30,46,0.95) 100%)'
              : 'linear-gradient(135deg, rgba(255,254,249,0.95) 0%, rgba(250,245,240,0.95) 100%)',
            boxShadow: isLincoln
              ? '0 4px 16px rgba(0,0,0,0.2)'
              : '0 4px 16px rgba(0,0,0,0.04)',
            animation: 'dyeSlideUp 0.25s ease-out',
            '@keyframes dyeSlideUp': {
              '0%': { opacity: 0, transform: 'translateY(8px)' },
              '100%': { opacity: 1, transform: 'translateY(0)' },
            },
          }}
        >
          <Typography
            sx={{
              fontFamily: titleFont,
              fontSize: isLincoln ? '12px' : '18px',
              color: accentColor,
              mb: 2,
              fontWeight: 600,
            }}
          >
            Dye Armor Pieces
          </Typography>

          {/* Piece selector row */}
          <Box sx={{ display: 'flex', gap: '6px', mb: 1.5, flexWrap: 'wrap', justifyContent: 'center' }}>
            {PIECE_ORDER.map((pieceId) => {
              const isUnlocked = unlockedPieces.includes(pieceId)
              const isActive = activePiece === pieceId
              const dyeHex = armorColors?.[pieceId]
              return (
                <Box
                  key={pieceId}
                  component="button"
                  disabled={!isUnlocked}
                  onClick={() => setActivePiece(isActive ? null : pieceId)}
                  sx={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    gap: '4px',
                    p: 1,
                    minWidth: 56,
                    minHeight: 56,
                    borderRadius: isLincoln ? '6px' : '12px',
                    border: isActive
                      ? `2px solid ${accentColor}`
                      : `1.5px solid ${isLincoln ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)'}`,
                    background: isActive
                      ? (isLincoln ? 'rgba(126,252,32,0.1)' : 'rgba(232,160,191,0.1)')
                      : 'transparent',
                    cursor: isUnlocked ? 'pointer' : 'default',
                    opacity: isUnlocked ? 1 : 0.35,
                    transition: 'all 0.2s ease',
                    '&:hover': isUnlocked ? {
                      borderColor: isActive ? accentColor : (isLincoln ? 'rgba(255,255,255,0.15)' : 'rgba(0,0,0,0.1)'),
                      transform: 'translateY(-1px)',
                    } : {},
                    '&:active': isUnlocked ? { transform: 'scale(0.96)' } : {},
                  }}
                >
                  <ArmorIcon pieceId={VOXEL_TO_ARMOR_PIECE[pieceId]} size={28} tier={tierColor} locked={!isUnlocked} />
                  {/* Dye color indicator dot */}
                  {dyeHex && (
                    <Box
                      sx={{
                        width: 10,
                        height: 10,
                        borderRadius: '50%',
                        background: dyeHex,
                        border: `1.5px solid ${isLincoln ? 'rgba(255,255,255,0.2)' : 'rgba(0,0,0,0.1)'}`,
                      }}
                    />
                  )}
                  <Typography
                    sx={{
                      fontFamily: isLincoln ? '"Press Start 2P", monospace' : '"Fredoka", cursive',
                      fontSize: isLincoln ? '12px' : '13px',
                      color: isActive
                        ? accentColor
                        : (isLincoln ? 'rgba(255,255,255,0.45)' : 'rgba(0,0,0,0.4)'),
                      lineHeight: 1,
                    }}
                  >
                    {PIECE_LABELS[pieceId]}
                  </Typography>
                </Box>
              )
            })}
          </Box>

          {/* Color palette grid */}
          {activePiece && (
            <Box
              sx={{
                display: 'grid',
                gridTemplateColumns: 'repeat(6, 1fr)',
                gap: '10px',
                justifyItems: 'center',
                py: 1.5,
                px: 0.5,
                animation: 'dyeSlideUp 0.2s ease-out',
              }}
            >
              {DYE_PALETTE.map((color) => {
                const isSelected = armorColors?.[activePiece] === color.hex
                return (
                  <Box
                    key={color.hex}
                    component="button"
                    onClick={() => onColorChange(activePiece, color.hex)}
                    title={color.name}
                    sx={{
                      width: 48,
                      height: 48,
                      borderRadius: isLincoln ? '6px' : '50%',
                      background: color.hex,
                      border: isSelected
                        ? `3px solid ${accentColor}`
                        : `2px solid ${isLincoln ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.08)'}`,
                      cursor: 'pointer',
                      transition: 'all 0.15s ease',
                      p: 0,
                      boxShadow: isSelected
                        ? `0 0 0 2px ${isLincoln ? '#0d1117' : '#faf5ef'}, 0 0 0 4px ${accentColor}, 0 0 12px ${accentColor}33`
                        : `0 2px 4px ${isLincoln ? 'rgba(0,0,0,0.3)' : 'rgba(0,0,0,0.08)'}`,
                      transform: isSelected ? 'scale(1.12)' : 'scale(1)',
                      '&:hover': {
                        transform: 'scale(1.15)',
                        boxShadow: `0 4px 8px ${isLincoln ? 'rgba(0,0,0,0.4)' : 'rgba(0,0,0,0.12)'}`,
                      },
                      '&:active': { transform: 'scale(0.95)' },
                    }}
                  />
                )
              })}
            </Box>
          )}

          {/* Reset button */}
          {hasCustomColors && (
            <Box sx={{ mt: 1.5, textAlign: 'center' }}>
              <Button
                size="small"
                onClick={() => {
                  onReset()
                  setActivePiece(null)
                }}
                sx={{
                  fontFamily: titleFont,
                  fontSize: isLincoln ? '12px' : '14px',
                  color: isLincoln ? 'rgba(255,255,255,0.5)' : 'rgba(0,0,0,0.4)',
                  textTransform: 'none',
                  '&:hover': {
                    color: isLincoln ? 'rgba(255,255,255,0.7)' : 'rgba(0,0,0,0.6)',
                    background: isLincoln ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.03)',
                  },
                }}
              >
                Reset to Default
              </Button>
            </Box>
          )}
        </Box>
      )}
    </Box>
  )
}
