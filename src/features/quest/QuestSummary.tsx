import { useNavigate } from 'react-router-dom'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import type { EvaluationFinding } from '../../core/types'
import type { ArmorTierInfo } from '../minecraft/armorTiers'
import { getArmorTier, getNextTierProgress } from '../minecraft/armorTiers'
import MinecraftAvatar from '../minecraft/MinecraftAvatar'
import type { QuestStreak } from './questTypes'

const MC = {
  bg: 'rgba(0,0,0,0.92)',
  gold: '#FCDB5B',
  green: '#7EFC20',
  diamond: '#5BFCEE',
  stone: '#8B8B8B',
  white: '#FFFFFF',
  darkStone: '#3C3C3C',
  font: '"Press Start 2P", monospace',
} as const

function findingStatusIcon(status: EvaluationFinding['status']): string {
  switch (status) {
    case 'mastered':
      return '\u2705'
    case 'emerging':
      return '\u26A0\uFE0F'
    case 'not-yet':
      return '\u274C'
    default:
      return '\u2753'
  }
}

function formatSkillLabel(tag: string): string {
  return tag
    .split('.')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' \u2192 ')
    .replace(/-/g, ' ')
    .replace(/cvc/i, 'CVC')
    .replace(/cvce/i, 'CVCe')
}

const XP_PER_DIAMOND = 2

interface QuestSummaryProps {
  totalCorrect: number
  totalQuestions: number
  finalLevel: number
  streak: QuestStreak
  findings: EvaluationFinding[]
  /** Total XP before this quest (for tier-up detection) */
  previousTotalXp?: number
  onDone: () => void
  onTryAgain: () => void
}

