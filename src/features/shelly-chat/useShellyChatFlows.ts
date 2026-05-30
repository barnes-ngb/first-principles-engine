import { useCallback, useEffect } from 'react'
import type { SetURLSearchParams } from 'react-router-dom'
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
import { compressIfNeeded } from '../../core/utils/compressImage'
import {
  daysCollection,
  db,
  shellyChatMessagesCollection,
  shellyChatThreadsCollection,
} from '../../core/firebase/firestore'
import { storage } from '../../core/firebase/storage'
import type { Child, ChatContext, ChatThread, ShellyChatMessage } from '../../core/types'
import type { ChatAction } from '../../core/types'
import { parseChatActions } from './parseChatActions'
import { parseFollowUps } from './parseFollowups'
import { computeReflectionSuggestions } from './reflectionSuggestions'
import type { ReflectionDay } from './reflectionSuggestions'
import type { RefinementQuestion, ShellyChatState } from './useShellyChatState'

type AI = ReturnType<typeof useAI>

/**
 * External dependencies {@link useShellyChatFlows} needs that don't live on
 * {@link ShellyChatState}: family/child identity, the AI hook surface, and the
 * router search-param setter. Passing these in keeps the flows hook free of any
 * routing/context wiring so it stays directly testable.
 */
export interface ShellyChatFlowsDeps {
  familyId: string
  children: Child[]
  activeChildId: string
  chat: AI['chat']
  generateImage: AI['generateImage']
  lastErrorRef: AI['lastErrorRef']
  setSearchParams: SetURLSearchParams
  /**
   * Stage `<action>` proposals parsed from an assistant message for
   * human-confirm (Build Step 3b). Owned by `useShellyChatActions`; the page
   * passes it through so the response handlers can hand off parsed actions
   * without this hook taking on any write capability.
   */
  stagePendingActions: (messageId: string, actions: ChatAction[]) => void
}

/**
 * Owns every effect and handler for {@link ShellyChatPage}. This is a
 * behavior-preserving extraction (ARCH-09): the Firestore reads/writes, the
 * send/image-generation/image-analysis flows, and the thread CRUD all move here
 * unchanged from the page body. No new write capability is added — that's the
 * later `useShellyChatActions` portal layer (design §6, build step 3).
 *
 * The page consumes the returned handlers and wires them straight into the JSX,
 * keeping its external prop/route contract identical.
 */
