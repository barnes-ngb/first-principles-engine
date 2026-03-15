import { useEffect, useState } from 'react'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Chip from '@mui/material/Chip'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import { getDocs, query, where } from 'firebase/firestore'

import { useFamilyId } from '../../core/auth/useAuth'
import { evaluationSessionsCollection } from '../../core/firebase/firestore'
import { useActiveChild } from '../../core/hooks/useActiveChild'
import type { EvaluationSession } from '../../core/types/domain'
import type { InteractiveSessionData, SessionQuestion } from '../quest/questTypes'

/** Merged type for sessions that may be interactive quests. */
type AnySession = EvaluationSession & Partial<InteractiveSessionData>

function isInteractive(session: AnySession): boolean {
  return session.sessionType === 'interactive'
}

function sessionTitle(session: AnySession): string {
  if (isInteractive(session)) return '\u26CF\uFE0F Reading Quest'
  return session.domain.charAt(0).toUpperCase() + session.domain.slice(1) + ' Evaluation'
}

function sessionSubtitle(session: AnySession): string {
  if (isInteractive(session)) {
    const parts: string[] = []
    if (session.totalCorrect != null && session.totalQuestions != null) {
      parts.push(`${session.totalCorrect}/${session.totalQuestions} correct`)
    }
    if (session.finalLevel != null) {
      parts.push(`Level ${session.finalLevel}`)
    }
    if (session.diamondsMined != null) {
      parts.push(`\uD83D\uDC8E ${session.diamondsMined}`)
    }
    return parts.join(' \u00B7 ')
  }
  return `${session.findings.length} findings \u00B7 ${session.recommendations.length} recommendations`
}

function QuestDetailView({ session }: { session: AnySession }) {
  const questions: SessionQuestion[] = session.questions || []

  return (
    <>
      {/* Stats box */}
      <Box sx={{ p: 2, bgcolor: 'grey.50', borderRadius: 2 }}>
        <Stack direction="row" spacing={3} flexWrap="wrap">
          <Box>
            <Typography variant="caption" color="text.secondary">Diamonds</Typography>
            <Typography variant="h6">{'\uD83D\uDC8E'} {session.diamondsMined ?? 0}</Typography>
          </Box>
          <Box>
            <Typography variant="caption" color="text.secondary">Level Reached</Typography>
            <Typography variant="h6">{session.finalLevel ?? '?'}</Typography>
          </Box>
          <Box>
            <Typography variant="caption" color="text.secondary">Score</Typography>
            <Typography variant="h6">{session.totalCorrect ?? 0}/{session.totalQuestions ?? 0}</Typography>
          </Box>
          {session.streakDays != null && session.streakDays > 0 && (
            <Box>
              <Typography variant="caption" color="text.secondary">Streak</Typography>
              <Typography variant="h6">{'\u2B50'} {session.streakDays} day{session.streakDays !== 1 ? 's' : ''}</Typography>
            </Box>
          )}
        </Stack>
      </Box>

      {session.summary && (
        <Box sx={{ p: 2, bgcolor: 'grey.50', borderRadius: 2 }}>
          <Typography variant="body2">{session.summary}</Typography>
        </Box>
      )}

      {/* Per-question breakdown */}
      {questions.length > 0 && (
        <>
          <Typography variant="subtitle2">Question Breakdown</Typography>
          <Stack spacing={1}>
            {questions.map((q, i) => (
              <Box
                key={q.id || i}
                sx={{
                  p: 1.5,
                  borderRadius: 1,
                  border: '1px solid',
                  borderColor: q.correct ? 'success.light' : 'error.light',
                  bgcolor: q.correct ? 'success.50' : 'error.50',
                }}
              >
                <Stack direction="row" spacing={1} alignItems="center">
                  <Typography sx={{ fontSize: '1rem' }}>
                    {q.correct ? '\u2705' : '\u274C'}
                  </Typography>
                  <Box sx={{ flex: 1 }}>
                    <Typography variant="body2">{q.prompt}</Typography>
                    <Typography variant="caption" color="text.secondary">
                      Answer: {q.childAnswer}
                      {!q.correct && ` (correct: ${q.correctAnswer})`}
                      {q.skill && ` \u00B7 ${q.skill}`}
                      {' \u00B7 Level '}
                      {q.level}
                    </Typography>
                  </Box>
                </Stack>
              </Box>
            ))}
          </Stack>
        </>
      )}

      {/* Findings section (same as guided) */}
      {session.findings.length > 0 && (
        <>
          <Typography variant="subtitle2">Skill Map</Typography>
          <Stack spacing={0.5}>
            {session.findings.map((f, i) => (
              <Stack key={i} direction="row" spacing={1} alignItems="flex-start">
                <Typography>
                  {f.status === 'mastered' ? '\u2705' : f.status === 'emerging' ? '\u26A0\uFE0F' : '\u274C'}
                </Typography>
                <Box>
                  <Typography variant="body2">
                    <strong>{f.skill}:</strong> {f.evidence}
                  </Typography>
                  {f.notes && (
                    <Typography variant="caption" color="text.secondary">
                      {f.notes}
                    </Typography>
                  )}
                </Box>
              </Stack>
            ))}
          </Stack>
        </>
      )}
    </>
  )
}

