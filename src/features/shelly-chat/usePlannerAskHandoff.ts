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
//  6. The composer is NOT HERS TO USE until the restore above has happened.
//     `composerReady` is that signal, and the host keeps the box and every one
//     of its media doors visibly unavailable until it is true. The children read
//     settles asynchronously, and the arrival pass that consumes custody runs in
//     the effect AFTER it — so for one commit the page was enabled with an empty
//     box and a draft still in the slot. Anything Shelly typed or picked in that
//     window was overwritten by the restore a moment later, and skipping the
//     restore instead would have thrown away the custody draft on unmount: both
//     halves are a silent loss, which is why the fix is to not offer the box yet.
//     The flag is STATE set in the same effect pass as the placement, so the
//     commit that enables typing is the commit that already holds her draft —
//     there is no render in between. It is monotonic for the mounted visit: a
//     refusal, an empty slot, a failed read and an ordinary visit all reach it,
//     and nothing takes it away again once typing is allowed.

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
  advanceComposerCustodyThread,
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
  type ComposerCustodyOrigin,
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
  | {
      kind: 'set-aside'
      draft: ComposerDraft
      holds: ComposerCustodyHolder
      /**
       * The owner it belongs to. Carried in the STATE so the offer stops being
       * shown by a plain render-time comparison the moment the tab, the child
       * or the sign-in moves — no effect, no second commit, and nothing for a
       * wrong-scope render to slip through.
       */
      scopeKey: string
    }
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

/**
 * Report the id an operation's OWN thread creation returned.
 *
 * One shot, and only the operation that took it out of
 * {@link PlannerAskHandoffResult.beginOwnThreadMint} may call it. Calling it
 * neither creates nor opens anything: it hands the guard the one id that is
 * allowed to become its conversation, and the guard still decides.
 *
 * The decision is RETURNED, because the caller has to act on it. `true` means
 * the id was honoured and the operation may go on to make that conversation the
 * live one; `false` means the claim was refused — she has moved, signed out,
 * left the route, opened another conversation, or had a different draft placed
 * since the tap — and the operation it belonged to is stale. A refused claim
 * must abort before it changes the active conversation, the URL, or uploads
 * anything: a `void` refusal left the caller carrying on regardless, which is
 * how a switch to another tab still ended up opening the old conversation and
 * putting her photo in it.
 */
export type PlannerAskOwnThreadClaim = (mintedThreadId: string) => boolean