export function useShellyChatFlows(state: ShellyChatState, deps: ShellyChatFlowsDeps) {
  const { familyId, children, activeChildId, chat, generateImage, lastErrorRef, setSearchParams, stagePendingActions } = deps

  const {
    chatContext, setChatContext,
    setThreads,
    activeThreadId, setActiveThreadId,
    messages, setMessages,
    input, setInput,
    setFollowUps,
    setReflectionSuggestions,
    sending, setSending,
    setDrawerOpen,
    setGeneratingImage,
    uploadPreview, setUploadPreview,
    uploadFile, setUploadFile,
    setUploading,
    setUploadDialogOpen,
    pendingAttachment, setPendingAttachment,
    pendingReferenceImage, setPendingReferenceImage,
    setImageFlowOpen,
    setImageFlowStep,
    imageIdea, setImageIdea,
    imageQuestions, setImageQuestions,
    imageAnswers, setImageAnswers,
    setLoadingQuestions,
    messagesEndRef,
    autoSendTriggered,
    imageIdeaTimeoutFired,
  } = state

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

  // ── Load data-driven reflection suggestions ───────────────────
  useEffect(() => {
    if (!familyId) return
    const childId = chatContext === 'lincoln'
      ? children.find(c => c.name.toLowerCase() === 'lincoln')?.id
      : chatContext === 'london'
        ? children.find(c => c.name.toLowerCase() === 'london')?.id
        : undefined

    if (!childId) {
      setReflectionSuggestions([])
      return
    }

    const fourteenDaysAgo = new Date()
    fourteenDaysAgo.setDate(fourteenDaysAgo.getDate() - 14)
    const startDate = fourteenDaysAgo.toISOString().slice(0, 10)

    const loadReflectionData = async () => {
      try {
        const daysSnap = await getDocs(
          query(
            daysCollection(familyId),
            where('childId', '==', childId),
            where('date', '>=', startDate),
            limit(50),
          ),
        )

        const days = daysSnap.docs.map((d) => d.data() as ReflectionDay)
        setReflectionSuggestions(computeReflectionSuggestions(days, chatContext))
      } catch (err) {
        console.warn('[shellyChat] Failed to load reflection data:', err)
      }
    }

    void loadReflectionData()
  }, [familyId, chatContext, children, setReflectionSuggestions])

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
  }, [setSearchParams, setChatContext, setActiveThreadId, setMessages, setFollowUps, autoSendTriggered])

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
  }, [familyId, chatContext, setThreads])

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
  }, [familyId, activeThreadId, setMessages, autoSendTriggered])

  // ── Auto-scroll on new messages ────────────────────────────────
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, messagesEndRef])

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

  // parseFollowUps now lives in ./parseFollowups (pure, unit-tested — TEST-01).

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
          // ── ARCH-09 / Build Step 3b: action extraction ──────────────
          // Strip [FOLLOWUP] markers, then `<action>` blocks, so neither shows
          // in the rendered/persisted message. Parsed actions are staged for
          // human-confirm via `useShellyChatActions` — no write happens here.
          const { cleanText: afterFollowups, followUps: suggestions } = parseFollowUps(response.message)
          setFollowUps(suggestions)
          const { actions, cleanText } = parseChatActions(afterFollowups)
          const msgRef = await addDoc(shellyChatMessagesCollection(familyId, activeThreadId), {
            role: 'assistant',
            content: cleanText,
            timestamp: new Date().toISOString(),
          })
          if (actions.length) stagePendingActions(msgRef.id, actions)
          await updateDoc(
            doc(shellyChatThreadsCollection(familyId), activeThreadId),
            {
              updatedAt: new Date().toISOString(),
              messageCount: increment(1),
              lastMessagePreview: cleanText.slice(0, 100),
            },
          )
        } else {
          console.warn('[Chat] sendToAI got null/empty response')
          await addDoc(shellyChatMessagesCollection(familyId, activeThreadId), {
            role: 'assistant',
            content: 'I wasn\'t able to respond — the AI service returned an empty response. Please try again.',
            timestamp: new Date().toISOString(),
          })
        }
      } catch (err) {
        console.error('Failed to get AI response:', err)
        if (activeThreadId) {
          await addDoc(shellyChatMessagesCollection(familyId, activeThreadId), {
            role: 'assistant',
            content: `Something went wrong: ${err instanceof Error ? err.message : 'Unknown error'}. Try again or start a new conversation.`,
            timestamp: new Date().toISOString(),
          }).catch(() => {})
        }
      } finally {
        setSending(false)
      }
    },
    [activeThreadId, chat, familyId, getChildIdForContext, setFollowUps, setSending, stagePendingActions],
  )

  // ── Send handler ───────────────────────────────────────────────
  const handleSend = useCallback(async () => {
    const text = input.trim()
    if (!text || sending) return

    setInput('')
    setFollowUps([])
    setSending(true)

    let threadId = activeThreadId
    try {

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

      const chatChildId = getChildIdForContext()
      console.log('[Chat] About to call aiChat...', {
        familyId,
        childId: chatChildId || '(general mode)',
        taskType: 'shellyChat',
        messageCount: aiMessages.length,
        lastMessage: aiMessages[aiMessages.length - 1]?.content?.slice(0, 80),
      })

      const startTime = Date.now()
      const response = await chat({
        familyId,
        childId: chatChildId,
        taskType: TaskType.ShellyChat,
        messages: aiMessages,
      })

      console.log('[Chat] aiChat returned after', Date.now() - startTime, 'ms')
      console.log('[Chat] Response type:', typeof response)
      console.log('[Chat] Response keys:', response ? Object.keys(response) : 'null')
      console.log('[Chat] Response message preview:', response?.message?.slice(0, 100))
      if (!response?.message) {
        console.error('[Chat] No message in response:', JSON.stringify(response)?.slice(0, 500))
      }

      if (response?.message) {
        const { cleanText: afterFollowups, followUps: suggestions } = parseFollowUps(response.message)
        setFollowUps(suggestions)
        const { actions, cleanText } = parseChatActions(afterFollowups)
        const msgRef = await addDoc(shellyChatMessagesCollection(familyId, threadId), {
          role: 'assistant',
          content: cleanText,
          timestamp: new Date().toISOString(),
        })
        if (actions.length) stagePendingActions(msgRef.id, actions)
        await updateDoc(
          doc(shellyChatThreadsCollection(familyId), threadId),
          {
            updatedAt: new Date().toISOString(),
            messageCount: increment(1),
            lastMessagePreview: cleanText.slice(0, 100),
          },
        )
      } else {
        console.warn('[Chat] handleSend got null/empty response')
        await addDoc(shellyChatMessagesCollection(familyId, threadId), {
          role: 'assistant',
          content: 'I wasn\'t able to respond right now. Please try again.',
          timestamp: new Date().toISOString(),
        })
      }
    } catch (err) {
      console.error('[Chat] handleSend error:', err)
      console.error('[Chat] Error details:', err instanceof Error ? err.message : String(err))
      // Use the local threadId (not activeThreadId from closure, which may be stale for new threads)
      if (threadId) {
        await addDoc(shellyChatMessagesCollection(familyId, threadId), {
          role: 'assistant',
          content: `Something went wrong: ${err instanceof Error ? err.message : 'Unknown error'}. Try again or start a new conversation.`,
          timestamp: new Date().toISOString(),
        }).catch(() => {})
      }
    } finally {
      setSending(false)
    }
  }, [input, sending, activeThreadId, familyId, messages, chat, getChildIdForContext, setSearchParams, pendingAttachment, chatContext, setActiveThreadId, setFollowUps, setInput, setPendingAttachment, setSending, stagePendingActions])

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
      } else {
        // Surface the actual error from the AI hook ref (synchronously available, unlike state)
        const errorDetail = lastErrorRef.current || 'unknown error'
        console.error('[Chat] Image generation failed:', errorDetail, '| prompt:', prompt.slice(0, 80))
        const userMessage = errorDetail.includes('safety') || errorDetail.includes('content_policy')
          ? `That prompt was blocked by the image safety filter — try describing the scene differently.`
          : errorDetail.includes('rate') || errorDetail.includes('busy')
            ? `Image generation is busy right now. Wait a moment and try again.`
            : `Sorry, I wasn't able to generate that image. ${errorDetail.includes('deadline') || errorDetail.includes('timeout') ? 'The request timed out — try again.' : 'Try rephrasing or try again in a moment.'}`
        await addDoc(shellyChatMessagesCollection(familyId, threadId), {
          role: 'assistant',
          content: userMessage,
          timestamp: new Date().toISOString(),
        })
        await updateDoc(
          doc(shellyChatThreadsCollection(familyId), threadId),
          {
            updatedAt: new Date().toISOString(),
            messageCount: increment(1),
            lastMessagePreview: '⚠️ Image generation failed',
          },
        )
      }
    } catch (err) {
      console.error('[Chat] Image generation failed:', err)
    } finally {
      setGeneratingImage(false)
    }
  }, [activeThreadId, familyId, generateImage, setSearchParams, chatContext, lastErrorRef, setActiveThreadId, setGeneratingImage])

  // ── Image refinement flow (Prompt 9) ───────────────────────────

  const handleImageFlowOpen = useCallback(() => {
    setImageFlowOpen(true)
    setImageFlowStep('idea')
    setImageIdea('')
    setImageQuestions([])
    setImageAnswers({})
  }, [setImageFlowOpen, setImageFlowStep, setImageIdea, setImageQuestions, setImageAnswers])

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
  }, [pendingReferenceImage, setImageFlowOpen, setImageIdea, setImageQuestions, setImageAnswers, setLoadingQuestions, setPendingReferenceImage])

  const handleImageIdeaSubmit = useCallback(async () => {
    const idea = imageIdea.trim()
    if (!idea) return

    setLoadingQuestions(true)
    setImageFlowStep('questions')
    imageIdeaTimeoutFired.current = false

    // Set a 5-second timeout — skip refinement and generate directly if AI is slow
    const timeoutId = setTimeout(() => {
      imageIdeaTimeoutFired.current = true
      setLoadingQuestions(false)
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
      // If the timeout already fired, generation is in progress — don't duplicate
      if (imageIdeaTimeoutFired.current) return

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
      // If the timeout already fired, generation is in progress — don't duplicate
      if (imageIdeaTimeoutFired.current) return
      setLoadingQuestions(false)
      handleImageFlowClose()
      handleGenerateImageDirect(idea)
    }
  }, [imageIdea, chat, familyId, getChildIdForContext, handleImageFlowClose, handleGenerateImageDirect, imageIdeaTimeoutFired, setImageFlowStep, setImageQuestions, setLoadingQuestions])

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
  }, [imageAnswers, imageQuestions, imageIdea, chat, familyId, getChildIdForContext, handleGenerateImageDirect, pendingReferenceImage, setImageFlowOpen, setImageFlowStep, setImageIdea, setImageQuestions, setImageAnswers, setLoadingQuestions, setPendingReferenceImage])

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
  }, [imageIdea, handleGenerateImageDirect, pendingReferenceImage, chat, familyId, getChildIdForContext, setImageFlowOpen, setImageFlowStep, setImageIdea, setImageQuestions, setImageAnswers, setLoadingQuestions, setPendingReferenceImage])

  // ── Image upload handlers (Prompt 8) ───────────────────────────

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    // Reset the input so the same file can be re-selected
    e.target.value = ''

    setUploadFile(file)
    setUploadPreview(URL.createObjectURL(file))
    setUploadDialogOpen(true)
  }, [setUploadFile, setUploadPreview, setUploadDialogOpen])

  const handleUploadCancel = useCallback(() => {
    if (uploadPreview) URL.revokeObjectURL(uploadPreview)
    setUploadDialogOpen(false)
    setUploadFile(null)
    setUploadPreview(null)
  }, [uploadPreview, setUploadDialogOpen, setUploadFile, setUploadPreview])

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
  }, [uploadFile, uploadPreview, activeThreadId, familyId, setSearchParams, chatContext, setActiveThreadId, setPendingAttachment, setUploadDialogOpen, setUploadFile, setUploadPreview, setUploading])

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

      console.log('[Chat] Calling aiChat for image analysis:', {
        familyId,
        childId: getChildIdForContext(),
        messageCount: aiMessages.length,
        hasImageUrl: aiMessages[aiMessages.length - 1]?.content?.startsWith('[IMAGE_URL:'),
      })

      const response = await chat({
        familyId,
        childId: getChildIdForContext(),
        taskType: TaskType.ShellyChat,
        messages: aiMessages,
      })

      console.log('[Chat] Image analysis response:', response ? 'got response' : 'null/undefined', response?.message?.slice(0, 50))

      if (response?.message) {
        const { cleanText: afterFollowups, followUps: suggestions } = parseFollowUps(response.message)
        setFollowUps(suggestions)
        const { actions, cleanText } = parseChatActions(afterFollowups)
        const msgRef = await addDoc(shellyChatMessagesCollection(familyId, threadId), {
          role: 'assistant',
          content: cleanText,
          timestamp: new Date().toISOString(),
        })
        if (actions.length) stagePendingActions(msgRef.id, actions)
        await updateDoc(
          doc(shellyChatThreadsCollection(familyId), threadId),
          {
            updatedAt: new Date().toISOString(),
            messageCount: increment(1),
            lastMessagePreview: cleanText.slice(0, 100),
          },
        )
      } else {
        console.warn('[Chat] handleUploadAnalyze got null/empty response')
        await addDoc(shellyChatMessagesCollection(familyId, threadId), {
          role: 'assistant',
          content: 'I wasn\'t able to analyze that image right now. Please try again.',
          timestamp: new Date().toISOString(),
        })
      }
    } catch (err) {
      console.error('Failed to analyze image:', err)
      const threadId = activeThreadId
      if (threadId) {
        await addDoc(shellyChatMessagesCollection(familyId, threadId), {
          role: 'assistant',
          content: `Something went wrong analyzing the image: ${err instanceof Error ? err.message : 'Unknown error'}. Try again or start a new conversation.`,
          timestamp: new Date().toISOString(),
        }).catch(() => {})
      }
    } finally {
      if (uploadPreview) URL.revokeObjectURL(uploadPreview)
      setUploadFile(null)
      setUploadPreview(null)
      setUploading(false)
      setSending(false)
    }
  }, [uploadFile, uploadPreview, activeThreadId, familyId, messages, chat, getChildIdForContext, setSearchParams, chatContext, setActiveThreadId, setFollowUps, setSending, setUploadDialogOpen, setUploadFile, setUploadPreview, setUploading, stagePendingActions])

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
  }, [uploadFile, uploadPreview, activeThreadId, familyId, setSearchParams, chatContext, setActiveThreadId, setImageFlowOpen, setImageFlowStep, setImageIdea, setImageQuestions, setImageAnswers, setPendingReferenceImage, setUploadDialogOpen, setUploadFile, setUploadPreview, setUploading])

  // ── New thread ─────────────────────────────────────────────────
  const handleNewThread = useCallback(() => {
    setActiveThreadId(null)
    setMessages([])
    setSearchParams({})
    setDrawerOpen(false)
    setFollowUps([])
    autoSendTriggered.current = false
  }, [setSearchParams, setActiveThreadId, setMessages, setDrawerOpen, setFollowUps, autoSendTriggered])

  // ── Select thread ──────────────────────────────────────────────
  const handleSelectThread = useCallback(
    (threadId: string) => {
      setActiveThreadId(threadId)
      setSearchParams({ thread: threadId })
      setDrawerOpen(false)
      setFollowUps([])
      autoSendTriggered.current = false
    },
    [setSearchParams, setActiveThreadId, setDrawerOpen, setFollowUps, autoSendTriggered],
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

  return {
    handleContextChange,
    handleSend,
    handleImageFlowOpen,
    handleImageFlowClose,
    handleImageIdeaSubmit,
    handleImageRefinementGenerate,
    handleJustGenerate,
    handleFileSelect,
    handleUploadCancel,
    handleUploadContext,
    handleUploadAnalyze,
    handleUploadGenerate,
    handleNewThread,
    handleSelectThread,
    handleArchiveThread,
    handleRenameThread,
    handleKeyDown,
  }
}
