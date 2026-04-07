import { useEffect, useState } from 'react'
import { doc, getDoc, getDocs, query, updateDoc, where, orderBy, limit as firestoreLimit } from 'firebase/firestore'
import Alert from '@mui/material/Alert'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Chip from '@mui/material/Chip'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'

import Page from '../../components/Page'
import { useFamilyId } from '../../core/auth/useAuth'
import { evaluationSessionsCollection, skillSnapshotsCollection } from '../../core/firebase/firestore'
import { useActiveChild } from '../../core/hooks/useActiveChild'
import type { EvaluationSession, SkillSnapshot } from '../../core/types'
import { EvaluationDomain, SkillLevel } from '../../core/types/enums'
import MinecraftAvatar from '../avatar/MinecraftAvatar'
import { useXpLedger } from '../../core/xp/useXpLedger'
import QuestQuestionScreen, { QuestFeedback, QuestLoading } from './ReadingQuest'
import QuestSummary from './QuestSummary'
import FluencyPractice from './FluencyPractice'
import { extractTargetWord } from './questHelpers'
import type { InteractiveSessionData, QuestDomainConfig } from './questTypes'
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

// ── Quest mode configs ─────────────────────────────────────────

const READING_MODES: QuestDomainConfig[] = [
  {
    domain: EvaluationDomain.Reading,
    questMode: 'phonics',
    label: 'Phonics Quest',
    icon: '⛏️',
    enabled: true,
    description: 'Letters & sounds · Levels 1-6',
  },
  {
    domain: EvaluationDomain.Reading,
    questMode: 'comprehension',
    label: 'Comprehension Quest',
    icon: '🧠',
    enabled: true,
    description: 'Vocabulary & meaning · Levels 1-6',
  },
  {
    domain: EvaluationDomain.Reading,
    questMode: 'fluency',
    label: 'Fluency Practice',
    icon: '📖',
    enabled: true,
    description: 'Read aloud · Build speed',
  },
]

const MATH_MODES: QuestDomainConfig[] = [
  {
    domain: EvaluationDomain.Math,
    questMode: 'math',
    label: 'Math Quest',
    icon: '⛏️',
    enabled: true,
    description: 'Numbers & operations',
  },
]

