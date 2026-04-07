import { useEffect, useRef } from 'react'
import Box from '@mui/material/Box'
import Typography from '@mui/material/Typography'

import type { ArmorPiece, AvatarProfile } from '../../core/types'
import { VOXEL_TO_ARMOR_PIECE } from '../../core/types'
import { getForgeCost } from '../../core/xp/forgeCosts'
import { ArmorIcon } from './icons/ArmorIcons'
import type { ArmorTierColor } from './icons/ArmorIcons'
import { getAppliedVoxelPieces, getArmorPieceState } from './armorPieceState'
import { VOXEL_ARMOR_PIECES } from './voxel/buildArmorPiece'
import type { ArmorPieceMeta } from './voxel/buildArmorPiece'

interface ArmorPieceGalleryProps {
  profile: AvatarProfile
  appliedPieces: ArmorPiece[]
  selectedPiece: ArmorPieceMeta | null
  activeForgeTier: string
  isLincoln: boolean
  accentColor: string
  textColor: string
  bgColor: string
  onPieceTap: (piece: ArmorPieceMeta) => void
}

export default function ArmorPieceGallery({
  profile,
  appliedPieces,
  selectedPiece,
  activeForgeTier,
  isLincoln,
  accentColor,
  textColor,
  bgColor,
  onPieceTap,
}: ArmorPieceGalleryProps) {
  const cardScrollRef = useRef<HTMLDivElement>(null)

  // Reset card scroll to start (Belt first) on initial load only
  useEffect(() => {
    if (cardScrollRef.current) cardScrollRef.current.scrollLeft = 0
  }, [])

  const appliedVoxel = getAppliedVoxelPieces(appliedPieces)

  return (
    <Box
      ref={cardScrollRef}
      sx={{
        overflowX: 'auto',
        display: 'flex',
        gap: '12px',
        pb: 2,
        pt: 0.5,
        px: '16px',
        scrollSnapType: 'x mandatory',
        scrollbarWidth: 'none',
        '&::-webkit-scrollbar': { display: 'none' },
      }}
    >
      {VOXEL_ARMOR_PIECES.map((piece) => {
        const armorPieceId = VOXEL_TO_ARMOR_PIECE[piece.id]
        const pieceState = getArmorPieceState({
          profile,
          pieceId: piece.id,
          activeForgeTier,
          appliedTodayVoxel: appliedVoxel,
        })
        const isApplied = pieceState === 'equipped_today'
        const isLocked = pieceState === 'locked_by_xp'
        const isSelected = selectedPiece?.id === piece.id
        const forgeCost = getForgeCost(activeForgeTier, piece.id)

        const statusLabel = pieceState === 'locked_by_xp'
          ? 'Locked'
          : pieceState === 'forgeable'
            ? `◆ ${forgeCost} Forge`
            : pieceState === 'forged_not_equipped_today'
              ? 'Equip'
              : 'Equipped'

        const statusColor = pieceState === 'locked_by_xp'
          ? (isLincoln ? 'rgba(255,255,255,0.45)' : 'rgba(0,0,0,0.5)')
          : pieceState === 'forgeable'
            ? '#00BCD4'
            : pieceState === 'forged_not_equipped_today'
              ? '#FFA726'
              : '#4caf50'

        return (
          <Box
            key={piece.id}
            onClick={() => onPieceTap(piece)}
            sx={{
              minWidth: 140,
              maxWidth: 140,
              minHeight: 120,
              scrollSnapAlign: 'center',
              p: '14px 12px 12px',
              borderRadius: isLincoln ? '8px' : '18px',
              border: isApplied
                ? `2px solid ${accentColor}`
                : isSelected
                  ? `2px solid ${accentColor}88`
                  : `1.5px solid ${isLincoln ? 'rgba(126,252,32,0.2)' : 'rgba(232,160,191,0.25)'}`,
              background: isApplied
                ? (isLincoln
                    ? 'linear-gradient(180deg, rgba(126,252,32,0.12) 0%, rgba(13,17,23,0.95) 100%)'
                    : 'linear-gradient(180deg, rgba(232,160,191,0.12) 0%, rgba(255,254,249,0.95) 100%)')
                : (isLincoln
                    ? 'linear-gradient(180deg, rgba(255,255,255,0.04) 0%, rgba(255,255,255,0.01) 100%)'
                    : 'linear-gradient(180deg, rgba(0,0,0,0.02) 0%, rgba(0,0,0,0.005) 100%)'),
              cursor: 'pointer',
              opacity: isLocked ? 0.7 : 1,
              transition: 'all 0.25s ease',
              textAlign: 'center',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: '8px',
              position: 'relative',
              flexShrink: 0,
              boxShadow: isApplied
                ? `0 0 8px rgba(76,175,80,0.4), 0 4px 16px ${accentColor}22`
                : isSelected
                  ? `0 0 12px ${accentColor}33`
                  : `0 2px 8px ${isLincoln ? 'rgba(0,0,0,0.2)' : 'rgba(0,0,0,0.06)'}`,
              ...(isSelected
                ? {
                    animation: 'cardPulse 1.5s ease-in-out infinite',
                    '@keyframes cardPulse': {
                      '0%, 100%': { borderColor: `${accentColor}88` },
                      '50%': { borderColor: accentColor },
                    },
                  }
                : {}),
              '&:hover': {
                transform: 'translateY(-2px) scale(1.03)',
                boxShadow: isApplied
                  ? `0 0 12px rgba(76,175,80,0.5), 0 6px 20px ${accentColor}33`
                  : `0 4px 12px ${isLincoln ? 'rgba(0,0,0,0.3)' : 'rgba(0,0,0,0.08)'}`,
              },
              '&:active': { transform: 'scale(0.97)' },
            }}
          >
            <Box
              sx={{
                position: 'absolute',
                top: 0,
                left: '50%',
                transform: 'translateX(-50%)',
                width: isApplied ? '50%' : '0%',
                height: '3px',
                borderRadius: '0 0 3px 3px',
                bgcolor: accentColor,
                transition: 'width 0.3s ease',
                boxShadow: isApplied ? `0 2px 8px ${accentColor}44` : 'none',
              }}
            />

            <Box
              sx={{
                width: 64,
                height: 64,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                borderRadius: isLincoln ? '8px' : '50%',
                background: isApplied
                  ? (isLincoln ? 'rgba(126,252,32,0.12)' : 'rgba(232,160,191,0.12)')
                  : (isLincoln ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.02)'),
                boxShadow: isApplied
                  ? `0 0 16px ${accentColor}33, inset 0 0 8px ${accentColor}11`
                  : 'none',
                transition: 'all 0.3s ease',
                position: 'relative',
              }}
            >
              <ArmorIcon
                pieceId={armorPieceId}
                size={46}
                tier={(profile.currentTier ?? 'wood') as ArmorTierColor}
                locked={isLocked}
              />

              {isApplied && (
                <Box sx={{
                  position: 'absolute', bottom: -3, right: -3,
                  width: 20, height: 20, borderRadius: '50%',
                  bgcolor: '#4caf50',
                  border: `2px solid ${bgColor}`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  boxShadow: '0 2px 6px rgba(76,175,80,0.3)',
                }}>
                  <Typography sx={{ color: '#fff', fontSize: 12, fontWeight: 700, lineHeight: 1 }}>
                    ✓
                  </Typography>
                </Box>
              )}

            </Box>

            <Typography
              sx={{
                fontFamily: isLincoln ? '"Press Start 2P", monospace' : '"Fredoka", cursive',
                fontSize: isLincoln ? '12px' : '14px',
                fontWeight: 700,
                color: isApplied ? accentColor : textColor,
                lineHeight: 1.2,
              }}
            >
              {piece.shortName}
            </Typography>

            <Typography
              sx={{
                fontFamily: isLincoln ? '"Press Start 2P", monospace' : '"Fredoka", cursive',
                fontSize: isLincoln ? '12px' : '13px',
                color: statusColor,
                fontWeight: 600,
              }}
            >
              {statusLabel}
            </Typography>
          </Box>
        )
      })}
    </Box>
  )
}
