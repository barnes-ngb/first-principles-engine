import { useCallback, useEffect, useRef } from 'react'
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
import { ART_QUOTA_MESSAGE, resolveChatImageGate } from './chatImageAccess'
import { recordChatArtGeneration } from './useChatArtQuota'
import { parseChatActions } from './parseChatActions'
import { parseFriction } from './parseFriction'
import { logFeatureRequest } from './logFeatureRequest'
import { parseFollowUps } from './parseFollowups'
import { computeReflectionSuggestions } from './reflectionSuggestions'
import type { ReflectionDay } from './reflectionSuggestions'
import type { ChatAttachment, RefinementQuestion, ShellyChatState } from './useShellyChatState'
import { buildImageMessageContent, MAX_UPLOAD_FILES } from './imageMarkers'
import {
  classifyImageGenerationFailure,
  imageFailureAlternatives,
  imageFailureChatMessage,
} from '../books/imageGenerationFailure'

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
  /** The structured rejection of the last image call (FEAT-195). */
  imageFailureRef: AI['imageFailureRef']
  setSearchParams: SetURLSearchParams
  /**
   * Stage `<action>` proposals parsed from an assistant message for
   * human-confirm (Build Step 3b). Owned by `useShellyChatActions`; the page
   * passes it through so the response handlers can hand off parsed actions
   * without this hook taking on any write capability.
   */
  stagePendingActions: (messageId: string, actions: ChatAction[], scope?: number) => void
  /**
   * A token for the context a turn is STARTING in (Codex P1, PR #1706).
   * Captured before the `await` on `chat()` and handed back at stage time, so a
   * reply that outlived a thread or tab switch cannot land its cards in the
   * context the parent moved to.
   */
  currentContextScope: () => number
  /**
   * UX-33(b) — drop the still-pending confirm cards, with a sentence, because
   * the context they were proposed in is gone. Owned by `useShellyChatActions`;
   * this hook holds the two handlers that end a context (a child-tab switch and
   * a thread switch) and so is where it has to be called. Passed through like
   * `stagePendingActions`, and for the same reason: no write capability moves
   * here, only the ability to clear a proposal.
   */
  dropPendingForContext: (reason: 'context-switch' | 'thread-switch') => void
  /**
   * Whether the signed-in profile is a parent (UX-189). `/chat` is nav-gated,
   * not route-gated, and the image door is a paid `gpt-image-1.5` call — so the
   * handler layer states the gate itself instead of trusting either the route
   * or the button being hidden. Defaults to false — fail closed.
   */
  isParent?: boolean
  /**
   * The week's art budget for the acting child (UX-189) — the SAME counter the
   * other five paid surfaces share (`useChatArtQuota`), never a second
   * allowance. Uncapped and inert for a parent by construction. Optional so the
   * hook stays testable without mounting the quota subscription; absent means
   * uncapped, which is the fail-open direction a courtesy cap wants.
   */
  artQuota?: { atLimit: boolean; recordGeneration: () => Promise<void> }
  /**
   * Hold back the two things this hook does on mount WITHOUT a tap — the legacy
   * `chatContext` back-fill (`writeBatch`) and the pre-seeded-thread auto-send
   * (a model call plus an assistant message) — for a visit that arrived from the
   * planner's hand-off (UX-273), whose contract is zero writes until Send.
   *
   * Opt-in and `false` by default, so ordinary entry — including
   * `openChatWithContext`'s deliberately pre-seeded thread — is unchanged. It is
   * a value the caller reads during render, not a ref written in an effect, so
   * the suppression is in force before either effect can start; and it is
   * re-checked after the migration's `await`, because work already begun must
   * not commit under a visit that no longer wants it.
   */
  suppressMountWrites?: boolean
  /**
   * Take the single-use authority for the thread THIS tap is about to create
   * (UX-273 closeout), or `null` when there is nothing to authorise.
   *
   * Called by every creator that mints a conversation while leaving the
   * composer's unsent work standing — "Attach to my message", "Analyze",
   * "Use as reference for image creation", and `handleGenerateImageDirect`, the
   * funnel behind all three generation doors. Round 2's P2 was that only the
   * first of them took the claim, so the other three still read their own
   * creation as Shelly opening a different conversation. `handleSend` is
   * deliberately NOT one of them: it consumes the submitted text before minting,
   * so there is no unsent draft for a claim to protect, and it is unchanged.
   *
   * Owned by `usePlannerAskHandoff` and passed in, like `currentContextScope`
   * above and for the same reason: the context an operation STARTED in has to be
   * captured before its first `await`, and a planner question held in a fresh
   * conversation is guarded on that conversation. Her explicit "Attach to my
   * message" is the one upload that creates the conversation she is already
   * standing in, so without this the guard read its own thread creation as her
   * opening a different conversation and cleared the edited question.
   *
   * No write capability moves either way: this hook still creates the thread
   * exactly as before, and all the callback does is report the id it got.
   * Optional, so an ordinary mount — and every existing test harness — is
   * unchanged.
   *
   * The claim it hands back answers whether the id was HONOURED. `false` means
   * the tap is stale — another tab, another conversation, a logout, a departure,
   * a different draft — and this handler aborts on it, before the conversation
   * it just created becomes the live one and before a byte is uploaded into it.
   */
  beginOwnThreadMint?: () => ((mintedThreadId: string) => boolean) | null
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
  const { familyId, children, activeChildId, chat, generateImage, lastErrorRef, imageFailureRef, setSearchParams, stagePendingActions, dropPendingForContext, currentContextScope, isParent = false, artQuota, suppressMountWrites = false, beginOwnThreadMint } = deps

  // Readable synchronously from any async continuation, so a commit cannot land
  // after the answer changed.
  const suppressMountWritesRef = useRef(suppressMountWrites)
  suppressMountWritesRef.current = suppressMountWrites

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
    uploadPreviews, setUploadPreviews,
    uploadFiles, setUploadFiles,
    setUploading,
    setUploadDialogOpen,
    pendingAttachments, setPendingAttachments,
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
    // UX-273: a hand-off visit promises zero writes until Send, and this is a
    // write nobody asked for. Deferred, not deleted — the next ordinary visit
    // runs it. Checked here AND after the read, since the read is awaited.
    if (suppressMountWrites) return
    const migrateOldThreads = async () => {
      try {
        const oldThreads = await getDocs(
          query(shellyChatThreadsCollection(familyId), where('archived', '==', false))
        )
        if (suppressMountWritesRef.current) return
        const batch = writeBatch(db)
        let needsMigration = false
        for (const threadDoc of oldThreads.docs) {
          if (!threadDoc.data().chatContext) {
            batch.update(threadDoc.ref, { chatContext: 'general' })
            needsMigration = true
          }
        }
        if (needsMigration) {
          if (suppressMountWritesRef.current) return
          await batch.commit()
          console.log('[shellyChat] Migrated old threads to general context')
        }
      } catch (err) {
        console.warn('[shellyChat] Thread migration error:', err)
      }
    }
    migrateOldThreads()
  }, [familyId, suppressMountWrites])

  // ── Context change handler ────────────────────────────────────
  const handleContextChange = useCallback((_: unknown, val: ChatContext | null) => {
    if (!val) return
    // UX-33(b) — FIRST, while `activeChildId` still names the child the cards
    // were proposed for. A card that outlived its tab was a dead button:
    // `rejectReason` refused it on the child mismatch and returned false with
    // nothing said. Now it is cleared, and the clearing is said out loud.
    dropPendingForContext('context-switch')
    setChatContext(val)
    setActiveThreadId(null)
    setMessages([])
    setFollowUps([])
    setSearchParams({})
    autoSendTriggered.current = false
  }, [dropPendingForContext, setSearchParams, setChatContext, setActiveThreadId, setMessages, setFollowUps, autoSendTriggered])

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
    // UX-273: on a hand-off visit this effect would call the model and write an
    // assistant turn into a saved conversation the parent only LOOKED at — the
    // thread she was offered a choice about. `openChatWithContext`'s own
    // pre-seeded entry is unaffected: it carries no hand-off state.
    if (suppressMountWrites) return
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
  }, [messages, activeThreadId, suppressMountWrites])

  // parseFollowUps now lives in ./parseFollowups (pure, unit-tested — TEST-01).

  // ── Send to AI (shared logic) ──────────────────────────────────
  const sendToAI = useCallback(
    async (currentMessages: ShellyChatMessage[]) => {
      if (!activeThreadId) return
      // The context this turn belongs to, captured before the await below.
      const scope = currentContextScope()
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
          const { actions, cleanText: afterActions } = parseChatActions(afterFollowups)
          // Silent friction capture (Build Step 5a): feedback metadata, NOT a
          // child's record, so it NEVER routes through applyChatAction. Strip the
          // <friction> block too, then fire-and-forget below. cleanText is the
          // text with both <action> and <friction> blocks removed.
          const { friction, cleanText } = parseFriction(afterActions)
          const msgRef = await addDoc(shellyChatMessagesCollection(familyId, activeThreadId), {
            role: 'assistant',
            content: cleanText,
            timestamp: new Date().toISOString(),
          })
          if (actions.length) stagePendingActions(msgRef.id, actions, scope)
          if (friction) {
            void logFeatureRequest(familyId, {
              quote: friction.quote,
              interpretedWant: friction.interpretedWant,
              childId: getChildIdForContext() || undefined,
              context: 'shelly-chat',
            })
          }
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
    [currentContextScope, activeThreadId, chat, familyId, getChildIdForContext, setFollowUps, setSending, stagePendingActions],
  )

  // ── Send handler ───────────────────────────────────────────────
  const handleSend = useCallback(async () => {
    const text = input.trim()
    if (!text || sending) return

    setInput('')
    setFollowUps([])
    setSending(true)

    // The context this turn belongs to, captured before any await (Codex P1).
    // A new thread minted below stays inside the SAME scope — the parent has
    // not gone anywhere; only a switch bumps it.
    const scope = currentContextScope()
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
      if (pendingAttachments.length) {
        userMsgData.uploadedImageUrls = pendingAttachments.map((a) => a.url)
        // Keep the singular field populated (first image) for legacy readers.
        userMsgData.uploadedImageUrl = pendingAttachments[0].url
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

      // Get AI response — include N image URLs for vision if attached (FEAT-59)
      const aiContent = buildImageMessageContent(
        pendingAttachments.map((a) => a.url),
        text,
      )
      if (pendingAttachments.length) {
        pendingAttachments.forEach((a) => URL.revokeObjectURL(a.previewUrl))
        setPendingAttachments([])
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
        const { actions, cleanText: afterActions } = parseChatActions(afterFollowups)
        // Silent friction capture (Build Step 5a): feedback metadata, NOT a
        // child's record, so it NEVER routes through applyChatAction. cleanText
        // has both <action> and <friction> blocks stripped.
        const { friction, cleanText } = parseFriction(afterActions)
        const msgRef = await addDoc(shellyChatMessagesCollection(familyId, threadId), {
          role: 'assistant',
          content: cleanText,
          timestamp: new Date().toISOString(),
        })
        if (actions.length) stagePendingActions(msgRef.id, actions, scope)
        if (friction) {
          void logFeatureRequest(familyId, {
            quote: friction.quote,
            interpretedWant: friction.interpretedWant,
            childId: getChildIdForContext() || undefined,
            context: 'shelly-chat',
          })
        }
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
  }, [currentContextScope, input, sending, activeThreadId, familyId, messages, chat, getChildIdForContext, setSearchParams, pendingAttachments, chatContext, setActiveThreadId, setFollowUps, setInput, setPendingAttachments, setSending, stagePendingActions])

  // ── Image generation (refactored for Prompt 9) ─────────────────
  //
  // UX-189 — the gate and the meter live HERE because this is the one funnel.
  // Every path into a paid call ends up in this function: the refinement flow
  // (`handleImageIdeaSubmit` → `handleImageRefinementGenerate`), its 5-second
  // timeout, its two catch branches, `handleJustGenerate`, and the reference
  // upload (`handleUploadGenerate`, which opens the flow). Gating the button
  // alone would have left six handlers open, and gating six handlers is six
  // places for a seventh to be forgotten.
  const handleGenerateImageDirect = useCallback(async (prompt: string) => {
    if (!prompt.trim()) return

    // Two refusals, and neither spends anything. The capability check is the
    // safety one; the cap is FEAT-175's courtesy counter, uncapped and
    // unreachable for a parent by construction. Both are refused BEFORE the
    // paid call and before `recordGeneration`, so a refused generation spends
    // no quota (FEAT-167) — and both say what to do next rather than stopping
    // (FEAT-195), which for a child means naming the art doors that are his.
    const gate = resolveChatImageGate(isParent, artQuota?.atLimit ?? false, ART_QUOTA_MESSAGE)
    if (!gate.ok) {
      console.info('[Chat] image generation refused —', gate.reason)
      const threadId = activeThreadId
      if (threadId) {
        await addDoc(shellyChatMessagesCollection(familyId, threadId), {
          role: 'assistant',
          content: gate.notice,
          timestamp: new Date().toISOString(),
        }).catch(() => {})
      }
      return
    }

    setGeneratingImage(true)

    // The own-thread claim for the one funnel every generation door reaches, and
    // the third non-consuming creator: the prompt comes from the image form, so
    // the composer's unsent text — her edited question for Lincoln — is still in
    // the box while this mints a conversation. Taken here rather than in the
    // callers because this is the function that CREATES the thread; the
    // refinement doors' own awaits create nothing.
    const claimOwnThread = beginOwnThreadMint?.() ?? null
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
        // Refused means stale: abort before the conversation becomes the live
        // one, before the `?thread` param, before the user message and before
        // the paid `generateImage` call — so a refusal spends no quota and
        // nothing is accounted for, exactly as the gate's refusal does not.
        if (claimOwnThread && !claimOwnThread(threadId)) return
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
        // UX-189 — count it, and only now. A refusal, a blocked prompt or a
        // dead call spends no quota; the picture exists, so the counter moves.
        // Fire-and-forget by construction (FEAT-167): this returns void, so a
        // counter write that never settles offline cannot wedge the chat.
        recordChatArtGeneration(artQuota?.recordGeneration)
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
        // The one classifier and the one set of words, instead of this door's
        // own three-way message sniff (FEAT-195). A chat reply cannot hold the
        // shared card — it is persisted text, not a component — so the
        // alternatives are listed for the parent to ask for by name, which is
        // this surface's own affordance. Parent voice, matching the register
        // every other reply in this thread is written in.
        const failure = classifyImageGenerationFailure(imageFailureRef.current)
        const alternatives = imageFailureAlternatives(imageFailureRef.current)
        // One classifier and one set of words, instead of this door's own
        // three-way message sniff (FEAT-195). A chat reply cannot hold the
        // shared card — it is persisted text, not a component — so
        // `imageFailureChatMessage` composes the same content as one string,
        // and holds the rule that a refusal ALWAYS ends with something to do:
        // an empty suggester falls back to the written tips here exactly as it
        // does on the component doors (Codex P2, PR #1768). Parent voice, the
        // register every other reply in this thread is written in.
        const userMessage = imageFailureChatMessage(failure, alternatives, 'parent')
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
  }, [activeThreadId, familyId, generateImage, setSearchParams, chatContext, lastErrorRef, imageFailureRef, setActiveThreadId, setGeneratingImage, isParent, artQuota, beginOwnThreadMint])

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
    // FEAT-59: accept multiple files (capped). Attach batches them; analyze /
    // reference-generate are single-image and only shown when exactly one chosen.
    const files = Array.from(e.target.files ?? []).slice(0, MAX_UPLOAD_FILES)
    if (!files.length) return
    // Reset the input so the same file(s) can be re-selected
    e.target.value = ''

    setUploadFiles(files)
    setUploadPreviews(files.map((f) => URL.createObjectURL(f)))
    setUploadDialogOpen(true)
  }, [setUploadFiles, setUploadPreviews, setUploadDialogOpen])

  const handleUploadCancel = useCallback(() => {
    uploadPreviews.forEach((p) => URL.revokeObjectURL(p))
    setUploadDialogOpen(false)
    setUploadFiles([])
    setUploadPreviews([])
  }, [uploadPreviews, setUploadDialogOpen, setUploadFiles, setUploadPreviews])

  /**
   * Let go of the file selection a STALE tap captured — and nothing else.
   *
   * The cleanup half of the own-thread claim (UX-273 closeout, round 2). By the
   * time a claim is refused the composer may already hold newer work: a restored
   * draft comes back with raw files and `blob:` previews of its own, so clearing
   * the live selection, or revoking its URLs, would destroy the very work the
   * refusal exists to protect. So the clear is conditional on the selection still
   * being the one this tap captured by identity, and the revoke happens only when
   * the clear does.
   *
   * One helper rather than the same eight lines in each of the three
   * non-consuming creators (attach, analyze, reference) — the class of handler
   * round 2 found had been fixed in only one place.
   */
  const releaseStaleUploadSelection = useCallback(
    (ownFiles: File[], ownPreviews: string[]) => {
      let revoked = false
      setUploadPreviews((prev) => {
        if (prev !== ownPreviews) return prev
        if (!revoked) {
          revoked = true
          ownPreviews.forEach((p) => URL.revokeObjectURL(p))
        }
        return []
      })
      setUploadFiles((prev) => (prev === ownFiles ? [] : prev))
    },
    [setUploadFiles, setUploadPreviews],
  )

  const handleUploadContext = useCallback(async () => {
    if (!uploadFiles.length) return

    setUploadDialogOpen(false)
    setUploading(true)

    // The authority for the conversation this tap may create, taken before any
    // `await` — the same rule as `currentContextScope` above (UX-273 closeout).
    // Taken unconditionally rather than only when `activeThreadId` is empty,
    // because the condition that matters is the one at the TAP: reading it later
    // would be reading it from a continuation.
    const claimOwnThread = beginOwnThreadMint?.() ?? null
    // Set by a REFUSED claim: this tap's conversation is not the one she is in
    // any more, so nothing after the refusal may run and the cleanup below has
    // to be careful about work that is not this tap's.
    let stale = false
    try {
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
        // Reported before the conversation becomes the active one, so the guard
        // already owns this id by the time the render that changes it happens.
        // Only THIS id, and only once: whether it may be honoured is the
        // guard's own decision, made against the context it captured.
        //
        // And the decision is OBEYED. A refusal means she switched tab, picked a
        // saved conversation, signed out or left while the creation was in
        // flight, so opening this id and uploading into it would drag her back
        // into a conversation she had moved on from. We stop here instead — the
        // created-but-unopened thread document is an empty one nobody is in,
        // which is what an abandoned fresh conversation always is, and no
        // further write is made.
        if (claimOwnThread && !claimOwnThread(threadId)) {
          stale = true
          return
        }
        setActiveThreadId(threadId)
        setSearchParams({ thread: threadId })
      }

      // Upload each file sequentially; collect one attachment per image (FEAT-59).
      const attachments: ChatAttachment[] = []
      for (let i = 0; i < uploadFiles.length; i++) {
        const compressed = await compressIfNeeded(uploadFiles[i], 2 * 1024 * 1024, { maxWidth: 1600, maxHeight: 1600 })
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
        const storagePath = `families/${familyId}/chat-uploads/${threadId}/${timestamp}_${i}.jpg`
        const storageRef = ref(storage, storagePath)
        await uploadBytes(storageRef, compressed)
        const downloadUrl = await getDownloadURL(storageRef)
        // Keep the preview URL alive for the attachment strip
        attachments.push({ url: downloadUrl, previewUrl: uploadPreviews[i] })
      }
      setPendingAttachments(attachments)
    } catch (err) {
      console.error('Failed to upload image(s) for attachment:', err)
      uploadPreviews.forEach((p) => URL.revokeObjectURL(p))
    } finally {
      if (stale) {
        // A stale tap clears ITS OWN selection and nothing else — see
        // `releaseStaleUploadSelection`.
        releaseStaleUploadSelection(uploadFiles, uploadPreviews)
      } else {
        setUploadFiles([])
        setUploadPreviews([])
      }
      setUploading(false)
    }
  }, [uploadFiles, uploadPreviews, activeThreadId, familyId, setSearchParams, chatContext, setActiveThreadId, setPendingAttachments, setUploadDialogOpen, setUploadFiles, setUploadPreviews, setUploading, beginOwnThreadMint, releaseStaleUploadSelection])

  const handleUploadAnalyze = useCallback(async () => {
    // Single-image path — the dialog only offers Analyze when one file is chosen.
    if (!uploadFiles.length) return

    setUploadDialogOpen(false)
    setUploading(true)

    // The context this turn belongs to, captured before any await (Codex P1).
    const scope = currentContextScope()
    // And the authority for the conversation this tap may create, taken in the
    // same breath — BEFORE the compression `await`, not just before the thread
    // creation. Analyze leaves the composer's unsent work standing (her edited
    // planner question for Lincoln is still in the box), so it is a
    // non-consuming creator and needs the same provenance Attach has.
    const claimOwnThread = beginOwnThreadMint?.() ?? null
    let stale = false
    try {
      const compressed = await compressIfNeeded(uploadFiles[0], 2 * 1024 * 1024, { maxWidth: 1600, maxHeight: 1600 })

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
        // Obeyed, exactly as in the attach path: a refusal means she switched
        // tab, opened a saved conversation, signed out or left while the
        // compression and the creation were in flight. So nothing after it runs
        // — no active conversation, no `?thread`, no upload, no message and no
        // model call. The empty thread document is an abandoned fresh
        // conversation, which is all an unopened one ever is.
        if (claimOwnThread && !claimOwnThread(threadId)) {
          stale = true
          return
        }
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
        const { actions, cleanText: afterActions } = parseChatActions(afterFollowups)
        // Silent friction capture (Build Step 5a): feedback metadata, NOT a
        // child's record, so it NEVER routes through applyChatAction. cleanText
        // has both <action> and <friction> blocks stripped.
        const { friction, cleanText } = parseFriction(afterActions)
        const msgRef = await addDoc(shellyChatMessagesCollection(familyId, threadId), {
          role: 'assistant',
          content: cleanText,
          timestamp: new Date().toISOString(),
        })
        if (actions.length) stagePendingActions(msgRef.id, actions, scope)
        if (friction) {
          void logFeatureRequest(familyId, {
            quote: friction.quote,
            interpretedWant: friction.interpretedWant,
            childId: getChildIdForContext() || undefined,
            context: 'shelly-chat',
          })
        }
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
      if (stale) {
        releaseStaleUploadSelection(uploadFiles, uploadPreviews)
      } else {
        uploadPreviews.forEach((p) => URL.revokeObjectURL(p))
        setUploadFiles([])
        setUploadPreviews([])
      }
      setUploading(false)
      setSending(false)
    }
  }, [currentContextScope, uploadFiles, uploadPreviews, activeThreadId, familyId, messages, chat, getChildIdForContext, setSearchParams, chatContext, setActiveThreadId, setFollowUps, setSending, setUploadDialogOpen, setUploadFiles, setUploadPreviews, setUploading, stagePendingActions, beginOwnThreadMint, releaseStaleUploadSelection])

  const handleUploadGenerate = useCallback(async () => {
    // Single-image path — reference generation uses exactly one image.
    if (!uploadFiles.length || !uploadPreviews.length) return

    setUploadDialogOpen(false)
    setUploading(true)

    // The own-thread claim, taken before the compression `await` (round 2's P2).
    // "Use as reference for image creation" mints a conversation and leaves the
    // composer's unsent work exactly where it is — her edited question for
    // Lincoln stays in the box — so the guard saw `null → id` as Shelly opening a
    // different conversation and cleared the text. Reference preparation itself
    // makes no model or generation call; it only stages the image and opens the
    // refinement form.
    const claimOwnThread = beginOwnThreadMint?.() ?? null
    let stale = false
    try {
      const compressed = await compressIfNeeded(uploadFiles[0], 2 * 1024 * 1024, { maxWidth: 1600, maxHeight: 1600 })

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
        // Refused means stale: stop before the conversation becomes the live one,
        // before the `?thread` param, before a byte is uploaded, and before the
        // reference image and the refinement form are staged into a composer that
        // is no longer this tap's.
        if (claimOwnThread && !claimOwnThread(threadId)) {
          stale = true
          return
        }
        setActiveThreadId(threadId)
        setSearchParams({ thread: threadId })
      }

      const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
      const storagePath = `families/${familyId}/chat-uploads/${threadId}/${timestamp}.jpg`
      const storageRef = ref(storage, storagePath)
      await uploadBytes(storageRef, compressed)
      const downloadUrl = await getDownloadURL(storageRef)

      // Store as reference image and open the refinement flow
      setPendingReferenceImage({ url: downloadUrl, previewUrl: uploadPreviews[0] })
      setImageFlowOpen(true)
      setImageFlowStep('idea')
      setImageIdea('')
      setImageQuestions([])
      setImageAnswers({})
    } catch (err) {
      console.error('Failed to upload reference image:', err)
      uploadPreviews.forEach((p) => URL.revokeObjectURL(p))
    } finally {
      if (stale) {
        releaseStaleUploadSelection(uploadFiles, uploadPreviews)
      } else {
        setUploadFiles([])
        setUploadPreviews([])
      }
      setUploading(false)
    }
  }, [uploadFiles, uploadPreviews, activeThreadId, familyId, setSearchParams, chatContext, setActiveThreadId, setImageFlowOpen, setImageFlowStep, setImageIdea, setImageQuestions, setImageAnswers, setPendingReferenceImage, setUploadDialogOpen, setUploadFiles, setUploadPreviews, setUploading, beginOwnThreadMint, releaseStaleUploadSelection])

  // ── New thread ─────────────────────────────────────────────────
  const handleNewThread = useCallback(() => {
    // UX-33(b), the sharper half: on a thread switch the CHILD still matches,
    // so a stale card's Confirm does not bounce off `rejectReason` — it writes,
    // and then annotates `pendingMessageId` under the new `activeThreadId`,
    // a message id that does not exist there. Cleared with a sentence.
    dropPendingForContext('thread-switch')
    setActiveThreadId(null)
    setMessages([])
    setSearchParams({})
    setDrawerOpen(false)
    setFollowUps([])
    autoSendTriggered.current = false
  }, [dropPendingForContext, setSearchParams, setActiveThreadId, setMessages, setDrawerOpen, setFollowUps, autoSendTriggered])

  // ── Select thread ──────────────────────────────────────────────
  const handleSelectThread = useCallback(
    (threadId: string) => {
      // Same rail as `handleNewThread` — see the note there. Guarded on the
      // thread actually CHANGING (Codex P2, PR #1706): the drawer renders the
      // active conversation as a live `ListItemButton`, so tapping the row you
      // are already in reaches this handler. Dropping there would delete every
      // pending card and report a context change that did not happen — the
      // silent-eat this fix exists to stop, in a new place.
      if (threadId !== activeThreadId) {
        dropPendingForContext('thread-switch')
      }
      setActiveThreadId(threadId)
      setSearchParams({ thread: threadId })
      setDrawerOpen(false)
      setFollowUps([])
      autoSendTriggered.current = false
    },
    [activeThreadId, dropPendingForContext, setSearchParams, setActiveThreadId, setDrawerOpen, setFollowUps, autoSendTriggered],
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