export default function QuestSummary({
  totalCorrect,
  totalQuestions,
  finalLevel,
  streak,
  findings,
  previousTotalXp = 0,
  onDone,
  onTryAgain,
}: QuestSummaryProps) {
  const navigate = useNavigate()

  // XP calculations
  const questXp = totalCorrect * XP_PER_DIAMOND
  const newTotalXp = previousTotalXp + questXp
  const previousTier: ArmorTierInfo = getArmorTier(previousTotalXp)
  const newTier: ArmorTierInfo = getArmorTier(newTotalXp)
  const tierUp = newTier.tier !== previousTier.tier
  const { progress, xpToNext, next } = getNextTierProgress(newTotalXp)

  // Deduplicate findings by skill (keep the latest)
  const uniqueFindings = findings.reduce<EvaluationFinding[]>((acc, f) => {
    const existing = acc.findIndex((a) => a.skill === f.skill)
    if (existing >= 0) {
      acc[existing] = f
    } else {
      acc.push(f)
    }
    return acc
  }, [])

  return (
    <Box sx={{ bgcolor: MC.bg, borderRadius: 2, p: 3 }}>
      {/* Trophy */}
      <Box sx={{ textAlign: 'center', mb: 3 }}>
        <Typography sx={{ fontSize: '3rem', mb: 1 }}>🏆</Typography>
        <Typography
          sx={{
            fontFamily: MC.font,
            fontSize: '0.8rem',
            color: MC.gold,
            lineHeight: 1.8,
          }}
        >
          Quest Complete!
        </Typography>
      </Box>

      {/* Diamond box */}
      <Box
        sx={{
          bgcolor: MC.darkStone,
          borderRadius: 2,
          p: 2,
          textAlign: 'center',
          mb: 2,
          border: `1px solid ${MC.diamond}`,
        }}
      >
        <Typography sx={{ fontSize: '1.5rem', mb: 1, letterSpacing: 4 }}>
          {'💎'.repeat(Math.min(totalCorrect, 10))}
        </Typography>
        <Typography
          sx={{
            fontFamily: MC.font,
            fontSize: '0.6rem',
            color: MC.diamond,
            mb: 0.5,
          }}
        >
          {totalCorrect} diamond{totalCorrect !== 1 ? 's' : ''} mined!
        </Typography>
        <Typography
          sx={{
            fontFamily: MC.font,
            fontSize: '0.45rem',
            color: MC.stone,
          }}
        >
          {totalCorrect}/{totalQuestions} correct · Level {finalLevel}
        </Typography>
      </Box>

      {/* Tier-up celebration */}
      {tierUp && (
        <Box
          sx={{
            bgcolor: MC.darkStone,
            borderRadius: 2,
            p: 2,
            textAlign: 'center',
            mb: 2,
            border: `2px solid ${MC.gold}`,
            animation: 'tier-up-glow 1.5s ease-in-out infinite',
            '@keyframes tier-up-glow': {
              '0%, 100%': { boxShadow: `0 0 8px ${MC.gold}40` },
              '50%': { boxShadow: `0 0 20px ${MC.gold}80` },
            },
          }}
        >
          <Typography
            sx={{
              fontFamily: MC.font,
              fontSize: '0.7rem',
              color: MC.gold,
              mb: 1.5,
              lineHeight: 1.8,
            }}
          >
            ARMOR UPGRADE!
          </Typography>
          <Box sx={{ display: 'flex', justifyContent: 'center', mb: 1.5 }}>
            <MinecraftAvatar tier={newTier} scale={4} />
          </Box>
          <Typography
            sx={{
              fontFamily: MC.font,
              fontSize: '0.45rem',
              color: MC.white,
              lineHeight: 1.8,
            }}
          >
            {previousTier.title} → {newTier.title}
          </Typography>
        </Box>
      )}

      {/* XP earned + armor progress */}
      {questXp > 0 && (
        <Box
          sx={{
            bgcolor: MC.darkStone,
            borderRadius: 2,
            p: 2,
            textAlign: 'center',
            mb: 2,
            border: `1px solid ${MC.green}`,
          }}
        >
          <Typography
            sx={{
              fontFamily: MC.font,
              fontSize: '0.6rem',
              color: MC.green,
              mb: 1,
            }}
          >
            +{questXp} XP!
          </Typography>
          {/* XP progress bar */}
          <Box
            sx={{
              position: 'relative',
              height: 12,
              backgroundColor: '#1A1A1A',
              border: '2px solid #3A3A3A',
              borderRadius: 0,
              overflow: 'hidden',
              mb: 1,
            }}
          >
            <Box
              sx={{
                position: 'absolute',
                top: 0,
                left: 0,
                height: '100%',
                width: `${progress * 100}%`,
                background: 'linear-gradient(180deg, #7EFC20 0%, #5BC010 50%, #3A8008 100%)',
                transition: 'width 0.5s ease-out',
              }}
            />
          </Box>
          <Typography
            sx={{
              fontFamily: MC.font,
              fontSize: '0.4rem',
              color: MC.stone,
            }}
          >
            {newTier.label} · {next ? `${xpToNext} to ${next.label}` : 'MAX TIER'}
          </Typography>
        </Box>
      )}

      {/* Streak */}
      {streak.currentStreak > 0 && (
        <Box
          sx={{
            bgcolor: MC.darkStone,
            borderRadius: 2,
            p: 2,
            textAlign: 'center',
            mb: 2,
            border: `1px solid ${MC.gold}`,
          }}
        >
          <Typography sx={{ fontSize: '1rem', mb: 0.5 }}>
            {'⭐'.repeat(Math.min(streak.currentStreak, 7))}
          </Typography>
          <Typography
            sx={{
              fontFamily: MC.font,
              fontSize: '0.55rem',
              color: MC.gold,
            }}
          >
            {streak.currentStreak} day streak!
          </Typography>
        </Box>
      )}

      {/* Skills found */}
      {uniqueFindings.length > 0 && (
        <Box sx={{ mb: 3 }}>
          <Typography
            sx={{
              fontFamily: MC.font,
              fontSize: '0.5rem',
              color: MC.gold,
              mb: 1.5,
            }}
          >
            Skills Found:
          </Typography>
          <Stack spacing={1}>
            {uniqueFindings.map((f, i) => (
              <Stack key={i} direction="row" spacing={1} alignItems="flex-start">
                <Typography sx={{ fontSize: '0.9rem', flexShrink: 0 }}>
                  {findingStatusIcon(f.status)}
                </Typography>
                <Box sx={{ flex: 1 }}>
                  <Typography
                    sx={{
                      fontFamily: MC.font,
                      fontSize: '0.4rem',
                      color: MC.white,
                      lineHeight: 1.8,
                    }}
                  >
                    {formatSkillLabel(f.skill)}
                  </Typography>
                  <Typography
                    sx={{
                      fontFamily: MC.font,
                      fontSize: '0.35rem',
                      color: MC.stone,
                      lineHeight: 1.6,
                    }}
                  >
                    {f.evidence}
                  </Typography>
                </Box>
              </Stack>
            ))}
          </Stack>
        </Box>
      )}

      {/* Buttons */}
      <Stack spacing={1.5}>
        <Button
          variant="contained"
          fullWidth
          onClick={() => {
            onDone()
            navigate('/today')
          }}
          sx={{
            fontFamily: MC.font,
            fontSize: '0.5rem',
            bgcolor: MC.green,
            color: '#000',
            minHeight: 48,
            '&:hover': { bgcolor: '#6edc18' },
          }}
        >
          Done
        </Button>
        <Button
          variant="outlined"
          fullWidth
          onClick={onTryAgain}
          sx={{
            fontFamily: MC.font,
            fontSize: '0.5rem',
            borderColor: MC.gold,
            color: MC.gold,
            minHeight: 48,
            '&:hover': { borderColor: MC.gold, bgcolor: 'rgba(252,219,91,0.1)' },
          }}
        >
          Try another quest
        </Button>
      </Stack>
    </Box>
  )
}
