import { useState } from 'react'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Chip from '@mui/material/Chip'
import Collapse from '@mui/material/Collapse'
import Divider from '@mui/material/Divider'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import MenuBookIcon from '@mui/icons-material/MenuBook'
import MicIcon from '@mui/icons-material/Mic'
import PlayArrowIcon from '@mui/icons-material/PlayArrow'
import ExpandLessIcon from '@mui/icons-material/ExpandLess'

import SectionCard from '../../components/SectionCard'
import type { WeekEvidence } from '../../core/types'
import { hasAnyEvidenceToShow } from './weekInEvidence.logic'

interface WeekInEvidenceProps {
  childName: string
  evidence: WeekEvidence
}

export default function WeekInEvidence({ childName, evidence }: WeekInEvidenceProps) {
  if (!hasAnyEvidenceToShow(evidence)) return null

  return (
    <SectionCard title={`Week in Evidence — ${childName}`}>
      <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1.5 }}>
        Raw counts from this week — the unfalsifiable record of what happened.
      </Typography>
      <Stack
        direction={{ xs: 'column', md: 'row' }}
        spacing={2}
        divider={<Divider flexItem orientation="vertical" sx={{ display: { xs: 'none', md: 'block' } }} />}
      >
        <BooksColumn evidence={evidence} />
        <TeachBacksColumn evidence={evidence} />
      </Stack>
    </SectionCard>
  )
}

function BooksColumn({ evidence }: { evidence: WeekEvidence }) {
  const { books } = evidence
  const createdCount = books.booksCreated.length
  const completedCount = books.booksCompleted.length
  const sessionCount = books.readingSessions.count
  const readingMinutes = books.readingSessions.totalMinutes

  const hasAny = createdCount > 0 || completedCount > 0 || sessionCount > 0

  return (
    <Box sx={{ flex: 1, minWidth: 0 }}>
      <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1 }}>
        <MenuBookIcon sx={{ fontSize: 20, color: 'primary.main' }} />
        <Typography variant="subtitle2" fontWeight={700}>
          Books
        </Typography>
      </Stack>
      {!hasAny ? (
        <Typography variant="body2" color="text.secondary">
          No book activity this week.
        </Typography>
      ) : (
        <Stack spacing={0.75}>
          <Typography variant="body2">
            • {createdCount} created, {completedCount} completed
          </Typography>
          {sessionCount > 0 && (
            <Typography variant="body2">
              • {sessionCount} reading session{sessionCount === 1 ? '' : 's'}
              {readingMinutes > 0 ? ` (${readingMinutes} min cumulative)` : ''}
            </Typography>
          )}
          {books.readingSessions.booksRead.length > 0 && (
            <Typography variant="body2" color="text.secondary" sx={{ pl: 1.5 }}>
              Books: {books.readingSessions.booksRead.map((b) => b.title).join(', ')}
            </Typography>
          )}
          {books.booksCreated.length > 0 && (
            <Typography variant="body2" color="text.secondary" sx={{ pl: 1.5 }}>
              Created:{' '}
              {books.booksCreated.map((b) => `"${b.title}"`).join(', ')}
            </Typography>
          )}
        </Stack>
      )}
    </Box>
  )
}

function TeachBacksColumn({ evidence }: { evidence: WeekEvidence }) {
  const { teachBacks } = evidence
  const [showHighlights, setShowHighlights] = useState(false)
  const audioExamples = teachBacks.examples.filter((ex) => ex.hasAudio && ex.audioUrl)

  return (
    <Box sx={{ flex: 1, minWidth: 0 }}>
      <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1 }}>
        <MicIcon sx={{ fontSize: 20, color: 'secondary.main' }} />
        <Typography variant="subtitle2" fontWeight={700}>
          Teach-Backs
        </Typography>
      </Stack>
      {teachBacks.count === 0 ? (
        <Typography variant="body2" color="text.secondary">
          No teach-back moments this week.
        </Typography>
      ) : (
        <Stack spacing={0.75}>
          <Typography variant="body2">
            • {teachBacks.count} moment{teachBacks.count === 1 ? '' : 's'} captured
          </Typography>
          {Object.keys(teachBacks.bySubject).length > 0 && (
            <Stack direction="row" spacing={0.5} flexWrap="wrap" useFlexGap sx={{ pl: 1.5 }}>
              {Object.entries(teachBacks.bySubject).map(([subject, count]) => (
                <Chip
                  key={subject}
                  size="small"
                  label={`${subject} (${count})`}
                  variant="outlined"
                />
              ))}
            </Stack>
          )}
          <Typography variant="body2" color="text.secondary">
            • {teachBacks.audioCount} audio, {teachBacks.textCount} text-only
          </Typography>
          {audioExamples.length > 0 && (
            <>
              <Button
                size="small"
                variant="text"
                startIcon={showHighlights ? <ExpandLessIcon /> : <PlayArrowIcon />}
                onClick={() => setShowHighlights((v) => !v)}
                sx={{ alignSelf: 'flex-start', mt: 0.5 }}
              >
                {showHighlights ? 'Hide highlights' : 'Listen to highlights'}
              </Button>
              <Collapse in={showHighlights}>
                <Stack spacing={1} sx={{ pl: 1.5, mt: 0.5 }}>
                  {audioExamples.map((ex, idx) => (
                    <Stack key={idx} spacing={0.5}>
                      <Typography variant="caption" color="text.secondary">
                        {ex.subject}
                        {ex.excerpt ? ` — ${ex.excerpt}` : ''}
                      </Typography>
                      <audio src={ex.audioUrl} controls style={{ width: '100%' }} />
                    </Stack>
                  ))}
                </Stack>
              </Collapse>
            </>
          )}
        </Stack>
      )}
    </Box>
  )
}
