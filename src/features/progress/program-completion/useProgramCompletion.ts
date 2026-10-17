import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { onSnapshot, query, where } from 'firebase/firestore'

import { useFamilyId } from '../../../core/auth/useAuth'
import {
  programCompletionEventsCollection,
  programCompletionStateCollection,
} from '../../../core/firebase/firestore'
import {
  ProgramCompletionRefused,
  applyProgramCompletionProjection,
  confirmProgramCompletion,
  withdrawProgramCompletion,
  type ProgramCompletionWriteResult,
} from '../../../core/firebase/programCompletionWrites'
import {
  programCompletionStateId,
  type CompletionWithdrawReason,
  type ProgramCompletionEvent,
  type ProgramCompletionProgram,
  type ProgramCompletionState,
} from '../../../core/types/programCompletion'
import { completionFailureNotice, type ReviewedCompletionDraft } from './programCompletionRule'

/**
 * Read and record one child's whole-program completions (FEAT-242).
 *
 * The same three disciplines the FEAT-241 hook next door establishes, for the
 * same reasons — they are not stylistic:
 *
 * **The child is a PARAMETER, never read from the shell.** The only writer of
 * these collections is reached through here, and a hook that resolved the child
 * itself would write wherever the header happened to be pointing when an await
 * came back. The surface above pins family + child, passes them in, and passes
 * them again on every save, retry and withdrawal.
 *
 * **A failed read is not an empty record.** State and events are cleared and the
 * scope un-stamped DURING RENDER whenever the family or child changes, so one
 * child's finished-program record can never be shown under another child's name
 * while a new subscription settles. A read that FAILS sets `error` and leaves the
 * record empty with the scope stamped — because "nothing recorded" invites a
 * confirmation and "we could not find out" must not.
 *
 * **Settlement names the FAMILY as well as the child.** A child id is unique
 * inside a family and not across sign-ins, so a settlement naming only the child
 * lets a queued callback from an account that has just signed out present its
 * record as the new account's. Both callbacks are checked against the scope as
 * COMMITTED (a layout effect, so a switch in the commit that queued them is
 * already visible) and against the subscription's own generation, which is what
 * makes an A → B → A round trip safe.
 */

export interface CompletionScope {
  familyId: string
  childId: string
}

/** The write actually in the air — not merely *that* one is. */
export interface InFlightCompletionSave extends CompletionScope {
  entryKey: string
  kind: 'confirm' | 'withdraw' | 'apply'
}

export interface ConfirmCompletionRequest {
  familyId: string
  childId: string
  entryKey: string
  reviewed: ReviewedCompletionDraft
}

export interface WithdrawCompletionRequest {
  familyId: string
  childId: string
  program: ProgramCompletionProgram
  entryKey: string
  /** The confirmation being ended. Refused by the writer if it is not active. */
  withdrawsEntryKey: string
  reason: CompletionWithdrawReason
}

export interface ApplyCompletionRequest {
  familyId: string
  childId: string
  program: ProgramCompletionProgram
  /** What the surface believes is active, so a stale tap is refused. */
  expectedEntryKey?: string
}

export type CompletionWriteOutcome =
  | { ok: true; result: ProgramCompletionWriteResult; current: boolean }
  | { ok: false; message: string; refused: boolean; current: boolean }

/**
 * One subscription's own answer.
 *
 * Separate per stream (FEAT-242 review): the state document and the event
 * history are two reads that fail independently, and sharing one `error` let a
 * later state success erase a history failure — presenting an empty history as
 * authoritative. `settled` is the only thing that licenses "nothing recorded".
 */
export interface CompletionStream {
  loading: boolean
  error: string | null
  /** The family + child this stream has actually answered for, or null. */
  settled: CompletionScope | null
}

export interface UseProgramCompletionResult {
  /** The active projection for this child + program, or null when none exists. */
  state: ProgramCompletionState | null
  /** The immutable history, unsorted — the display order is the rule module's. */
  events: ProgramCompletionEvent[]
  /** The state document's own read status. */
  stateStream: CompletionStream
  /** The event history's own read status. */
  eventStream: CompletionStream
  saving: boolean
  savingRequest: InFlightCompletionSave | null
  confirm: (request: ConfirmCompletionRequest) => Promise<CompletionWriteOutcome>
  withdraw: (request: WithdrawCompletionRequest) => Promise<CompletionWriteOutcome>
  applyProjection: (request: ApplyCompletionRequest) => Promise<CompletionWriteOutcome>
}