function GuidedDetailView({ session }: { session: AnySession }) {
  return (
    <>
      {session.summary && (
        <Box sx={{ p: 2, bgcolor: 'grey.50', borderRadius: 2 }}>
          <Typography variant="body2">{session.summary}</Typography>
        </Box>
      )}

      {session.findings.length > 0 && (
        <>
          <Typography variant="subtitle2">Skill Map</Typography>
          <Stack spacing={0.5}>
            {session.findings.map((f, i) => (
              <Stack key={i} direction="row" spacing={1} alignItems="flex-start">
                <Typography>
                  {f.status === 'mastered' ? '\u2705' : f.status === 'emerging' ? '\u26A0\uFE0F' : '\u274C'}
                </Typography>
                <Box>
                  <Typography variant="body2">
                    <strong>{f.skill}:</strong> {f.evidence}
                  </Typography>
                  {f.notes && (
                    <Typography variant="caption" color="text.secondary">
                      {f.notes}
                    </Typography>
                  )}
                </Box>
              </Stack>
            ))}
          </Stack>
        </>
      )}

      {session.recommendations.length > 0 && (
        <>
          <Typography variant="subtitle2">Recommendations</Typography>
          {session.recommendations.map((rec, i) => (
            <Box key={i} sx={{ pl: 1.5, borderLeft: '3px solid', borderColor: 'primary.main', mb: 1 }}>
              <Typography variant="body2">
                <strong>
                  {rec.priority}. {rec.skill}
                </strong>
              </Typography>
              <Typography variant="body2">{rec.action}</Typography>
              <Typography variant="caption" color="text.secondary">
                {rec.frequency} &middot; {rec.duration}
                {rec.materials?.length ? ` \u00B7 Materials: ${rec.materials.join(', ')}` : ''}
              </Typography>
            </Box>
          ))}
        </>
      )}

      {session.nextEvalDate && (
        <Typography variant="caption" color="text.secondary">
          Next evaluation suggested: {new Date(session.nextEvalDate).toLocaleDateString()}
        </Typography>
      )}
    </>
  )
}

