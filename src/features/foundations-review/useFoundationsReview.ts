// ── Foundations Review Chat: session hook (FEAT-51, slice 2a) ────────────
//
// Owns one subject-scoped review session end to end, mirroring the shellyChat
// flow (send → parse actions → stage → confirm → write) but wired to the
// foundationsReview task + the learnerModels write layer. It NEVER touches the
// shellyChat feature or its state.
//
// Slice 2b adds `uploadImages` — attach photo(s) + a one-line context to a turn.
// The transport mirrors shellyChat (compress → Storage → `[IMAGE_URL:…]` markers).
//
// Persistence mirrors shellyChat's: the *messages* persist (to one
// `learnerReviewSessions/{childId}_{domain}` doc) so a session survives "end +
// come back"; the staged (unconfirmed) proposals themselves are ephemeral React
// state, re-derived by re-parsing the latest assistant message on resume. The
// durable outcome — confirmed writes — already lives in `learnerModels`.

import { useCallback, useRef, useState } from 'react'
import { doc, getDoc, setDoc } from 'firebase/firestore'
import { getDownloadURL, ref, uploadBytes } from 'firebase/storage'

import { TaskType, useAI } from '../../core/ai/useAI'
import {
  learnerModelsCollection,
  learnerReviewSessionsCollection,
} from '../../core/firebase/firestore'
import { storage } from '../../core/firebase/storage'
import { compressIfNeeded } from '../../core/utils/compressImage'
import { buildUploadMessageContent } from './uploadImageMessage'
import {
  fastPhonicsBridge,
  FOUNDATION_NODE_MAP,
  foundationNodesForDomain,
} from '../../core/foundations'
import { computeReviewPriority } from '../../core/foundations/reviewPriority'
import type { FoundationDomain } from '../../core/foundations/types'
import type {
  LearnerModel,
  ReviewSessionMessage,
} from '../../core/types/learnerModel'
import {
  applyReviewActionToModel,
  parseFoundationsReviewActions,
} from './foundationsReviewActions'
import type { FoundationsReviewAction } from './foundationsReviewActions'
import { groundCoveredProposals } from './uploadGrounding'

/** How many concepts the agenda carries — enough for a ~10-min walk, bounded tokens. */
const AGENDA_LIMIT = 18

export type ReviewActionStatus = 'pending' | 'applied' | 'dismissed'

export interface PendingReviewAction {
  id: string
  action: FoundationsReviewAction
  status: ReviewActionStatus
}

export interface ReviewRecap {
  /** Confirmed state changes (attest / covered). */
  changed: Array<{ conceptId: string; kidName: string; state: string; via: string }>
  /** Concepts queued for a kid-facing test. */
  queued: Array<{ conceptId: string; kidName: string }>
}

export type ReviewStatus = 'idle' | 'loading' | 'active' | 'error'

interface Args {
  familyId: string
  childId: string
  childName: string
  domain: FoundationDomain
}

const sessionDocId = (childId: string, domain: string) => `${childId}_${domain}`
const now = () => new Date().toISOString()

/**
 * The external-curriculum bridge(s) relevant to a domain, in a compact form the CF
 * folds into the system prompt so the model can map an extracted position (e.g.
 * "Peak 13") to reading-graph concepts. Single-sourced from the client bridge data
 * (FEAT-53) and threaded through the persisted agenda marker — no server duplicate.
 */
function bridgesForDomain(domain: FoundationDomain) {
  if (domain !== 'reading') return []
  return [
    {
      source: fastPhonicsBridge.source,
      version: fastPhonicsBridge.version,
      units: fastPhonicsBridge.units.map((u) => ({
        peak: u.peak,
        phase: u.phase,
        covers: u.covers,
        depthOnly: u.depthOnly ?? false,
      })),
    },
  ]
}

/** Build the review agenda (priority-ordered, plain-language) from a stored model. */
function buildAgenda(model: LearnerModel | null, domain: FoundationDomain) {
  const nodes = foundationNodesForDomain(domain)
  const states = model?.conceptStates ?? {}
  const ordered = computeReviewPriority(nodes, states)
  const concepts = ordered.slice(0, AGENDA_LIMIT).map((id) => {
    const node = FOUNDATION_NODE_MAP[id]
    const entry = states[id]
    return {
      conceptId: id,
      name: node?.kidName ?? id,
      description: node?.parentDescription ?? '',
      state: entry?.state ?? 'not-yet',
      evidence: (entry?.evidence ?? []).map((e) => e.note).slice(0, 3),
    }
  })
  return { domain, subjectLabel: domain, concepts, bridges: bridgesForDomain(domain) }
}

