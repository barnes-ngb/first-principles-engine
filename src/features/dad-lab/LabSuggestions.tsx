import { useCallback, useEffect, useState } from 'react'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Card from '@mui/material/Card'
import CardContent from '@mui/material/CardContent'
import Chip from '@mui/material/Chip'
import Dialog from '@mui/material/Dialog'
import DialogContent from '@mui/material/DialogContent'
import DialogTitle from '@mui/material/DialogTitle'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'

import { doc, getDoc } from 'firebase/firestore'

import { ErrorState, LoadingState } from '../../components/states'
import { useAI, TaskType } from '../../core/ai/useAI'
import { useFamilyId } from '../../core/auth/useAuth'
import { useChildren } from '../../core/hooks/useChildren'
import type { Child } from '../../core/types'
import type { DadLabType } from '../../core/types/enums'
import { db } from '../../core/firebase/firestore'
import { weekKeyFromDate } from '../../core/utils/dateKey'
import { parseChildRoles } from './childRoles'
import { buildLabSuggestionsPrompt, DAD_LAB_SUGGESTION_MODEL } from './dadLabPrompts'

interface Prefill {
  title: string
  question: string
  labType: DadLabType
  description: string
  materials?: string[]
  /** Per-child role text keyed by childId (ARCH-40). */
  childRoles?: Record<string, string>
  duration?: number
}

interface LabSuggestionsProps {
  open: boolean
  onClose: () => void
  onSelect: (prefill: Prefill) => void
}

interface ParsedSuggestion {
  title: string
  type: string
  framework: string
  question: string
  description: string
  phases: string
  materials: string
  /** Per-child role text keyed by childId (ARCH-40). */
  childRoles: Record<string, string>
  teachingMoment: string
  subjectConnection: string
  duration: string
}

const LAB_TYPE_MAP: Record<string, DadLabType> = {
  science: 'science',
  engineering: 'engineering',
  adventure: 'adventure',
  heart: 'heart',
}

const LAB_TYPE_ICONS: Record<string, string> = {
  science: '\u{1F9EA}',
  engineering: '\u{1F528}',
  adventure: '\u{1F333}',
  heart: '\u{2764}\u{FE0F}',
}

function parseLabType(raw: string): DadLabType {
  const lower = raw.toLowerCase().trim()
  return LAB_TYPE_MAP[lower] ?? 'science'
}

function parseSuggestions(text: string, children: Child[]): ParsedSuggestion[] {
  const suggestions: ParsedSuggestion[] = []
  // Split by --- dividers
  const blocks = text.split(/---/).filter((b) => b.trim())

  for (const block of blocks) {
    const get = (key: string): string => {
      const match = block.match(new RegExp(`${key}:\\s*(.+)`, 'i'))
      return match?.[1]?.trim() ?? ''
    }

    const title = get('Title')
    if (!title) continue

    suggestions.push({
      title,
      type: get('Type') || 'science',
      framework: get('Framework'),
      question: get('Question'),
      description: get('Description'),
      phases: get('Phases'),
      materials: get('Materials'),
      childRoles: parseChildRoles(block, children),
      teachingMoment: get('Teaching moment'),
      subjectConnection: get('Subject connection'),
      duration: get('Duration'),
    })
  }

  // Fallback: try numbered format if --- didn't work
  if (suggestions.length === 0) {
    const numberedBlocks = text.split(/(?=\d+[.)]\s)/).filter((b) => b.trim())
    for (const block of numberedBlocks) {
      const get = (key: string): string => {
        const match = block.match(new RegExp(`${key}:\\s*(.+)`, 'i'))
        return match?.[1]?.trim() ?? ''
      }
      const title = get('Title') || get('Name')
      if (!title) continue
      suggestions.push({
        title,
        type: get('Type') || get('Category') || 'science',
        framework: get('Framework'),
        question: get('Question') || get('Driving question'),
        description: get('Description') || get('Brief') || get('Overview'),
        phases: get('Phases'),
        materials: get('Materials'),
        childRoles: parseChildRoles(block, children),
        teachingMoment: get('Teaching moment'),
        subjectConnection: get('Subject connection'),
        duration: get('Duration'),
      })
    }
  }

  // Final fallback: return the whole text as one suggestion
  if (suggestions.length === 0 && text.trim()) {
    suggestions.push({
      title: 'AI Suggested Lab',
      type: 'science',
      framework: '',
      question: '',
      description: text.trim(),
      phases: '',
      materials: '',
      childRoles: {},
      teachingMoment: '',
      subjectConnection: '',
      duration: '',
    })
  }

  return suggestions
}

