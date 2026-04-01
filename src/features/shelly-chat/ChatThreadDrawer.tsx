import { useCallback, useState } from 'react'
import AddIcon from '@mui/icons-material/Add'
import MoreVertIcon from '@mui/icons-material/MoreVert'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Divider from '@mui/material/Divider'
import Drawer from '@mui/material/Drawer'
import IconButton from '@mui/material/IconButton'
import List from '@mui/material/List'
import ListItemButton from '@mui/material/ListItemButton'
import ListItemText from '@mui/material/ListItemText'
import Menu from '@mui/material/Menu'
import MenuItem from '@mui/material/MenuItem'
import TextField from '@mui/material/TextField'
import Typography from '@mui/material/Typography'
import type { ChatThread, ChatContext } from '../../core/types'

function formatRelativeTime(dateStr: string): string {
  const date = new Date(dateStr)
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffMin = Math.floor(diffMs / 60_000)
  const diffHr = Math.floor(diffMs / 3_600_000)
  const diffDays = Math.floor(diffMs / 86_400_000)

  if (diffMin < 1) return 'Just now'
  if (diffMin < 60) return `${diffMin}m ago`
  if (diffHr < 24) return `${diffHr}h ago`
  if (diffDays === 1) return 'Yesterday'
  if (diffDays < 7) {
    return date.toLocaleDateString([], { weekday: 'long' })
  }
  return date.toLocaleDateString([], { month: 'short', day: 'numeric' })
}

interface ChatThreadDrawerProps {
  open: boolean
  onClose: () => void
  threads: ChatThread[]
  activeThreadId: string | null
  chatContext: ChatContext
  onSelectThread: (threadId: string) => void
  onNewThread: () => void
  onArchiveThread: (threadId: string) => void
  onRenameThread: (threadId: string, newTitle: string) => void
}

export default function ChatThreadDrawer({
  open,
  onClose,
  threads,
  activeThreadId,
  chatContext,
  onSelectThread,
  onNewThread,
  onArchiveThread,
  onRenameThread,
}: ChatThreadDrawerProps) {
  const [menuAnchor, setMenuAnchor] = useState<HTMLElement | null>(null)
  const [menuThreadId, setMenuThreadId] = useState<string | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editTitle, setEditTitle] = useState('')

  const handleMenuOpen = useCallback(
    (e: React.MouseEvent<HTMLElement>, threadId: string) => {
      e.stopPropagation()
      setMenuAnchor(e.currentTarget)
      setMenuThreadId(threadId)
    },
    [],
  )

  const handleMenuClose = useCallback(() => {
    setMenuAnchor(null)
    setMenuThreadId(null)
  }, [])

  const handleRenameStart = useCallback(() => {
    if (!menuThreadId) return
    const thread = threads.find((t) => t.id === menuThreadId)
    setEditingId(menuThreadId)
    setEditTitle(thread?.title || '')
    handleMenuClose()
  }, [menuThreadId, threads, handleMenuClose])

  const handleRenameSubmit = useCallback(() => {
    if (editingId && editTitle.trim()) {
      onRenameThread(editingId, editTitle.trim())
    }
    setEditingId(null)
    setEditTitle('')
  }, [editingId, editTitle, onRenameThread])

  const handleRenameCancel = useCallback(() => {
    setEditingId(null)
    setEditTitle('')
  }, [])

  const handleArchive = useCallback(() => {
    if (menuThreadId) {
      onArchiveThread(menuThreadId)
    }
    handleMenuClose()
  }, [menuThreadId, onArchiveThread, handleMenuClose])

  return (
    <Drawer
      open={open}
      onClose={onClose}
      sx={{
        '& .MuiDrawer-paper': {
          width: { xs: '85vw', sm: 280 },
          maxWidth: 280,
        },
      }}
    >
      <Box sx={{ p: 2, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <Typography variant="h6">
          {chatContext === 'lincoln' ? "Lincoln's Conversations" :
           chatContext === 'london' ? "London's Conversations" :
           'General Conversations'}
        </Typography>
        <Button
          startIcon={<AddIcon />}
          size="small"
          onClick={() => {
            onNewThread()
            onClose()
          }}
        >
          New Chat
        </Button>
      </Box>
      <Divider />
      <Box sx={{ flex: 1, overflow: 'auto' }}>
        {threads.length === 0 ? (
          <Typography
            variant="body2"
            color="text.secondary"
            sx={{ textAlign: 'center', mt: 4, px: 2 }}
          >
            No conversations yet
          </Typography>
        ) : (
          <List disablePadding>
            {threads.map((thread) => (
              <ListItemButton
                key={thread.id}
                selected={thread.id === activeThreadId}
                onClick={() => onSelectThread(thread.id)}
                sx={{ pr: 1 }}
              >
                <ListItemText
                  primary={
                    editingId === thread.id ? (
                      <TextField
                        size="small"
                        value={editTitle}
                        onChange={(e) => setEditTitle(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') handleRenameSubmit()
                          if (e.key === 'Escape') handleRenameCancel()
                        }}
                        onBlur={handleRenameSubmit}
                        autoFocus
                        fullWidth
                        onClick={(e) => e.stopPropagation()}
                      />
                    ) : (
                      <Typography variant="body2" noWrap>
                        {thread.title}
                      </Typography>
                    )
                  }
                  secondary={
                    editingId !== thread.id && (
                      <Box component="span" sx={{ display: 'flex', justifyContent: 'space-between' }}>
                        <Typography
                          variant="caption"
                          color="text.secondary"
                          noWrap
                          sx={{ flex: 1, mr: 1 }}
                        >
                          {thread.lastMessagePreview}
                        </Typography>
                        <Typography variant="caption" color="text.secondary" sx={{ flexShrink: 0 }}>
                          {formatRelativeTime(thread.updatedAt)}
                        </Typography>
                      </Box>
                    )
                  }
                />
                {editingId !== thread.id && (
                  <IconButton
                    size="small"
                    onClick={(e) => handleMenuOpen(e, thread.id)}
                    aria-label="Thread options"
                  >
                    <MoreVertIcon fontSize="small" />
                  </IconButton>
                )}
              </ListItemButton>
            ))}
          </List>
        )}
      </Box>
      <Menu
        anchorEl={menuAnchor}
        open={Boolean(menuAnchor)}
        onClose={handleMenuClose}
      >
        <MenuItem onClick={handleRenameStart}>Rename</MenuItem>
        <MenuItem onClick={handleArchive}>Archive</MenuItem>
      </Menu>
    </Drawer>
  )
}