const SPEECH_MODES: QuestDomainConfig[] = [
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

/** Check if phonics is marked secure in the skill snapshot */
function isPhonicsSecure(snapshot: SkillSnapshot | null): boolean {
  if (!snapshot) return false
  // If Reading Eggs or similar is in completedPrograms, phonics is secure
  if (snapshot.completedPrograms?.length) return true
  // Check if phonics skills are all secure
  const phonicsSkills = snapshot.prioritySkills.filter((s) => s.tag.startsWith('phonics.'))
  if (phonicsSkills.length === 0) return false
  return phonicsSkills.every((s) => s.level === SkillLevel.Secure)
}

export default function KnowledgeMinePage() {
  const { activeChild, activeChildId } = useActiveChild()
  const familyId = useFamilyId()
  const quest = useQuestSession()
  const xpLedger = useXpLedger(familyId, activeChildId ?? '')
  const [activeDomain, setActiveDomain] = useState<QuestDomainConfig | null>(null)
  const [snapshot, setSnapshot] = useState<SkillSnapshot | null>(null)

  const childName = activeChild?.name || 'Explorer'

  // Load skill snapshot for recommendation badges
  useEffect(() => {
    if (!activeChildId || !familyId) return
    let cancelled = false
    async function load() {
      try {
        const ref = doc(skillSnapshotsCollection(familyId), activeChildId!)
        const snap = await getDoc(ref)
        if (!cancelled && snap.exists()) {
          setSnapshot(snap.data() as SkillSnapshot)
        }
      } catch {
        // Non-blocking
      }
    }
    void load()
    return () => { cancelled = true }
  }, [activeChildId, familyId])

  // Load in-progress quest sessions (within 24h) for resume card
  const [resumeSession, setResumeSession] = useState<(EvaluationSession & Partial<InteractiveSessionData>) | null>(null)
  useEffect(() => {
    if (!activeChildId || !familyId) return
    let cancelled = false
    async function loadResume() {
      try {
        const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
        const q = query(
          evaluationSessionsCollection(familyId),
          where('childId', '==', activeChildId),
          where('status', '==', 'in-progress'),
          orderBy('evaluatedAt', 'desc'),
          firestoreLimit(1),
        )
        const snap = await getDocs(q)
        if (cancelled) return
        const sessions = snap.docs
          .map((d) => ({ ...d.data(), id: d.id }) as EvaluationSession & Partial<InteractiveSessionData>)
          .filter((s) => s.sessionType === 'interactive' && s.evaluatedAt >= cutoff)
        setResumeSession(sessions[0] ?? null)
      } catch {
        // Non-blocking — resume card is optional
      }
    }
    void loadResume()
    return () => { cancelled = true }
  }, [activeChildId, familyId, quest.screen]) // re-query when returning to intro

  const phonicsSecure = isPhonicsSecure(snapshot)

  // Build reading modes with recommendation badges
  const readingModes = READING_MODES.map((m) => ({
    ...m,
    recommended: m.questMode !== 'phonics' && phonicsSecure,
  }))

  // Reorder: if phonics secure, put comprehension and fluency first
  const orderedReadingModes = phonicsSecure
    ? [...readingModes.filter((m) => m.questMode !== 'phonics'), ...readingModes.filter((m) => m.questMode === 'phonics')]
    : readingModes

  // ── Fluency mode screens ────────────────────────────────────
  if (
    quest.screen === QuestScreen.FluencyPassage ||
    quest.screen === QuestScreen.FluencyRecording ||
    quest.screen === QuestScreen.FluencySelfCheck ||
    quest.screen === QuestScreen.FluencySummary
  ) {
    return (
      <Page>
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
        <FluencyPractice quest={quest} />
      </Page>
    )
  }

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

          {/* ── Resume card ──────────────────────────────────── */}
          {resumeSession && (
            <ResumeCard
              session={resumeSession}
              onResume={() => {
                const domain = resumeSession.domain as EvaluationDomain
                const mode = resumeSession.questMode
                setActiveDomain(
                  [...READING_MODES, ...MATH_MODES].find(
                    (m) => m.domain === domain && m.questMode === mode,
                  ) ?? READING_MODES[0],
                )
                const ok = quest.resumeSession(resumeSession)
                if (!ok) {
                  // Fallback: resume fields missing — start fresh instead
                  void quest.startQuest(domain, mode)
                }
              }}
              onStartFresh={() => {
                // Mark the partial session as abandoned in Firestore
                if (resumeSession.id) {
                  const ref = doc(evaluationSessionsCollection(familyId), resumeSession.id)
                  updateDoc(ref, { status: 'abandoned' }).catch((err) =>
                    console.error('Failed to mark session as abandoned', err),
                  )
                }
                setResumeSession(null)
              }}
            />
          )}

          {/* ── READING section ─────────────────────────────── */}
          <DomainSection label="READING" icon="📖">
            {orderedReadingModes.map((qd) => (
              <QuestCard
                key={`${qd.domain}-${qd.questMode}`}
                config={qd}
                onSelect={() => {
                  setActiveDomain(qd)
                  void quest.startQuest(qd.domain, qd.questMode)
                }}
              />
            ))}
          </DomainSection>

          {/* ── MATH section ────────────────────────────────── */}
          <DomainSection label="MATH" icon="➕">
            {MATH_MODES.map((qd) => (
              <QuestCard
                key={`${qd.domain}-${qd.questMode}`}
                config={qd}
                onSelect={() => {
                  setActiveDomain(qd)
                  void quest.startQuest(qd.domain, qd.questMode)
                }}
              />
            ))}
          </DomainSection>

          {/* ── SPEECH section ──────────────────────────────── */}
          <DomainSection label="SPEECH" icon="🗣️">
            {SPEECH_MODES.map((qd) => (
              <QuestCard
                key={`${qd.domain}-${qd.questMode}`}
                config={qd}
                onSelect={() => {}}
              />
            ))}
          </DomainSection>

          {/* Error display with retry */}
          {(quest.startQuestError || quest.aiError) && (
            <Alert
              severity="error"
              sx={{ mb: 2, fontFamily: MC.font, fontSize: '0.4rem' }}
              action={
                activeDomain ? (
                  <Button
                    color="inherit"
                    size="small"
                    sx={{ fontFamily: MC.font, fontSize: '0.35rem' }}
                    onClick={() => void quest.startQuest(activeDomain.domain, activeDomain.questMode)}
                  >
                    Try Again
                  </Button>
                ) : undefined
              }
            >
              {quest.startQuestError || quest.aiError?.message || 'Something went wrong'}
            </Alert>
          )}

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
          onAnswerWithMethod={quest.submitAnswer}
          onSkip={quest.handleSkip}
          domainLabel={activeDomain?.label || 'Reading Quest'}
          domain={activeDomain?.domain || 'reading'}
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
          strugglingWords={[...new Set(
            quest.answeredQuestions
              .filter((q) => (!q.correct || q.skipped) && !q.flaggedAsError)
              .map((q) => extractTargetWord(q))
              .filter((w): w is string => w !== null),
          )]}
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

// ── Sub-components ──────────────────────────────────────────────

function DomainSection({ label, icon, children }: { label: string; icon: string; children: React.ReactNode }) {
  return (
    <Box sx={{ mb: 2, textAlign: 'left' }}>
      <Typography
        sx={{
          fontFamily: MC.font,
          fontSize: '0.4rem',
          color: MC.stone,
          mb: 1,
          pl: 0.5,
        }}
      >
        {icon} {label}
      </Typography>
      <Stack spacing={1}>
        {children}
      </Stack>
    </Box>
  )
}

function QuestCard({ config, onSelect }: { config: QuestDomainConfig; onSelect: () => void }) {
  const { enabled, icon, label, description, recommended } = config

  return (
    <Box
      role={enabled ? 'button' : undefined}
      tabIndex={enabled ? 0 : undefined}
      onClick={() => {
        if (enabled) onSelect()
      }}
      onKeyDown={(e) => {
        if (enabled && (e.key === 'Enter' || e.key === ' ')) {
          e.preventDefault()
          onSelect()
        }
      }}
      sx={{
        bgcolor: MC.darkStone,
        border: `2px solid ${enabled ? MC.gold : MC.stone}`,
        borderRadius: 2,
        p: 2,
        minHeight: 56,
        display: 'flex',
        alignItems: 'center',
        gap: 2,
        cursor: enabled ? 'pointer' : 'default',
        opacity: enabled ? 1 : 0.4,
        transition: 'border-color 0.15s',
        '&:hover': enabled ? { borderColor: MC.diamond } : {},
        '&:focus-visible': enabled ? { borderColor: MC.diamond, outline: 'none' } : {},
      }}
    >
      <Typography sx={{ fontSize: '1.5rem' }}>{icon}</Typography>
      <Box sx={{ textAlign: 'left', flex: 1 }}>
        <Stack direction="row" alignItems="center" spacing={1}>
          <Typography
            sx={{
              fontFamily: MC.font,
              fontSize: '0.5rem',
              color: enabled ? MC.white : MC.stone,
            }}
          >
            {label}
          </Typography>
          {recommended && (
            <Chip
              label="Recommended"
              size="small"
              sx={{
                fontFamily: MC.font,
                fontSize: '0.3rem',
                height: 18,
                bgcolor: MC.green,
                color: MC.bg,
                fontWeight: 700,
              }}
            />
          )}
        </Stack>
        {description && (
          <Typography
            sx={{
              fontFamily: MC.font,
              fontSize: '0.35rem',
              color: MC.stone,
              mt: 0.5,
            }}
          >
            {description}
          </Typography>
        )}
        {enabled && (
          <Typography
            sx={{
              fontFamily: MC.font,
              fontSize: '0.3rem',
              color: MC.diamond,
              mt: 0.3,
            }}
          >
            Earn diamonds 💎
          </Typography>
        )}
      </Box>
    </Box>
  )
}

/** Quest mode labels for resume card display */
const QUEST_MODE_LABELS: Record<string, string> = {
  phonics: 'Phonics Quest',
  comprehension: 'Comprehension Quest',
  fluency: 'Fluency Practice',
  math: 'Math Quest',
}

function ResumeCard({
  session,
  onResume,
  onStartFresh,
}: {
  session: EvaluationSession & Partial<InteractiveSessionData>
  onResume: () => void
  onStartFresh: () => void
}) {
  const elapsed = Date.now() - new Date(session.evaluatedAt).getTime()
  const hoursAgo = Math.floor(elapsed / (1000 * 60 * 60))
  const minsAgo = Math.floor(elapsed / (1000 * 60))
  const timeLabel = hoursAgo >= 1 ? `${hoursAgo}h ago` : `${minsAgo}m ago`
  const modeLabel = QUEST_MODE_LABELS[session.questMode ?? ''] ?? 'Quest'

  return (
    <Box
      role="button"
      tabIndex={0}
      onClick={onResume}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          onResume()
        }
      }}
      sx={{
        bgcolor: MC.darkStone,
        border: `2px solid ${MC.diamond}`,
        borderRadius: 2,
        p: 2,
        mb: 2,
        cursor: 'pointer',
        transition: 'border-color 0.15s',
        '&:hover': { borderColor: MC.gold },
        '&:focus-visible': { borderColor: MC.gold, outline: 'none' },
      }}
    >
      <Stack direction="row" alignItems="center" spacing={1.5}>
        <Typography sx={{ fontSize: '1.5rem' }}>🔄</Typography>
        <Box sx={{ flex: 1, textAlign: 'left' }}>
          <Typography
            sx={{
              fontFamily: MC.font,
              fontSize: '0.45rem',
              color: MC.diamond,
              lineHeight: 1.8,
            }}
          >
            Pick up where you left off?
          </Typography>
          <Typography
            sx={{
              fontFamily: MC.font,
              fontSize: '0.35rem',
              color: MC.stone,
              mt: 0.3,
            }}
          >
            {modeLabel} · {session.totalCorrect ?? 0}/{session.totalQuestions ?? 0} correct · Level {session.finalLevel ?? '?'} · {timeLabel}
          </Typography>
        </Box>
      </Stack>
      <Typography
        component="span"
        role="button"
        tabIndex={0}
        onClick={(e) => {
          e.stopPropagation()
          onStartFresh()
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault()
            e.stopPropagation()
            onStartFresh()
          }
        }}
        sx={{
          display: 'block',
          fontFamily: MC.font,
          fontSize: '0.3rem',
          color: MC.stone,
          mt: 1,
          textAlign: 'center',
          textDecoration: 'underline',
          cursor: 'pointer',
          '&:hover': { color: MC.gold },
        }}
      >
        Start fresh instead
      </Typography>
    </Box>
  )
}
