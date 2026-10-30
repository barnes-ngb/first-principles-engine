// Ask AI's end of the planner hand-off (UX-273).
//
// Contracts, each one a finding from an independent browser run:
//  1. An accepted question is OWNED for its whole unsent life — through the
//     arrival render, edits, a dismissed notice, a keep-my-draft detour. The
//     owned text is tracked (`expectedText`/`observed`) so the PRE-FILL empty
//     render is never mistaken for a clear or a send, which is what erased the
//     authority in candidate 2.
//  2. Ownership is re-evaluated in an effect AND synchronously inside
//     `guardSend` / `replaceWithQuestion` / `startFresh`, from render-scope
//     values, so a Send racing the effect cannot leave under another identity.
//     A revocation drops the authority; A→B→A cannot revive it.
//  3. Her own unsent work survives the route unmount through `composerCustody`,
//     labelled with the owner it was EDITED under (never the latest identity),
//     restored before any collision choice, and never consumed when it cannot
//     be shown.
//  4. Nothing here writes: no thread, no message, no model call, no domain data
//     (pinned by `plannerAskHandoff.boundary.source.test.ts`).

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useLocation } from 'react-router-dom'

import { formatDateYmd } from '../../core/utils/format'
import {
  acceptPlannerAskHandoff,
  buildPlannerAskDraft,
  evaluatePlannerAskAuthority,
  plannerAskHandoffGenerationFromState,
  PlannerAskHandoffRefusal,
  resolveChatContextChild,
  takePlannerAskHandoff,
  type PlannerAskAuthority,
  type PlannerAskHandoff,
  type PlannerAskReceiver,
} from '../planner-chat/plannerAskHandoff'
import {
  composerDraftIsEmpty,
  EMPTY_COMPOSER_DRAFT,
  saveComposerCustody,
  takeComposerCustody,
  type ComposerCustodyOwner,
  type ComposerDraft,
} from './composerCustody'

/** What the receiving view has to say, if anything. */
export type PlannerAskHandoffState =
  | { kind: 'idle' }
  | { kind: 'filled'; handoff: PlannerAskHandoff; setAside: ComposerDraft | null }
  | { kind: 'collision'; handoff: PlannerAskHandoff; mine: ComposerDraft; fromOtherThread: boolean }
  | { kind: 'kept'; handoff: PlannerAskHandoff }
  | { kind: 'thread-choice'; handoff: PlannerAskHandoff }
  | { kind: 'declined'; handoff: PlannerAskHandoff }
  | { kind: 'withdrawn'; handoff: PlannerAskHandoff; reason: PlannerAskHandoffRefusal }
  | { kind: 'refused'; reason: PlannerAskHandoffRefusal }

export interface PlannerAskHandoffDeps {
  familyId: string
  profile: string | null
  isParent: boolean
  activeChildId: string
  childrenLoading: boolean
  children: readonly { id: string; name: string }[]
  /** The chat tab. What `handleSend` derives its child from. */
  chatContext: string
  threadId: string | null
  /** Everything unsent in the composer. */
  draft: ComposerDraft
  applyDraft: (draft: ComposerDraft) => void
  /** Leave the saved conversation for a fresh, unwritten one. */
  startFreshThread: () => void
}

export interface PlannerAskHandoffResult {
  state: PlannerAskHandoffState
  keepExisting: () => void
  replaceWithQuestion: () => void
  restoreSetAside: () => void
  startFresh: () => void
  keepConversation: () => void
  /** Hides the notice; deliberately does NOT drop ownership. */
  dismiss: () => void
  guardSend: (send: () => void) => void
}

/** The authority plus what the composer is expected to be holding for it. */
interface HeldAsk extends PlannerAskAuthority {
  /** The owned text as last placed or last adopted from an edit. */
  expectedText: string
  /** Has the owned text actually been seen in the composer yet? */
  observed: boolean
}

function ownerOf(receiver: PlannerAskReceiver): ComposerCustodyOwner {
  return {
    familyId: receiver.familyId,
    profile: receiver.profile,
    chatContext: receiver.chatContext,
    contextChildId: receiver.contextChildId,
  }
}

