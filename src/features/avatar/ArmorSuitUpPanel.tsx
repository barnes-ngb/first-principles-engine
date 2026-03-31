import Box from '@mui/material/Box'
import Typography from '@mui/material/Typography'

import type { AvatarProfile } from '../../core/types'
import type { ArmorPieceMeta } from './voxel/buildArmorPiece'
import { getTierTextColor } from './voxel/tierMaterials'

interface ArmorSuitUpPanelProps {
  profile: AvatarProfile
  morningReset: boolean
  unlockedVoxel: string[]
  appliedVoxel: string[]
  allEarnedApplied: boolean
  allSixUnlocked: boolean
  nextUnlock: { piece: ArmorPieceMeta; xpNeeded: number } | null
  currentTierName: string
  tierProgress: number
  isLincoln: boolean
  isChildProfile: boolean
  accentColor: string
  onSuitUpAll: () => void
  onStartDay: () => void
}

export default function ArmorSuitUpPanel({
  profile,
  morningReset,
  unlockedVoxel,
  appliedVoxel,
  allEarnedApplied,
  allSixUnlocked,
  nextUnlock,
  currentTierName,
  tierProgress,
  isLincoln,
  isChildProfile,
  accentColor,
  onSuitUpAll,
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
      {allEarnedApplied && unlockedVoxel.length > 0 ? (
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
            {allSixUnlocked
              ? 'Full armor equipped!'
              : `${unlockedVoxel.length}/6 pieces on`}
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
          {/* Start Your Day button */}
          {isChildProfile && (
            <Box
              component="button"
              onClick={onStartDay}
              sx={{
                display: 'block',
                mx: 'auto',
                mt: 1.5,
                px: '28px',
                py: '12px',
                borderRadius: isLincoln ? '4px' : '24px',
                border: 'none',
                background: isLincoln
                  ? 'linear-gradient(135deg, #7EFC20, #5BC010)'
                  : 'linear-gradient(135deg, #4caf50, #388e3c)',
                color: isLincoln ? '#000' : '#fff',
                fontFamily: isLincoln ? '"Press Start 2P", monospace' : '"Fredoka", cursive',
                fontSize: isLincoln ? '12px' : '16px',
                fontWeight: 600,
                cursor: 'pointer',
                minHeight: '48px',
                boxShadow: `0 4px 14px ${isLincoln ? 'rgba(126,252,32,0.3)' : 'rgba(76,175,80,0.3)'}`,
                animation: 'pulse 2s ease-in-out infinite',
                '@keyframes pulse': {
                  '0%, 100%': { transform: 'scale(1)', boxShadow: `0 4px 14px ${isLincoln ? 'rgba(126,252,32,0.3)' : 'rgba(76,175,80,0.3)'}` },
                  '50%': { transform: 'scale(1.03)', boxShadow: `0 6px 20px ${isLincoln ? 'rgba(126,252,32,0.4)' : 'rgba(76,175,80,0.4)'}` },
                },
              }}
            >
              Start Your Day →
            </Box>
          )}
        </Box>
      ) : unlockedVoxel.length > 0 && appliedVoxel.length < unlockedVoxel.length ? (
        <Box sx={{ textAlign: 'center', py: 1, mb: 0.5 }}>
          {/* Equipped count dots */}
          <Box sx={{ display: 'flex', justifyContent: 'center', gap: '6px', mb: 1.5 }}>
            {Array.from({ length: 6 }).map((_, i) => (
              <Box
                key={i}
                sx={{
                  width: 10,
                  height: 10,
                  borderRadius: isLincoln ? '2px' : '50%',
                  bgcolor: i < appliedVoxel.length
                    ? accentColor
                    : i < unlockedVoxel.length
                      ? (isLincoln ? 'rgba(126,252,32,0.2)' : 'rgba(232,160,191,0.25)')
                      : (isLincoln ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)'),
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
            {appliedVoxel.length}/{unlockedVoxel.length} equipped
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
                    width: `${tierProgress}%`,
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
