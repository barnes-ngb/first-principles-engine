import { useEffect, useRef } from 'react'
import Box from '@mui/material/Box'
import Typography from '@mui/material/Typography'

import type { ArmorPiece, AvatarProfile } from '../../core/types'
import { VOXEL_TO_ARMOR_PIECE } from '../../core/types'
import { ArmorIcon } from './icons/ArmorIcons'
import type { ArmorTierColor } from './icons/ArmorIcons'
import { VOXEL_ARMOR_PIECES, XP_THRESHOLDS } from './voxel/buildArmorPiece'
import type { ArmorPieceMeta } from './voxel/buildArmorPiece'

interface ArmorPieceGalleryProps {
  profile: AvatarProfile
  appliedPieces: ArmorPiece[]
  selectedPiece: ArmorPieceMeta | null
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
  isLincoln,
  accentColor,
  textColor,
  bgColor,
  onPieceTap,
}: ArmorPieceGalleryProps) {
  const cardScrollRef = useRef<HTMLDivElement>(null)

  // Reset card scroll to start (Belt first) on load
  useEffect(() => {
    if (cardScrollRef.current) cardScrollRef.current.scrollLeft = 0
  }, [profile])

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
        const isUnlocked = profile.totalXp >= XP_THRESHOLDS[piece.id]
        const armorPieceId = VOXEL_TO_ARMOR_PIECE[piece.id]
        const isApplied = armorPieceId ? appliedPieces.includes(armorPieceId) : false
        const isSelected = selectedPiece?.id === piece.id
        const xpAway = XP_THRESHOLDS[piece.id] - profile.totalXp
        const unlockProgress = isUnlocked ? 100 : Math.max(0, Math.min(100, (profile.totalXp / XP_THRESHOLDS[piece.id]) * 100))

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
                  : isUnlocked
                    ? `1.5px solid ${isLincoln ? 'rgba(126,252,32,0.2)' : 'rgba(232,160,191,0.25)'}`
                    : `1px solid ${isLincoln ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)'}`,
              background: isApplied
                ? (isLincoln
                    ? 'linear-gradient(180deg, rgba(126,252,32,0.12) 0%, rgba(13,17,23,0.95) 100%)'
                    : 'linear-gradient(180deg, rgba(232,160,191,0.12) 0%, rgba(255,254,249,0.95) 100%)')
                : isUnlocked
                  ? (isLincoln
                      ? 'linear-gradient(180deg, rgba(255,255,255,0.04) 0%, rgba(255,255,255,0.01) 100%)'
                      : 'linear-gradient(180deg, rgba(0,0,0,0.02) 0%, rgba(0,0,0,0.005) 100%)')
                  : 'transparent',
              cursor: 'pointer',
              opacity: isUnlocked ? 1 : 0.45,
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
                  : (isUnlocked ? `0 2px 8px ${isLincoln ? 'rgba(0,0,0,0.2)' : 'rgba(0,0,0,0.06)'}` : 'none'),
              // Pulsing border when verse card is showing for this piece
              ...(isSelected ? {
                animation: 'cardPulse 1.5s ease-in-out infinite',
                '@keyframes cardPulse': {
                  '0%, 100%': { borderColor: `${accentColor}88` },
                  '50%': { borderColor: accentColor },
                },
              } : {}),
              '&:hover': {
                transform: 'translateY(-2px) scale(1.03)',
                boxShadow: isApplied
                  ? `0 0 12px rgba(76,175,80,0.5), 0 6px 20px ${accentColor}33`
                  : `0 4px 12px ${isLincoln ? 'rgba(0,0,0,0.3)' : 'rgba(0,0,0,0.08)'}`,
              },
              '&:active': { transform: 'scale(0.97)' },
            }}
          >
            {/* Status indicator — top strip */}
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

            {/* Icon container with glow for equipped */}
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
                  : (isUnlocked ? (isLincoln ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.02)') : 'transparent'),
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
                tier={(profile.currentTier ?? 'stone') as ArmorTierColor}
                locked={!isUnlocked}
              />

              {/* Equipped check overlay */}
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

              {/* Lock overlay */}
              {!isUnlocked && (
                <Box sx={{
                  position: 'absolute', bottom: -3, right: -3,
                  width: 20, height: 20, borderRadius: '50%',
                  bgcolor: isLincoln ? '#2a2a2a' : '#ddd',
                  border: `2px solid ${bgColor}`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 10,
                }}>
                  🔒
                </Box>
              )}
            </Box>

            {/* Piece name */}
            <Typography
              sx={{
                fontFamily: isLincoln ? '"Press Start 2P", monospace' : '"Fredoka", cursive',
                fontSize: isLincoln ? '12px' : '14px',
                fontWeight: 700,
                color: isApplied
                  ? accentColor
                  : isUnlocked
                    ? textColor
                    : (isLincoln ? 'rgba(255,255,255,0.4)' : 'rgba(0,0,0,0.35)'),
                lineHeight: 1.2,
              }}
            >
              {piece.shortName}
            </Typography>

            {/* Status / XP progress */}
            {isApplied ? (
              <Typography
                sx={{
                  fontFamily: isLincoln ? '"Press Start 2P", monospace' : '"Fredoka", cursive',
                  fontSize: isLincoln ? '12px' : '13px',
                  color: '#4caf50',
                  fontWeight: 600,
                }}
              >
                Equipped
              </Typography>
            ) : isUnlocked ? (
              <Typography
                sx={{
                  fontFamily: isLincoln ? '"Press Start 2P", monospace' : '"Fredoka", cursive',
                  fontSize: isLincoln ? '12px' : '13px',
                  color: '#FFA726',
                }}
              >
                Tap to equip
              </Typography>
            ) : (
              <Box sx={{ width: '85%' }}>
                <Box
                  sx={{
                    height: 6,
                    borderRadius: '3px',
                    bgcolor: isLincoln ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)',
                    overflow: 'hidden',
                  }}
                >
                  <Box
                    sx={{
                      height: '100%',
                      width: `${unlockProgress}%`,
                      borderRadius: 'inherit',
                      bgcolor: isLincoln ? 'rgba(126,252,32,0.35)' : 'rgba(232,160,191,0.4)',
                      transition: 'width 0.5s ease',
                    }}
                  />
                </Box>
                <Typography
                  sx={{
                    fontFamily: isLincoln ? '"Press Start 2P", monospace' : '"Fredoka", cursive',
                    fontSize: isLincoln ? '12px' : '12px',
                    color: isLincoln ? 'rgba(255,255,255,0.35)' : 'rgba(0,0,0,0.35)',
                    mt: 0.5,
                  }}
                >
                  {xpAway > 0 ? `${xpAway} XP` : `${XP_THRESHOLDS[piece.id]} XP`}
                </Typography>
              </Box>
            )}
          </Box>
        )
      })}
    </Box>
  )
}