/** Cheap content signature — changes exactly when unsent work changes. */
function draftSignature(draft: ComposerDraft): string {
  return [
    draft.text,
    draft.attachments.map((a) => a.url).join(','),
    draft.referenceImage?.url ?? '',
    draft.uploadFiles.map((f) => `${f.name}:${f.size}`).join(','),
    draft.uploadPreviews.join(','),
    String(draft.uploadDialogOpen),
    String(draft.imageFlowOpen),
    draft.imageFlowStep,
    draft.imageIdea,
    String(draft.imageQuestions.length),
    Object.entries(draft.imageAnswers).map(([k, v]) => `${k}=${v}`).join(','),
  ].join('\u0001')
}

export function usePlannerAskHandoff(deps: PlannerAskHandoffDeps): PlannerAskHandoffResult {
  const location = useLocation()
  const [state, setState] = useState<PlannerAskHandoffState>({ kind: 'idle' })

  const {
    familyId,
    profile,
    isParent,
    activeChildId,
    childrenLoading,
    children,
    chatContext,
    threadId,
    draft,
    applyDraft,
    startFreshThread,
  } = deps

  // What Send would do, this render.
  const contextChild = resolveChatContextChild(children, chatContext)
  const contextChildId = contextChild.ok ? contextChild.childId : ''
  const receiver = useMemo<PlannerAskReceiver>(
    () => ({ familyId, profile, chatContext, contextChildId, threadId }),
    [familyId, profile, chatContext, contextChildId, threadId],
  )
  const receiverKey = `${familyId}|${profile ?? ''}|${chatContext}|${contextChildId}|${threadId ?? ''}`
  const childIds = useMemo(() => children.map((c) => c.id), [children])
  const draftText = draft.text
  const signature = draftSignature(draft)

  const live = useRef({ receiver, activeChildId, isParent, draft, applyDraft, startFreshThread, childIds })
  live.current = { receiver, activeChildId, isParent, draft, applyDraft, startFreshThread, childIds }

  /** The held question. A ref, so an action reads it with no render in between. */
  const authority = useRef<HeldAsk | null>(null)
  /** Where her own unsent work belongs — stamped once, never re-stamped. */
  const draftOwner = useRef<{ owner: ComposerCustodyOwner; threadId: string | null } | null>(null)
  const restoreAttempted = useRef(false)
  const decidedGeneration = useRef<number | null>(null)

  const generation = plannerAskHandoffGenerationFromState(location.state)
  const settled = profile !== null && Boolean(familyId) && !childrenLoading
  // One extra pass before believing "this tab maps to no child": the chat
  // initialises its tab in its own mount effect, which runs in this same flush.
  const [contextSettlePass, setContextSettlePass] = useState(0)

  const authorityNow = useCallback(
    () => ({
      receiver: live.current.receiver,
      activeChildId: live.current.activeChildId,
      isParent: live.current.isParent,
      todayKey: formatDateYmd(new Date()),
    }),
    [],
  )

  /** Take the question back; her other unsent work stays untouched. */
  const revoke = useCallback((held: HeldAsk, reason: PlannerAskHandoffRefusal) => {
    authority.current = null
    if (held.inComposer) live.current.applyDraft({ ...live.current.draft, text: '' })
    setState({ kind: 'withdrawn', handoff: held.handoff, reason })
  }, [])

  const fill = useCallback(
    (
      handoff: PlannerAskHandoff,
      setAside: ComposerDraft | null,
      receiverOverride?: PlannerAskReceiver,
    ) => {
      const text = buildPlannerAskDraft(handoff)
      // A set-aside draft takes its media with it; otherwise hers stays put.
      const base = setAside ? EMPTY_COMPOSER_DRAFT : live.current.draft
      live.current.applyDraft({ ...base, text })
      authority.current = {
        handoff,
        receiver: receiverOverride ?? live.current.receiver,
        activeChildId: live.current.activeChildId,
        inComposer: true,
        expectedText: text,
        observed: false,
      }
      setState({ kind: 'filled', handoff, setAside })
    },
    [],
  )

  const hold = useCallback((handoff: PlannerAskHandoff, receiverOverride?: PlannerAskReceiver) => {
    authority.current = {
      handoff,
      receiver: receiverOverride ?? live.current.receiver,
      activeChildId: live.current.activeChildId,
      inComposer: false,
      expectedText: '',
      observed: false,
    }
  }, [])

  // ── Her own work: stamp its owner once, and release the slot when emptied ──
  useEffect(() => {
    const current = live.current.draft
    const held = authority.current
    if (composerDraftIsEmpty(current)) {
      if (draftOwner.current) {
        saveComposerCustody(draftOwner.current.owner, draftOwner.current.threadId, EMPTY_COMPOSER_DRAFT)
        draftOwner.current = null
      }
      return
    }
    // The incoming question is not hers; it never takes ownership of the slot.
    if (held?.inComposer && current.text === held.expectedText && composerDraftIsEmpty({ ...current, text: '' })) {
      return
    }
    if (!draftOwner.current) {
      draftOwner.current = { owner: ownerOf(live.current.receiver), threadId: live.current.receiver.threadId }
    }
  }, [signature])

  // ── Arrival: custody first, then the question ───────────────────────────
  useEffect(() => {
    if (!settled) return
    if (live.current.receiver.contextChildId === '' && contextSettlePass === 0) {
      setContextSettlePass(1)
      return
    }

    let restored: ComposerDraft | null = null
    let offered: ComposerDraft | null = null
    if (!restoreAttempted.current) {
      restoreAttempted.current = true
      const look = takeComposerCustody(
        ownerOf(live.current.receiver),
        threadId,
        // A cross-thread draft is only consumed when there is a choice to show
        // it in; otherwise it is left where it is.
        { acceptOtherThread: generation !== null },
      )
      if (look.kind === 'same-thread') {
        restored = look.draft
        draftOwner.current = { owner: ownerOf(live.current.receiver), threadId }
        live.current.applyDraft(look.draft)
      } else if (look.kind === 'other-thread' && generation !== null) {
        offered = look.draft
      }
    }

    if (generation === null) return
    if (decidedGeneration.current === generation) return
    decidedGeneration.current = generation

    const decision = acceptPlannerAskHandoff(takePlannerAskHandoff(), {
      receiver: live.current.receiver,
      activeChildId: live.current.activeChildId,
      knownChildIds: live.current.childIds,
      isParent: live.current.isParent,
      todayKey: formatDateYmd(new Date()),
      generation,
      now: Date.now(),
    })
    if (!decision.ok) {
      setState({ kind: 'refused', reason: decision.reason })
      return
    }

    // A saved conversation is open: filling it would send this question with
    // that transcript's history. She decides; nothing is written either way.
    if (threadId !== null) {
      hold(decision.handoff)
      setState({ kind: 'thread-choice', handoff: decision.handoff })
      return
    }

    const mine =
      offered ??
      (restored && !composerDraftIsEmpty(restored) ? restored : null) ??
      (!composerDraftIsEmpty(live.current.draft) ? live.current.draft : null)
    if (mine) {
      if (offered) {
        draftOwner.current = { owner: ownerOf(live.current.receiver), threadId }
        live.current.applyDraft(offered)
      }
      hold(decision.handoff)
      setState({ kind: 'collision', handoff: decision.handoff, mine, fromOtherThread: offered !== null })
      return
    }

    fill(decision.handoff, null)
  }, [settled, contextSettlePass, generation, threadId, receiverKey, activeChildId, isParent, fill, hold])

  // ── Invalidation, and the end of an owned draft's life ──────────────────
  useEffect(() => {
    const held = authority.current
    if (!held) return
    const verdict = evaluatePlannerAskAuthority(held, authorityNow())
    if (!verdict.ok) {
      revoke(held, verdict.reason)
      return
    }
    if (!held.inComposer) return
    if (!held.observed) {
      // The fill is scheduled but has not rendered: an empty box here is the
      // PRE-FILL value, never a clear and never a send (candidate 2's P1).
      if (draftText === held.expectedText) authority.current = { ...held, observed: true }
      return
    }
    if (draftText === '') {
      authority.current = null
      setState((prev) => (prev.kind === 'filled' ? { kind: 'idle' } : prev))
      return
    }
    // An edit is adopted, not disowned: edited incoming text keeps its guard.
    if (draftText !== held.expectedText) authority.current = { ...held, expectedText: draftText }
  }, [draftText, receiverKey, activeChildId, isParent, authorityNow, revoke])

  // ── On the way out: hand HER work to custody, under its own owner ───────
  useEffect(
    () => () => {
      const stamp = draftOwner.current
      // Nothing of hers to keep: touch the slot at all and a StrictMode replay
      // (or a pre-settle pass) would wipe a draft it cannot see.
      if (!stamp) return
      const held = authority.current
      const outgoing = live.current.draft
      saveComposerCustody(stamp.owner, stamp.threadId, {
        ...outgoing,
        // The incoming question is recoverable from the planner and must not
        // come back without authority.
        text: held?.inComposer ? '' : outgoing.text,
      })
    },
    [],
  )

  /** The one place an action asks "may this still be used?". */
  const guardHeld = useCallback(
    (requireInComposer: boolean): HeldAsk | 'blocked' | null => {
      const held = authority.current
      if (!held) return null
      if (requireInComposer && !held.inComposer) return null
      const verdict = evaluatePlannerAskAuthority(held, authorityNow())
      if (!verdict.ok) {
        revoke(held, verdict.reason)
        return 'blocked'
      }
      return held
    },
    [authorityNow, revoke],
  )

  const guardSend = useCallback(
    (send: () => void) => {
      if (guardHeld(true) === 'blocked') return
      send()
    },
    [guardHeld],
  )

  const keepExisting = useCallback(() => {
    setState((prev) => (prev.kind === 'collision' ? { kind: 'kept', handoff: prev.handoff } : prev))
  }, [])

  const replaceWithQuestion = useCallback(() => {
    if (state.kind !== 'collision' && state.kind !== 'kept') return
    if (guardHeld(false) === 'blocked') return
    // Her draft is preserved BEFORE the replacement, not after.
    const mine = state.kind === 'collision' ? state.mine : live.current.draft
    fill(state.handoff, composerDraftIsEmpty(mine) ? null : mine)
  }, [state, guardHeld, fill])

  const restoreSetAside = useCallback(() => {
    if (state.kind !== 'filled' || !state.setAside) return
    const held = authority.current
    if (held) authority.current = { ...held, inComposer: false, expectedText: '', observed: false }
    draftOwner.current = {
      owner: ownerOf(live.current.receiver),
      threadId: live.current.receiver.threadId,
    }
    live.current.applyDraft(state.setAside)
    setState(held ? { kind: 'kept', handoff: state.handoff } : { kind: 'idle' })
  }, [state])

  const startFresh = useCallback(() => {
    if (state.kind !== 'thread-choice') return
    if (guardHeld(false) === 'blocked') return
    const { handoff } = state
    const mine = live.current.draft
    // Local state and the `?thread` param only — no write. Send mints the thread.
    live.current.startFreshThread()
    // Stamped with the thread this draft is now in (`null`), not the one the ref
    // still shows: no render has happened yet.
    const fresh: PlannerAskReceiver = { ...live.current.receiver, threadId: null }
    if (composerDraftIsEmpty(mine)) {
      fill(handoff, null, fresh)
      return
    }
    hold(handoff, fresh)
    setState({ kind: 'collision', handoff, mine, fromOtherThread: false })
  }, [state, guardHeld, fill, hold])

  const keepConversation = useCallback(() => {
    const held = authority.current
    authority.current = null
    setState(held ? { kind: 'declined', handoff: held.handoff } : { kind: 'idle' })
  }, [])

  const dismiss = useCallback(() => setState({ kind: 'idle' }), [])

  return {
    state,
    keepExisting,
    replaceWithQuestion,
    restoreSetAside,
    startFresh,
    keepConversation,
    dismiss,
    guardSend,
  }
}
