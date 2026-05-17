import { useRef, useState } from 'react'
import type { RefObject } from 'react'
import ExpandMoreIcon from '@mui/icons-material/ExpandMore'
import SendIcon from '@mui/icons-material/Send'
import Box from '@mui/material/Box'
import ButtonBase from '@mui/material/ButtonBase'
import CircularProgress from '@mui/material/CircularProgress'
import Collapse from '@mui/material/Collapse'
import IconButton from '@mui/material/IconButton'
import Stack from '@mui/material/Stack'
import TextField from '@mui/material/TextField'
import Typography from '@mui/material/Typography'

import type { ChatMessage } from '../../core/types'
import PlannerChatMessages from './PlannerChatMessages'

interface PlannerChatDrawerProps {
  messages: ChatMessage[]
  inputText: string
  onInputChange: (v: string) => void
  onSend: () => void
  loading: boolean
  /** Used to scroll chat to bottom on new messages. If omitted, drawer maintains its own ref. */
  messagesEndRef?: RefObject<HTMLDivElement | null>
}

export default function PlannerChatDrawer({
  messages,
  inputText,
  onInputChange,
  onSend,
  loading,
  messagesEndRef,
}: PlannerChatDrawerProps) {
  const [open, setOpen] = useState(false)
  const internalEndRef = useRef<HTMLDivElement>(null)
  const endRef = messagesEndRef ?? internalEndRef

  const handleToggle = () => {
    setOpen((prev) => !prev)
  }

  return (
    <Box
      sx={{
        border: '1px solid',
        borderColor: 'divider',
        borderRadius: 2,
        bgcolor: 'background.paper',
        overflow: 'hidden',
      }}
    >
      <ButtonBase
        onClick={handleToggle}
        sx={{
          width: '100%',
          px: 2,
          py: 1.25,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          textAlign: 'left',
        }}
        aria-expanded={open}
        aria-controls="planner-chat-drawer-content"
      >
        <Typography variant="body2" color="text.secondary">
          Free-form chat (advanced)
        </Typography>
        <ExpandMoreIcon
          fontSize="small"
          sx={{
            transition: 'transform 200ms',
            transform: open ? 'rotate(180deg)' : 'rotate(0deg)',
          }}
        />
      </ButtonBase>
      <Collapse in={open} timeout="auto" unmountOnExit>
        <Box id="planner-chat-drawer-content" sx={{ px: 2, pb: 2, borderTop: '1px solid', borderColor: 'divider', pt: 1.5 }}>
          {messages.length === 0 && (
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1 }}>
              Use chat for things the form above can&apos;t handle — e.g., &quot;make Wednesday lighter,&quot; &quot;add a science project on Thursday.&quot;
            </Typography>
          )}
          <PlannerChatMessages messages={messages} messagesEndRef={endRef} />
          <Stack direction="row" spacing={1} alignItems="flex-end" sx={{ mt: 1 }}>
            <TextField
              fullWidth
              size="small"
              placeholder='e.g. "swap Tue and Thu", "add extra reading Friday"...'
              value={inputText}
              onChange={(e) => onInputChange(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault()
                  onSend()
                }
              }}
            />
            <IconButton
              onClick={onSend}
              color="primary"
              disabled={!inputText.trim() || loading}
              aria-label="send chat message"
            >
              {loading ? <CircularProgress size={24} /> : <SendIcon />}
            </IconButton>
          </Stack>
        </Box>
      </Collapse>
    </Box>
  )
}
