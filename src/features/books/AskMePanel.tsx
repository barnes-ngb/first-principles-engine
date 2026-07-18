import Box from '@mui/material/Box'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'

import type { ComprehensionQuestion } from './useComprehensionQuestions'
import { fallbackQuestions, orderAskMe } from './askMePanel.logic'

interface Props {
  childName: string
  /** Comprehension data (same source as the default-mode panel). Questions ONLY are shown. */
  questions: ComprehensionQuestion[]
  /** True while questions are still generating — shows a gentle "more coming" hint. */
  loading?: boolean
}

/**
 * Ask-Me panel — the Story Call (`?call=1`) back-cover surface, read over a video
 * call by a far-away grandparent while the tablet screen is shared.
 *
 * It renders the SAME comprehension data as {@link ComprehensionQuestions} but with a
 * different contract: it addresses the *asker* ("Your turn! Ask {child}…"), shows the
 * **questions only** — never the `answer` field, no reveal buttons, no answered-count,
 * no ✅/❌, no `%`. This is a broadcast surface, not an evaluation surface (charter:
 * no grades, no shame). Order is opinion → inference → recall so the call opens warm.
 *
 * The panel must NEVER be blank on a live call — if generation is empty or failed, it
 * falls back to three static prompts.
 */
export default function AskMePanel({ childName, questions, loading = false }: Props) {
  const name = childName.trim() || 'them'
  const ordered = orderAskMe(questions)
  // Never blank on a live call: real questions when we have them, static prompts otherwise.
  const prompts = ordered.length > 0 ? ordered.map((q) => q.question) : fallbackQuestions(childName)

  return (
    <Stack spacing={2.5} sx={{ width: '100%', maxWidth: 640, mx: 'auto', py: 2 }}>
      <Typography
        component="h2"
        sx={{ fontWeight: 800, fontSize: '1.6rem', lineHeight: 1.3, textAlign: 'center' }}
      >
        Your turn! Ask {name}…
      </Typography>

      {prompts.map((q, i) => (
        <Box
          key={i}
          sx={{
            p: 2.5,
            borderRadius: 3,
            border: '2px solid',
            borderColor: 'primary.main',
            bgcolor: 'rgba(255,255,255,0.06)',
          }}
        >
          <Typography sx={{ fontSize: '1.35rem', lineHeight: 1.45, fontWeight: 600 }}>
            {q}
          </Typography>
        </Box>
      ))}

      {loading && ordered.length === 0 && (
        <Typography sx={{ textAlign: 'center', opacity: 0.6, fontSize: '0.95rem' }}>
          more questions coming…
        </Typography>
      )}
    </Stack>
  )
}
