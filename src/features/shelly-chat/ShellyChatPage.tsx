import { useCallback, useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import AddIcon from '@mui/icons-material/Add'
import ImageIcon from '@mui/icons-material/Image'
import MenuIcon from '@mui/icons-material/Menu'
import SendIcon from '@mui/icons-material/Send'
import AppBar from '@mui/material/AppBar'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import CircularProgress from '@mui/material/CircularProgress'
import Dialog from '@mui/material/Dialog'
import DialogActions from '@mui/material/DialogActions'
import DialogContent from '@mui/material/DialogContent'
import DialogTitle from '@mui/material/DialogTitle'
import IconButton from '@mui/material/IconButton'
import Paper from '@mui/material/Paper'
import Stack from '@mui/material/Stack'
import TextField from '@mui/material/TextField'
import Toolbar from '@mui/material/Toolbar'
import Typography from '@mui/material/Typography'
import {
  addDoc,
  doc,
  increment,
  limit,
  onSnapshot,
  orderBy,
  query,
  updateDoc,
  where,
} from 'firebase/firestore'

import { useAI, TaskType } from '../../core/ai/useAI'
import { useFamilyId } from '../../core/auth/useAuth'
import {
  shellyChatMessagesCollection,
  shellyChatThreadsCollection,
} from '../../core/firebase/firestore'
import { useActiveChild } from '../../core/hooks/useActiveChild'
import type { ChatMessage, ChatThread } from '../../core/types'
import ChatMessageBubble from './ChatMessageBubble'
import ChatThreadDrawer from './ChatThreadDrawer'

const SUGGESTIONS = [
  {
    label: 'Sight word activity ideas',
    message: 'What are some fun ways to practice sight words with Lincoln?',
  },
  {
    label: 'Quick London activity',
    message: 'I need a quick 10-minute activity for London while I work with Lincoln',
  },
  {
    label: 'Reading progress check',
    message: 'Help me understand where Lincoln is with reading and what to focus on',
  },
] as const

export default function ShellyChatPage() {
  const familyId = useFamilyId()
  const { activeChild } = useActiveChild()
  const { chat, generateImage } = useAI()

  const [searchParams, setSearchParams] = useSearchParams()
  const [threads, setThreads] = useState<ChatThread[]>([])
  const [activeThreadId, setActiveThreadId] = useState<string | null>(
    searchParams.get('thread'),
  )
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [imageDialogOpen, setImageDialogOpen] = useState(false)
  const [imagePromptText, setImagePromptText] = useState('')
  const [generatingImage, setGeneratingImage] = useState(false)

  const messagesEndRef = useRef<HTMLDivElement>(null)
  const autoSendTriggered = useRef(false)

  // ── Real-time thread list ──────────────────────────────────────
  useEffect(() => {
    const q = query(
      shellyChatThreadsCollection(familyId),
      where('archived', '==', false),
      orderBy('updatedAt', 'desc'),
      limit(20),
    )
    const unsub = onSnapshot(
      q,
      (snap) => {
        const items = snap.docs.map((d) => ({
          ...(d.data() as Omit<ChatThread, 'id'>),
          id: d.id,
        })) as ChatThread[]
        setThreads(items)
      },
      (err) => console.error('Thread list listener error:', err),
    )
    return unsub
  }, [familyId])

  // ── Real-time messages ─────────────────────────────────────────
  useEffect(() => {
    if (!activeThreadId) {
      setMessages([])
      autoSendTriggered.current = false
      return
    }
    const q = query(
      shellyChatMessagesCollection(familyId, activeThreadId),
      orderBy('timestamp', 'asc'),
    )
    const unsub = onSnapshot(
      q,
      (snap) => {
        const items = snap.docs.map((d) => ({
          ...(d.data() as Omit<ChatMessage, 'id'>),
          id: d.id,
        })) as ChatMessage[]
        setMessages(items)
      },
      (err) => console.error('Messages listener error:', err),
    )
    return unsub
  }, [familyId, activeThreadId])

  // ── Auto-scroll on new messages ────────────────────────────────
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  // ── Auto-send for pre-seeded threads ───────────────────────────
  useEffect(() => {
    if (
      activeThreadId &&
      messages.length === 1 &&
      messages[0].role === 'user' &&
      !autoSendTriggered.current &&
      !sending
    ) {
      autoSendTriggered.current = true
      sendToAI(messages)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messages, activeThreadId])

  // ── Send to AI (shared logic) ──────────────────────────────────
  const sendToAI = useCallback(
    async (currentMessages: ChatMessage[]) => {
      if (!activeThreadId) return
      setSending(true)
      try {
        const aiMessages = currentMessages.slice(-20).map((m) => ({
          role: m.role as 'user' | 'assistant',
          content: m.content,
        }))
        const response = await chat({
          familyId,
          childId: activeChild?.id ?? '',
          taskType: TaskType.ShellyChat,
          messages: aiMessages,
        })
        if (response?.message) {
          await addDoc(shellyChatMessagesCollection(familyId, activeThreadId), {
            role: 'assistant',
            content: response.message,
            timestamp: new Date().toISOString(),
          })
          await updateDoc(
            doc(shellyChatThreadsCollection(familyId), activeThreadId),
            {
              updatedAt: new Date().toISOString(),
              messageCount: increment(1),
              lastMessagePreview: response.message.slice(0, 100),
            },
          )
        }
      } catch (err) {
        console.error('Failed to get AI response:', err)
      } finally {
        setSending(false)
      }
    },
    [activeThreadId, chat, familyId, activeChild?.id],
  )

  // ── Send handler ───────────────────────────────────────────────
  const handleSend = useCallback(async () => {
    const text = input.trim()
    if (!text || sending) return

    setInput('')
    setSending(true)

    try {
      let threadId = activeThreadId

      // Create new thread if needed
      if (!threadId) {
        const threadRef = await addDoc(shellyChatThreadsCollection(familyId), {
          title: text.slice(0, 60),
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          messageCount: 0,
          lastMessagePreview: text.slice(0, 100),
          archived: false,
        })
        threadId = threadRef.id
        setActiveThreadId(threadId)
        setSearchParams({ thread: threadId })
      }

      // Add user message
      await addDoc(shellyChatMessagesCollection(familyId, threadId), {
        role: 'user',
        content: text,
        timestamp: new Date().toISOString(),
      })
      await updateDoc(
        doc(shellyChatThreadsCollection(familyId), threadId),
        {
          updatedAt: new Date().toISOString(),
          messageCount: increment(1),
          lastMessagePreview: text.slice(0, 100),
        },
      )

      // Get AI response
      const currentMsgs = [...messages, { id: '', role: 'user' as const, content: text, timestamp: new Date().toISOString() }]
      const aiMessages = currentMsgs.slice(-20).map((m) => ({
        role: m.role as 'user' | 'assistant',
        content: m.content,
      }))

      const response = await chat({
        familyId,
        childId: activeChild?.id ?? '',
        taskType: TaskType.ShellyChat,
        messages: aiMessages,
      })

      if (response?.message) {
        await addDoc(shellyChatMessagesCollection(familyId, threadId), {
          role: 'assistant',
          content: response.message,
          timestamp: new Date().toISOString(),
        })
        await updateDoc(
          doc(shellyChatThreadsCollection(familyId), threadId),
          {
            updatedAt: new Date().toISOString(),
            messageCount: increment(1),
            lastMessagePreview: response.message.slice(0, 100),
          },
        )
      }
    } catch (err) {
      console.error('Failed to send message:', err)
    } finally {
      setSending(false)
    }
  }, [input, sending, activeThreadId, familyId, messages, chat, activeChild?.id, setSearchParams])

  // ── Image generation ───────────────────────────────────────────
  const handleGenerateImage = useCallback(async () => {
    const prompt = imagePromptText.trim()
    if (!prompt) return

    setImageDialogOpen(false)
    setImagePromptText('')
    setGeneratingImage(true)

    try {
      let threadId = activeThreadId

      if (!threadId) {
        const threadRef = await addDoc(shellyChatThreadsCollection(familyId), {
          title: `🎨 ${prompt.slice(0, 50)}`,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          messageCount: 0,
          lastMessagePreview: `🎨 ${prompt.slice(0, 90)}`,
          archived: false,
        })
        threadId = threadRef.id
        setActiveThreadId(threadId)
        setSearchParams({ thread: threadId })
      }

      // Add user message with image prompt
      await addDoc(shellyChatMessagesCollection(familyId, threadId), {
        role: 'user',
        content: `🎨 ${prompt}`,
        timestamp: new Date().toISOString(),
        imagePrompt: prompt,
      })
      await updateDoc(
        doc(shellyChatThreadsCollection(familyId), threadId),
        {
          updatedAt: new Date().toISOString(),
          messageCount: increment(1),
        },
      )

      // Generate image
      const result = await generateImage({
        familyId,
        prompt,
        style: 'general',
        size: '1024x1024',
      })

      if (result?.url) {
        await addDoc(shellyChatMessagesCollection(familyId, threadId), {
          role: 'assistant',
          content: result.revisedPrompt || 'Here\'s your generated image:',
          timestamp: new Date().toISOString(),
          imageUrl: result.url,
        })
        await updateDoc(
          doc(shellyChatThreadsCollection(familyId), threadId),
          {
            updatedAt: new Date().toISOString(),
            messageCount: increment(1),
            lastMessagePreview: '🎨 Image generated',
          },
        )
      }
    } catch (err) {
      console.error('Failed to generate image:', err)
    } finally {
      setGeneratingImage(false)
    }
  }, [imagePromptText, activeThreadId, familyId, generateImage, setSearchParams])

  // ── New thread ─────────────────────────────────────────────────
  const handleNewThread = useCallback(() => {
    setActiveThreadId(null)
    setMessages([])
    setSearchParams({})
    setDrawerOpen(false)
    autoSendTriggered.current = false
  }, [setSearchParams])

  // ── Select thread ──────────────────────────────────────────────
  const handleSelectThread = useCallback(
    (threadId: string) => {
      setActiveThreadId(threadId)
      setSearchParams({ thread: threadId })
      setDrawerOpen(false)
      autoSendTriggered.current = false
    },
    [setSearchParams],
  )

  // ── Archive thread ─────────────────────────────────────────────
  const handleArchiveThread = useCallback(
    async (threadId: string) => {
      try {
        await updateDoc(
          doc(shellyChatThreadsCollection(familyId), threadId),
          { archived: true },
        )
        if (activeThreadId === threadId) {
          handleNewThread()
        }
      } catch (err) {
        console.error('Failed to archive thread:', err)
      }
    },
    [familyId, activeThreadId, handleNewThread],
  )

  // ── Rename thread ──────────────────────────────────────────────
  const handleRenameThread = useCallback(
    async (threadId: string, newTitle: string) => {
      try {
        await updateDoc(
          doc(shellyChatThreadsCollection(familyId), threadId),
          { title: newTitle },
        )
      } catch (err) {
        console.error('Failed to rename thread:', err)
      }
    },
    [familyId],
  )

  // ── Key handler for input ──────────────────────────────────────
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault()
        handleSend()
      }
    },
    [handleSend],
  )

  const showEmpty = !activeThreadId && messages.length === 0

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100vh', maxHeight: '100dvh' }}>
      {/* AppBar */}
      <AppBar position="static" color="default" elevation={1}>
        <Toolbar>
          <IconButton edge="start" onClick={() => setDrawerOpen(true)} aria-label="Open threads">
            <MenuIcon />
          </IconButton>
          <Typography variant="h6" sx={{ flex: 1, ml: 1 }}>
            Ask AI
          </Typography>
          <Button startIcon={<AddIcon />} onClick={handleNewThread} size="small">
            New
          </Button>
        </Toolbar>
      </AppBar>

      {/* Thread drawer */}
      <ChatThreadDrawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        threads={threads}
        activeThreadId={activeThreadId}
        onSelectThread={handleSelectThread}
        onNewThread={handleNewThread}
        onArchiveThread={handleArchiveThread}
        onRenameThread={handleRenameThread}
      />

      {/* Messages area */}
      <Box sx={{ flex: 1, overflow: 'auto', px: 2, py: 2 }}>
        {showEmpty ? (
          <Box
            sx={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              height: '100%',
              textAlign: 'center',
              gap: 2,
            }}
          >
            <Typography variant="h5">Hi Shelly 👋</Typography>
            <Typography variant="body2" color="text.secondary" sx={{ maxWidth: 320 }}>
              Ask me anything about teaching, activities, curriculum ideas, or just chat.
            </Typography>
            <Stack spacing={1} sx={{ mt: 1, width: '100%', maxWidth: 360 }}>
              {SUGGESTIONS.map((s) => (
                <Button
                  key={s.label}
                  variant="outlined"
                  size="small"
                  onClick={() => setInput(s.message)}
                  sx={{ textTransform: 'none', justifyContent: 'flex-start' }}
                >
                  {s.label}
                </Button>
              ))}
            </Stack>
          </Box>
        ) : (
          <>
            {messages.map((msg) => (
              <ChatMessageBubble key={msg.id} message={msg} />
            ))}
            {(sending || generatingImage) && (
              <Box sx={{ display: 'flex', mb: 1.5 }}>
                <Box
                  sx={{
                    px: 2,
                    py: 1,
                    borderRadius: '16px 16px 16px 4px',
                    bgcolor: 'grey.100',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 1,
                  }}
                >
                  <CircularProgress size={16} />
                  <Typography variant="body2" color="text.secondary">
                    {generatingImage ? 'Generating image...' : 'Thinking...'}
                  </Typography>
                </Box>
              </Box>
            )}
            <div ref={messagesEndRef} />
          </>
        )}
      </Box>

      {/* Input area */}
      <Paper elevation={2} sx={{ p: 1.5, borderTop: '1px solid', borderColor: 'divider' }}>
        <Box sx={{ display: 'flex', alignItems: 'flex-end', gap: 0.5 }}>
          <IconButton
            onClick={() => setImageDialogOpen(true)}
            disabled={sending || generatingImage}
            size="small"
            aria-label="Generate image"
          >
            <ImageIcon />
          </IconButton>
          <TextField
            fullWidth
            multiline
            maxRows={4}
            size="small"
            placeholder="Ask Shelly's AI..."
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={sending || generatingImage}
            sx={{ '& .MuiOutlinedInput-root': { borderRadius: 3 } }}
          />
          <IconButton
            onClick={handleSend}
            disabled={!input.trim() || sending || generatingImage}
            color="primary"
            size="small"
            aria-label="Send message"
          >
            <SendIcon />
          </IconButton>
        </Box>
      </Paper>

      {/* Image generation dialog */}
      <Dialog
        open={imageDialogOpen}
        onClose={() => setImageDialogOpen(false)}
        fullWidth
        maxWidth="sm"
      >
        <DialogTitle>Generate an Image</DialogTitle>
        <DialogContent>
          <TextField
            autoFocus
            fullWidth
            multiline
            rows={3}
            placeholder="Describe what you want..."
            value={imagePromptText}
            onChange={(e) => setImagePromptText(e.target.value)}
            sx={{ mt: 1 }}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setImageDialogOpen(false)}>Cancel</Button>
          <Button
            variant="contained"
            onClick={handleGenerateImage}
            disabled={!imagePromptText.trim()}
          >
            Generate
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  )
}
