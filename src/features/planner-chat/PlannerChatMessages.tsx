import type { RefObject } from 'react'
import Box from '@mui/material/Box'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'

import { stripPlannerBoundaryMarkers } from '../../../functions/src/shared/plannerBoundary'
import type { ChatMessage } from '../../core/types'
import { ChatMessageRole } from '../../core/types/enums'
import { fixUnicodeEscapes } from '../../core/utils/format'
import PlannerBoundaryLink from './PlannerBoundaryLink'

interface PlannerChatMessagesProps {
  messages: ChatMessage[]
  messagesEndRef: RefObject<HTMLDivElement | null>
}

export default function PlannerChatMessages({ messages, messagesEndRef }: PlannerChatMessagesProps) {
  if (messages.length === 0) return null

  return (
    <Box
      sx={{
        overflowY: 'auto',
        maxHeight: '35vh',
        border: '1px solid',
        borderColor: 'divider',
        borderRadius: 2,
        p: 2,
        bgcolor: 'grey.50',
      }}
    >
      <Stack spacing={1.5}>
        {messages.map((msg) => {
          // The strip runs here as well as at parse time — the SAME function,
          // called twice, not a second stripper. FEAT-135's shape was a block
          // stripped in one path while a second path rendered the raw reply, so
          // a call site that forgets to parse still cannot leak `[[BOUNDARY:…]]`
          // into a sentence Shelly reads.
          //
          // Assistant turns only: the marker is something the MODEL writes, and
          // a belt that also ran over her own turns would silently eat text a
          // parent typed. Swallowing her words to tidy up after the model is a
          // worse failure than the one this guards.
          const isAssistant = msg.role === ChatMessageRole.Assistant
          const text = !msg.text ? '' : isAssistant ? stripPlannerBoundaryMarkers(msg.text) : msg.text
          return (
            <Box
              key={msg.id}
              sx={{
                alignSelf: msg.role === ChatMessageRole.User ? 'flex-end' : 'flex-start',
                maxWidth: '85%',
                bgcolor: msg.role === ChatMessageRole.User ? 'primary.main' : 'background.paper',
                color: msg.role === ChatMessageRole.User ? 'primary.contrastText' : 'text.primary',
                px: 2,
                py: 1,
                borderRadius: 2,
                boxShadow: 1,
              }}
            >
              {text && (
                <Typography variant="body2" sx={{ whiteSpace: 'pre-line' }}>
                  {fixUnicodeEscapes(text)}
                </Typography>
              )}
              {/* The offer follows the refusal (FEAT-195's rule): a boundary that
                  names only what it can't do reads as a wall. */}
              {msg.boundaryJobId && <PlannerBoundaryLink jobId={msg.boundaryJobId} />}
              {msg.photoLabels && msg.photoLabels.length > 0 && (
                <Stack direction="row" spacing={0.5} flexWrap="wrap" useFlexGap sx={{ mt: 0.5 }}>
                  {msg.photoLabels.map((label, i) => (
                    <Typography key={i} variant="caption">
                      {label.subjectBucket}: {label.lessonOrPages || 'page'} ({label.estimatedMinutes}m)
                    </Typography>
                  ))}
                </Stack>
              )}
            </Box>
          )
        })}
        <div ref={messagesEndRef} />
      </Stack>
    </Box>
  )
}
