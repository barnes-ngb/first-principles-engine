import Box from '@mui/material/Box'
import Typography from '@mui/material/Typography'

import type { AvatarProfile } from '../../core/types'
import type { ArmorPieceMeta } from './voxel/buildArmorPiece'
import { ALL_ARMOR_VOXEL_PIECES } from './armorTierProgress'
import { getTierTextColor } from './voxel/tierMaterials'

interface ArmorSuitUpPanelProps {
  profile: AvatarProfile
  morningReset: boolean
  unlockedVoxel: string[]
  appliedVoxel: string[]
  allEarnedApplied: boolean
  allSixUnlocked: boolean
  /** Total number of forged pieces the child owns (across all tiers) */
  forgedCount: number
  nextUnlock: { piece: ArmorPieceMeta; xpNeeded: number } | null
  currentTierName: string
  nextUnlockProgress: number
  isLincoln: boolean
  isChildProfile: boolean
  accentColor: string
  nextRecommendedAction: {
    type: 'forge' | 'suit_up' | 'start_day' | 'earn_xp'
    label: string
  }
  onSuitUpAll: () => void
  onForgeNext: () => void
  onStartDay: () => void
}

export default function ArmorSuitUpPanel({
  profile,
  morningReset,
  unlockedVoxel,
  appliedVoxel,
  allEarnedApplied,
  allSixUnlocked,
  forgedCount,
  nextUnlock,
  currentTierName,
  nextUnlockProgress,
  isLincoln,
  isChildProfile,
  accentColor,
  nextRecommendedAction,
  onSuitUpAll,
  onForgeNext,
  onStartDay,
}: ArmorSuitUpPanelProps) {
  const titleFont = isLincoln ? '"Press Start 2P", monospace' : '"Fredoka", cursive'

  return (
    <>
      {/* ── Morning reset message ────────────────────────────── */}
      {morningReset && unlockedVoxel.length > 0 && appliedVoxel.length === 0 && (
        <Box
          sx={{
            textAlign: 'center',
            py: 2,
            px: 2,
            mx: 1,
            mb: 1,
            borderRadius: isLincoln ? '8px' : '16px',
            background: isLincoln
              ? 'linear-gradient(135deg, rgba(255,215,0,0.06) 0%, rgba(255,215,0,0.02) 100%)'
              : 'linear-gradient(135deg, rgba(156,39,176,0.06) 0%, rgba(156,39,176,0.02) 100%)',
            border: `1px solid ${isLincoln ? 'rgba(255,215,0,0.12)' : 'rgba(156,39,176,0.1)'}`,
            animation: 'morningFadeIn 0.8s ease-out 1s both',
            '@keyframes morningFadeIn': {
              '0%': { opacity: 0, transform: 'translateY(-4px)' },
              '100%': { opacity: 1, transform: 'translateY(0)' },
            },
          }}
        >
          <Typography
            sx={{
              fontFamily: titleFont,
              fontSize: isLincoln ? '12px' : '16px',
              fontWeight: 600,
              color: isLincoln ? '#FFD700' : '#9C27B0',
              lineHeight: 1.6,
            }}
          >
            Good morning! Put on the armor of God today.
          </Typography>
        </Box>
      )}

      {/* ── Armor status text ────────────────────────────────── */}
      {isChildProfile ? (
        <Box
          sx={{
            mx: 2,
            mb: 1,
            p: 1.5,
            borderRadius: isLincoln ? '8px' : '16px',
            border: `1.5px solid ${isLincoln ? 'rgba(126,252,32,0.2)' : 'rgba(232,160,191,0.3)'}`,
            background: isLincoln
              ? 'linear-gradient(135deg, rgba(126,252,32,0.08) 0%, rgba(255,255,255,0.02) 100%)'
              : 'linear-gradient(135deg, rgba(232,160,191,0.1) 0%, rgba(255,255,255,0.8) 100%)',
          }}
        >
          <Typography
            sx={{
              textAlign: 'center',
              fontFamily: titleFont,
              fontSize: isLincoln ? '11px' : '14px',
              fontWeight: 600,
              color: isLincoln ? 'rgba(255,255,255,0.72)' : 'rgba(0,0,0,0.62)',
              mb: 1,
            }}
          >
            Next action
          </Typography>

          <Box
            component="button"
            onClick={() => {
              if (nextRecommendedAction.type === 'suit_up') {
                onSuitUpAll()
                return
              }
              if (nextRecommendedAction.type === 'start_day') {
                onStartDay()
                return
              }
              if (nextRecommendedAction.type === 'forge') {
                onForgeNext()
                return
              }
            }}
            disabled={nextRecommendedAction.type === 'earn_xp'}
            sx={{
              width: '100%',
              py: 1.5,
              borderRadius: isLincoln ? '6px' : '22px',
              border: `2px solid ${accentColor}`,
              background: isLincoln
                ? 'linear-gradient(135deg, rgba(126,252,32,0.16) 0%, rgba(126,252,32,0.08) 100%)'
                : 'linear-gradient(135deg, rgba(232,160,191,0.18) 0%, rgba(232,160,191,0.1) 100%)',
              color: accentColor,
              fontFamily: titleFont,
              fontSize: isLincoln ? '12px' : '18px',
              fontWeight: 700,
              cursor: nextRecommendedAction.type === 'earn_xp' ? 'default' : 'pointer',
              minHeight: '52px',
              opacity: nextRecommendedAction.type === 'earn_xp' ? 0.85 : 1,
            }}
          >
            {nextRecommendedAction.type === 'suit_up' && '⚔️ '}
            {nextRecommendedAction.type === 'start_day' && '🌅 '}
            {nextRecommendedAction.type === 'forge' && '🔨 '}
            {nextRecommendedAction.label}
          </Box>

          <Typography
            sx={{
              mt: 1,
              textAlign: 'center',
              fontFamily: titleFont,
              fontSize: isLincoln ? '10px' : '13px',
              color: isLincoln ? 'rgba(255,255,255,0.6)' : 'rgba(0,0,0,0.55)',
              fontWeight: 500,
            }}
          >
            {appliedVoxel.length}/{forgedCount} equipped today{allEarnedApplied && forgedCount > 0 ? ' ✓' : ''}
          </Typography>
          {forgedCount < ALL_ARMOR_VOXEL_PIECES.length && (
            <Typography
              sx={{
                mt: 0.6,
                textAlign: 'center',
                fontFamily: titleFont,
                fontSize: isLincoln ? '9px' : '12px',
                color: isLincoln ? 'rgba(255,255,255,0.45)' : 'rgba(0,0,0,0.45)',
              }}
            >
              {forgedCount}/{ALL_ARMOR_VOXEL_PIECES.length} pieces forged. Forge more to unlock the next material.
            </Typography>
          )}
        </Box>
      ) : allEarnedApplied && forgedCount > 0 ? (
        <Box sx={{ textAlign: 'center', py: 2, mb: 0.5 }}>
          <Typography
            key={`count-${appliedVoxel.length}`}
            sx={{
              fontFamily: titleFont,
              fontSize: isLincoln ? '14px' : '18px',
              fontWeight: 700,
              color: isLincoln ? '#FFD700' : '#9C27B0',
              textShadow: isLincoln ? '0 0 12px rgba(255,215,0,0.3)' : 'none',
              animation: 'countPulse 0.4s ease-out',
              '@keyframes countPulse': {
                '0%': { transform: 'scale(1)' },
                '40%': { transform: 'scale(1.08)' },
                '100%': { transform: 'scale(1)' },
              },
            }}
          >
            {forgedCount >= ALL_ARMOR_VOXEL_PIECES.length
              ? 'Full armor equipped!'
              : `${forgedCount}/${forgedCount} equipped ✓`}
          </Typography>
          {/* Streak display */}
          {(profile.armorStreak ?? 0) > 1 && (
            <Box
              sx={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '4px',
                mt: 0.75,
                px: 1.5,
                py: 0.5,
                borderRadius: isLincoln ? '3px' : '10px',
                bgcolor: isLincoln ? 'rgba(255,167,38,0.12)' : 'rgba(255,167,38,0.1)',
                border: '1px solid rgba(255,167,38,0.2)',
              }}
            >
              <Typography
                sx={{
                  fontFamily: isLincoln ? '"Press Start 2P", monospace' : '"Fredoka", cursive',
                  fontSize: isLincoln ? '12px' : '14px',
                  color: '#FFA726',
                  fontWeight: 600,
                }}
              >
                🔥 {profile.armorStreak}-day streak
              </Typography>
            </Box>
          )}
        </Box>
      ) : forgedCount > 0 && !allEarnedApplied ? (
        <Box sx={{ textAlign: 'center', py: 1, mb: 0.5 }}>
          {/* Equipped count dots — one per forged piece */}
          <Box sx={{ display: 'flex', justifyContent: 'center', gap: '6px', mb: 1.5 }}>
            {Array.from({ length: forgedCount }).map((_, i) => (
              <Box
                key={i}
                sx={{
                  width: 10,
                  height: 10,
                  borderRadius: isLincoln ? '2px' : '50%',
                  bgcolor: i < appliedVoxel.length
                    ? accentColor
                    : (isLincoln ? 'rgba(126,252,32,0.2)' : 'rgba(232,160,191,0.25)'),
                  transition: 'all 0.3s ease',
                  boxShadow: i < appliedVoxel.length
                    ? `0 0 6px ${accentColor}44`
                    : 'none',
                }}
              />
            ))}
          </Box>
          <Typography
            key={`eq-${appliedVoxel.length}`}
            sx={{
              fontFamily: titleFont,
              fontSize: isLincoln ? '12px' : '16px',
              fontWeight: 700,
              color: isLincoln ? 'rgba(255,255,255,0.6)' : 'rgba(0,0,0,0.5)',
              animation: 'countPulse 0.4s ease-out',
              '@keyframes countPulse': {
                '0%': { transform: 'scale(1)' },
                '40%': { transform: 'scale(1.08)' },
                '100%': { transform: 'scale(1)' },
              },
            }}
          >
            {appliedVoxel.length}/{forgedCount} equipped
          </Typography>
          {/* Suit Up! button */}
          <Box
            component="button"
            onClick={onSuitUpAll}
            sx={{
              mt: 1.5,
              px: '28px',
              py: '12px',
              borderRadius: isLincoln ? '6px' : '22px',
              border: `2px solid ${accentColor}`,
              background: isLincoln
                ? 'linear-gradient(135deg, rgba(126,252,32,0.12) 0%, rgba(126,252,32,0.06) 100%)'
                : 'linear-gradient(135deg, rgba(232,160,191,0.12) 0%, rgba(232,160,191,0.06) 100%)',
              color: accentColor,
              fontFamily: isLincoln ? '"Press Start 2P", monospace' : '"Fredoka", cursive',
              fontSize: isLincoln ? '12px' : '16px',
              fontWeight: 700,
              cursor: 'pointer',
              transition: 'all 0.2s ease',
              minHeight: '48px',
              boxShadow: `0 2px 12px ${accentColor}22`,
              '&:hover': {
                background: isLincoln ? 'rgba(126,252,32,0.2)' : 'rgba(232,160,191,0.2)',
                transform: 'translateY(-1px)',
                boxShadow: `0 4px 16px ${accentColor}33`,
              },
              '&:active': { transform: 'scale(0.96)' },
            }}
          >
            ⚔️ Suit Up!
          </Box>
        </Box>
      ) : (
        <Box sx={{ mb: 1.5, px: 1 }}>
          {!allSixUnlocked && nextUnlock ? (
            <Box
              sx={{
                mx: 1,
                p: 1.5,
                borderRadius: isLincoln ? '4px' : '12px',
                background: isLincoln ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.02)',
                border: `1px solid ${isLincoln ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)'}`,
              }}
            >
              <Typography
                sx={{
                  mb: 0.75,
                  color: isLincoln ? 'rgba(255,255,255,0.6)' : 'text.primary',
                  fontFamily: isLincoln ? '"Press Start 2P", monospace' : '"Fredoka", cursive',
                  fontSize: isLincoln ? '12px' : '14px',
                  fontWeight: 500,
                }}
              >
                Next: {nextUnlock.piece.name} — {nextUnlock.xpNeeded} XP away
              </Typography>
              <Typography
                sx={{
                  mb: 0.5,
                  color: isLincoln ? 'rgba(255,255,255,0.5)' : 'rgba(0,0,0,0.6)',
                  fontFamily: isLincoln ? '"Press Start 2P", monospace' : '"Fredoka", cursive',
                  fontSize: isLincoln ? '10px' : '12px',
                  fontWeight: 600,
                  textTransform: 'uppercase',
                  letterSpacing: '0.04em',
                }}
              >
                Progress to next piece
              </Typography>
              <Box
                sx={{
                  height: 6,
                  borderRadius: isLincoln ? '2px' : '3px',
                  bgcolor: isLincoln ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)',
                  overflow: 'hidden',
                }}
              >
                <Box
                  sx={{
                    height: '100%',
                    width: `${nextUnlockProgress}%`,
                    borderRadius: 'inherit',
                    bgcolor: getTierTextColor(currentTierName),
                    transition: 'width 0.5s ease-out',
                  }}
                />
              </Box>
            </Box>
          ) : allSixUnlocked ? (
            <Typography
              sx={{
                textAlign: 'center',
                fontFamily: titleFont,
                fontSize: isLincoln ? '12px' : '16px',
                color: accentColor,
                fontWeight: 700,
              }}
            >
              Full set unlocked!
            </Typography>
          ) : null}
        </Box>
      )}
    </>
  )
}
