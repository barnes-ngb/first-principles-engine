import type { RefObject } from 'react'
import Box from '@mui/material/Box'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'

import type { ChatMessage } from '../../core/types'
import { ChatMessageRole } from '../../core/types/enums'
import { fixUnicodeEscapes } from '../../core/utils/format'

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
        {messages.map((msg) => (
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
            {msg.text && (
              <Typography variant="body2" sx={{ whiteSpace: 'pre-line' }}>
                {fixUnicodeEscapes(msg.text)}
              </Typography>
            )}
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
        ))}
        <div ref={messagesEndRef} />
      </Stack>
    </Box>
  )
}
