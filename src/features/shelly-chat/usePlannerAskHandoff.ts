// ── Ask AI's end of the planner hand-off (UX-273) ───────────────────────────
//
// The planner stages one sentence and navigates here (`planner-chat/
// plannerAskHandoff.ts` holds the shape and the reasons). This hook is the
// receiving end. Four invariants, each one a finding the independent browser run
// made rather than a precaution:
//
//  1. **Her draft survives the journey.** `/chat` unmounts on the way to the
//     planner, so the composer is handed to `composerCustody` on unmount and
//     taken back on arrival — BEFORE the collision decision, which is the only
//     way that decision can see anything to collide with.
//  2. **The incoming draft is owned for its whole unsent life** — through edits,
//     through a dismissed notice, through a keep-my-draft detour. Ownership is
//     the identity that decides what Send would DO: the chat tab and the child
//     it maps to, the thread, the family, the profile. `handleSend` takes its
//     `childId` from the TAB, so agreeing with the app header proved nothing.
//  3. **Guards run at action time.** `guardSend` / `replaceWithQuestion` /
//     `startFresh` re-evaluate from render-scope values on the click itself, so
//     a Send racing the invalidation effect cannot slip through. A revoked
//     authority is dropped, never recomputed, so A → B → A revives nothing.
//  4. **Nothing here writes.** No thread, no message, no model call, no domain
//     data — pinned on the source by `plannerAskHandoff.boundary.source.test.ts`.
//     The chat's own Send and its confirm cards remain the only writers.

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
  saveComposerCustody,
  takeComposerCustody,
  type ComposerDraft,
} from './composerCustody'

/** What the receiving view has to say, if anything. */
export type PlannerAskHandoffState =
  | { kind: 'idle' }
  /** The question is in the composer, unsent. `setAside` is her displaced draft. */
  | { kind: 'filled'; handoff: PlannerAskHandoff; setAside: ComposerDraft | null }
  /** She was already typing — her draft is in the box and she chooses. */
  | { kind: 'collision'; handoff: PlannerAskHandoff; mine: ComposerDraft; fromOtherThread: boolean }
  /** She kept her own draft; the question is still offered. */
  | { kind: 'kept'; handoff: PlannerAskHandoff }
  /** A saved conversation is open — a fresh one, or not now. */
  | { kind: 'thread-choice'; handoff: PlannerAskHandoff }
  /** She chose to stay in the saved conversation. */
  | { kind: 'declined'; handoff: PlannerAskHandoff }
  /** It was accepted and has been taken back out of her hands. */
  | { kind: 'withdrawn'; handoff: PlannerAskHandoff; reason: PlannerAskHandoffRefusal }
  /** It never landed. */
  | { kind: 'refused'; reason: PlannerAskHandoffRefusal }

export interface PlannerAskHandoffDeps {
  familyId: string
  /** The signed-in profile; `null` until one is chosen. */
  profile: string | null
  isParent: boolean
  /** The shell's active child — `''` until the read settles. */
  activeChildId: string
  /** True while the family's children are loading. Nothing is taken until false. */
  childrenLoading: boolean
  children: readonly { id: string; name: string }[]
  /** The chat tab. What Send derives its child from. */
  chatContext: string
  /** The saved conversation the composer would send into, or `null`. */
  threadId: string | null
  /** The composer's live unsent contents. */
  draft: ComposerDraft
  /** Put contents into the composer. The hook's only effect on the page. */
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
  /** Hides the notice. Deliberately does NOT drop ownership. */
  dismiss: () => void
  /**
   * Run a send — or refuse it, synchronously, when the box holds an incoming
   * question that may no longer be sent from here.
   */
  guardSend: (send: () => void) => void
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

  // What Send would do, recomputed every render and read by the guards through
  // a ref, so a click evaluates the identity of the render it happened in.
  const contextChild = resolveChatContextChild(children, chatContext)
  const contextChildId = contextChild.ok ? contextChild.childId : ''
  const receiver = useMemo<PlannerAskReceiver>(
    () => ({ familyId, profile, chatContext, contextChildId, threadId }),
    [familyId, profile, chatContext, contextChildId, threadId],
  )
  /** One string for effect dependencies — object identity would re-run them blindly. */
  const receiverKey = `${familyId}|${profile ?? ''}|${chatContext}|${contextChildId}|${threadId ?? ''}`

  const childIds = useMemo(() => children.map((c) => c.id), [children])
  const draftText = draft.text

  const live = useRef({ receiver, activeChildId, isParent, draft, applyDraft, startFreshThread, childIds })
  live.current = { receiver, activeChildId, isParent, draft, applyDraft, startFreshThread, childIds }

  /** The held question. A ref, so an action reads it with no render in between. */
  const authority = useRef<PlannerAskAuthority | null>(null)
  const restoreAttempted = useRef(false)
  const decidedGeneration = useRef<number | null>(null)

  const generation = plannerAskHandoffGenerationFromState(location.state)
  const settled = profile !== null && Boolean(familyId) && !childrenLoading
  /**
   * One extra pass before believing "this tab maps to no child".
   *
   * `useShellyChatFlows` initialises the tab in its OWN mount effect, which runs
   * in the same flush as the arrival below — so the first pass can see `general`
   * purely because that effect has not been applied yet, and both the custody
   * owner and the Send-target check key on the tab's child. One bounded extra
   * pass is enough (the two setStates batch into a single re-render) and keeps a
   * child the tabs genuinely do not cover failing closed rather than hanging.
   */
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