export interface PlannerAskHandoffResult {
  state: PlannerAskHandoffState
  /**
   * May the composer be used yet?
   *
   * `false` from the first render of the visit until the arrival pass has read
   * both custody homes and COMMITTED whatever it restores. The host's contract
   * is that while it is false the composer and every entry point that writes
   * into the composer — typing, Enter, Send, the photo picker and its chooser
   * actions, the image door and the refinement controls — are not offered, and a
   * short preparation line is shown in their place. Restore first, then type.
   *
   * It is not a permission check and it is not scope-aware: the scope guards are
   * the authority above and are unchanged. It answers one question — "could a
   * restore still land on top of her?" — and once it is true it stays true for
   * the mounted visit, including when nothing was restored at all.
   */
  composerReady: boolean
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
  /**
   * Called by an operation that is ABOUT TO create this composer's own
   * conversation to take the single-use authority for the id it is about to get.
   *
   * That is every creator which mints a conversation and leaves her unsent work
   * in the box: "Attach to my message", "Analyze", "Use as reference for image
   * creation", and the direct-generate funnel behind the image doors. Not
   * `handleSend`, which consumes the submitted text before it mints and so has
   * no unsent draft to protect.
   *
   * Call it BEFORE the operation's first `await`: that is the whole point. What
   * it returns closes over the identity, the sign-in and the draft generation of
   * the moment the tap happened, so a result that lands after she has moved,
   * signed out, left the route or had a different draft placed is refused
   * instead of re-arming a guard against a scope nobody is in. Returns `null`
   * when there is nothing to authorise — no held question, or a conversation
   * that already has an id, which is every ordinary upload.
   */
  beginOwnThreadMint: () => PlannerAskOwnThreadClaim | null
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

/**
 * The owner as one comparable string — no conversation in it.
 *
 * The same composition the render-time `ownerKey` uses, so a check made from an
 * async continuation (which has no render values) asks exactly the question the
 * screen answers.
 */
function ownerKeyOf(owner: ComposerCustodyOwner): string {
  return `${owner.familyId}|${owner.profile ?? ''}|${owner.chatContext}|${owner.contextChildId}`
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
  /**
   * The custody OWNER, as a render value — no conversation in it.
   *
   * What a set-aside offer is keyed on, and the reason it is a string rendered
   * from props rather than a check inside an effect: the offer has to stop being
   * shown in the very render where the tab or the child moves, and a scope test
   * that lives in an effect cannot be, by one commit.
   */
  const ownerKey = `${familyId}|${profile ?? ''}|${chatContext}|${contextChildId}`
  const childIds = useMemo(() => children.map((c) => c.id), [children])
  const draftText = draft.text
  const signature = draftSignature(draft)

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
   * It lives until she RESTORES it or DISCARDS it, and nothing else clears it —
   * except a scope that moves under it, which the layout effect below drops in
   * the same commit.
   */
  const displaced = useRef<{
    draft: ComposerDraft
    owner: ComposerCustodyOwner
    ownerKey: string
    threadId: string | null
    session: number
    holds: ComposerCustodyHolder
    origin: ComposerCustodyOrigin | null
  } | null>(null)

  // Committed in a LAYOUT effect rather than written during render: a render can
  // be thrown away, and a ref written in one is a mutation that never happened.
  // Layout is early enough for every reader — React runs layout effects before
  // the passive effects below, and an event handler (the Send guard) runs later
  // still — so the synchronous, fail-closed guards read the identity of the last
  // COMMITTED render, which is the one she is looking at.
  const live = useRef({ receiver, activeChildId, isParent, draft, applyDraft, startFreshThread, childIds })
  useLayoutEffect(() => {
    live.current = { receiver, activeChildId, isParent, draft, applyDraft, startFreshThread, childIds }
    // A set-aside draft stops being OFFERED in the same commit its scope moves.
    // Dropping the mirror here — a ref write in the effect that already commits
    // refs — is what keeps the actions fail-closed without an effect setting
    // state; the note itself is suppressed by `scopeKey` during render, so the
    // two halves agree and neither waits for the other.
    if (displaced.current && displaced.current.ownerKey !== ownerKey) displaced.current = null
    if (displaced.current && displaced.current.session !== currentComposerCustodySession()) {
      displaced.current = null
    }
  }, [receiver, activeChildId, isParent, draft, applyDraft, startFreshThread, childIds, ownerKey])

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
  const restoreAttempted = useRef(false)
  const decidedGeneration = useRef<number | null>(null)

  // ── What a late result has to still be true for ──────────────────────────
  //
  // Two facts an async continuation cannot read off a render, both for the same
  // reason: an operation that started under one draft in one visit must not be
  // able to act on another.
  //
  // `onThisVisit` is the route. A departure unmounts this hook, and the
  // continuation of an operation it started keeps running — holding THIS
  // instance's refs, which nothing else will ever read again. Re-assigned in the
  // effect body, not just cleared in the cleanup, so a StrictMode replay's
  // simulated unmount does not retire the instance that is actually mounted.
  //
  // `placements` counts the times this hook has PLACED a draft wholesale — a
  // fill, an arrival restore, a swap, a revocation. It does not count her
  // typing: an edit keeps its guard and must keep a claim too, since typing
  // while an upload runs is ordinary. A placement is the opposite — the box now
  // holds different work from the one the operation was started for.
  const onThisVisit = useRef(false)
  useEffect(() => {
    onThisVisit.current = true
    return () => {
      onThisVisit.current = false
    }
  }, [])
  const placements = useRef(0)

  const generation = plannerAskHandoffGenerationFromState(location.state)
  const settled = profile !== null && Boolean(familyId) && !childrenLoading
  // One extra pass before believing "this tab maps to no child": the chat
  // initialises its tab in its own mount effect, which runs in this same flush.
  const [contextSettlePass, setContextSettlePass] = useState(0)
  /**
   * Has the arrival pass finished putting things in the box?
   *
   * The readiness signal behind {@link PlannerAskHandoffResult.composerReady},
   * and deliberately STATE rather than a ref: the host renders from it, so the
   * one commit in which it becomes true has to be a commit React performs — and
   * it is the same batched commit as the `applyDraft` that restores her draft,
   * because both are set from one pass of the effect below.
   */
  const [restoreSettled, setRestoreSettled] = useState(false)

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
    placements.current += 1
    authority.current = null
    if (held.inComposer) live.current.applyDraft({ ...live.current.draft, text: '' })
    setState({ kind: 'withdrawn', handoff: held.handoff, reason })
  }, [])

  /**
   * Is a set-aside draft still THIS composer's to offer back?
   *
   * The owner and the sign-in, and deliberately NOT the thread. The slot keys
   * on the thread because it PLACES work without being asked, and work from
   * another conversation must only ever be offered; a restore is the opposite —
   * an explicit tap putting her own words in the box she is looking at. And the
   * thread of a fresh conversation moves on Send (`null` becomes the minted id)
   * without any scope changing, so reading it here would make the offer vanish
   * at the one moment she most needs it: the question has just left the box.
   *
   * Whether the draft may be SENT is a different question with a different
   * answer, asked of the hand-off's own authority — see `armFromOrigin`.
   */
  const displacedIsLive = useCallback(
    (stamp: { owner: ComposerCustodyOwner; session: number }) =>
      stamp.session === currentComposerCustodySession() &&
      sameComposerOwner(stamp.owner, ownerOf(live.current.receiver)),
    [],
  )

  /** The guard metadata to travel with a carried draft, or `null` for hers. */
  const originOf = useCallback(
    (held: HeldAsk | null): ComposerCustodyOrigin | null =>
      held?.inComposer
        ? { handoff: held.handoff, receiver: held.receiver, activeChildId: held.activeChildId }
        : null,
    [],
  )

  /**
   * Put a carried question back UNDER ITS ORIGINAL GUARD.
   *
   * The release review's behavioural blocker in one function. A restored
   * question used to come back as ordinary typing, so Send sent it wherever
   * Shelly happened to be — London's tab wrote London's conversation while the text
   * still named Lincoln and carried Lincoln's week. The authority is rebuilt
   * from the origin the draft travelled with, which is the identity it was
   * ACCEPTED under: the original receiver, the original active child, the
   * original payload with its generation, source week and staging time.
   *
   * Nothing is re-stamped as newly legitimate. It is deliberately NOT
   * `acceptPlannerAskHandoff` — that is an arrival, and an arrival would read
   * the live scope as the one it was accepted for, which is the defect. The
   * invalidation effect and the synchronous Send guard then evaluate it exactly
   * as they evaluate a live one, so a tab or child that moved reads as a
   * REVOCATION: the text goes, the notice says why and names where the question
   * still is, and Send does nothing.
   */
  const armFromOrigin = useCallback((origin: ComposerCustodyOrigin, text: string) => {
    placements.current += 1
    authority.current = {
      handoff: origin.handoff,
      receiver: origin.receiver,
      activeChildId: origin.activeChildId,
      inComposer: true,
      expectedText: text,
      // Not yet SEEN, exactly as a fresh fill is not: the placement is a state
      // update, so the next pass can still read the pre-placement box. Calling
      // that empty box a clear is candidate 2's P1, and it would drop the guard
      // at the moment it is being installed. The Send guard does not wait on
      // this — it is armed from here on.
      observed: false,
    }
  }, [])

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
      origin: ComposerCustodyOrigin | null,
    ): ComposerDraft | null => {
      const owner = ownerOf(receiver)
      const threadId = receiver.threadId
      const session = currentComposerCustodySession()
      // The guard travels with the draft into the second home too: a question
      // set aside by a restore is still a question, and it comes back guarded.
      saveDisplacedComposerCustody(owner, threadId, draft, holds, Date.now(), session, origin)
      const kept = peekDisplacedComposerCustody(owner)
      displaced.current =
        kept.kind === 'held'
          ? {
              draft: kept.draft,
              owner,
              ownerKey: ownerKeyOf(owner),
              threadId: kept.threadId,
              session,
              holds: kept.holds,
              origin: kept.origin,
            }
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
    return {
      kind: 'set-aside',
      draft: stamp.draft,
      holds: stamp.holds,
      scopeKey: stamp.ownerKey,
    }
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
      // What is leaving the box: hers, or a question still under guard (the
      // `kept` note's "use the question instead", after a restore swapped one
      // in). Read BEFORE the authority below replaces it, so a guarded draft
      // takes its guard with it.
      const leaving = authority.current
      const asideHolds: ComposerCustodyHolder = leaving?.inComposer ? 'question' : 'mine'
      // Set aside BEFORE the box is overwritten, and show what was kept: the
      // displaced draft is the only copy of that work, so it reaches its holder
      // before the composer that was holding it is replaced.
      const kept = setAside
        ? setWorkAside(setAside, receiver, asideHolds, originOf(leaving))
        : null
      placements.current += 1
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
    [setWorkAside, originOf],
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

  /**
   * Take the incoming question's hold — UNLESS the box is already holding a
   * guarded one.
   *
   * A restored question is armed from its origin as it is placed, and a hold is
   * `inComposer: false` by definition: writing one over the armed authority
   * would unguard the very text she is looking at, which is the blocker the arm
   * exists to close. The arriving question is named in the choice she is shown
   * and only takes the box when she picks it — through `fill`, which carries
   * the outgoing guard into the set-aside home first.
   */
  const holdUnlessGuarded = useCallback(
    (handoff: PlannerAskHandoff, receiverOverride?: PlannerAskReceiver) => {
      if (authority.current?.inComposer) return
      hold(handoff, receiverOverride)
    },
    [hold],
  )

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
        placements.current += 1
        live.current.applyDraft(restored)
        // A carried question is placed back under the guard it was accepted
        // with, BEFORE anything on this page can send it. The checks below and
        // the Send guard then judge it against the live scope, so a tab or a
        // child that moved while she was away revokes it instead of letting it
        // go out as ordinary text.
        if (look.origin) armFromOrigin(look.origin, restored.text)
      } else if (look.kind === 'other-thread' && generation !== null && !look.origin) {
        // A cross-conversation draft is OFFERED, which means placed in the box
        // beside a collision choice — and a carried question can only be placed
        // where its guard can be rebuilt with it, which is the same-thread
        // restore above and the restore tap, not here. So one that carries an
        // origin stays in its home, recoverable under its owner, rather than
        // becoming ordinary text in another conversation's box.
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
          ownerKey,
          threadId: waiting.threadId,
          session: currentComposerCustodySession(),
          holds: waiting.holds,
          origin: waiting.origin,
        }
        // Said out loud on an ordinary return, where no louder note is coming.
        // A hand-off's own states are decided below and overwrite this.
        setState(noticeWithoutQuestion())
      }
    }

    // ── The readiness commit ────────────────────────────────────────────────
    //
    // Here, and nowhere earlier. Everything above this line either placed a
    // restored draft or decided there was none to place, so from the host's next
    // render the box is hers. It is set BEFORE the hand-off decision below on
    // purpose: that decision is part of the same batched pass (`fill`, the
    // collision, a refusal all call `setState` from right here), so the commit
    // that enables typing already carries whichever of them ran — while the
    // early returns below (no hand-off at all, a generation already decided)
    // must not leave the composer gated for the rest of the visit.
    //
    // Idempotent, so the StrictMode double-invoke and every later pass of this
    // effect are no-ops: React bails out of a set to the value it already holds.
    // eslint-disable-next-line react-hooks/set-state-in-effect -- the readiness signal itself; see the note above
    setRestoreSettled(true)

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
      holdUnlessGuarded(decision.handoff)
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
        placements.current += 1
        live.current.applyDraft(placed)
      }
      // Not a plain `hold`: the box may already be holding a question restored
      // under its own guard this very pass, and that guard outranks a hold for
      // one she has not chosen yet.
      holdUnlessGuarded(decision.handoff)
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
    holdUnlessGuarded,
    noticeWithoutQuestion,
    ownerKey,
    armFromOrigin,
  ])

  // ── Invalidation, and the end of an owned draft's life ──────────────────
  useEffect(() => {
    // A set-aside draft outlives the notice, but not the scope it was typed in.
    // That invalidation is NOT done here: the mirror is dropped in the layout
    // effect above and the note is suppressed by `scopeKey` during render, both
    // in the commit the scope moves rather than a commit later. The custody
    // entry itself keeps its own label and is left alone — an entry that cannot
    // be acted on is never consumed and dropped.
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
  }, [draftText, receiverKey, activeChildId, isParent, authorityNow, revoke, noticeWithoutQuestion])

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
      //
      // And the guard goes over WITH it. A carried question that came back
      // without its authority was ordinary text in a box, which is how a
      // Lincoln question came to be sent on London's tab.
      saveComposerCustody(
        stamp.owner,
        stamp.threadId,
        outgoing,
        Date.now(),
        stamp.session,
        originOf(authority.current),
      )
    },
    [originOf],
  )

  // ── The conversation this composer MINTS for itself ──────────────────────
  //
  // The closeout's blocker, and the one case the thread check gets wrong.
  //
  // A restored, edited Lincoln question sits in a FRESH conversation, so the
  // guard's conversation is `null`. Shelly picks a photo and taps "Attach to my
  // message" — the existing upload, her own explicit tap — and that handler
  // creates the thread document a fresh conversation has been missing and sets
  // it active. The guard then saw `null → 'abc'`, read it as "she opened another
  // conversation", revoked, and CLEARED the edited text behind a notice whose
  // own message had been withdrawn. The photo survived; her words did not.
  //
  // The thread check is right and stays: a question accepted for one
  // conversation must not be sent into another, and `null → id` is exactly what
  // selecting a saved conversation from the drawer looks like too. So the two
  // are told apart by PROVENANCE rather than by shape — not by matching the
  // child, not by allowing a `null` to be replaced freely:
  //
  //  - the authority to move is taken by the operation BEFORE its first
  //    `await`, from the identity, sign-in and draft generation of the tap;
  //  - only the id that operation's own creation returned is offered back, once;
  //  - and the offer is refused unless all of that is still true at the moment
  //    it lands — same visit, same owner, same shell child, same sign-in, same
  //    placed draft, same held question, and the live conversation still the
  //    fresh one. A result arriving after a tab switch, a logout, a departure,
  //    or a swap that moved the draft cannot re-arm anything or address a draft
  //    it was not started for; it is REFUSED OUT LOUD — the claim answers
  //    `false` so the operation that holds it aborts before it opens anything or
  //    uploads anything — and the ordinary revocation stands.
  //
  // Nothing here creates, opens, writes or sends: the thread already exists by
  // the time this is told about it, and what moves is a stamp.
  const beginOwnThreadMint = useCallback((): PlannerAskOwnThreadClaim | null => {
    const held = authority.current
    if (!held) return null
    const receiver = live.current.receiver
    // Only a composer standing in a fresh conversation can mint one, and only a
    // question whose own authority names that same fresh conversation has
    // anything to advance. Either already naming an id means this is not the
    // case the blocker is about, and an ordinary upload stays untouched.
    if (receiver.threadId !== null || held.receiver.threadId !== null) return null
    const captured = {
      owner: ownerOf(receiver),
      ownerKey: ownerKeyOf(ownerOf(receiver)),
      activeChildId: live.current.activeChildId,
      /** By identity: the very question held at the tap, not one like it. */
      handoff: held.handoff,
      session: currentComposerCustodySession(),
      placements: placements.current,
    }
    let spent = false
    // Every refusal below answers `false`, and the caller's contract is to
    // abort the operation on it: the id was minted for a moment that has passed,
    // so nothing downstream of it — the active conversation, the `?thread`
    // param, the upload — is addressed to the composer she is actually looking
    // at. The ordinary revocation stands, exactly as before.
    return (mintedThreadId: string): boolean => {
      if (spent) return false
      spent = true
      if (!mintedThreadId) return false
      if (!onThisVisit.current) return false
      if (currentComposerCustodySession() !== captured.session) return false
      if (placements.current !== captured.placements) return false
      const now = live.current.receiver
      // She has opened a conversation in the meantime, so this id is not the
      // conversation she is in and the thread check's answer is the right one.
      if (now.threadId !== null) return false
      if (ownerKeyOf(ownerOf(now)) !== captured.ownerKey) return false
      if (live.current.activeChildId !== captured.activeChildId) return false
      const still = authority.current
      if (!still || still.handoff !== captured.handoff) return false
      if (still.receiver.threadId !== null) return false

      // The guard's conversation, and nothing else about its identity.
      authority.current = {
        ...still,
        receiver: { ...still.receiver, threadId: mintedThreadId },
      }
      // The box's own home moves with it: the work in the composer now lives in
      // this conversation, so that is the conversation it would be handed over
      // from and restored into.
      const stamp = draftOwner.current
      if (
        stamp &&
        stamp.threadId === null &&
        stamp.session === captured.session &&
        sameComposerOwner(stamp.owner, captured.owner)
      ) {
        draftOwner.current = { ...stamp, threadId: mintedThreadId }
      }
      // And the set-aside home, in the slot and in the mirror the notice reads
      // from — including a set-aside QUESTION's carried origin, so a swap after
      // the upload arms it against the conversation it is actually in, instead
      // of revoking it for a fresh conversation that now has an id.
      advanceComposerCustodyThread(captured.owner, null, mintedThreadId, captured.session)
      const aside = displaced.current
      if (
        aside &&
        aside.threadId === null &&
        aside.session === captured.session &&
        sameComposerOwner(aside.owner, captured.owner)
      ) {
        displaced.current = {
          ...aside,
          threadId: mintedThreadId,
          origin:
            aside.origin && aside.origin.receiver.threadId === null
              ? {
                  ...aside.origin,
                  receiver: { ...aside.origin.receiver, threadId: mintedThreadId },
                }
              : aside.origin,
        }
      }
      return true
    }
  }, [])

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
    placements.current += 1
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
    // apply the old draft straight over the new work and say nothing.) The
    // guard of whatever leaves the box leaves with it.
    // Held as the SAVE's own answer rather than re-read off the ref below: the
    // save is what decides whether anything is actually set aside (a slot that
    // refuses leaves no offer standing), and the value it returns is the draft
    // the notice should offer back.
    let nowSetAside: ComposerDraft | null = null
    if (composerDraftIsEmpty(outgoing)) {
      displaced.current = null
    } else {
      nowSetAside = setWorkAside(
        outgoing,
        live.current.receiver,
        held?.inComposer ? 'question' : 'mine',
        originOf(held),
      )
    }
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
    const placed = adoptRestoredUploadPreviews(taken.draft)
    if (taken.origin) {
      // A set-aside QUESTION comes back guarded, under the identity it was
      // accepted with — never as ordinary text, and never re-stamped as a new
      // arrival. If the scope has moved since, the checks revoke it on the next
      // pass and the note says so; Send cannot carry it anywhere meanwhile.
      armFromOrigin(taken.origin, placed.text)
      live.current.applyDraft(placed)
      setState({
        kind: 'filled',
        handoff: taken.origin.handoff,
        setAside: nowSetAside,
      })
      return
    }
    // Hers. A question still in the box steps out of it rather than being
    // disowned, so the `kept` note can still offer it back.
    if (held) authority.current = { ...held, inComposer: false, expectedText: '', observed: false }
    live.current.applyDraft(placed)
    setState(held ? { kind: 'kept', handoff: held.handoff } : noticeWithoutQuestion())
  }, [displacedIsLive, setWorkAside, noticeWithoutQuestion, originOf, armFromOrigin])

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
      // Same rule as the arrival: a carried question is not placed anywhere its
      // guard cannot come with it. This tap is about to hold a DIFFERENT
      // question, so there is only one authority to be had — hers stays in its
      // home. (A take that found one has emptied the slot, so it is put back
      // under the owner and conversation it was saved with.)
      if (waiting.kind === 'same-thread' && waiting.origin) {
        saveComposerCustody(
          ownerOf(fresh),
          fresh.threadId,
          waiting.draft,
          Date.now(),
          currentComposerCustodySession(),
          waiting.origin,
        )
      } else if (waiting.kind === 'same-thread') {
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
    holdUnlessGuarded(handoff, fresh)
    setState({ kind: 'collision', handoff, mine, fromOtherThread })
  }, [state, guardHeld, fill, holdUnlessGuarded])

  const keepConversation = useCallback(() => {
    const held = authority.current
    authority.current = null
    setState(held ? { kind: 'declined', handoff: held.handoff } : { kind: 'idle' })
  }, [])

  // Closing a note is not a decision about her work: the offer to bring a
  // set-aside draft back takes the note's place instead of going with it.
  const dismiss = useCallback(() => setState(noticeWithoutQuestion()), [noticeWithoutQuestion])

  /**
   * A set-aside offer belongs to ONE owner, and the render in which that owner
   * changes is the render it has to stop appearing in — so the suppression is
   * rendered from props rather than written by an effect. The mirror the
   * actions read is dropped in the same commit by the layout effect above, so
   * what she can see and what she can do cannot disagree.
   */
  const visibleState: PlannerAskHandoffState =
    state.kind === 'set-aside' && state.scopeKey !== ownerKey ? { kind: 'idle' } : state

  return {
    state: visibleState,
    composerReady: restoreSettled,
    keepExisting,
    replaceWithQuestion,
    restoreSetAside,
    startFresh,
    keepConversation,
    discardSetAside,
    keepSetAside,
    dismiss,
    guardSend,
    beginOwnThreadMint,
  }
}
