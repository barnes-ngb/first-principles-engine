import Alert from '@mui/material/Alert'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'

import Page from '../../components/Page'
import { useFamilyId } from '../../core/auth/useAuth'
import { useActiveChild } from '../../core/hooks/useActiveChild'
import { EvaluationDomain } from '../../core/types/enums'
import MinecraftAvatar from '../minecraft/MinecraftAvatar'
import { useXpLedger } from '../minecraft/useXpLedger'
import QuestQuestionScreen, { QuestFeedback, QuestLoading } from './ReadingQuest'
import QuestSummary from './QuestSummary'
import type { QuestDomainConfig } from './questTypes'
import { QuestScreen } from './questTypes'
import { useQuestSession } from './useQuestSession'

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

const QUEST_DOMAINS: QuestDomainConfig[] = [
  {
    domain: EvaluationDomain.Reading,
    label: 'Reading Quest',
    icon: '📖',
    enabled: true,
    description: 'Phonics, blending, and word reading',
  },
  {
    domain: EvaluationDomain.Math,
    label: 'Math Quest',
    icon: '🔢',
    enabled: false,
    description: 'Coming soon!',
  },
  {
    domain: EvaluationDomain.Speech,
    label: 'Speech Quest',
    icon: '🗣️',
    enabled: false,
    description: 'Coming soon!',
  },
]

function daysAgo(dateStr: string | null): string {
  if (!dateStr) return 'Never played'
  const d = new Date(dateStr + 'T00:00:00')
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const diff = Math.floor((today.getTime() - d.getTime()) / 86400000)
  if (diff === 0) return 'Today'
  if (diff === 1) return 'Yesterday'
  return `${diff} days ago`
}