  /**
   * Take the question back out of her hands.
   *
   * Only the question's own text goes — attachments she staged are hers and stay
   * — and the notice says where the question still is. Dropping the authority
   * rather than recomputing it is what makes a revocation final.
   */
  const revoke = useCallback((held: PlannerAskAuthority, reason: PlannerAskHandoffRefusal) => {
    authority.current = null
    if (held.inComposer) {
      const current = live.current.draft
      live.current.applyDraft({
        text: '',
        attachments: current.attachments,
        referenceImage: current.referenceImage,
      })
    }
    setState({ kind: 'withdrawn', handoff: held.handoff, reason })
  }, [])

  /** Put the question in the box and stamp what it may be sent under. */
  const fill = useCallback(
    (
      handoff: PlannerAskHandoff,
      setAside: ComposerDraft | null,
      receiverOverride?: PlannerAskReceiver,
    ) => {
      const current = live.current.draft
      live.current.applyDraft({
        text: buildPlannerAskDraft(handoff),
        attachments: setAside ? [] : current.attachments,
        referenceImage: setAside ? null : current.referenceImage,
      })
      authority.current = {
        handoff,
        receiver: receiverOverride ?? live.current.receiver,
        activeChildId: live.current.activeChildId,
        inComposer: true,
      }
      setState({ kind: 'filled', handoff, setAside })
    },
    [],
  )

  const hold = useCallback(
    (handoff: PlannerAskHandoff, receiverOverride?: PlannerAskReceiver) => {
      authority.current = {
        handoff,
        receiver: receiverOverride ?? live.current.receiver,
        activeChildId: live.current.activeChildId,
        inComposer: false,
      }
    },
    [],
  )

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
      const { receiver: here } = live.current
      const taken = takeComposerCustody(
        {
          familyId: here.familyId,
          profile: here.profile,
          chatContext: here.chatContext,
          contextChildId: here.contextChildId,
        },
        threadId,
      )
      if (taken.kind === 'same-thread') {
        restored = taken.draft
        live.current.applyDraft(taken.draft)
      } else if (taken.kind === 'other-thread') {
        offered = taken.draft
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

    // A saved conversation is open. Filling its composer would send this
    // question with that transcript's history attached, which is the merge the
    // contract forbids — so she decides, and nothing is written either way.
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
      // A draft from another conversation is placed here — in a FRESH one, so no
      // history comes with it — and the card says where it came from rather than
      // letting it appear as if she had typed it here.
      if (offered) live.current.applyDraft(offered)
      hold(decision.handoff)
      setState({ kind: 'collision', handoff: decision.handoff, mine, fromOtherThread: offered !== null })
      return
    }

    fill(decision.handoff, null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settled, contextSettlePass, generation, threadId, receiverKey, activeChildId, isParent, fill, hold])

  // ── Invalidation, and the end of a draft's life ─────────────────────────
  useEffect(() => {
    const held = authority.current
    if (!held) return
    const verdict = evaluatePlannerAskAuthority(held, authorityNow())
    if (!verdict.ok) {
      revoke(held, verdict.reason)
      return
    }
    if (!held.inComposer) return
    if (draftText === '') {
      // Sent, or cleared by hand. Nothing is held any more, and the note stops
      // describing a box it no longer describes.
      authority.current = null
      setState((prev) => (prev.kind === 'filled' ? { kind: 'idle' } : prev))
    }
    // An edit is adopted, not disowned: edited incoming text keeps its guard.
  }, [draftText, receiverKey, activeChildId, isParent, authorityNow, revoke])

  // ── On the way out: hand her draft to page-session custody ──────────────
  useEffect(
    () => () => {
      const held = authority.current
      const { receiver: here, draft: outgoing } = live.current
      // An incoming question is NOT hers to hold across a visit: it is
      // recoverable from the planner, and keeping it would revive a transfer
      // that no longer has authority. Her attachments still travel.
      const kept: ComposerDraft = held?.inComposer
        ? { text: '', attachments: outgoing.attachments, referenceImage: outgoing.referenceImage }
        : outgoing
      saveComposerCustody(
        {
          familyId: here.familyId,
          profile: here.profile,
          chatContext: here.chatContext,
          contextChildId: here.contextChildId,
        },
        here.threadId,
        kept,
      )
    },
    [],
  )

  /**
   * The one place an action asks "may this still be used?".
   *
   * Returns `'blocked'` after revoking, so every caller fails closed by doing
   * nothing more. `null` means there is nothing held and the action is ordinary.
   */
  const guardHeld = useCallback(
    (requireInComposer: boolean): PlannerAskAuthority | 'blocked' | null => {
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
    const mine = state.kind === 'collision' ? state.mine : live.current.draft
    fill(state.handoff, composerDraftIsEmpty(mine) ? null : mine)
  }, [state, guardHeld, fill])

  const restoreSetAside = useCallback(() => {
    if (state.kind !== 'filled' || !state.setAside) return
    const held = authority.current
    if (held) authority.current = { ...held, inComposer: false }
    live.current.applyDraft(state.setAside)
    setState(held ? { kind: 'kept', handoff: state.handoff } : { kind: 'idle' })
  }, [state])

  const startFresh = useCallback(() => {
    if (state.kind !== 'thread-choice') return
    if (guardHeld(false) === 'blocked') return
    const { handoff } = state
    const mine = live.current.draft
    // Leaves the saved conversation without writing anything — local state and
    // the `?thread` param only. The next Send mints the new thread.
    live.current.startFreshThread()
    // Stamped with the thread this draft is now in (`null`), not the one the ref
    // still shows: no render has happened yet, and a stale stamp would revoke
    // the question the moment the next effect ran.
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

  // Hides the note. Ownership is untouched on purpose: a dismissed notice must
  // not become a way to send a question from somewhere it may not be sent.
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