export default function EvaluationHistoryTab() {
  const familyId = useFamilyId()
  const { activeChildId, activeChild } = useActiveChild()
  const [sessions, setSessions] = useState<AnySession[]>([])
  const [selectedSession, setSelectedSession] = useState<AnySession | null>(null)
  const [loadedKey, setLoadedKey] = useState<string | null>(null)
  const currentKey = activeChildId ? `${familyId}:${activeChildId}` : null
  const loading = !!currentKey && loadedKey !== currentKey

  useEffect(() => {
    if (!activeChildId) return
    const q = query(
      evaluationSessionsCollection(familyId),
      where('childId', '==', activeChildId),
      where('status', '==', 'complete'),
    )
    getDocs(q).then((snap) => {
      setSessions(
        snap.docs
          .map((d) => ({ ...(d.data() as AnySession), id: d.id }))
          .sort((a, b) => b.evaluatedAt.localeCompare(a.evaluatedAt)),
      )
      setLoadedKey(`${familyId}:${activeChildId}`)
    })
  }, [familyId, activeChildId])

  if (!activeChildId) {
    return (
      <Typography color="text.secondary" sx={{ py: 4, textAlign: 'center' }}>
        Select a child to view evaluations.
      </Typography>
    )
  }

  if (loading) {
    return <Typography color="text.secondary">Loading evaluations...</Typography>
  }

  if (selectedSession) {
    return (
      <Stack spacing={2}>
        <Button size="small" onClick={() => setSelectedSession(null)} sx={{ alignSelf: 'flex-start' }}>
          &larr; Back to evaluation list
        </Button>

        <Stack direction="row" spacing={1} alignItems="center">
          <Typography variant="h6">{sessionTitle(selectedSession)}</Typography>
          <Chip size="small" label={selectedSession.domain} variant="outlined" />
          {isInteractive(selectedSession) && (
            <Chip size="small" label={`${activeChild?.name}'s Quest`} color="secondary" />
          )}
        </Stack>
        <Typography variant="caption" color="text.secondary">
          {new Date(selectedSession.evaluatedAt).toLocaleDateString()}
        </Typography>

        {isInteractive(selectedSession) ? (
          <QuestDetailView session={selectedSession} />
        ) : (
          <GuidedDetailView session={selectedSession} />
        )}
      </Stack>
    )
  }

  return (
    <Stack spacing={2}>
      <Stack direction="row" justifyContent="space-between" alignItems="center">
        <Typography variant="subtitle1">{activeChild?.name}&apos;s Evaluations</Typography>
        <Button variant="contained" size="small" href="/evaluate">
          New Evaluation
        </Button>
      </Stack>

      {sessions.length === 0 ? (
        <Box sx={{ textAlign: 'center', py: 4 }}>
          <Typography color="text.secondary" gutterBottom>
            No evaluations yet.
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Run an evaluation to map {activeChild?.name}&apos;s skill frontier.
          </Typography>
          <Button variant="outlined" sx={{ mt: 2 }} href="/evaluate">
            Evaluate {activeChild?.name}&apos;s Skills
          </Button>
        </Box>
      ) : (
        <Stack spacing={1}>
          {sessions.map((session) => (
            <Box
              key={session.id}
              sx={{
                p: 2,
                borderRadius: 2,
                border: '1px solid',
                borderColor: 'divider',
                cursor: 'pointer',
                '&:hover': { bgcolor: 'action.hover' },
              }}
              onClick={() => setSelectedSession(session)}
            >
              <Stack direction="row" justifyContent="space-between" alignItems="center">
                <Stack direction="row" spacing={1} alignItems="center">
                  <Typography variant="subtitle2">{sessionTitle(session)}</Typography>
                  {isInteractive(session) && (
                    <Chip label={`${activeChild?.name}'s Quest`} size="small" color="secondary" />
                  )}
                </Stack>
                <Typography variant="caption" color="text.secondary">
                  {new Date(session.evaluatedAt).toLocaleDateString()}
                </Typography>
              </Stack>
              {session.summary && (
                <Typography
                  variant="body2"
                  color="text.secondary"
                  sx={{
                    mt: 0.5,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    display: '-webkit-box',
                    WebkitLineClamp: 2,
                    WebkitBoxOrient: 'vertical',
                  }}
                >
                  {session.summary}
                </Typography>
              )}
              <Typography variant="caption" color="text.secondary" sx={{ mt: 0.5 }}>
                {sessionSubtitle(session)}
              </Typography>
            </Box>
          ))}
        </Stack>
      )}
    </Stack>
  )
}
