import { useRef, useState } from 'react'
import Box from '@mui/material/Box'
import Typography from '@mui/material/Typography'

import type { ArmorPiece, ArmorTier, AvatarProfile } from '../../core/types'
import { VOXEL_TO_ARMOR_PIECE } from '../../core/types'
import { getForgeCost } from '../../core/xp/forgeCosts'
import { ArmorIcon } from './icons/ArmorIcons'
import type { ArmorTierColor } from './icons/ArmorIcons'
import { getAppliedVoxelPieces, getArmorPieceState, getForgedPiecesForTier, getPieceLockReason } from './armorPieceState'
import { MINECRAFT_TIER_ORDER } from './armorTierProgress'
import { VOXEL_ARMOR_PIECES, XP_THRESHOLDS } from './voxel/buildArmorPiece'
import type { ArmorPieceMeta } from './voxel/buildArmorPiece'

/** Find the highest tier below `activeTier` where this piece has been forged. */
function getPriorForgedTier(
  profile: AvatarProfile,
  pieceId: string,
  activeTier: string,
): string | null {
  const activeIdx = MINECRAFT_TIER_ORDER.indexOf(activeTier as typeof MINECRAFT_TIER_ORDER[number])
  if (activeIdx <= 0) return null
  for (let i = activeIdx - 1; i >= 0; i--) {
    const tier = MINECRAFT_TIER_ORDER[i]
    if (profile.forgedPieces?.[tier]?.[pieceId]) return tier
  }
  return null
}

