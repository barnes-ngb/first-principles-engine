import { useCallback, useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import AddIcon from '@mui/icons-material/Add'
import AddPhotoAlternateIcon from '@mui/icons-material/AddPhotoAlternate'
import AutoFixHighIcon from '@mui/icons-material/AutoFixHigh'
import ChatBubbleOutlineIcon from '@mui/icons-material/ChatBubbleOutline'
import CloseIcon from '@mui/icons-material/Close'
import HistoryIcon from '@mui/icons-material/History'
import ImageIcon from '@mui/icons-material/Image'
import SendIcon from '@mui/icons-material/Send'
import VisibilityIcon from '@mui/icons-material/Visibility'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Chip from '@mui/material/Chip'
import CircularProgress from '@mui/material/CircularProgress'
import Dialog from '@mui/material/Dialog'
import DialogActions from '@mui/material/DialogActions'
import DialogContent from '@mui/material/DialogContent'
import IconButton from '@mui/material/IconButton'
import LinearProgress from '@mui/material/LinearProgress'
import Paper from '@mui/material/Paper'
import Stack from '@mui/material/Stack'
import Tab from '@mui/material/Tab'
import Tabs from '@mui/material/Tabs'
import TextField from '@mui/material/TextField'
import Typography from '@mui/material/Typography'
import {
  addDoc,
  doc,
  getDocs,
  increment,
  limit,
  onSnapshot,
  orderBy,
  query,
  updateDoc,
  where,
  writeBatch,
} from 'firebase/firestore'
import { getDownloadURL, ref, uploadBytes } from 'firebase/storage'

import { useAI, TaskType } from '../../core/ai/useAI'
import { useFamilyId } from '../../core/auth/useAuth'
import { compressIfNeeded } from '../../core/utils/compressImage'
import {
  db,
  shellyChatMessagesCollection,
  shellyChatThreadsCollection,
} from '../../core/firebase/firestore'
import { storage } from '../../core/firebase/storage'
import { useActiveChild } from '../../core/hooks/useActiveChild'
import type { ShellyChatMessage, ChatThread, ChatContext } from '../../core/types'
import ChatMessageBubble from './ChatMessageBubble'
import ChatThreadDrawer from './ChatThreadDrawer'

const SUGGESTIONS_BY_CONTEXT: Record<ChatContext, { greeting: string; subtitle: string; suggestions: ReadonlyArray<{ label: string; message: string }> }> = {
  lincoln: {
    greeting: "Lincoln's Learning Space \u{1F3AE}",
    subtitle: "Ask about Lincoln's reading progress, activity ideas, skill recommendations, or anything related to his learning.",
    suggestions: [
      { label: 'Reading progress check', message: "How is Lincoln doing with reading? What should we focus on this week based on his evaluations?" },
      { label: 'Sight word activities', message: 'What are some fun, hands-on ways to practice sight words with Lincoln?' },
      { label: 'What to work on next', message: "Based on Lincoln's skill snapshot and recent evaluations, what should be our priority this week?" },
    ],
  },
  london: {
    greeting: "London's Creative Corner \u{1F3A8}",
    subtitle: "Ask about London's progress, story ideas, creative activities, or anything related to his learning.",
    suggestions: [
      { label: 'Story activity ideas', message: 'What are some creative story or drawing activities for London this week?' },
      { label: 'Learning through art', message: "How can I tie London's love of drawing into our academic goals?" },
      { label: 'Quick independent activity', message: 'I need a quick 10-minute activity for London while I work with Lincoln.' },
    ],
  },
  general: {
    greeting: "Hi Shelly \u{1F44B}",
    subtitle: "Ask me anything \u2014 teaching ideas, curriculum questions, scheduling, or just vent about your day.",
    suggestions: [
      { label: 'Weekly planning help', message: "Help me think through this week's plan. What should I prioritize?" },
      { label: 'Low energy day ideas', message: "I'm having a low energy day. What's the most important thing to cover with the boys?" },
      { label: 'Curriculum question', message: 'I have a question about our curriculum approach.' },
    ],
  },
}

// ── Image refinement types ─────────────────────────────────────

interface RefinementQuestion {
  question: string
  options: string[]
}

export default function ShellyChatPage() {
  const familyId = useFamilyId()
  const { activeChildId, children } = useActiveChild()
  const { chat, generateImage } = useAI()

  const [searchParams, setSearchParams] = useSearchParams()
  const [chatContext, setChatContext] = useState<ChatContext>('general')
  const [threads, setThreads] = useState<ChatThread[]>([])
  const [activeThreadId, setActiveThreadId] = useState<string | null>(
    searchParams.get('thread'),
  )
  const [messages, setMessages] = useState<ShellyChatMessage[]>([])
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [generatingImage, setGeneratingImage] = useState(false)

  // ── Image upload state (Prompt 8) ──────────────────────────────
  const [uploadPreview, setUploadPreview] = useState<string | null>(null)
  const [uploadFile, setUploadFile] = useState<File | null>(null)
  const [uploading, setUploading] = useState(false)
  const [uploadDialogOpen, setUploadDialogOpen] = useState(false)
  const [pendingAttachment, setPendingAttachment] = useState<{ url: string; previewUrl: string } | null>(null)
  const [pendingReferenceImage, setPendingReferenceImage] = useState<{ url: string; previewUrl: string } | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // ── Image refinement state (Prompt 9) ──────────────────────────
  const [imageFlowOpen, setImageFlowOpen] = useState(false)
  const [imageFlowStep, setImageFlowStep] = useState<'idea' | 'questions' | 'generating'>('idea')
  const [imageIdea, setImageIdea] = useState('')
  const [imageQuestions, setImageQuestions] = useState<RefinementQuestion[]>([])
  const [imageAnswers, setImageAnswers] = useState<Record<number, string>>({})
  const [loadingQuestions, setLoadingQuestions] = useState(false)

  // ── Follow-up suggestions state ─────────────────────────────────
  const [followUps, setFollowUps] = useState<string[]>([])

  const messagesEndRef = useRef<HTMLDivElement>(null)
  const autoSendTriggered = useRef(false)

  const activeThread = threads.find((t) => t.id === activeThreadId)

  // ── Initialize context from URL param or active child ─────────
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const contextParam = params.get('context') as ChatContext | null

    if (contextParam && ['lincoln', 'london', 'general'].includes(contextParam)) {
      setChatContext(contextParam)
    } else if (activeChildId) {
      const child = children.find(c => c.id === activeChildId)
      if (child) {
        const name = child.name.toLowerCase()
        if (name === 'lincoln' || name === 'london') {
          setChatContext(name)
        }
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []) // Only on mount

  // ── Migrate old threads without chatContext ────────────────────
  useEffect(() => {
    const migrateOldThreads = async () => {
      try {
        const oldThreads = await getDocs(
          query(shellyChatThreadsCollection(familyId), where('archived', '==', false))
        )
        const batch = writeBatch(db)
        let needsMigration = false
        for (const threadDoc of oldThreads.docs) {
          if (!threadDoc.data().chatContext) {
            batch.update(threadDoc.ref, { chatContext: 'general' })
            needsMigration = true
          }
        }
        if (needsMigration) {
          await batch.commit()
          console.log('[shellyChat] Migrated old threads to general context')
        }
      } catch (err) {
        console.warn('[shellyChat] Thread migration error:', err)
      }
    }
    migrateOldThreads()
  }, [familyId])

  // ── Context change handler ────────────────────────────────────
  const handleContextChange = useCallback((_: unknown, val: ChatContext | null) => {
    if (!val) return
    setChatContext(val)
    setActiveThreadId(null)
    setMessages([])
    setFollowUps([])
    setSearchParams({})
    autoSendTriggered.current = false
  }, [setSearchParams])

  // ── Map chatContext to childId for AI calls ───────────────────
  const getChildIdForContext = useCallback((): string => {
    if (chatContext === 'general') return ''
    const child = children.find(c => c.name.toLowerCase() === chatContext)
    return child?.id || ''
  }, [chatContext, children])

  // ── Real-time thread list (filtered by chatContext) ───────────
  useEffect(() => {
    const q = query(
      shellyChatThreadsCollection(familyId),
      where('archived', '==', false),
      where('chatContext', '==', chatContext),
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
  }, [familyId, chatContext])

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
          ...(d.data() as Omit<ShellyChatMessage, 'id'>),
          id: d.id,
        })) as ShellyChatMessage[]
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

  // ── Follow-up parser ────────────────────────────────────────────
  const parseFollowUps = (text: string): { cleanText: string; followUps: string[] } => {
    const lines = text.split('\n')
    const followUpItems: string[] = []
    const contentLines: string[] = []

    for (const line of lines) {
      const match = line.match(/^\[FOLLOWUP\]\s*(.+)/)
      if (match) {
        followUpItems.push(match[1].trim())
      } else {
        contentLines.push(line)
      }
    }

    return {
      cleanText: contentLines.join('\n').trimEnd(),
      followUps: followUpItems.slice(0, 3),
    }
  }

  // ── Send to AI (shared logic) ──────────────────────────────────
  const sendToAI = useCallback(
    async (currentMessages: ShellyChatMessage[]) => {
      if (!activeThreadId) return
      setSending(true)
      try {
        const aiMessages = currentMessages.slice(-20).map((m) => ({
          role: m.role as 'user' | 'assistant',
          content: m.uploadedImageUrl && m.imageAction === 'analyze'
            ? `[IMAGE_URL:${m.uploadedImageUrl}]\n${m.content}`
            : m.content,
        }))
        const response = await chat({
          familyId,
          childId: getChildIdForContext(),
          taskType: TaskType.ShellyChat,
          messages: aiMessages,
        })
        if (response?.message) {
          const { cleanText, followUps: suggestions } = parseFollowUps(response.message)
          setFollowUps(suggestions)
          await addDoc(shellyChatMessagesCollection(familyId, activeThreadId), {
            role: 'assistant',
            content: cleanText,
            timestamp: new Date().toISOString(),
          })
          await updateDoc(
            doc(shellyChatThreadsCollection(familyId), activeThreadId),
            {
              updatedAt: new Date().toISOString(),
              messageCount: increment(1),
              lastMessagePreview: cleanText.slice(0, 100),
            },
          )
        }
      } catch (err) {
        console.error('Failed to get AI response:', err)
      } finally {
        setSending(false)
      }
    },
    [activeThreadId, chat, familyId, getChildIdForContext],
  )

  // ── Send handler ───────────────────────────────────────────────
  const handleSend = useCallback(async () => {
    const text = input.trim()
    if (!text || sending) return

    setInput('')
    setFollowUps([])
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
          chatContext,
          archived: false,
        })
        threadId = threadRef.id
        setActiveThreadId(threadId)
        setSearchParams({ thread: threadId })
      }

      // Add user message (with optional pending attachment)
      const userMsgData: Record<string, unknown> = {
        role: 'user',
        content: text,
        timestamp: new Date().toISOString(),
      }
      if (pendingAttachment) {
        userMsgData.uploadedImageUrl = pendingAttachment.url
        userMsgData.imageAction = 'attach'
      }
      await addDoc(shellyChatMessagesCollection(familyId, threadId), userMsgData)
      await updateDoc(
        doc(shellyChatThreadsCollection(familyId), threadId),
        {
          updatedAt: new Date().toISOString(),
          messageCount: increment(1),
          lastMessagePreview: text.slice(0, 100),
        },
      )

      // Get AI response — include image URL for vision if attached
      const aiContent = pendingAttachment
        ? `[IMAGE_URL:${pendingAttachment.url}]\n${text}`
        : text
      if (pendingAttachment) {
        URL.revokeObjectURL(pendingAttachment.previewUrl)
        setPendingAttachment(null)
      }

      const currentMsgs = [...messages, { id: '', role: 'user' as const, content: aiContent, timestamp: new Date().toISOString() }]
      const aiMessages = currentMsgs.slice(-20).map((m) => ({
        role: m.role as 'user' | 'assistant',
        content: m.content,
      }))

      const response = await chat({
        familyId,
        childId: getChildIdForContext(),
        taskType: TaskType.ShellyChat,
        messages: aiMessages,
      })

      if (response?.message) {
        const { cleanText, followUps: suggestions } = parseFollowUps(response.message)
        setFollowUps(suggestions)
        await addDoc(shellyChatMessagesCollection(familyId, threadId), {
          role: 'assistant',
          content: cleanText,
          timestamp: new Date().toISOString(),
        })
        await updateDoc(
          doc(shellyChatThreadsCollection(familyId), threadId),
          {
            updatedAt: new Date().toISOString(),
            messageCount: increment(1),
            lastMessagePreview: cleanText.slice(0, 100),
          },
        )
      }
    } catch (err) {
      console.error('Failed to send message:', err)
    } finally {
      setSending(false)
    }
  }, [input, sending, activeThreadId, familyId, messages, chat, getChildIdForContext, setSearchParams, pendingAttachment, chatContext])

  // ── Image generation (refactored for Prompt 9) ─────────────────
  const handleGenerateImageDirect = useCallback(async (prompt: string) => {
    if (!prompt.trim()) return

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
          chatContext,
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
  }, [activeThreadId, familyId, generateImage, setSearchParams, chatContext])

  // ── Image refinement flow (Prompt 9) ───────────────────────────

  const handleImageFlowOpen = useCallback(() => {
    setImageFlowOpen(true)
    setImageFlowStep('idea')
    setImageIdea('')
    setImageQuestions([])
    setImageAnswers({})
  }, [])

  const handleImageFlowClose = useCallback(() => {
    setImageFlowOpen(false)
    setImageIdea('')
    setImageQuestions([])
    setImageAnswers({})
    setLoadingQuestions(false)
    if (pendingReferenceImage) {
      URL.revokeObjectURL(pendingReferenceImage.previewUrl)
      setPendingReferenceImage(null)
    }
  }, [pendingReferenceImage])

  const handleImageIdeaSubmit = useCallback(async () => {
    const idea = imageIdea.trim()
    if (!idea) return

    setLoadingQuestions(true)
    setImageFlowStep('questions')

    // Set a 5-second timeout
    const timeoutId = setTimeout(() => {
      setLoadingQuestions(false)
      // Auto-skip to direct generation if too slow
      setImageFlowStep('generating')
      handleImageFlowClose()
      handleGenerateImageDirect(idea)
    }, 5000)

    try {
      const response = await chat({
        familyId,
        childId: getChildIdForContext(),
        taskType: TaskType.ShellyChat,
        messages: [{
          role: 'user',
          content: `[IMAGE_REFINEMENT] The user wants to generate an image. Their description: "${idea}". Ask 2-3 quick clarifying questions to help create the perfect image. For each question, provide 3-4 short suggested answers they can tap, plus an "Other" option. Format your response as JSON only, no other text:
{
  "questions": [
    {
      "question": "What style?",
      "options": ["Realistic photo", "Cartoon/illustrated", "Minecraft-style", "Watercolor"]
    }
  ]
}`,
        }],
      })

      clearTimeout(timeoutId)

      if (response?.message) {
        try {
          // Extract JSON from response (handle markdown code blocks)
          let jsonStr = response.message
          const jsonMatch = jsonStr.match(/\{[\s\S]*"questions"[\s\S]*\}/)
          if (jsonMatch) jsonStr = jsonMatch[0]
          const parsed = JSON.parse(jsonStr) as { questions: RefinementQuestion[] }
          if (parsed.questions?.length) {
            setImageQuestions(parsed.questions)
            setLoadingQuestions(false)
            return
          }
        } catch {
          // JSON parse failed — fall through to direct generation
        }
      }

      // Fallback: skip to direct generation
      setLoadingQuestions(false)
      handleImageFlowClose()
      handleGenerateImageDirect(idea)
    } catch {
      clearTimeout(timeoutId)
      setLoadingQuestions(false)
      handleImageFlowClose()
      handleGenerateImageDirect(idea)
    }
  }, [imageIdea, chat, familyId, getChildIdForContext, handleImageFlowClose, handleGenerateImageDirect])

  const handleImageRefinementGenerate = useCallback(async () => {
    setImageFlowStep('generating')

    // Build refined prompt via Claude
    const selectedOptions = Object.entries(imageAnswers)
      .map(([idx, val]) => {
        const q = imageQuestions[Number(idx)]
        return q ? `${q.question}: ${val}` : val
      })
      .join('. ')

    try {
      const response = await chat({
        familyId,
        childId: getChildIdForContext(),
        taskType: TaskType.ShellyChat,
        messages: [{
          role: 'user',
          content: `[BUILD_IMAGE_PROMPT] Original idea: "${imageIdea}". Preferences: ${selectedOptions}. Write a detailed DALL-E image prompt (1-2 sentences) that incorporates these preferences. Respond with ONLY the prompt text, nothing else.`,
        }],
      })

      let refinedPrompt = response?.message?.trim() || imageIdea

      // If there's a reference image, have Claude describe it and fold that into the prompt
      const refImage = pendingReferenceImage
      if (refImage) {
        try {
          const descResult = await chat({
            familyId,
            childId: getChildIdForContext(),
            taskType: TaskType.ShellyChat,
            messages: [{
              role: 'user',
              content: `[IMAGE_URL:${refImage.url}]\nDescribe this image in detail for use as a DALL-E prompt reference. Focus on style, colors, composition, and subject matter. Respond with ONLY the description, 2-3 sentences.`,
            }],
          })
          if (descResult?.message) {
            refinedPrompt = `${refinedPrompt}. Reference style: ${descResult.message.trim()}`
          }
        } catch {
          // Proceed without reference description
        }
      }

      // Clean up reference image before generating
      if (pendingReferenceImage) {
        URL.revokeObjectURL(pendingReferenceImage.previewUrl)
        setPendingReferenceImage(null)
      }
      setImageFlowOpen(false)
      setImageIdea('')
      setImageQuestions([])
      setImageAnswers({})
      setLoadingQuestions(false)

      await handleGenerateImageDirect(refinedPrompt)
    } catch {
      if (pendingReferenceImage) {
        URL.revokeObjectURL(pendingReferenceImage.previewUrl)
        setPendingReferenceImage(null)
      }
      setImageFlowOpen(false)
      setImageIdea('')
      setImageQuestions([])
      setImageAnswers({})
      setLoadingQuestions(false)
      await handleGenerateImageDirect(imageIdea)
    }
  }, [imageAnswers, imageQuestions, imageIdea, chat, familyId, getChildIdForContext, handleGenerateImageDirect, pendingReferenceImage])

  const handleJustGenerate = useCallback(async () => {
    const idea = imageIdea.trim()
    if (!idea) return

    let finalPrompt = idea

    // If there's a reference image, have Claude describe it
    const refImage = pendingReferenceImage
    if (refImage) {
      setImageFlowStep('generating')
      try {
        const descResult = await chat({
          familyId,
          childId: getChildIdForContext(),
          taskType: TaskType.ShellyChat,
          messages: [{
            role: 'user',
            content: `[IMAGE_URL:${refImage.url}]\nDescribe this image in detail for use as a DALL-E prompt reference. Focus on style, colors, composition, and subject matter. Respond with ONLY the description, 2-3 sentences.`,
          }],
        })
        if (descResult?.message) {
          finalPrompt = `${idea}. Reference style: ${descResult.message.trim()}`
        }
      } catch {
        // Proceed without reference description
      }
    }

    if (pendingReferenceImage) {
      URL.revokeObjectURL(pendingReferenceImage.previewUrl)
      setPendingReferenceImage(null)
    }
    setImageFlowOpen(false)
    setImageIdea('')
    setImageQuestions([])
    setImageAnswers({})
    setLoadingQuestions(false)

    await handleGenerateImageDirect(finalPrompt)
  }, [imageIdea, handleGenerateImageDirect, pendingReferenceImage, chat, familyId, getChildIdForContext])

  // ── Image upload handlers (Prompt 8) ───────────────────────────

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    // Reset the input so the same file can be re-selected
    e.target.value = ''

    setUploadFile(file)
    setUploadPreview(URL.createObjectURL(file))
    setUploadDialogOpen(true)
  }, [])

  const handleUploadCancel = useCallback(() => {
    if (uploadPreview) URL.revokeObjectURL(uploadPreview)
    setUploadDialogOpen(false)
    setUploadFile(null)
    setUploadPreview(null)
  }, [uploadPreview])

  const handleUploadContext = useCallback(async () => {
    if (!uploadFile || !uploadPreview) return

    setUploadDialogOpen(false)
    setUploading(true)

    try {
      const compressed = await compressIfNeeded(uploadFile, 2 * 1024 * 1024, { maxWidth: 1600, maxHeight: 1600 })

      let threadId = activeThreadId

      if (!threadId) {
        const threadRef = await addDoc(shellyChatThreadsCollection(familyId), {
          title: 'New conversation',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          messageCount: 0,
          lastMessagePreview: '',
          chatContext,
          archived: false,
        })
        threadId = threadRef.id
        setActiveThreadId(threadId)
        setSearchParams({ thread: threadId })
      }

      const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
      const storagePath = `families/${familyId}/chat-uploads/${threadId}/${timestamp}.jpg`
      const storageRef = ref(storage, storagePath)
      await uploadBytes(storageRef, compressed)
      const downloadUrl = await getDownloadURL(storageRef)

      // Keep the preview URL alive for the attachment strip
      setPendingAttachment({ url: downloadUrl, previewUrl: uploadPreview })
    } catch (err) {
      console.error('Failed to upload image for attachment:', err)
      if (uploadPreview) URL.revokeObjectURL(uploadPreview)
    } finally {
      setUploadFile(null)
      setUploadPreview(null)
      setUploading(false)
    }
  }, [uploadFile, uploadPreview, activeThreadId, familyId, setSearchParams])

  const handleUploadAnalyze = useCallback(async () => {
    if (!uploadFile) return

    setUploadDialogOpen(false)
    setUploading(true)

    try {
      const compressed = await compressIfNeeded(uploadFile, 2 * 1024 * 1024, { maxWidth: 1600, maxHeight: 1600 })

      let threadId = activeThreadId

      if (!threadId) {
        const threadRef = await addDoc(shellyChatThreadsCollection(familyId), {
          title: '📷 Image analysis',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          messageCount: 0,
          lastMessagePreview: '📷 Analyzing image...',
          chatContext,
          archived: false,
        })
        threadId = threadRef.id
        setActiveThreadId(threadId)
        setSearchParams({ thread: threadId })
      }

      const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
      const storagePath = `families/${familyId}/chat-uploads/${threadId}/${timestamp}.jpg`
      const storageRef = ref(storage, storagePath)
      await uploadBytes(storageRef, compressed)
      const downloadUrl = await getDownloadURL(storageRef)

      const content = 'What can you tell me about this image?'

      await addDoc(shellyChatMessagesCollection(familyId, threadId), {
        role: 'user',
        content,
        timestamp: new Date().toISOString(),
        uploadedImageUrl: downloadUrl,
        imageAction: 'analyze',
      })
      await updateDoc(
        doc(shellyChatThreadsCollection(familyId), threadId),
        {
          updatedAt: new Date().toISOString(),
          messageCount: increment(1),
          lastMessagePreview: content.slice(0, 100),
        },
      )

      setSending(true)
      setUploading(false)

      const currentMsgs = [...messages, {
        id: '', role: 'user' as const, content: `[IMAGE_URL:${downloadUrl}]\n${content}`, timestamp: new Date().toISOString(),
      }]
      const aiMessages = currentMsgs.slice(-20).map((m) => ({
        role: m.role as 'user' | 'assistant',
        content: m.content,
      }))

      const response = await chat({
        familyId,
        childId: getChildIdForContext(),
        taskType: TaskType.ShellyChat,
        messages: aiMessages,
      })

      if (response?.message) {
        const { cleanText, followUps: suggestions } = parseFollowUps(response.message)
        setFollowUps(suggestions)
        await addDoc(shellyChatMessagesCollection(familyId, threadId), {
          role: 'assistant',
          content: cleanText,
          timestamp: new Date().toISOString(),
        })
        await updateDoc(
          doc(shellyChatThreadsCollection(familyId), threadId),
          {
            updatedAt: new Date().toISOString(),
            messageCount: increment(1),
            lastMessagePreview: cleanText.slice(0, 100),
          },
        )
      }
    } catch (err) {
      console.error('Failed to analyze image:', err)
    } finally {
      if (uploadPreview) URL.revokeObjectURL(uploadPreview)
      setUploadFile(null)
      setUploadPreview(null)
      setUploading(false)
      setSending(false)
    }
  }, [uploadFile, uploadPreview, activeThreadId, familyId, messages, chat, getChildIdForContext, setSearchParams])

  const handleUploadGenerate = useCallback(async () => {
    if (!uploadFile || !uploadPreview) return

    setUploadDialogOpen(false)
    setUploading(true)

    try {
      const compressed = await compressIfNeeded(uploadFile, 2 * 1024 * 1024, { maxWidth: 1600, maxHeight: 1600 })

      let threadId = activeThreadId

      if (!threadId) {
        const threadRef = await addDoc(shellyChatThreadsCollection(familyId), {
          title: '🎨 Image creation',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          messageCount: 0,
          lastMessagePreview: '🎨 Using as reference...',
          chatContext,
          archived: false,
        })
        threadId = threadRef.id
        setActiveThreadId(threadId)
        setSearchParams({ thread: threadId })
      }

      const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
      const storagePath = `families/${familyId}/chat-uploads/${threadId}/${timestamp}.jpg`
      const storageRef = ref(storage, storagePath)
      await uploadBytes(storageRef, compressed)
      const downloadUrl = await getDownloadURL(storageRef)

      // Store as reference image and open the refinement flow
      setPendingReferenceImage({ url: downloadUrl, previewUrl: uploadPreview })
      setImageFlowOpen(true)
      setImageFlowStep('idea')
      setImageIdea('')
      setImageQuestions([])
      setImageAnswers({})
    } catch (err) {
      console.error('Failed to upload reference image:', err)
      if (uploadPreview) URL.revokeObjectURL(uploadPreview)
    } finally {
      setUploadFile(null)
      setUploadPreview(null)
      setUploading(false)
    }
  }, [uploadFile, uploadPreview, activeThreadId, familyId, setSearchParams])

  // ── New thread ─────────────────────────────────────────────────
  const handleNewThread = useCallback(() => {
    setActiveThreadId(null)
    setMessages([])
    setSearchParams({})
    setDrawerOpen(false)
    setFollowUps([])
    autoSendTriggered.current = false
  }, [setSearchParams])

  // ── Select thread ──────────────────────────────────────────────
  const handleSelectThread = useCallback(
    (threadId: string) => {
      setActiveThreadId(threadId)
      setSearchParams({ thread: threadId })
      setDrawerOpen(false)
      setFollowUps([])
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
  const isBusy = sending || generatingImage || uploading

  return (
    <Box data-page="chat" sx={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0, flex: 1 }}>
      {/* Slim toolbar row */}
      <Box sx={{ display: 'flex', alignItems: 'center', px: 1, py: 0.5, borderBottom: 1, borderColor: 'divider' }}>
        <IconButton size="small" onClick={() => setDrawerOpen(true)} aria-label="Conversations">
          <HistoryIcon />
        </IconButton>
        <Typography
          variant="body2"
          color="text.secondary"
          noWrap
          sx={{ flex: 1, ml: 1 }}
        >
          {activeThread?.title || 'New conversation'}
        </Typography>
        <Button size="small" startIcon={<AddIcon />} onClick={handleNewThread}>
          New
        </Button>
      </Box>

      {/* Context tabs */}
      <Tabs
        value={chatContext}
        onChange={handleContextChange}
        variant="fullWidth"
        sx={{
          minHeight: 36,
          '& .MuiTab-root': { minHeight: 36, py: 0.5, textTransform: 'none', fontSize: '0.875rem' },
        }}
      >
        <Tab value="lincoln" label="Lincoln" />
        <Tab value="london" label="London" />
        <Tab value="general" label="General" />
      </Tabs>

      {/* Thread drawer */}
      <ChatThreadDrawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        threads={threads}
        activeThreadId={activeThreadId}
        chatContext={chatContext}
        onSelectThread={handleSelectThread}
        onNewThread={handleNewThread}
        onArchiveThread={handleArchiveThread}
        onRenameThread={handleRenameThread}
      />

      {/* Messages area */}
      <Box sx={{ flex: 1, overflow: 'auto', px: 2, py: 2, minHeight: 0 }}>
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
            <Typography variant="h5">{SUGGESTIONS_BY_CONTEXT[chatContext].greeting}</Typography>
            <Typography variant="body2" color="text.secondary" sx={{ maxWidth: 320 }}>
              {SUGGESTIONS_BY_CONTEXT[chatContext].subtitle}
            </Typography>
            <Stack spacing={1} sx={{ mt: 1, width: '100%', maxWidth: 360 }}>
              {SUGGESTIONS_BY_CONTEXT[chatContext].suggestions.map((s) => (
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
            {isBusy && (
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
                    {uploading ? 'Uploading image...' : generatingImage ? 'Generating image...' : 'Thinking...'}
                  </Typography>
                </Box>
              </Box>
            )}
            <div ref={messagesEndRef} />
          </>
        )}
      </Box>

      {/* Image refinement panel (Prompt 9) */}
      {imageFlowOpen && (
        <Paper
          elevation={4}
          sx={{
            borderRadius: '16px 16px 0 0',
            p: 2,
            maxHeight: '60vh',
            overflow: 'auto',
            borderTop: 1,
            borderColor: 'divider',
          }}
        >
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1.5 }}>
            <Typography variant="subtitle2">Create an Image</Typography>
            <IconButton size="small" onClick={handleImageFlowClose}>
              <CloseIcon fontSize="small" />
            </IconButton>
          </Box>

          {pendingReferenceImage && (
            <Box sx={{ textAlign: 'center', mb: 1.5 }}>
              <Box
                component="img"
                src={pendingReferenceImage.previewUrl}
                alt="Reference"
                sx={{ maxHeight: 120, borderRadius: 2, objectFit: 'contain' }}
              />
              <Typography variant="caption" display="block" color="text.secondary">
                Using as reference
              </Typography>
            </Box>
          )}

          {imageFlowStep === 'idea' && (
            <Box>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
                What would you like me to create?
              </Typography>
              <TextField
                fullWidth
                size="small"
                placeholder="e.g., something for our reading corner"
                value={imageIdea}
                onChange={(e) => setImageIdea(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault()
                    handleImageIdeaSubmit()
                  }
                }}
                autoFocus
                sx={{ mb: 1 }}
              />
              <Box sx={{ display: 'flex', gap: 1, justifyContent: 'flex-end' }}>
                <Button
                  size="small"
                  variant="text"
                  disabled={!imageIdea.trim()}
                  onClick={handleJustGenerate}
                >
                  Just generate
                </Button>
                <Button
                  size="small"
                  variant="contained"
                  disabled={!imageIdea.trim()}
                  onClick={handleImageIdeaSubmit}
                >
                  Next
                </Button>
              </Box>
            </Box>
          )}

          {imageFlowStep === 'questions' && loadingQuestions && (
            <Box sx={{ textAlign: 'center', py: 2 }}>
              <CircularProgress size={24} />
              <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
                Getting suggestions...
              </Typography>
              <Button size="small" sx={{ mt: 1 }} onClick={handleJustGenerate}>
                Just generate with what I have
              </Button>
            </Box>
          )}

          {imageFlowStep === 'questions' && !loadingQuestions && imageQuestions.length > 0 && (
            <Box>
              {imageQuestions.map((q, qIdx) => (
                <Box key={qIdx} sx={{ mb: 2 }}>
                  <Typography variant="body2" fontWeight={500} sx={{ mb: 0.5 }}>
                    {q.question}
                  </Typography>
                  <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
                    {q.options.map((opt) => (
                      <Chip
                        key={opt}
                        label={opt}
                        size="small"
                        variant={imageAnswers[qIdx] === opt ? 'filled' : 'outlined'}
                        color={imageAnswers[qIdx] === opt ? 'primary' : 'default'}
                        onClick={() => setImageAnswers((prev) => ({ ...prev, [qIdx]: opt }))}
                      />
                    ))}
                  </Box>
                </Box>
              ))}
              <Box sx={{ display: 'flex', gap: 1, justifyContent: 'flex-end' }}>
                <Button size="small" variant="text" onClick={handleJustGenerate}>
                  Just generate
                </Button>
                <Button
                  size="small"
                  variant="contained"
                  onClick={handleImageRefinementGenerate}
                >
                  Generate
                </Button>
              </Box>
            </Box>
          )}

          {imageFlowStep === 'generating' && (
            <Box sx={{ textAlign: 'center', py: 2 }}>
              <CircularProgress size={24} />
              <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
                Creating your image...
              </Typography>
            </Box>
          )}
        </Paper>
      )}

      {/* Follow-up suggestions */}
      {followUps.length > 0 && !sending && (
        <Box sx={{ px: 1, pb: 0.5, display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
          {followUps.map((q, i) => (
            <Chip
              key={i}
              label={q}
              size="small"
              variant="outlined"
              onClick={() => {
                setInput(q)
                setFollowUps([])
              }}
              sx={{ fontSize: '0.75rem' }}
            />
          ))}
        </Box>
      )}

      {/* Input area */}
      <Paper elevation={2} sx={{ p: 1.5, borderTop: '1px solid', borderColor: 'divider' }}>
        {uploading && <LinearProgress sx={{ mb: 1 }} />}
        {pendingAttachment && (
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1, px: 0.5 }}>
            <Box
              component="img"
              src={pendingAttachment.previewUrl}
              alt="Attached"
              sx={{ width: 36, height: 36, borderRadius: 1, objectFit: 'cover' }}
            />
            <Typography variant="caption" color="text.secondary" sx={{ flex: 1 }}>
              Image attached — type your question
            </Typography>
            <IconButton size="small" onClick={() => {
              URL.revokeObjectURL(pendingAttachment.previewUrl)
              setPendingAttachment(null)
            }} aria-label="Remove attachment">
              <CloseIcon fontSize="small" />
            </IconButton>
          </Box>
        )}
        <Box sx={{ display: 'flex', alignItems: 'flex-end', gap: 0.5 }}>
          {/* Hidden file input for image upload (no capture attr — shows camera + gallery picker) */}
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            onChange={handleFileSelect}
            style={{ display: 'none' }}
          />
          <IconButton
            onClick={() => fileInputRef.current?.click()}
            disabled={isBusy}
            size="small"
            aria-label="Upload image"
          >
            <AddPhotoAlternateIcon />
          </IconButton>
          <IconButton
            onClick={handleImageFlowOpen}
            disabled={isBusy}
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
            onChange={(e) => { setInput(e.target.value); if (followUps.length) setFollowUps([]) }}
            onKeyDown={handleKeyDown}
            disabled={isBusy}
            sx={{ '& .MuiOutlinedInput-root': { borderRadius: 3 } }}
          />
          <IconButton
            onClick={handleSend}
            disabled={!input.trim() || isBusy}
            color="primary"
            size="small"
            aria-label="Send message"
          >
            <SendIcon />
          </IconButton>
        </Box>
      </Paper>

      {/* Image upload action dialog */}
      <Dialog
        open={uploadDialogOpen}
        onClose={handleUploadCancel}
        fullWidth
        maxWidth="xs"
      >
        <DialogContent sx={{ pt: 3 }}>
          {uploadPreview && (
            <Box sx={{ textAlign: 'center', mb: 2.5 }}>
              <Box
                component="img"
                src={uploadPreview}
                alt="Selected"
                sx={{ maxHeight: 180, maxWidth: '100%', borderRadius: 2, objectFit: 'contain' }}
              />
            </Box>
          )}
          <Typography variant="subtitle2" gutterBottom>What would you like to do?</Typography>
          <Stack spacing={1.5}>
            <Button
              fullWidth
              variant="outlined"
              startIcon={<VisibilityIcon />}
              onClick={handleUploadAnalyze}
              sx={{ justifyContent: 'flex-start', textTransform: 'none', py: 1.5 }}
            >
              <Box sx={{ textAlign: 'left' }}>
                <Typography variant="body2" fontWeight="medium">Analyze this image</Typography>
                <Typography variant="caption" color="text.secondary">
                  Ask questions about what's in the image
                </Typography>
              </Box>
            </Button>
            <Button
              fullWidth
              variant="outlined"
              startIcon={<AutoFixHighIcon />}
              onClick={handleUploadGenerate}
              sx={{ justifyContent: 'flex-start', textTransform: 'none', py: 1.5 }}
            >
              <Box sx={{ textAlign: 'left' }}>
                <Typography variant="body2" fontWeight="medium">Use as reference for image creation</Typography>
                <Typography variant="caption" color="text.secondary">
                  Generate a new image inspired by this one
                </Typography>
              </Box>
            </Button>
            <Button
              fullWidth
              variant="outlined"
              startIcon={<ChatBubbleOutlineIcon />}
              onClick={handleUploadContext}
              sx={{ justifyContent: 'flex-start', textTransform: 'none', py: 1.5 }}
            >
              <Box sx={{ textAlign: 'left' }}>
                <Typography variant="body2" fontWeight="medium">Attach to my message</Typography>
                <Typography variant="caption" color="text.secondary">
                  Send with a question like "what should Lincoln work on next?"
                </Typography>
              </Box>
            </Button>
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleUploadCancel}>Cancel</Button>
        </DialogActions>
      </Dialog>
    </Box>
  )
}
