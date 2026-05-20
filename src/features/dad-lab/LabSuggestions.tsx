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

import { doc, getDoc } from 'firebase/firestore'

import { useAI, TaskType } from '../../core/ai/useAI'
import { useFamilyId } from '../../core/auth/useAuth'
import { useChildren } from '../../core/hooks/useChildren'
import type { DadLabType } from '../../core/types/enums'
import { db } from '../../core/firebase/firestore'
import { weekKeyFromDate } from '../../core/utils/dateKey'

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
  framework: string
  question: string
  description: string
  phases: string
  materials: string
  lincolnRole: string
  londonRole: string
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
      framework: get('Framework'),
      question: get('Question'),
      description: get('Description'),
      phases: get('Phases'),
      materials: get('Materials'),
      lincolnRole: get("Lincoln's role") || get('Lincoln'),
      londonRole: get("London's role") || get('London'),
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
        lincolnRole: get("Lincoln's role") || get('Lincoln'),
        londonRole: get("London's role") || get('London'),
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
      lincolnRole: '',
      londonRole: '',
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
        messages: [
          {
            role: 'user',
            content: `Suggest 3 Dad Lab activities for this Saturday.

Context:
- Lincoln (10, neurodivergent, loves Minecraft/building/art)
- London (6, loves drawing and stories)
- Both boys
- Keep to 45-90 minutes, household materials preferred
- Lincoln should lead hard parts and teach London after
- London assists, observes, and creates (drawing, decorating)

DAD LAB TYPES AND FRAMEWORKS:

TYPE 1: EXPERIMENT (science) — Scientific Method
Framework: Question → Hypothesis → Test → Observe → Conclude
- Prediction step: "Lincoln, what do you THINK will happen when we...?"
- Testing step: Hands-on experiment with clear variables
- Observation step: "What did we actually see? Was it what you expected?"
- Conclusion step: "Why do you think it happened that way?"
- Lincoln teaches London: Explain the result simply
Example: "Does a heavy ball fall faster than a light ball?"

TYPE 2: BUILD (engineering) — Engineering Design
Framework: Problem → Design → Build → Test → Improve
- Define the problem: "We need a bridge that holds this weight"
- Design phase: Sketch on paper first
- Build phase: Construct with available materials
- Test phase: Does it work? How well?
- Improve phase: What would you change? Build version 2.
Example: "Build a catapult that launches a marshmallow into a cup"

TYPE 3: EXPLORE (adventure) — Discovery/Nature
Framework: Wonder → Observe → Document → Research → Share
- Go outside or to a location
- Observe and document (photos, sketches, notes)
- Research what you found
- Lincoln explains to London what they learned
Example: "What lives in our backyard soil?"

TYPE 4: CREATE (heart) — Making/Art/Character
Framework: Inspiration → Plan → Make → Reflect → Display
- Less rigid structure, process matters more than outcome
- Focus on decisions and problem-solving during creation
- Lincoln describes his creative choices
- Connect to a virtue or character theme
Example: "Build a Minecraft diorama with real materials"

For each suggestion:
1. STATE THE TYPE: e.g. "Type: science" (uses Scientific Method framework)
2. LIST THE PHASES for that type with estimated time per phase
3. INCLUDE both boys: Lincoln's role + London's role
4. NOTE the teaching moment: "After the test, Lincoln explains to London why..."
5. CONNECT to school: "This connects to [subject] because..."
6. MATERIALS: List what Nathan needs, flag anything that needs advance purchase

Respond in EXACTLY this format:

---
Title: [name]
Type: [science/engineering/adventure/heart]
Framework: [e.g. "Question → Hypothesis → Test → Observe → Conclude"]
Question: [the driving question to explore]
Description: [what you'll do, 2-3 sentences]
Phases: [Phase 1 (Xmin) → Phase 2 (Xmin) → Phase 3 (Xmin)]
Materials: [comma-separated list of materials needed]
Lincoln's role: [what he does — predict, build, measure, explain]
London's role: [what he does — observe, draw, help, decorate]
Teaching moment: [when/how Lincoln teaches London]
Subject connection: [what subject this connects to and why]
Duration: [estimated total minutes]
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
        {(aiLoading || childrenLoading) && (
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