interface ArmorPieceGalleryProps {
  profile: AvatarProfile
  appliedPieces: ArmorPiece[]
  selectedPiece: ArmorPieceMeta | null
  activeForgeTier: string
  unlockedTiers: ArmorTier[]
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
  unlockedTiers,
  isLincoln,
  accentColor,
  textColor,
  bgColor,
  onPieceTap,
}: ArmorPieceGalleryProps) {
  const cardScrollRef = useRef<HTMLDivElement>(null)
  const [viewingTier, setViewingTier] = useState<string | null>(null)

  // If viewing a different tier than active, use that for display.
  // Reset to null (active) if the viewed tier becomes invalid.
  const displayTier = viewingTier && unlockedTiers.includes(viewingTier as ArmorTier)
    ? viewingTier
    : activeForgeTier
  const showTierSelector = unlockedTiers.length > 1

  const appliedVoxel = getAppliedVoxelPieces(appliedPieces)
  const tierLockReason = getPieceLockReason(profile, displayTier)
  const isTierLocked = tierLockReason !== ''

  return (
    <Box sx={{ position: 'relative' }}>
      {/* ── Tier selector tabs ─────────────────────────────────── */}
      {showTierSelector && (
        <Box
          sx={{
            display: 'flex',
            gap: '8px',
            px: 2,
            mb: 1,
            overflowX: 'auto',
            scrollbarWidth: 'none',
            '&::-webkit-scrollbar': { display: 'none' },
          }}
        >
          {unlockedTiers.map((tier) => {
            const isActive = tier === displayTier
            const forgedInTier = getForgedPiecesForTier(profile, tier).length
            const capLabel = tier.charAt(0).toUpperCase() + tier.slice(1)
            const isNewTier = tier === activeForgeTier && forgedInTier === 0 && tier !== 'wood'

            return (
              <Box
                key={tier}
                component="button"
                onClick={() => setViewingTier(tier === activeForgeTier ? null : tier)}
                sx={{
                  px: 1.5,
                  py: 0.75,
                  borderRadius: isLincoln ? '4px' : '12px',
                  border: `1.5px solid ${isActive ? accentColor : (isLincoln ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.1)')}`,
                  background: isActive
                    ? (isLincoln ? 'rgba(126,252,32,0.12)' : 'rgba(232,160,191,0.12)')
                    : 'transparent',
                  color: isActive ? accentColor : (isLincoln ? 'rgba(255,255,255,0.6)' : 'rgba(0,0,0,0.5)'),
                  fontFamily: isLincoln ? '"Press Start 2P", monospace' : '"Fredoka", cursive',
                  fontSize: isLincoln ? '10px' : '13px',
                  fontWeight: isActive ? 700 : 500,
                  cursor: 'pointer',
                  whiteSpace: 'nowrap',
                  flexShrink: 0,
                  transition: 'all 0.2s ease',
                }}
              >
                {capLabel}{isNewTier ? ' \u2728' : forgedInTier === 6 ? ' \u2713' : ''}
              </Box>
            )
          })}
        </Box>
      )}

      {/* Tier lock banner — shows when the displayed tier isn't unlocked yet */}
      {isTierLocked && (
        <Box
          sx={{
            mx: 2,
            mb: 1,
            px: 2,
            py: 1.5,
            borderRadius: isLincoln ? '6px' : '14px',
            background: isLincoln
              ? 'linear-gradient(90deg, rgba(255,152,0,0.12) 0%, rgba(255,152,0,0.04) 100%)'
              : 'linear-gradient(90deg, rgba(255,152,0,0.08) 0%, rgba(255,152,0,0.02) 100%)',
            border: `1px solid ${isLincoln ? 'rgba(255,152,0,0.25)' : 'rgba(255,152,0,0.2)'}`,
            display: 'flex',
            alignItems: 'center',
            gap: 1.5,
          }}
        >
          <Typography sx={{ fontSize: '18px', lineHeight: 1 }}>
            {'\uD83D\uDD12'}
          </Typography>
          <Box>
            <Typography sx={{
              fontFamily: isLincoln ? '"Press Start 2P", monospace' : '"Fredoka", cursive',
              fontSize: isLincoln ? '11px' : '14px',
              fontWeight: 700,
              color: isLincoln ? '#FFA726' : '#E65100',
              lineHeight: 1.3,
            }}>
              {displayTier.charAt(0).toUpperCase() + displayTier.slice(1)} Tier Locked
            </Typography>
            <Typography sx={{
              fontFamily: isLincoln ? '"Press Start 2P", monospace' : '"Fredoka", cursive',
              fontSize: isLincoln ? '9px' : '12px',
              color: isLincoln ? 'rgba(255,255,255,0.55)' : 'rgba(0,0,0,0.5)',
              lineHeight: 1.4,
              mt: 0.25,
            }}>
              {tierLockReason}
            </Typography>
          </Box>
        </Box>
      )}

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
          activeForgeTier: displayTier,
          appliedTodayVoxel: appliedVoxel,
        })
        const isApplied = pieceState === 'equipped_today'
        const isLocked = pieceState === 'locked_by_xp' || pieceState === 'locked_by_tier'
        const isSelected = selectedPiece?.id === piece.id
        const forgeCost = getForgeCost(displayTier, piece.id)

        // Check if this piece exists at a lower tier (upgrade indicator)
        const priorTier = pieceState === 'forgeable'
          ? getPriorForgedTier(profile, piece.id, displayTier)
          : null
        const isUpgrade = priorTier !== null

        const statusLabel = pieceState === 'locked_by_tier'
          ? tierLockReason || 'Locked'
          : pieceState === 'locked_by_xp'
            ? `Need ${XP_THRESHOLDS[piece.id]} XP`
            : pieceState === 'forgeable'
              ? `\u25C6 ${forgeCost} ${isUpgrade ? 'Upgrade' : 'Forge'}`
              : pieceState === 'forged_not_equipped_today'
                ? 'Equip'
                : 'Equipped'

        const statusColor = isLocked
          ? (isLincoln ? 'rgba(255,255,255,0.45)' : 'rgba(0,0,0,0.5)')
          : pieceState === 'forgeable'
            ? (isUpgrade ? '#FF9800' : '#00BCD4')
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
              opacity: isLocked ? 0.55 : 1,
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

              {/* Upgrade badge */}
              {isUpgrade && (
                <Box sx={{
                  position: 'absolute', top: -4, right: -4,
                  px: 0.6, py: 0.2,
                  borderRadius: isLincoln ? '3px' : '8px',
                  bgcolor: '#FF9800',
                  border: `1.5px solid ${bgColor}`,
                  boxShadow: '0 1px 4px rgba(255,152,0,0.3)',
                }}>
                  <Typography sx={{
                    fontFamily: isLincoln ? '"Press Start 2P", monospace' : '"Fredoka", cursive',
                    fontSize: isLincoln ? '7px' : '9px',
                    fontWeight: 700,
                    color: '#fff',
                    lineHeight: 1,
                  }}>
                    {'\u2B06'}
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

            {/* Current tier indicator for upgrades */}
            {isUpgrade && priorTier && (
              <Typography
                sx={{
                  fontFamily: isLincoln ? '"Press Start 2P", monospace' : '"Fredoka", cursive',
                  fontSize: isLincoln ? '8px' : '10px',
                  color: isLincoln ? 'rgba(255,255,255,0.45)' : 'rgba(0,0,0,0.4)',
                  lineHeight: 1,
                  mt: '-4px',
                }}
              >
                Current: {priorTier.charAt(0).toUpperCase() + priorTier.slice(1)}
              </Typography>
            )}

            <Typography
              sx={{
                fontFamily: isLincoln ? '"Press Start 2P", monospace' : '"Fredoka", cursive',
                fontSize: pieceState === 'locked_by_tier'
                  ? (isLincoln ? '8px' : '10px')
                  : (isLincoln ? '12px' : '13px'),
                color: statusColor,
                fontWeight: 600,
                lineHeight: 1.3,
                maxWidth: '120px',
              }}
            >
              {statusLabel}
            </Typography>
          </Box>
        )
      })}
      </Box>
    </Box>
  )
}
