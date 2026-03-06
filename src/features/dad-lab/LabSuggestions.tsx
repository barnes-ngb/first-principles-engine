import { useCallback, useEffect, useState } from 'react'
import Button from '@mui/material/Button'
import Card from '@mui/material/Card'
import CardActionArea from '@mui/material/CardActionArea'
import CardContent from '@mui/material/CardContent'
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
}

const LAB_TYPE_MAP: Record<string, DadLabType> = {
  science: 'science',
  engineering: 'engineering',
  adventure: 'adventure',
  heart: 'heart',
}

function parseLabType(raw: string): DadLabType {
  const lower = raw.toLowerCase().trim()
  return LAB_TYPE_MAP[lower] ?? 'science'
}

function parseSuggestions(text: string): ParsedSuggestion[] {
  // Try to parse structured suggestions from AI response
  // Look for numbered items with title, type, question patterns
  const suggestions: ParsedSuggestion[] = []
  const blocks = text.split(/(?=\d+[.)]\s)/).filter((b) => b.trim())

  for (const block of blocks) {
    const titleMatch = block.match(/(?:title|name)[:\s]*["']?([^"'\n]+)["']?/i)
    const typeMatch = block.match(/(?:type|category)[:\s]*["']?(\w+)["']?/i)
    const questionMatch = block.match(/(?:question|driving question)[:\s]*["']?([^"'\n]+)["']?/i)
    const descMatch = block.match(/(?:description|brief|overview)[:\s]*["']?([^"'\n]+)["']?/i)

    if (titleMatch) {
      suggestions.push({
        title: titleMatch[1].trim(),
        type: typeMatch?.[1]?.trim() ?? 'science',
        question: questionMatch?.[1]?.trim() ?? '',
        description: descMatch?.[1]?.trim() ?? '',
      })
    }
  }

  // Fallback: if parsing failed, return the whole text as one suggestion
  if (suggestions.length === 0 && text.trim()) {
    suggestions.push({
      title: 'AI Suggested Lab',
      type: 'science',
      question: '',
      description: text.trim(),
    })
  }

  return suggestions
}

function LabSuggestionsContent({ onClose, onSelect }: Omit<LabSuggestionsProps, 'open'>) {
  const familyId = useFamilyId()
  const { children } = useChildren()
  const { chat, loading: aiLoading } = useAI()
  const [suggestions, setSuggestions] = useState<ParsedSuggestion[]>([])
  const [rawText, setRawText] = useState('')
  const [error, setError] = useState<string | null>(null)

  const fetchSuggestions = useCallback(async () => {
    if (!children.length) return
    setSuggestions([])
    setRawText('')
    setError(null)

    const response = await chat({
      familyId,
      childId: children[0]?.id ?? '',
      taskType: TaskType.Chat,
      messages: [
        {
          role: 'user',
          content: `Suggest 3 Dad Lab activities for this Saturday. Consider:
- Lincoln (10, neurodivergent, loves Minecraft/Lego/Art), London (6, story-driven, loves drawing)
- Lab types: science, engineering, adventure, or heart/character
- Keep to 45-90 minutes, household materials preferred
- Include what each kid does at their level
- Include a driving question

For each suggestion provide:
Title: [name]
Type: [science/engineering/adventure/heart]
Question: [the driving question]
Description: [brief overview and materials needed]
Lincoln's role: [what he does]
London's role: [what she does]`,
        },
      ],
    })

    if (response?.message) {
      setRawText(response.message)
      setSuggestions(parseSuggestions(response.message))
    } else {
      setError('No suggestions received. Try again later.')
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
          <Typography color="error" sx={{ py: 2 }}>
            {error}
          </Typography>
        )}

        {!aiLoading && suggestions.length > 0 && (
          <Stack spacing={1.5} sx={{ pb: 1 }}>
            {suggestions.map((s, i) => (
              <Card key={i} variant="outlined">
                <CardActionArea onClick={() => handleSelect(s)}>
                  <CardContent>
                    <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
                      {s.title}
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      {s.type}
                    </Typography>
                    {s.question && (
                      <Typography variant="body2" sx={{ mt: 0.5, fontStyle: 'italic' }}>
                        &ldquo;{s.question}&rdquo;
                      </Typography>
                    )}
                    {s.description && (
                      <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
                        {s.description}
                      </Typography>
                    )}
                  </CardContent>
                </CardActionArea>
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
