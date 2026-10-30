import { StrictMode, useEffect, useState } from 'react'
import { fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { setActiveChildIdShared } from '../../core/hooks/activeChildStore'
import {
  clearPlannerAskHandoff,
  stagePlannerAskHandoff,
  takePlannerAskHandoff,
} from '../planner-chat/plannerAskHandoff'
import {
  clearComposerCustody,
  EMPTY_COMPOSER_DRAFT,
  peekComposerCustody,
  saveComposerCustody,
  type ComposerCustodyOwner,
} from './composerCustody'
import { useHandoffScopeWatch } from './useHandoffScopeWatch'

/**
 * UX-273 — **a session that ends takes its two slots with it.**
 *
 * The independent browser run's first blocker: an Ask AI draft, a trip to the
 * planner, a logout with family / profile / child all unresolved, and then the
 * SAME account signing back in — and Ask AI handed the previous session's
 * private composer draft back. The observer was mounted in `AppShell`, which is
 * inside the gate, so the logout unmounted the only thing watching for it while
 * the slots themselves live in module scope and survived.
 *
 * This harness is the real shape of `App.tsx` reduced to the two facts that
 * matter: the observer is ABOVE the gate, and the composer hands its unsent work
 * to custody on the way out. The observer is the ACTUAL hook — the point is its
 * lifetime, so a hand-rolled clear would test nothing.
 *
 * It is not a full-shell authenticated end-to-end run; that is the independent
 * browser pass. What it pins is the lifetime rule the browser run found broken.
 */

const OWNER: ComposerCustodyOwner = {
  familyId: 'fam-1',
  profile: 'parents',
  chatContext: 'lincoln',
  contextChildId: 'child-a',
}

const DRAFT = 'her private draft — nobody else may read this'

/** Ask AI reduced to the one thing that outlives it: the custody hand-over. */
function ComposerHolder({ text }: { text: string }) {
  useEffect(
    () => () => {
      saveComposerCustody(OWNER, null, { ...EMPTY_COMPOSER_DRAFT, text })
    },
    [text],
  )
  return <div>composer</div>
}

function Observer({ familyId, profile }: { familyId: string; profile: string | null }) {
  useHandoffScopeWatch(familyId, profile)
  return null
}

interface Session {
  familyId: string
  profile: string | null
}

const SIGNED_IN: Session = { familyId: 'fam-1', profile: 'parents' }
const SIGNED_OUT: Session = { familyId: '', profile: null }
const OTHER_ACCOUNT: Session = { familyId: 'fam-2', profile: 'parents' }

function Harness({ initial = SIGNED_IN }: { initial?: Session }) {
  const [session, setSession] = useState<Session>(initial)
  const [draft, setDraft] = useState('')
  const open = Boolean(session.familyId) && session.profile !== null
  return (
    <>
      {/* Above the gate, exactly as in `App.tsx`: the gate closing below must
          not take the observer with it. */}
      <Observer familyId={session.familyId} profile={session.profile} />
      {open ? <ComposerHolder text={draft} /> : <div>login screen</div>}
      <button onClick={() => setDraft(DRAFT)}>type a draft</button>
      <button onClick={() => setSession(SIGNED_OUT)}>log out</button>
      <button onClick={() => setSession(SIGNED_IN)}>log in, same account</button>
      <button onClick={() => setSession(OTHER_ACCOUNT)}>log in, other account</button>
    </>
  )
}

const type = () => fireEvent.click(screen.getByText('type a draft'))
const logOut = () => fireEvent.click(screen.getByText('log out'))
const logBackIn = () => fireEvent.click(screen.getByText('log in, same account'))
const logInOther = () => fireEvent.click(screen.getByText('log in, other account'))
const held = () => peekComposerCustody(OWNER, null).kind

function stage() {
  return stagePlannerAskHandoff({
    familyId: 'fam-1',
    childId: 'child-a',
    childName: 'Lincoln',
    weekStart: '2026-11-01',
    question: 'add TGTB Math Level 1, 30 minutes daily',
    jobId: 'curriculum',
  })
}

beforeEach(() => {
  // The observer reads the child from the shared store, so the scope resolves.
  setActiveChildIdShared('child-a')
  clearPlannerAskHandoff()
  clearComposerCustody()
})

afterEach(() => {
  clearPlannerAskHandoff()
  clearComposerCustody()
})

describe('a logout ends the hand-off scope, even with Ask AI unmounted', () => {
  it('drops the unsent composer draft the gate closing handed to custody', () => {
    render(<Harness />)
    type()
    expect(held()).toBe('none') // nothing is saved while she is still on the page

    logOut()

    expect(screen.getByText('login screen')).toBeInTheDocument()
    expect(held()).toBe('none')
  })

  it('does not hand it back when the same account signs straight in again', () => {
    render(<Harness />)
    type()
    logOut()
    logBackIn()

    // The reported defect: `seen` came back as `null` on the remount and the
    // slot was still full, so the restore looked like a first load.
    expect(held()).toBe('none')
    expect(screen.getByText('composer')).toBeInTheDocument()
  })

  it('does not hand it to a different account either', () => {
    render(<Harness />)
    type()
    logOut()
    logInOther()

    expect(held()).toBe('none')
  })

  it('drops a staged question that was still in flight at logout', () => {
    render(<Harness />)
    expect(stage()).not.toBeNull()

    logOut()

    expect(takePlannerAskHandoff()).toBeNull()
  })

  it('survives StrictMode, where the composer saves on a simulated unmount', () => {
    render(
      <StrictMode>
        <Harness />
      </StrictMode>,
    )
    type()
    logOut()
    logBackIn()

    expect(held()).toBe('none')
    expect(takePlannerAskHandoff()).toBeNull()
  })
})

describe('an initial unresolved load is not a logout', () => {
  it('keeps a brand-new arrival staged while the identity is still settling', () => {
    render(<Harness initial={SIGNED_OUT} />)
    const staged = stage()
    expect(staged).not.toBeNull()

    logBackIn()

    // Clearing here would discard the payload of a legitimate arrival: `''`
    // before anything has resolved is a page loading, not a session ending.
    const payload = takePlannerAskHandoff()
    expect(payload?.generation).toBe(staged?.generation)
  })

  it('still clears once that identity has resolved and then goes away', () => {
    render(<Harness initial={SIGNED_OUT} />)
    logBackIn()
    expect(stage()).not.toBeNull()

    logOut()

    expect(takePlannerAskHandoff()).toBeNull()
  })
})