export default function KnowledgeMinePage() {
  const { activeChild, activeChildId } = useActiveChild()
  const familyId = useFamilyId()
  const quest = useQuestSession()
  const xpLedger = useXpLedger(familyId, activeChildId ?? '')

  const childName = activeChild?.name || 'Explorer'

  // ── Intro screen ──────────────────────────────────────────────
  if (quest.screen === QuestScreen.Intro) {
    return (
      <Page>
        <Box
          sx={{
            bgcolor: MC.bg,
            borderRadius: 2,
            p: 3,
            textAlign: 'center',
          }}
        >
          <Typography sx={{ fontSize: '2.5rem', mb: 1 }}>⛏️</Typography>
          <Typography
            sx={{
              fontFamily: MC.font,
              fontSize: '0.8rem',
              color: MC.gold,
              mb: 1,
              lineHeight: 1.8,
            }}
          >
            Knowledge Mine
          </Typography>
          <Typography
            sx={{
              fontFamily: MC.font,
              fontSize: '0.5rem',
              color: MC.white,
              mb: 2,
              lineHeight: 1.8,
            }}
          >
            Hey {childName}! Ready to mine some knowledge?
          </Typography>

          {/* Avatar + armor tier */}
          {!xpLedger.loading && (
            <Stack direction="row" alignItems="center" justifyContent="center" spacing={2} sx={{ mb: 3 }}>
              <MinecraftAvatar xp={xpLedger.totalXp} scale={2} />
              <Box sx={{ textAlign: 'left' }}>
                <Typography
                  sx={{
                    fontFamily: MC.font,
                    fontSize: '0.45rem',
                    color: xpLedger.armorTier.color,
                    lineHeight: 1.8,
                  }}
                >
                  {xpLedger.armorTier.title}
                </Typography>
                <Typography
                  sx={{
                    fontFamily: MC.font,
                    fontSize: '0.4rem',
                    color: MC.stone,
                  }}
                >
                  {xpLedger.totalXp} XP
                </Typography>
              </Box>
            </Stack>
          )}

          {/* Domain cards */}
          <Stack spacing={1.5} sx={{ mb: 3 }}>
            {QUEST_DOMAINS.map((qd) => (
              <Box
                key={qd.domain}
                role={qd.enabled ? 'button' : undefined}
                tabIndex={qd.enabled ? 0 : undefined}
                onClick={() => {
                  if (qd.enabled) void quest.startQuest(qd.domain)
                }}
                onKeyDown={(e) => {
                  if (qd.enabled && (e.key === 'Enter' || e.key === ' ')) {
                    e.preventDefault()
                    void quest.startQuest(qd.domain)
                  }
                }}
                sx={{
                  bgcolor: MC.darkStone,
                  border: `2px solid ${qd.enabled ? MC.gold : MC.stone}`,
                  borderRadius: 2,
                  p: 2,
                  minHeight: 56,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 2,
                  cursor: qd.enabled ? 'pointer' : 'default',
                  opacity: qd.enabled ? 1 : 0.4,
                  transition: 'border-color 0.15s',
                  '&:hover': qd.enabled
                    ? { borderColor: MC.diamond }
                    : {},
                  '&:focus-visible': qd.enabled
                    ? { borderColor: MC.diamond, outline: 'none' }
                    : {},
                }}
              >
                <Typography sx={{ fontSize: '1.5rem' }}>{qd.icon}</Typography>
                <Box sx={{ textAlign: 'left', flex: 1 }}>
                  <Typography
                    sx={{
                      fontFamily: MC.font,
                      fontSize: '0.5rem',
                      color: qd.enabled ? MC.white : MC.stone,
                    }}
                  >
                    {qd.label}
                  </Typography>
                  {qd.description && (
                    <Typography
                      sx={{
                        fontFamily: MC.font,
                        fontSize: '0.35rem',
                        color: MC.stone,
                        mt: 0.5,
                      }}
                    >
                      {qd.description}
                    </Typography>
                  )}
                </Box>
              </Box>
            ))}
          </Stack>

          {/* Streak display */}
          <Box sx={{ mb: 2 }}>
            {quest.streak.currentStreak > 0 && (
              <Typography
                sx={{
                  fontFamily: MC.font,
                  fontSize: '0.45rem',
                  color: MC.gold,
                  mb: 0.5,
                }}
              >
                {'⭐'.repeat(Math.min(quest.streak.currentStreak, 7))} {quest.streak.currentStreak} day streak!
              </Typography>
            )}
            <Typography
              sx={{
                fontFamily: MC.font,
                fontSize: '0.4rem',
                color: MC.stone,
              }}
            >
              Last quest: {daysAgo(quest.streak.lastQuestDate)}
            </Typography>
          </Box>
        </Box>
      </Page>
    )
  }

  // ── Active quest screens ──────────────────────────────────────

  return (
    <Page>
      {/* Back button (not on summary) */}
      {quest.screen !== QuestScreen.Summary && (
        <Button
          onClick={quest.resetToIntro}
          sx={{
            fontFamily: MC.font,
            fontSize: '0.4rem',
            color: MC.stone,
            textTransform: 'none',
            mb: 1,
            '&:hover': { color: MC.white },
          }}
        >
          ← Back to mine
        </Button>
      )}

      {/* Loading */}
      {quest.screen === QuestScreen.Loading && <QuestLoading />}

      {/* Question */}
      {quest.screen === QuestScreen.Question && quest.currentQuestion && quest.questState && (
        <QuestQuestionScreen
          question={quest.currentQuestion}
          questState={quest.questState}
          consecutiveWrong={quest.questState.consecutiveWrong}
          onAnswer={quest.submitAnswer}
          onSkip={quest.handleSkip}
        />
      )}

      {/* Feedback */}
      {quest.screen === QuestScreen.Feedback && quest.lastAnswer && quest.questState && (
        <QuestFeedback
          correct={quest.lastAnswer.correct}
          correctAnswer={quest.lastAnswer.correctAnswer}
          encouragement={quest.lastAnswer.encouragement}
          childAnswer={quest.lastAnswer.correctAnswer}
          totalCorrect={quest.questState.totalCorrect}
        />
      )}

      {/* Summary */}
      {quest.screen === QuestScreen.Summary && quest.questState && (
        <QuestSummary
          totalCorrect={quest.questState.totalCorrect}
          totalQuestions={quest.questState.totalQuestions}
          finalLevel={quest.questState.currentLevel}
          streak={quest.streak}
          findings={quest.findings}
          previousTotalXp={Math.max(0, xpLedger.totalXp - quest.questState.totalCorrect * 2)}
          skippedCount={quest.answeredQuestions.filter((q) => q.skipped).length}
          flaggedErrorCount={quest.answeredQuestions.filter((q) => q.flaggedAsError).length}
          onDone={quest.resetToIntro}
          onTryAgain={() => {
            quest.resetToIntro()
          }}
        />
      )}

      {/* Error display */}
      {quest.aiError && (
        <Alert severity="error" sx={{ mt: 2 }}>
          Something went wrong: {quest.aiError.message}
        </Alert>
      )}
    </Page>
  )
}