function parseDuration(raw: string): number | undefined {
  const match = raw.match(/(\d+)/)
  return match ? parseInt(match[1], 10) : undefined
}

function LabSuggestionsContent({ onClose, onSelect }: Omit<LabSuggestionsProps, 'open'>) {
  const familyId = useFamilyId()
  const { children, isLoading: childrenLoading } = useChildren()
  const { chat, loading: aiLoading } = useAI()
  const [suggestions, setSuggestions] = useState<ParsedSuggestion[]>([])
  const [rawText, setRawText] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [storySuggestion, setStorySuggestion] = useState<{ title: string; text: string } | null>(null)

  // Load this week's dadLabSuggestion from the conundrum
  useEffect(() => {
    const weekKey = weekKeyFromDate(new Date())
    getDoc(doc(db, `families/${familyId}/weeks/${weekKey}`))
      .then((snap) => {
        if (snap.exists()) {
          const data = snap.data() as { conundrum?: { title?: string; dadLabSuggestion?: string } }
          if (data.conundrum?.dadLabSuggestion) {
            setStorySuggestion({
              title: data.conundrum.title ?? "This Week's Story",
              text: data.conundrum.dadLabSuggestion,
            })
          }
        }
      })
      .catch(() => { /* ignore */ })
  }, [familyId])

  const fetchSuggestions = useCallback(async () => {
    if (!children.length) {
      setError('No children found. Add a child first.')
      return
    }
    setSuggestions([])
    setRawText('')
    setError(null)

    try {
      const response = await chat({
        familyId,
        childId: children[0]?.id ?? '',
        taskType: TaskType.Chat,
        model: DAD_LAB_SUGGESTION_MODEL,
        messages: [
          {
            role: 'user',
            content: buildLabSuggestionsPrompt(children),
          },
        ],
      })

      if (response?.message) {
        setRawText(response.message)
        const parsed = parseSuggestions(response.message, children)
        setSuggestions(parsed)
      } else {
        setError('No response from AI. Check that AI features are enabled in Settings.')
      }
    } catch (err) {
      console.error('Lab suggestions failed:', err)
      setError(`Failed to get suggestions: ${err instanceof Error ? err.message : 'Unknown error'}`)
    }
  }, [familyId, children, chat])

  useEffect(() => {
    if (!childrenLoading) {
      fetchSuggestions()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [childrenLoading])

  const handleSelect = useCallback(
    (suggestion: ParsedSuggestion) => {
      onSelect({
        title: suggestion.title,
        question: suggestion.question,
        labType: parseLabType(suggestion.type),
        description: suggestion.description,
        materials: suggestion.materials
          ? suggestion.materials.split(',').map((m) => m.trim()).filter(Boolean)
          : undefined,
        childRoles: suggestion.childRoles,
        duration: parseDuration(suggestion.duration),
      })
    },
    [onSelect],
  )

  return (
    <>
      <DialogTitle>Lab Suggestions</DialogTitle>
      <DialogContent>
        {(aiLoading || childrenLoading) && (
          <LoadingState fullHeight label="Thinking up lab ideas..." />
        )}

        {error && (
          <Box sx={{ py: 2 }}>
            <ErrorState message={error} onRetry={fetchSuggestions} />
          </Box>
        )}

        {storySuggestion && (
          <Card variant="outlined" sx={{ mb: 2, border: '2px solid', borderColor: 'warning.main' }}>
            <CardContent>
              <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 1 }}>
                <Chip label="From This Week's Story" size="small" color="warning" />
              </Stack>
              <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
                {'\u{1F5FA}\u{FE0F}'} {storySuggestion.title}
              </Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
                {storySuggestion.text}
              </Typography>
              <Button
                variant="contained"
                size="small"
                color="warning"
                sx={{ mt: 1.5 }}
                onClick={() =>
                  onSelect({
                    title: `Story Lab: ${storySuggestion.title}`,
                    question: '',
                    labType: 'science',
                    description: storySuggestion.text,
                  })
                }
              >
                Plan This Lab
              </Button>
            </CardContent>
          </Card>
        )}

        {!aiLoading && !childrenLoading && suggestions.length > 0 && (
          <Stack spacing={1.5} sx={{ pb: 1 }}>
            {suggestions.map((s, i) => (
              <Card key={i} variant="outlined">
                <CardContent>
                  <Stack direction="row" justifyContent="space-between" alignItems="flex-start">
                    <Box sx={{ flex: 1, minWidth: 0 }}>
                      <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
                        {LAB_TYPE_ICONS[parseLabType(s.type)] ?? '\u{1F52C}'} {s.title}
                      </Typography>
                      <Stack direction="row" spacing={0.5} sx={{ mt: 0.5 }}>
                        <Chip label={s.type} size="small" />
                        {s.duration && <Chip label={s.duration} size="small" variant="outlined" />}
                      </Stack>
                    </Box>
                    <Button
                      variant="contained"
                      size="small"
                      onClick={() => handleSelect(s)}
                      sx={{ ml: 1, flexShrink: 0 }}
                    >
                      Plan This Lab
                    </Button>
                  </Stack>
                  {s.question && (
                    <Typography variant="body2" sx={{ mt: 1, fontStyle: 'italic' }}>
                      &ldquo;{s.question}&rdquo;
                    </Typography>
                  )}
                  {s.description && (
                    <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
                      {s.description}
                    </Typography>
                  )}
                  {s.framework && (
                    <Typography variant="caption" color="secondary" sx={{ mt: 0.5, display: 'block' }}>
                      {s.framework}
                    </Typography>
                  )}
                  {s.phases && (
                    <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
                      {s.phases}
                    </Typography>
                  )}
                  {s.materials && (
                    <Box sx={{ mt: 1 }}>
                      <Typography variant="caption" color="text.secondary">
                        Materials:
                      </Typography>
                      <Typography variant="body2">{s.materials}</Typography>
                    </Box>
                  )}
                  <Stack direction="row" spacing={2} sx={{ mt: 1 }}>
                    {children.map((child) =>
                      s.childRoles[child.id] ? (
                        <Box key={child.id} sx={{ flex: 1 }}>
                          <Typography variant="caption" color="primary">
                            {child.name}:
                          </Typography>
                          <Typography variant="body2">{s.childRoles[child.id]}</Typography>
                        </Box>
                      ) : null,
                    )}
                  </Stack>
                  {s.teachingMoment && (
                    <Typography variant="body2" sx={{ mt: 0.5, fontStyle: 'italic' }}>
                      {s.teachingMoment}
                    </Typography>
                  )}
                  {s.subjectConnection && (
                    <Typography variant="caption" color="text.secondary" sx={{ mt: 0.5, display: 'block' }}>
                      {s.subjectConnection}
                    </Typography>
                  )}
                </CardContent>
              </Card>
            ))}
          </Stack>
        )}

        {/* Show raw text if parsing yielded only fallback */}
        {!aiLoading && !childrenLoading && rawText && suggestions.length === 1 && suggestions[0].title === 'AI Suggested Lab' && (
          <Typography
            variant="body2"
            sx={{ whiteSpace: 'pre-wrap', mt: 1, p: 2, bgcolor: 'action.hover', borderRadius: 1 }}
          >
            {rawText}
          </Typography>
        )}

        <Stack direction="row" justifyContent="flex-end" sx={{ mt: 2 }}>
          <Button onClick={onClose}>Close</Button>
        </Stack>
      </DialogContent>
    </>
  )
}

export default function LabSuggestions({ open, onClose, onSelect }: LabSuggestionsProps) {
  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      {open && <LabSuggestionsContent onClose={onClose} onSelect={onSelect} />}
    </Dialog>
  )
}
