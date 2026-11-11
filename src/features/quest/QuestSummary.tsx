import { useNavigate } from 'react-router-dom'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import type { EvaluationFinding } from '../../core/types'
import type { ArmorTierInfo } from '../../core/xp/armorTiers'
import { getArmorTier, getNextTierProgress } from '../../core/xp/armorTiers'
import MinecraftAvatar from '../avatar/MinecraftAvatar'
import type { QuestStreak } from './questTypes'
import { QUEST_GRAPH_COPY, QUEST_SOURCE_COPY } from './questSaveCopy'
import { kidPalette } from '../../app/tokens'

const MC = {
  bg: kidPalette.bg,
  gold: kidPalette.gold,
  green: kidPalette.xpGreen,
  diamond: kidPalette.diamond,
  stone: kidPalette.stone,
  white: '#FFFFFF',
  darkStone: kidPalette.darkStone,
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

/**
 * The save lines on the summary (UX-494).
 *
 * NEW child-facing text, so this run's readability rule applies and the legacy
 * Mine's pixel font around it does not: plain, at least 14px, 44px targets.
 * Every string is in `questSaveCopy.ts` and held to the shared kid bar.
 *
 * It renders NOTHING until a close has something to report, so the ordinary
 * summary a child sees is exactly the summary he saw before.
 */
function QuestSaveStatus({
  sourceSave,
  graphSync,
  onRetrySourceSave,
  onRetryGraphSync,
}: Pick<
  QuestSummaryProps,
  'sourceSave' | 'graphSync' | 'onRetrySourceSave' | 'onRetryGraphSync'
>) {
  const sourceState = sourceSave?.state ?? 'idle'
  const graphState = graphSync?.state ?? 'idle'
  if (sourceState === 'idle') return null

  const sourceLine =
    sourceState === 'saving'
      ? QUEST_SOURCE_COPY.saving
      : sourceState === 'saved'
        ? QUEST_SOURCE_COPY.saved
        : sourceState === 'conflict'
          ? QUEST_SOURCE_COPY.conflict
          : QUEST_SOURCE_COPY.failed

  // The map line exists only once his answers are safe: offering a map retry
  // for a quest that did not save would be the two successes confused again.
  const graphLine =
    sourceState !== 'saved'
      ? null
      : graphState === 'pending' || graphState === 'running'
        ? QUEST_GRAPH_COPY.pending
        : graphState === 'reached'
          ? QUEST_GRAPH_COPY.reached
          : graphState === 'failed'
            ? QUEST_GRAPH_COPY.failed
            : null // `skipped` claims nothing — the saved line above is the truth

  const showSourceRetry = sourceState === 'failed' && Boolean(sourceSave?.canRetry && onRetrySourceSave)
  const showGraphRetry = graphState === 'failed' && sourceState === 'saved' && Boolean(onRetryGraphSync)
  const failed = sourceState === 'failed' || graphState === 'failed'

  return (
    <Box
      sx={{
        bgcolor: MC.darkStone,
        borderRadius: 2,
        p: 2,
        mb: 2,
        border: `1px solid ${failed ? MC.gold : MC.stone}`,
      }}
    >
      <Typography sx={{ fontSize: '14px', lineHeight: 1.45, color: MC.white }}>
        {sourceLine}
      </Typography>
      {graphLine && (
        <Typography sx={{ fontSize: '14px', lineHeight: 1.45, color: MC.stone, mt: 0.5 }}>
          {graphLine}
        </Typography>
      )}
      {(showSourceRetry || showGraphRetry) && (
        <Stack direction="row" spacing={1} sx={{ mt: 1, flexWrap: 'wrap', rowGap: 1 }}>
          {showSourceRetry && (
            <Button
              size="small"
              onClick={onRetrySourceSave}
              sx={{
                fontSize: '14px',
                textTransform: 'none',
                minHeight: 44,
                color: MC.gold,
                border: `1px solid ${MC.gold}`,
              }}
            >
              {QUEST_SOURCE_COPY.retry}
            </Button>
          )}
          {showGraphRetry && (
            <Button
              size="small"
              onClick={onRetryGraphSync}
              sx={{
                fontSize: '14px',
                textTransform: 'none',
                minHeight: 44,
                color: MC.diamond,
                border: `1px solid ${MC.diamond}`,
              }}
            >
              {QUEST_GRAPH_COPY.retry}
            </Button>
          )}
        </Stack>
      )}
    </Box>
  )
}

interface QuestSummaryProps {
  totalCorrect: number
  finalLevel: number
  streak: QuestStreak
  findings: EvaluationFinding[]
  /** Total XP before this quest (for tier-up detection) */
  previousTotalXp?: number
  skippedCount?: number
  flaggedErrorCount?: number
  /** Words the child got wrong or skipped during this quest */
  strugglingWords?: string[]
  /** True when the child hit the quest-mode level cap */
  hitLevelCap?: boolean
  /** Current quest mode (for handoff messaging) */
  questMode?: string
  /**
   * UX-494 — the SOURCE save: his answers, under this run's own id. Its own
   * line and its own retry, because if this did not land nothing else matters.
   */
  sourceSave?: {
    state: 'idle' | 'saving' | 'saved' | 'failed' | 'conflict'
    canRetry: boolean
  }
  /**
   * UX-494 — the GRAPH projection: the learner model's evidence, concept states
   * and the parent's queued requests. A SEPARATE success, said separately, and
   * never claimed for a source that only saved.
   */
  graphSync?: {
    state: 'idle' | 'pending' | 'running' | 'reached' | 'skipped' | 'failed'
    sessionId?: string
    childId?: string
  }
  onRetrySourceSave?: () => void
  onRetryGraphSync?: () => void
  onDone: () => void
  onTryAgain: () => void
}

export default function QuestSummary({
  totalCorrect,
  finalLevel,
  streak,
  findings,
  previousTotalXp = 0,
  flaggedErrorCount = 0,
  strugglingWords = [],
  hitLevelCap = false,
  questMode,
  sourceSave,
  graphSync,
  onRetrySourceSave,
  onRetryGraphSync,
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
          Level {finalLevel} reached
        </Typography>
      </Box>

      {/* ── Two successes, said separately (UX-494) ──────────────
          The source is his answers; the graph is the map. A denied save used
          to leave this screen silent while the map claimed the work had
          landed, so each gets its own sentence and its own retry. */}
      <QuestSaveStatus
        sourceSave={sourceSave}
        graphSync={graphSync}
        onRetrySourceSave={onRetrySourceSave}
        onRetryGraphSync={onRetryGraphSync}
      />

      {/* Flagged errors notice */}
      {flaggedErrorCount > 0 && (
        <Typography
          sx={{
            fontFamily: MC.font,
            fontSize: '0.4rem',
            color: MC.stone,
            textAlign: 'center',
            mb: 2,
            lineHeight: 1.8,
          }}
        >
          ⚠️ {flaggedErrorCount} question{flaggedErrorCount !== 1 ? 's' : ''} skipped (possible question errors)
        </Typography>
      )}

      {/* Phonics level-cap handoff card */}
      {hitLevelCap && questMode === 'phonics' && (
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
          <Typography sx={{ fontSize: '1.5rem', mb: 0.5 }}>🧠</Typography>
          <Typography
            sx={{
              fontFamily: MC.font,
              fontSize: '0.5rem',
              color: MC.diamond,
              mb: 1,
              lineHeight: 1.8,
            }}
          >
            PHONICS MASTER!
          </Typography>
          <Typography
            sx={{
              fontFamily: MC.font,
              fontSize: '0.4rem',
              color: MC.stone,
              lineHeight: 1.8,
            }}
          >
            You crushed every phonics level! Ready to try Comprehension Quest?
          </Typography>
        </Box>
      )}

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
                background: `linear-gradient(180deg, ${MC.green} 0%, #5BC010 50%, #3A8008 100%)`,
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

      {/* Struggling words — story suggestion */}
      {strugglingWords.length > 0 && (
        <Box
          sx={{
            bgcolor: MC.darkStone,
            borderRadius: 2,
            p: 2,
            mb: 2,
            border: `1px solid ${MC.diamond}`,
          }}
        >
          <Typography
            sx={{
              fontFamily: MC.font,
              fontSize: '0.45rem',
              color: MC.diamond,
              mb: 1,
              lineHeight: 1.8,
            }}
          >
            {strugglingWords.length} word{strugglingWords.length !== 1 ? 's' : ''} need practice:
          </Typography>
          <Typography
            sx={{
              fontFamily: MC.font,
              fontSize: '0.4rem',
              color: MC.white,
              mb: 1.5,
              lineHeight: 1.8,
              wordBreak: 'break-word',
            }}
          >
            {strugglingWords.join(', ')}
          </Typography>
          <Button
            size="small"
            fullWidth
            onClick={() => {
              onDone()
              navigate('/books/create-story', {
                state: {
                  prefillWords: strugglingWords,
                  source: 'quest-summary',
                },
              })
            }}
            sx={{
              fontFamily: MC.font,
              fontSize: '0.4rem',
              color: MC.diamond,
              borderColor: MC.diamond,
              border: '1px solid',
              minHeight: 40,
              '&:hover': { bgcolor: 'rgba(91,252,238,0.1)' },
            }}
          >
            Generate a practice story
          </Button>
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
