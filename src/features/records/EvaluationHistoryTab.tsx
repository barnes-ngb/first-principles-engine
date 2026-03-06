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

export default function EvaluationHistoryTab() {
  const familyId = useFamilyId()
  const { activeChildId, activeChild } = useActiveChild()
  const [sessions, setSessions] = useState<EvaluationSession[]>([])
  const [selectedSession, setSelectedSession] = useState<EvaluationSession | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!activeChildId) return
    setLoading(true)
    const q = query(
      evaluationSessionsCollection(familyId),
      where('childId', '==', activeChildId),
      where('status', '==', 'complete'),
    )
    getDocs(q).then((snap) => {
      setSessions(
        snap.docs
          .map((d) => ({ ...d.data(), id: d.id }))
          .sort((a, b) => b.evaluatedAt.localeCompare(a.evaluatedAt)),
      )
      setLoading(false)
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
          <Typography variant="h6">
            {selectedSession.domain.charAt(0).toUpperCase() + selectedSession.domain.slice(1)} Evaluation
          </Typography>
          <Chip size="small" label={selectedSession.domain} variant="outlined" />
        </Stack>
        <Typography variant="caption" color="text.secondary">
          {new Date(selectedSession.evaluatedAt).toLocaleDateString()}
        </Typography>

        {selectedSession.summary && (
          <Box sx={{ p: 2, bgcolor: 'grey.50', borderRadius: 2 }}>
            <Typography variant="body2">{selectedSession.summary}</Typography>
          </Box>
        )}

        {selectedSession.findings.length > 0 && (
          <>
            <Typography variant="subtitle2">Skill Map</Typography>
            <Stack spacing={0.5}>
              {selectedSession.findings.map((f, i) => (
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

        {selectedSession.recommendations.length > 0 && (
          <>
            <Typography variant="subtitle2">Recommendations</Typography>
            {selectedSession.recommendations.map((rec, i) => (
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

        {selectedSession.nextEvalDate && (
          <Typography variant="caption" color="text.secondary">
            Next evaluation suggested: {new Date(selectedSession.nextEvalDate).toLocaleDateString()}
          </Typography>
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
                <Typography variant="subtitle2">
                  {session.domain.charAt(0).toUpperCase() + session.domain.slice(1)} Evaluation
                </Typography>
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
                {session.findings.length} findings &middot; {session.recommendations.length} recommendations
              </Typography>
            </Box>
          ))}
        </Stack>
      )}
    </Stack>
  )
}
