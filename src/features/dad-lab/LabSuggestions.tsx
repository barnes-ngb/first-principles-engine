import { useCallback, useEffect, useState } from 'react'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Card from '@mui/material/Card'
import CardContent from '@mui/material/CardContent'
import Chip from '@mui/material/Chip'
import CircularProgress from '@mui/material/CircularProgress'
import Dialog from '@mui/material/Dialog'
import DialogContent from '@mui/material/DialogContent'
import DialogTitle from '@mui/material/DialogTitle'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'

import { useAI, TaskType } from '../../core/ai/useAI'
import { useFamilyId } from '../../core/auth/useAuth'
import { useChildren } from '../../core/hooks/useChildren'
import type { DadLabType } from '../../core/types/enums'

interface Prefill {
  title: string
  question: string
  labType: DadLabType
  description: string
  materials?: string[]
  lincolnRole?: string
  londonRole?: string
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
  question: string
  description: string
  materials: string
  lincolnRole: string
  londonRole: string
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

function parseSuggestions(text: string): ParsedSuggestion[] {
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
      question: get('Question'),
      description: get('Description'),
      materials: get('Materials'),
      lincolnRole: get("Lincoln's role") || get('Lincoln'),
      londonRole: get("London's role") || get('London'),
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
        question: get('Question') || get('Driving question'),
        description: get('Description') || get('Brief') || get('Overview'),
        materials: get('Materials'),
        lincolnRole: get("Lincoln's role") || get('Lincoln'),
        londonRole: get("London's role") || get('London'),
        duration: get('Duration'),
      })
    }
  }

  // Final fallback: return the whole text as one suggestion
  if (suggestions.length === 0 && text.trim()) {
    suggestions.push({
      title: 'AI Suggested Lab',
      type: 'science',
      question: '',
      description: text.trim(),
      materials: '',
      lincolnRole: '',
      londonRole: '',
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
  const { children } = useChildren()
  const { chat, loading: aiLoading } = useAI()
  const [suggestions, setSuggestions] = useState<ParsedSuggestion[]>([])
  const [rawText, setRawText] = useState('')
  const [error, setError] = useState<string | null>(null)

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
        messages: [
          {
            role: 'user',
            content: `Suggest 3 Dad Lab activities for this Saturday.

Context:
- Lincoln (10, neurodivergent, loves Minecraft/building/art)
- London (6, loves drawing and stories)
- Both boys
- Lab types: science, engineering, adventure, or heart/character
- Keep to 45-90 minutes, household materials preferred
- Lincoln should lead hard parts and teach London after
- London assists, observes, and creates (drawing, decorating)

For each suggestion, respond in EXACTLY this format:

---
Title: [name]
Type: [science/engineering/adventure/heart]
Question: [the driving question to explore]
Description: [what you'll do, 2-3 sentences]
Materials: [comma-separated list of materials needed]
Lincoln's role: [what he does — predict, build, measure, explain]
London's role: [what he does — observe, draw, help, decorate]
Duration: [estimated minutes]
---

Give exactly 3 suggestions separated by ---. Make them different types.`,
          },
        ],
      })

      if (response?.message) {
        setRawText(response.message)
        const parsed = parseSuggestions(response.message)
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
    fetchSuggestions()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

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
        lincolnRole: suggestion.lincolnRole || undefined,
        londonRole: suggestion.londonRole || undefined,
        duration: parseDuration(suggestion.duration),
      })
    },
    [onSelect],
  )

  return (
    <>
      <DialogTitle>Lab Suggestions</DialogTitle>
      <DialogContent>
        {aiLoading && (
          <Stack alignItems="center" spacing={2} sx={{ py: 4 }}>
            <CircularProgress />
            <Typography color="text.secondary">Thinking up lab ideas...</Typography>
          </Stack>
        )}

        {error && (
          <Stack spacing={1} sx={{ py: 2 }}>
            <Typography color="error">{error}</Typography>
            <Button variant="outlined" size="small" onClick={fetchSuggestions}>
              Try Again
            </Button>
          </Stack>
        )}

        {!aiLoading && suggestions.length > 0 && (
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
                  {s.materials && (
                    <Box sx={{ mt: 1 }}>
                      <Typography variant="caption" color="text.secondary">
                        Materials:
                      </Typography>
                      <Typography variant="body2">{s.materials}</Typography>
                    </Box>
                  )}
                  <Stack direction="row" spacing={2} sx={{ mt: 1 }}>
                    {s.lincolnRole && (
                      <Box sx={{ flex: 1 }}>
                        <Typography variant="caption" color="primary">
                          Lincoln:
                        </Typography>
                        <Typography variant="body2">{s.lincolnRole}</Typography>
                      </Box>
                    )}
                    {s.londonRole && (
                      <Box sx={{ flex: 1 }}>
                        <Typography variant="caption" color="primary">
                          London:
                        </Typography>
                        <Typography variant="body2">{s.londonRole}</Typography>
                      </Box>
                    )}
                  </Stack>
                </CardContent>
              </Card>
            ))}
          </Stack>
        )}

        {/* Show raw text if parsing yielded only fallback */}
        {!aiLoading && rawText && suggestions.length === 1 && suggestions[0].title === 'AI Suggested Lab' && (
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