export function useFoundationsReview({ familyId, childId, domain }: Args) {
  // `childName` is part of Args for the caller's convenience; the hook itself
  // labels via kid-word concept names, so it isn't read here.
  const { chat } = useAI()
  const [status, setStatus] = useState<ReviewStatus>('idle')
  const [messages, setMessages] = useState<ReviewSessionMessage[]>([])
  const [pending, setPending] = useState<PendingReviewAction[]>([])
  const [applied, setApplied] = useState<FoundationsReviewAction[]>([])
  const [sending, setSending] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [ended, setEnded] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Current model, held in a ref so sequential applies (confirmAll) thread the
  // latest value without stale closures.
  const modelRef = useRef<LearnerModel | null>(null)
  const messagesRef = useRef<ReviewSessionMessage[]>([])

  const modelDocRef = useCallback(
    () => doc(learnerModelsCollection(familyId), childId),
    [familyId, childId],
  )
  const sessionDocRef = useCallback(
    () => doc(learnerReviewSessionsCollection(familyId), sessionDocId(childId, domain)),
    [familyId, childId, domain],
  )

  const persistSession = useCallback(
    async (msgs: ReviewSessionMessage[]) => {
      messagesRef.current = msgs
      try {
        await setDoc(sessionDocRef(), { childId, domain, messages: msgs, updatedAt: now() })
      } catch (err) {
        console.warn('[foundationsReview] failed to persist session:', err)
      }
    },
    [sessionDocRef, childId, domain],
  )

  /** Re-derive staged proposals from the latest assistant message (like shellyChat).
   *  Every batch is ground-filtered through the bridge: a `covered` proposal against
   *  a bridged source whose conceptId the extracted peak doesn't cover is dropped
   *  before staging (the LLM proposes the position; the bridge decides the mapping). */
  const restageFrom = useCallback((assistantContent: string, key: string) => {
    const { actions } = parseFoundationsReviewActions(assistantContent)
    const { kept, dropped } = groundCoveredProposals(actions)
    if (dropped.length > 0) {
      console.info(
        `[foundationsReview] bridge dropped ${dropped.length} ungrounded proposal(s):`,
        dropped.map((d) => `${d.action.conceptId} (${d.reason})`),
      )
    }
    setPending(
      kept.map((action, i) => ({ id: `${key}_${i}`, action, status: 'pending' as const })),
    )
  }, [])

  /** Send the running conversation to the CF and append + stage the reply. */
  const runTurn = useCallback(
    async (convo: ReviewSessionMessage[]) => {
      const response = await chat({
        familyId,
        childId,
        taskType: TaskType.FoundationsReview,
        messages: convo.map((m) => ({ role: m.role, content: m.content })),
      })
      if (!response?.message) {
        setError('The Learning Engine could not respond — try again.')
        return convo
      }
      const { cleanText } = parseFoundationsReviewActions(response.message)
      const assistantMsg: ReviewSessionMessage = {
        role: 'assistant',
        // Keep the raw text (with <action> blocks) so a resume can re-derive
        // staging; render strips the blocks.
        content: response.message,
        at: now(),
      }
      const next = [...convo, assistantMsg]
      setMessages(next)
      restageFrom(response.message, assistantMsg.at)
      await persistSession(next)
      void cleanText
      return next
    },
    [chat, familyId, childId, restageFrom, persistSession],
  )

  /** Load an existing session or open a new one with the priority agenda. */
  const start = useCallback(async () => {
    setStatus('loading')
    setError(null)
    setEnded(false)
    try {
      const [modelSnap, sessionSnap] = await Promise.all([
        getDoc(modelDocRef()),
        getDoc(sessionDocRef()),
      ])
      const model = modelSnap.exists() ? modelSnap.data() : null
      modelRef.current = model

      const existing = sessionSnap.exists() ? sessionSnap.data().messages : []
      if (existing && existing.length > 0) {
        // Resume: show the conversation, re-derive staging from the last assistant.
        setMessages(existing)
        messagesRef.current = existing
        const lastAssistant = [...existing].reverse().find((m) => m.role === 'assistant')
        if (lastAssistant) restageFrom(lastAssistant.content, lastAssistant.at)
        setStatus('active')
        return
      }

      const agenda = buildAgenda(model, domain)
      const priming: ReviewSessionMessage = {
        role: 'user',
        hidden: true,
        content: `[FOUNDATIONS_REVIEW]${JSON.stringify(agenda)}[/FOUNDATIONS_REVIEW]\nLet's review ${domain}.`,
        at: now(),
      }
      setStatus('active')
      setSending(true)
      await runTurn([priming])
    } catch (err) {
      console.error('[foundationsReview] start failed:', err)
      setError(err instanceof Error ? err.message : 'Could not start the review.')
      setStatus('error')
    } finally {
      setSending(false)
    }
  }, [modelDocRef, sessionDocRef, restageFrom, runTurn, domain])

  /** Parent replies with free text. */
  const send = useCallback(
    async (text: string) => {
      const trimmed = text.trim()
      if (!trimmed || sending) return
      const userMsg: ReviewSessionMessage = { role: 'user', content: trimmed, at: now() }
      const convo = [...messagesRef.current, userMsg]
      setMessages(convo)
      messagesRef.current = convo
      setPending([])
      setSending(true)
      setError(null)
      try {
        await runTurn(convo)
      } finally {
        setSending(false)
      }
    },
    [sending, runTurn],
  )

  /**
   * Attach photo(s) + a required one-line context to the review. Each image is
   * compressed and uploaded to Storage; the download URLs ride as `[IMAGE_URL:…]`
   * markers on a single user message (transport mirrors shellyChat). The CF runs
   * the vision + extraction pass and returns a batch of `<action>` proposals, which
   * `runTurn` → `restageFrom` grounds and stages as the usual confirm cards.
   */
  const uploadImages = useCallback(
    async (files: File[], context: string) => {
      const ctx = context.trim()
      if (files.length === 0 || !ctx || sending || uploading) return
      setUploading(true)
      setError(null)
      try {
        const urls: string[] = []
        for (const file of files) {
          const compressed = await compressIfNeeded(file, 2 * 1024 * 1024, {
            maxWidth: 1600,
            maxHeight: 1600,
          })
          const stamp = now().replace(/[:.]/g, '-')
          const path = `families/${familyId}/foundations-review-uploads/${childId}_${domain}/${stamp}_${urls.length}.jpg`
          const sref = ref(storage, path)
          await uploadBytes(sref, compressed)
          urls.push(await getDownloadURL(sref))
        }
        const userMsg: ReviewSessionMessage = {
          role: 'user',
          content: buildUploadMessageContent(urls, ctx),
          at: now(),
        }
        const convo = [...messagesRef.current, userMsg]
        setMessages(convo)
        messagesRef.current = convo
        setPending([])
        setSending(true)
        try {
          await runTurn(convo)
        } finally {
          setSending(false)
        }
      } catch (err) {
        console.error('[foundationsReview] upload failed:', err)
        setError('Could not read that photo — try again.')
      } finally {
        setUploading(false)
      }
    },
    [sending, uploading, familyId, childId, domain, runTurn],
  )

  /** Write one confirmed action to learnerModels (merge-only) + track for recap. */
  const applyAction = useCallback(
    async (action: FoundationsReviewAction) => {
      if (action.childId !== childId) {
        console.warn('[foundationsReview] rejected action — child mismatch', action)
        return
      }
      const base = modelRef.current
      if (!base) {
        console.warn('[foundationsReview] no model loaded; cannot apply', action)
        return
      }
      const { model: nextModel, changedConceptId } = applyReviewActionToModel(base, action, now())
      modelRef.current = nextModel

      const merge: Record<string, unknown> = {
        openQuestions: nextModel.openQuestions,
        changeFeed: nextModel.changeFeed,
        updatedAt: nextModel.updatedAt,
      }
      if (changedConceptId) {
        merge.conceptStates = { [changedConceptId]: nextModel.conceptStates[changedConceptId] }
      }
      try {
        await setDoc(modelDocRef(), merge as Partial<LearnerModel>, { merge: true })
      } catch (err) {
        console.error('[foundationsReview] failed to write learner model:', err)
        setError('Could not save that — try again.')
        return
      }

      setApplied((prev) => [...prev, action])
      setPending((prev) =>
        prev.map((p) => (p.action === action ? { ...p, status: 'applied' } : p)),
      )
    },
    [childId, modelDocRef],
  )

  const dismissAction = useCallback((action: FoundationsReviewAction) => {
    setPending((prev) =>
      prev.map((p) => (p.action === action ? { ...p, status: 'dismissed' } : p)),
    )
  }, [])

  const confirmAll = useCallback(async () => {
    const still = pending.filter((p) => p.status === 'pending')
    for (const p of still) {
      // Sequential — each apply threads modelRef.current forward.
      await applyAction(p.action)
    }
  }, [pending, applyAction])

  const end = useCallback(() => setEnded(true), [])

  /** The end-of-session recap: what changed + what's queued for testing. */
  const recap: ReviewRecap = {
    changed: applied
      .filter((a) => a.kind === 'attest' || a.kind === 'covered')
      .map((a) => {
        const node = FOUNDATION_NODE_MAP[a.conceptId]
        if (a.kind === 'attest') {
          return { conceptId: a.conceptId, kidName: node?.kidName ?? a.conceptId, state: a.state, via: 'you confirmed it' }
        }
        return { conceptId: a.conceptId, kidName: node?.kidName ?? a.conceptId, state: 'forming', via: `covered in ${a.source}` }
      }),
    queued: applied
      .filter((a) => a.kind === 'queueTest')
      .map((a) => ({ conceptId: a.conceptId, kidName: FOUNDATION_NODE_MAP[a.conceptId]?.kidName ?? a.conceptId })),
  }

  /** Only the non-hidden messages are rendered. */
  const visibleMessages = messages.filter((m) => !m.hidden)

  return {
    status,
    messages: visibleMessages,
    pending,
    applied,
    recap,
    sending,
    uploading,
    ended,
    error,
    start,
    send,
    uploadImages,
    applyAction,
    dismissAction,
    confirmAll,
    end,
  }
}