/** What a second tap gets while the first is still in the air. */
export const COMPLETION_SAVE_IN_FLIGHT =
  'That entry is already saving — give it a moment.'

/** A stream that has not answered for the current family + child yet. */
const FRESH_STREAM: CompletionStream = { loading: true, error: null, settled: null }

export function useProgramCompletion(
  childId: string,
  program: ProgramCompletionProgram,
): UseProgramCompletionResult {
  const familyId = useFamilyId()
  const [state, setState] = useState<ProgramCompletionState | null>(null)
  const [events, setEvents] = useState<ProgramCompletionEvent[]>([])
  const [stateStream, setStateStream] = useState<CompletionStream>(FRESH_STREAM)
  const [eventStream, setEventStream] = useState<CompletionStream>(FRESH_STREAM)
  const [savingRequest, setSavingRequest] = useState<InFlightCompletionSave | null>(null)

  const scopeKey = `${familyId ?? ''}|${childId}`
  const [scope, setScope] = useState({ key: scopeKey, run: 0 })
  if (scope.key !== scopeKey) {
    // During render, not in an effect: an effect runs after the children of this
    // hook's caller have already rendered once with the previous child's record.
    setScope((prev) => ({ key: scopeKey, run: prev.run + 1 }))
    setState(null)
    setEvents([])
    setStateStream(FRESH_STREAM)
    setEventStream(FRESH_STREAM)
  }

  const committedScope = useRef(scope)
  useLayoutEffect(() => {
    committedScope.current = scope
  }, [scope])

  /** One confirmed write at a time — the latch that makes a double tap one act. */
  const savingRef = useRef(false)

  useEffect(() => {
    if (!familyId || !childId) return
    const stateDocId = programCompletionStateId(childId, program)
    const stateQuery = query(
      programCompletionStateCollection(familyId),
      where('childId', '==', childId),
    )
    const eventQuery = query(
      programCompletionEventsCollection(familyId),
      where('childId', '==', childId),
    )
    const settles: CompletionScope = { familyId, childId }
    const run = scope.run
    let live = true
    const mine = () =>
      live &&
      committedScope.current.key === `${familyId}|${childId}` &&
      committedScope.current.run === run

    // Queried rather than fetched by id so both subscriptions use one shape, and
    // so a mis-filed row for this child is visible rather than invisible. One
    // equality filter, no ordering — no composite index.
    const unsubState = onSnapshot(
      stateQuery,
      (snap) => {
        if (!mine()) return
        const rows = snap.docs
          .map((d) => ({ ...d.data(), id: d.id }) as ProgramCompletionState)
          .filter((row) => row.id === stateDocId || row.program === program)
        setState(rows.find((row) => row.program === program) ?? null)
        setStateStream({ loading: false, error: null, settled: settles })
      },
      (err) => {
        console.error('[programCompletion] State snapshot error:', err)
        if (!mine()) return
        // Empty AND stamped with an error: a caller must be able to tell "none
        // recorded" from "we could not find out", because the first invites a
        // confirmation and the second must block one.
        setState(null)
        setStateStream({ loading: false, error: err.message, settled: settles })
      },
    )
    const unsubEvents = onSnapshot(
      eventQuery,
      (snap) => {
        if (!mine()) return
        setEvents(
          snap.docs
            .map((d) => ({ ...d.data(), id: d.id }) as ProgramCompletionEvent)
            .filter((row) => row.program === program),
        )
        setEventStream({ loading: false, error: null, settled: settles })
      },
      (err) => {
        console.error('[programCompletion] Event snapshot error:', err)
        if (!mine()) return
        setEvents([])
        // Scoped to THIS stream: a later state success must not erase a history
        // failure and leave an empty history looking authoritative.
        setEventStream({ loading: false, error: err.message, settled: settles })
      },
    )
    return () => {
      live = false
      unsubState()
      unsubEvents()
    }
  }, [familyId, childId, program, scope.run])

  /** The one place a write is run, latched and attributed to its own record. */
  const run = useCallback(
    async (
      inFlight: InFlightCompletionSave,
      write: () => Promise<ProgramCompletionWriteResult>,
    ): Promise<CompletionWriteOutcome> => {
      // Checked on the ref, not on `saving`: two taps in the same tick both read
      // the pre-render state value (the FIX-262 latch, same shape).
      if (savingRef.current) {
        return { ok: false, message: COMPLETION_SAVE_IN_FLIGHT, refused: true, current: true }
      }
      savingRef.current = true
      setSavingRequest(inFlight)
      // The VISIT this write belongs to, not merely its ids. An A → B → A switch
      // makes the key equal again while the visit is a different one, so a key
      // comparison alone would let a result from the first visit settle the
      // third — and `current` is what every caller gates its notices on,
      // including a determinate refusal.
      const visit = committedScope.current.run
      const key = `${inFlight.familyId}|${inFlight.childId}`
      const stillCurrent = () =>
        committedScope.current.key === key && committedScope.current.run === visit
      try {
        const result = await write()
        // Immediate read-back, but only onto the visit that asked for it.
        if (stillCurrent()) setState(result.state)
        return { ok: true, result, current: stillCurrent() }
      } catch (err) {
        console.error('[programCompletion] Write failed:', err)
        // A refusal carries its own sentence and is determinate — the writer
        // rejected it and the transaction never committed. Anything else is
        // indeterminate (the commit may have landed and the answer been lost),
        // so it gets the notice that claims neither.
        return err instanceof ProgramCompletionRefused
          ? { ok: false, message: err.message, refused: true, current: stillCurrent() }
          : {
              ok: false,
              message: completionFailureNotice(),
              refused: false,
              current: stillCurrent(),
            }
      } finally {
        savingRef.current = false
        setSavingRequest(null)
      }
    },
    [],
  )

  const confirm = useCallback(
    (request: ConfirmCompletionRequest) =>
      run(
        {
          familyId: request.familyId,
          childId: request.childId,
          entryKey: request.entryKey,
          kind: 'confirm',
        },
        () =>
          confirmProgramCompletion({
            familyId: request.familyId,
            childId: request.childId,
            program: request.reviewed.program,
            entryKey: request.entryKey,
            completion: {
              observedOn: request.reviewed.observedOn,
              source: request.reviewed.source,
              assistance: request.reviewed.assistance,
              ...(request.reviewed.note ? { note: request.reviewed.note } : {}),
              ...(request.reviewed.reportObservationId
                ? { reportObservationId: request.reviewed.reportObservationId }
                : {}),
            },
          }),
      ),
    [run],
  )

  const withdraw = useCallback(
    (request: WithdrawCompletionRequest) =>
      run(
        {
          familyId: request.familyId,
          childId: request.childId,
          entryKey: request.entryKey,
          kind: 'withdraw',
        },
        () =>
          withdrawProgramCompletion({
            familyId: request.familyId,
            childId: request.childId,
            program: request.program,
            entryKey: request.entryKey,
            withdrawsEntryKey: request.withdrawsEntryKey,
            reason: request.reason,
          }),
      ),
    [run],
  )

  const applyProjection = useCallback(
    (request: ApplyCompletionRequest) =>
      run(
        {
          familyId: request.familyId,
          childId: request.childId,
          entryKey: request.expectedEntryKey ?? 'apply',
          kind: 'apply',
        },
        () =>
          applyProgramCompletionProjection({
            familyId: request.familyId,
            childId: request.childId,
            program: request.program,
            ...(request.expectedEntryKey
              ? { expectedEntryKey: request.expectedEntryKey }
              : {}),
          }),
      ),
    [run],
  )

  return {
    state,
    events,
    stateStream,
    eventStream,
    // Derived, so "a write is in the air" and "which record it belongs to" have
    // one source of truth and can never disagree.
    saving: savingRequest !== null,
    savingRequest,
    confirm,
    withdraw,
    applyProjection,
  }
}
