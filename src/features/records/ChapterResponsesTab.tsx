import { useEffect, useMemo, useRef, useState } from 'react'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Container from '@mui/material/Container'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import PauseIcon from '@mui/icons-material/Pause'
import PlayArrowIcon from '@mui/icons-material/PlayArrow'
import { getDocs, orderBy, query, where } from 'firebase/firestore'

import SectionCard from '../../components/SectionCard'
import { useFamilyId } from '../../core/auth/useAuth'
import { chapterResponsesCollection } from '../../core/firebase/firestore'
import { useActiveChild } from '../../core/hooks/useActiveChild'
import type { ChapterResponse } from '../../core/types'

function AudioPlayButton({ url }: { url: string }) {
  const [playing, setPlaying] = useState(false)
  const audioRef = useRef<HTMLAudioElement | null>(null)

  useEffect(() => {
    return () => {
      audioRef.current?.pause()
    }
  }, [])

  const toggle = () => {
    if (!audioRef.current) {
      audioRef.current = new Audio(url)
      audioRef.current.onended = () => setPlaying(false)
    }
    if (playing) {
      audioRef.current.pause()
      setPlaying(false)
    } else {
      audioRef.current.play()
      setPlaying(true)
    }
  }

  return (
    <Button
      size="small"
      startIcon={playing ? <PauseIcon /> : <PlayArrowIcon />}
      onClick={toggle}
      variant="outlined"
      sx={{ textTransform: 'none' }}
    >
      {playing ? 'Pause' : 'Listen'}
    </Button>
  )
}

function formatResponseDate(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00')
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
}

export default function ChapterResponsesTab() {
  const familyId = useFamilyId()
  const { activeChild } = useActiveChild()
  const [responses, setResponses] = useState<ChapterResponse[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!familyId || !activeChild?.id) return
    let cancelled = false

    const q = query(
      chapterResponsesCollection(familyId),
      where('childId', '==', activeChild.id),
      orderBy('date', 'desc'),
    )

    getDocs(q)
      .then((snap) => {
        if (cancelled) return
        const items = snap.docs.map((doc) => ({
          ...(doc.data() as ChapterResponse),
          id: doc.id,
        }))
        setResponses(items)
      })
      .catch((err) => {
        if (!cancelled) console.error('Failed to load chapter responses:', err)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => { cancelled = true }
  }, [familyId, activeChild?.id])

  // Group by book
  const grouped = useMemo(() => {
    const map = new Map<string, ChapterResponse[]>()
    for (const r of responses) {
      const key = r.bookTitle || 'Unknown Book'
      const existing = map.get(key) ?? []
      existing.push(r)
      map.set(key, existing)
    }
    return Array.from(map.entries())
  }, [responses])

  if (loading) {
    return (
      <Container maxWidth="lg" sx={{ py: 3 }}>
        <Typography color="text.secondary">Loading chapter responses...</Typography>
      </Container>
    )
  }

  if (responses.length === 0) {
    return (
      <Container maxWidth="lg" sx={{ py: 3 }}>
        <SectionCard title="Book Responses">
          <Typography color="text.secondary" sx={{ py: 2 }}>
            No chapter responses recorded yet.
          </Typography>
          <Typography variant="body2" color="text.secondary">
            When {activeChild?.name ?? 'your child'} records thoughts on the read-aloud book, they'll appear here.
          </Typography>
        </SectionCard>
      </Container>
    )
  }

  return (
    <Container maxWidth="lg" sx={{ py: 3 }}>
      <Stack spacing={3}>
        {grouped.map(([bookTitle, items]) => (
          <SectionCard key={bookTitle} title={bookTitle}>
            <Stack spacing={2}>
              {items.map((r) => (
                <Box
                  key={r.id ?? r.createdAt}
                  sx={{
                    pl: 2,
                    borderLeft: '3px solid',
                    borderLeftColor: 'primary.light',
                    py: 1,
                  }}
                >
                  <Stack spacing={0.5}>
                    <Typography variant="subtitle2" color="text.secondary">
                      {formatResponseDate(r.date)} — {r.chapter}
                    </Typography>
                    <Typography variant="body2" sx={{ fontStyle: 'italic', lineHeight: 1.5 }}>
                      {r.question}
                    </Typography>
                    {(r.virtue || r.scripture) && (
                      <Typography variant="caption" color="text.secondary">
                        {r.virtue && `Theme: ${r.virtue}`}
                        {r.virtue && r.scripture && ' · '}
                        {r.scripture}
                      </Typography>
                    )}
                    {r.audioUrl && (
                      <Box sx={{ mt: 0.5 }}>
                        <AudioPlayButton url={r.audioUrl} />
                      </Box>
                    )}
                    {r.textResponse && (
                      <Typography variant="body2" sx={{ mt: 0.5, color: 'text.primary' }}>
                        {r.textResponse}
                      </Typography>
                    )}
                  </Stack>
                </Box>
              ))}
            </Stack>
          </SectionCard>
        ))}
      </Stack>
    </Container>
  )
}
