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
//  3. Unsent work survives the route unmount through `composerCustody`,
//     labelled with the owner it was EDITED under (never the latest identity),
//     restored before any collision choice, and never consumed when it cannot
//     be shown. There are TWO drafts to keep, not one, and they have a home
//     each: the BOX — her edits to the question and the photo she attached to
//     it, none of which the planner holds, since it holds only the original
//     sentence — and the DISPLACED draft the question pushed out of it. Neither
//     save can cost the other, and the set-aside one outlives every notice,
//     because the notice is transient and the draft is the only copy.
//     (Round 1's P2s, both of them: `dismiss` set `idle` and took her text, her
//     photo and her image idea with it; and the unmount handed over the live
//     box with the question's text blanked, so her edits went and the displaced
//     draft was never saved at all.)
//  4. A draft is only CONSUMED from the slot where it is actually placed. Every
//     early return on the arrival path — a refused or expired hand-off, a saved
//     conversation she decides to stay in — leaves it in the slot under the
//     owner and the sign-in it was typed under (round 1's other P2: the take
//     ran first and dropped it on the floor). Two homes is also the whole
//     representation, so a third draft cannot appear behind her back: the one
//     move that would need one asks first.
//  5. Nothing here writes: no thread, no message, no model call, no domain data
//     (pinned by `plannerAskHandoff.boundary.source.test.ts`).

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
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
  adoptRestoredUploadPreviews,
  composerDraftIsEmpty,
  currentComposerCustodySession,
  EMPTY_COMPOSER_DRAFT,
  peekComposerCustody,
  peekDisplacedComposerCustody,
  sameComposerOwner,
  saveComposerCustody,
  saveDisplacedComposerCustody,
  takeComposerCustody,
  takeDisplacedComposerCustody,
  type ComposerCustodyHolder,
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
  /**
   * A draft is still set aside and the question's own note has gone — closed,
   * or sent, or cleared. The restore has to outlive that note, so it gets a
   * notice of its own with exactly two exits, both explicit. `holds` is what is
   * in there, so the note names it rather than guessing.
   */
  | { kind: 'set-aside'; draft: ComposerDraft; holds: ComposerCustodyHolder }
  /**
   * Taking the question would need a THIRD home: one draft is in the box and a
   * different one is already set aside. There are two homes, so this is a
   * decision rather than a side effect — the notice names what would go.
   */
  | { kind: 'displace-confirm'; handoff: PlannerAskHandoff; standing: ComposerDraft }

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
  /**
   * Throw the set-aside draft away. The only thing that does — a notice
   * closing, a Send and a cleared composer all leave it exactly where it is.
   */
  discardSetAside: () => void
  /** Keep both drafts and leave the question where it is. */
  keepSetAside: () => void
  /**
   * Hides the notice; deliberately does NOT drop ownership, and deliberately
   * does not drop a set-aside draft either — it reveals the offer to bring it
   * back, which is what makes that offer reachable from every closable notice.
   */
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

  // Committed in a LAYOUT effect rather than written during render: a render can
  // be thrown away, and a ref written in one is a mutation that never happened.
  // Layout is early enough for every reader — React runs layout effects before
  // the passive effects below, and an event handler (the Send guard) runs later
  // still — so the synchronous, fail-closed guards read the identity of the last
  // COMMITTED render, which is the one she is looking at.
  const live = useRef({ receiver, activeChildId, isParent, draft, applyDraft, startFreshThread, childIds })
  useLayoutEffect(() => {
    live.current = { receiver, activeChildId, isParent, draft, applyDraft, startFreshThread, childIds }
  }, [receiver, activeChildId, isParent, draft, applyDraft, startFreshThread, childIds])

  /** The held question. A ref, so an action reads it with no render in between. */
  const authority = useRef<HeldAsk | null>(null)
  /**
   * Where her own unsent work belongs — stamped once, never re-stamped.
   *
   * The `session` is the sign-in it was typed under. It travels with the save so
   * that a save arriving after that sign-in ended — this hook's own unmount
   * cleanup on a logout, or a callback that outlived the route — is refused
   * instead of re-filling a slot the ending session emptied.
   */
  const draftOwner = useRef<{
    owner: ComposerCustodyOwner
    threadId: string | null
    session: number
  } | null>(null)
  /**
   * The draft the question DISPLACED — her text, her media, her image idea —
   * and the scope it was displaced in.
   *
   * A mirror of custody's second home, not the thing itself: the notice is
   * transient (a close tap, a Send, an emptied composer all take it away) and a
   * draft that lived inside notice state went with it. So the slot holds the
   * work, this ref holds the label the notice renders from, and the two are the
   * same by construction — every write reads back what custody kept.
   *
   * It lives until she RESTORES it or DISCARDS it, and nothing else clears it.
   */
  const displaced = useRef<{
    draft: ComposerDraft
    owner: ComposerCustodyOwner
    threadId: string | null
    session: number
    holds: ComposerCustodyHolder
  } | null>(null)
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

  /**
   * Is her displaced work still THIS composer's to offer back?
   *
   * The owner and the sign-in, and deliberately NOT the thread. The slot keys
   * on the thread because it PLACES work without being asked, and work from
   * another conversation must only ever be offered; a restore is the opposite —
   * an explicit tap putting her own words in the box she is looking at. And the
   * thread of a fresh conversation moves on Send (`null` becomes the minted id)
   * without any scope changing, so reading it here would make the offer vanish
   * at the one moment she most needs it: the question has just left the box.
   */
  const displacedIsLive = useCallback(
    (stamp: { owner: ComposerCustodyOwner; session: number }) =>
      stamp.session === currentComposerCustodySession() &&
      sameComposerOwner(stamp.owner, ownerOf(live.current.receiver)),
    [],
  )

  /**
   * Set her work aside: into custody first, and into the ref from what custody
   * actually KEPT.
   *
   * Read back rather than copied, so the offer on screen and the slot cannot
   * disagree — the slot is what decides what an interrupted stage means, and a
   * save it refuses (a sign-in that has ended) must not leave a restore offer
   * standing behind it either.
   */
  const setWorkAside = useCallback(
    (
      draft: ComposerDraft,
      receiver: PlannerAskReceiver,
      holds: ComposerCustodyHolder,
    ): ComposerDraft | null => {
      const owner = ownerOf(receiver)
      const threadId = receiver.threadId
      const session = currentComposerCustodySession()
      saveDisplacedComposerCustody(owner, threadId, draft, holds, Date.now(), session)
      const kept = peekDisplacedComposerCustody(owner)
      displaced.current =
        kept.kind === 'held'
          ? { draft: kept.draft, owner, threadId: kept.threadId, session, holds: kept.holds }
          : null
      // The live box keeps its OWN stamp and its own home. That is the P2 this
      // pair of slots exists for: the box is about to hold the question, she
      // will edit it and attach to it, and none of that is reproducible from
      // the planner — only the original sentence is. So nothing here touches
      // `draftOwner`, and the two drafts are saved independently.
      return displaced.current?.draft ?? null
    },
    [],
  )

  /** The notice when the question's own note goes but a set-aside draft has not. */
  const noticeWithoutQuestion = useCallback((): PlannerAskHandoffState => {
    const stamp = displaced.current
    if (!stamp || !displacedIsLive(stamp)) return { kind: 'idle' }
    return { kind: 'set-aside', draft: stamp.draft, holds: stamp.holds }
  }, [displacedIsLive])

  const fill = useCallback(
    (
      handoff: PlannerAskHandoff,
      setAside: ComposerDraft | null,
      receiverOverride?: PlannerAskReceiver,
    ) => {
      const text = buildPlannerAskDraft(handoff)
      // A set-aside draft takes its media with it; otherwise hers stays put.
      const base = setAside ? EMPTY_COMPOSER_DRAFT : live.current.draft
      const receiver = receiverOverride ?? live.current.receiver
      // Set aside BEFORE the box is overwritten, and show what was kept: the
      // displaced draft is the only copy of that work, so it reaches its holder
      // before the composer that was holding it is replaced.
      const kept = setAside ? setWorkAside(setAside, receiver, 'mine') : null
      live.current.applyDraft({ ...base, text })
      authority.current = {
        handoff,
        receiver,
        activeChildId: live.current.activeChildId,
        inComposer: true,
        expectedText: text,
        observed: false,
      }
      setState({ kind: 'filled', handoff, setAside: kept })
    },
    [setWorkAside],
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

  // ── The box: stamp its owner once, and release its slot when emptied ──────
  useEffect(() => {
    const current = live.current.draft
    if (composerDraftIsEmpty(current)) {
      if (draftOwner.current) {
        const { owner, threadId: owned, session } = draftOwner.current
        saveComposerCustody(owner, owned, EMPTY_COMPOSER_DRAFT, Date.now(), session)
        draftOwner.current = null
      }
      return
    }
    // Whatever is in the box is kept, question or not. Two earlier rules used
    // to stand here and both were the same P2 mistake — that the question in
    // the box is "not hers" and is recoverable from the planner, so the box
    // could be left unstamped, and that a set-aside draft should hold the only
    // slot. The planner holds the ORIGINAL SENTENCE and nothing else: not the
    // words she changed in it, not the photo she attached to it, not the image
    // idea she started beside it. Those exist nowhere else, so they are stamped
    // and saved like any other unsent work — and the draft the question
    // displaced has a home of its own, so keeping this one cannot cost that one.
    if (!draftOwner.current) {
      draftOwner.current = {
        owner: ownerOf(live.current.receiver),
        threadId: live.current.receiver.threadId,
        session: currentComposerCustodySession(),
      }
    }
  }, [signature])

  // ── Arrival: custody first, then the question ───────────────────────────
  useEffect(() => {
    if (!settled) return
    if (live.current.receiver.contextChildId === '' && contextSettlePass === 0) {
      // The extra COMMIT is the point, which is the one thing the render-phase
      // alternative cannot express: state set during render re-runs this
      // component immediately, still before the chat's own mount effect has
      // installed its tab — the pass being waited out. The hand-off is an
      // external one-time take, so believing an unresolved tab too early
      // refuses it for good.
      // eslint-disable-next-line react-hooks/set-state-in-effect -- deliberate one-commit settle; see above
      setContextSettlePass(1)
      return
    }

    let restored: ComposerDraft | null = null
    let offered: ComposerDraft | null = null
    if (!restoreAttempted.current) {
      restoreAttempted.current = true
      // PEEKED, because what happens to it is not known yet. Everything below
      // this line can return without anywhere to put a cross-thread draft — the
      // hand-off can be refused or expired (a children read that settled past
      // the 2-minute TTL is exactly that), and a saved conversation she decides
      // to stay in is another — and a take here emptied the slot before any of
      // those were decided, leaving her only copy in a local variable belonging
      // to a function that had already returned. So the slot keeps it until
      // something PLACES it.
      const look = peekComposerCustody(ownerOf(live.current.receiver), threadId)
      if (look.kind === 'same-thread') {
        // This one is placed here and now, so it is consumed here and now.
        // Placed, so its raw-file previews become this page's to own and to
        // clean up; `restored` is the adopted draft everywhere below, or a
        // later set-aside would hand the departed instance's URLs back.
        takeComposerCustody(ownerOf(live.current.receiver), threadId)
        restored = adoptRestoredUploadPreviews(look.draft)
        draftOwner.current = {
          owner: ownerOf(live.current.receiver),
          threadId,
          session: currentComposerCustodySession(),
        }
        live.current.applyDraft(restored)
      } else if (look.kind === 'other-thread' && generation !== null) {
        offered = look.draft
      }

      // The second home, read at the same moment: a draft set aside before the
      // route change is still set aside after it, and the way back to it has to
      // come back with it. Peeked, not taken — the take is the restore tap.
      const waiting = peekDisplacedComposerCustody(ownerOf(live.current.receiver))
      if (waiting.kind === 'held') {
        displaced.current = {
          draft: waiting.draft,
          owner: ownerOf(live.current.receiver),
          threadId: waiting.threadId,
          session: currentComposerCustodySession(),
          holds: waiting.holds,
        }
        // Said out loud on an ordinary return, where no louder note is coming.
        // A hand-off's own states are decided below and overwrite this.
        setState(noticeWithoutQuestion())
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

    // TAKEN here, where it is placed, and not where it was looked at. Both
    // early returns above leave it in the slot under the owner and the sign-in
    // it was typed under, for the visit that can actually show it — and the take
    // is also the re-check, so a sign-in that ended or a TTL that passed between
    // the peek and the placement comes back empty rather than placing stale
    // work. Adopting the previews belongs here too: one mint per placement, and
    // a URL minted for work that is never placed is one nothing would revoke.
    let placed: ComposerDraft | null = null
    if (offered) {
      const taken = takeComposerCustody(ownerOf(live.current.receiver), threadId, {
        acceptOtherThread: true,
      })
      if (taken.kind !== 'none') placed = adoptRestoredUploadPreviews(taken.draft)
    }
    const mine =
      placed ??
      (restored && !composerDraftIsEmpty(restored) ? restored : null) ??
      (!composerDraftIsEmpty(live.current.draft) ? live.current.draft : null)
    if (mine) {
      if (placed) {
        draftOwner.current = {
          owner: ownerOf(live.current.receiver),
          threadId,
          session: currentComposerCustodySession(),
        }
        live.current.applyDraft(placed)
      }
      hold(decision.handoff)
      setState({ kind: 'collision', handoff: decision.handoff, mine, fromOtherThread: placed !== null })
      return
    }

    fill(decision.handoff, null)
  }, [
    settled,
    contextSettlePass,
    generation,
    threadId,
    receiverKey,
    activeChildId,
    isParent,
    fill,
    hold,
    noticeWithoutQuestion,
  ])

  // ── Invalidation, and the end of an owned draft's life ──────────────────
  useEffect(() => {
    // Her set-aside work outlives the notice, but not the scope it was typed
    // in. The custody entry keeps its own label and is left alone — an entry
    // that cannot be acted on is never consumed and dropped — but it stops
    // being OFFERED, because the composer in front of her now belongs to
    // another tab, another child or another sign-in.
    const stamp = displaced.current
    if (stamp && !displacedIsLive(stamp)) {
      displaced.current = null
      setState((prev) => (prev.kind === 'set-aside' ? { kind: 'idle' } : prev))
    }
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
      // A Send, or a box she cleared herself. Either way the question's note is
      // finished and her set-aside draft is NOT: the offer to bring it back
      // replaces the note rather than going with it, which is the one that was
      // silently discarding her work on send.
      const after = noticeWithoutQuestion()
      setState((prev) => (prev.kind === 'filled' ? after : prev))
      return
    }
    // An edit is adopted, not disowned: edited incoming text keeps its guard.
    if (draftText !== held.expectedText) authority.current = { ...held, expectedText: draftText }
  }, [
    draftText,
    receiverKey,
    activeChildId,
    isParent,
    authorityNow,
    revoke,
    displacedIsLive,
    noticeWithoutQuestion,
  ])

  // ── On the way out: hand HER work to custody, under its own owner ───────
  useEffect(
    () => () => {
      const stamp = draftOwner.current
      // Nothing in the box to keep: touch the slot at all and a StrictMode
      // replay (or a pre-settle pass) would wipe a draft it cannot see.
      if (!stamp) return
      const outgoing = live.current.draft
      // The box goes over VERBATIM — the P2's second half. This used to blank
      // the text whenever the question was in the composer, on the claim that
      // the question is recoverable from the planner. Only the original
      // sentence is: her edits to it, and anything she attached beside it, were
      // deleted on the way out. Nothing here decides what is worth keeping.
      //
      // The draft the question displaced is NOT handed over from here. It went
      // to its own slot at the moment it was displaced, under the scope it was
      // displaced in, so neither of the two drafts is this save's to overwrite.
      //
      // The session stamp is why this is safe on a LOGOUT, which is also an
      // unmount: the scope observer ends that session in the same commit, and a
      // save carrying the session it was typed under is refused rather than
      // re-filling the slot for whoever signs in next.
      saveComposerCustody(stamp.owner, stamp.threadId, outgoing, Date.now(), stamp.session)
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
    if (state.kind !== 'collision' && state.kind !== 'kept' && state.kind !== 'displace-confirm') {
      return
    }
    if (guardHeld(false) === 'blocked') return
    // Her draft is preserved BEFORE the replacement, not after — and it is the
    // composer as it stands AT THE DECISION, not the snapshot taken when the
    // collision arrived. The notice is live: she can edit the text, or cancel a
    // raw-file selection, while the choice is on screen, and setting aside the
    // arrival snapshot lost that edit and resurrected the cancelled file with a
    // revoked preview behind it.
    //
    // That includes an OFFERED cross-thread draft. The arrival does not merely
    // offer it: it PLACES it — `adoptRestoredUploadPreviews` then `applyDraft`,
    // both before the collision state is set — so by the time the choice is on
    // screen that work IS the live composer, editable and cancellable like any
    // other collision. Reading its arrival snapshot threw exactly those edits
    // away. The live draft is the placed work, so nothing is merged and nothing
    // of another thread's is invented here.
    const mine = live.current.draft
    const setAside = composerDraftIsEmpty(mine) ? null : mine
    const standing = displaced.current
    // Two homes, and both are full: the box holds one draft and a DIFFERENT one
    // is already set aside (she came back to it, or restored and kept typing).
    // Taking the question would need a third, so she is asked rather than told —
    // the one overwrite left in this feature, and it is not silent.
    if (setAside && standing && displacedIsLive(standing) && state.kind !== 'displace-confirm') {
      setState({ kind: 'displace-confirm', handoff: state.handoff, standing: standing.draft })
      return
    }
    fill(state.handoff, setAside)
  }, [state, guardHeld, fill, displacedIsLive])

  /**
   * Bring her set-aside draft back.
   *
   * Driven by the REF, not by the notice's state, so it works from the full
   * arrival note and from the slim set-aside one alike — and so a notice that
   * closed, or a Send that finished, has not taken the action with it.
   */
  const restoreSetAside = useCallback(() => {
    const stamp = displaced.current
    if (!stamp) return
    // Re-checked synchronously, from the committed render's identity, because
    // the TAP is what places the work: placing it under a scope that has moved
    // is how one child's words reach another child's composer.
    if (!displacedIsLive(stamp)) {
      displaced.current = null
      setState((prev) => (prev.kind === 'set-aside' ? { kind: 'idle' } : prev))
      return
    }
    // Consumed where it is PLACED, which is the slot's own rule, and the take is
    // the second check: a sign-in that ended, or a scope the shell observer
    // cleared, comes back empty and nothing is restored from a stale copy.
    const taken = takeDisplacedComposerCustody(stamp.owner)
    displaced.current = null
    if (taken.kind !== 'held') {
      setState((prev) => (prev.kind === 'set-aside' ? { kind: 'idle' } : prev))
      return
    }
    const held = authority.current
    const outgoing = live.current.draft
    // A SWAP, not an overwrite. What is in the box right now is a second,
    // genuinely different draft — her edited question, the photo she attached
    // to it — and the slot it is going into has just been emptied, so both
    // drafts live and the restore is reversible. (The P2 again: this used to
    // apply the old draft straight over the new work and say nothing.)
    if (composerDraftIsEmpty(outgoing)) {
      displaced.current = null
    } else {
      setWorkAside(outgoing, live.current.receiver, held?.inComposer ? 'question' : 'mine')
    }
    if (held) authority.current = { ...held, inComposer: false, expectedText: '', observed: false }
    // Stamped with the conversation it is in NOW, not the one it was displaced
    // from: the take above used the slot's own key, but from here on this is
    // live work in the live box, which is where it would be handed over from.
    draftOwner.current = {
      owner: stamp.owner,
      threadId: live.current.receiver.threadId,
      session: currentComposerCustodySession(),
    }
    // Adopted on EVERY placement, including this one. The strings in the slot
    // belong to whichever instance minted them, and that instance's upload
    // failure or cancel revokes them — so a restored chooser showing them is
    // one dead `blob:` away from the eighth browser run's blank thumbnail.
    // Deriving a view this page owns is the only way the files stay usable.
    live.current.applyDraft(adoptRestoredUploadPreviews(taken.draft))
    setState(held ? { kind: 'kept', handoff: held.handoff } : noticeWithoutQuestion())
  }, [displacedIsLive, setWorkAside, noticeWithoutQuestion])

  const discardSetAside = useCallback(() => {
    const stamp = displaced.current
    displaced.current = null
    // Her explicit throw-away, through the slot's own "she emptied the box"
    // path, which clears this owner's entry and nobody else's.
    if (stamp) {
      saveDisplacedComposerCustody(
        stamp.owner,
        stamp.threadId,
        EMPTY_COMPOSER_DRAFT,
        stamp.holds,
        Date.now(),
        stamp.session,
      )
    }
    setState((prev) =>
      prev.kind === 'set-aside'
        ? { kind: 'idle' }
        : prev.kind === 'filled'
          ? { ...prev, setAside: null }
          : prev,
    )
  }, [])

  /**
   * "Keep it" on the displace confirmation: both drafts stay where they are.
   *
   * The question is untouched and still held, so the `kept` note's own offer to
   * use it is the way forward once she has dealt with one of the two drafts.
   */
  const keepSetAside = useCallback(() => {
    setState((prev) =>
      prev.kind === 'displace-confirm' ? { kind: 'kept', handoff: prev.handoff } : prev,
    )
  }, [])

  const startFresh = useCallback(() => {
    if (state.kind !== 'thread-choice') return
    if (guardHeld(false) === 'blocked') return
    const { handoff } = state
    let mine = live.current.draft
    let fromOtherThread = false
    // Local state and the `?thread` param only — no write. Send mints the thread.
    live.current.startFreshThread()
    // Stamped with the thread this draft is now in (`null`), not the one the ref
    // still shows: no render has happened yet.
    const fresh: PlannerAskReceiver = { ...live.current.receiver, threadId: null }
    if (composerDraftIsEmpty(mine)) {
      // The arrival PEEKED a cross-thread draft rather than consuming it, and
      // this tap is what gives it somewhere to be: she has landed in the
      // conversation it was typed in, with an empty box. So it is taken here —
      // the first moment it can be placed — and offered as the collision it is.
      // Only with an empty box: a draft she can see in front of her is the one
      // that wins, and the other stays in the slot rather than being merged
      // into something she never typed.
      const waiting = takeComposerCustody(ownerOf(fresh), fresh.threadId)
      if (waiting.kind === 'same-thread') {
        mine = adoptRestoredUploadPreviews(waiting.draft)
        fromOtherThread = true
        draftOwner.current = {
          owner: ownerOf(fresh),
          threadId: fresh.threadId,
          session: currentComposerCustodySession(),
        }
        live.current.applyDraft(mine)
      }
    }
    if (composerDraftIsEmpty(mine)) {
      fill(handoff, null, fresh)
      return
    }
    hold(handoff, fresh)
    setState({ kind: 'collision', handoff, mine, fromOtherThread })
  }, [state, guardHeld, fill, hold])

  const keepConversation = useCallback(() => {
    const held = authority.current
    authority.current = null
    setState(held ? { kind: 'declined', handoff: held.handoff } : { kind: 'idle' })
  }, [])

  // Closing a note is not a decision about her work: the offer to bring a
  // set-aside draft back takes the note's place instead of going with it.
  const dismiss = useCallback(() => setState(noticeWithoutQuestion()), [noticeWithoutQuestion])

  return {
    state,
    keepExisting,
    replaceWithQuestion,
    restoreSetAside,
    startFresh,
    keepConversation,
    discardSetAside,
    keepSetAside,
    dismiss,
    guardSend,
  }
}
