import { StrictMode, useState } from 'react'
import { fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { setActiveChildIdShared } from '../../core/hooks/activeChildStore'
import {
  clearPlannerAskHandoff,
  stagePlannerAskHandoff,
  takePlannerAskHandoff,
} from '../planner-chat/plannerAskHandoff'
import {
  clearComposerCustody,
  currentComposerCustodySession,
  EMPTY_COMPOSER_DRAFT,
  peekComposerCustody,
  saveComposerCustody,
  type ComposerCustodyOwner,
  type ComposerDraft,
} from './composerCustody'
import { usePlannerAskHandoff } from './usePlannerAskHandoff'
import { handoffScopeIdentity, useHandoffScopeWatch } from './useHandoffScopeWatch'

/**
 * UX-273 — **a session that ends takes its two slots with it.**
 *
 * The independent browser run's first blocker: an Ask AI draft, a trip to the
 * planner, a logout with family / profile / child unresolved, and then the SAME
 * account signing back in — and Ask AI handed the previous session's private
 * composer draft back. The observer was mounted in `AppShell`, which is inside
 * the gate, so the logout unmounted the only thing watching for it while the
 * slots themselves live in module scope and survived.
 *
 * **The composer here is the REAL one's lifecycle**: `usePlannerAskHandoff`
 * owns the save-on-unmount, the restore-on-mount and the owner stamp, and it is
 * mounted BELOW a gate shaped like `AuthGate`/`ProfileGate` with the actual
 * observer above it. An earlier fixture hand-rolled the save and held the draft
 * text in state ABOVE the gate, which is not where `ShellyChatPage`'s state
 * lives: the remount then received the old text as a prop and saved it again, so
 * the fixture manufactured the very leak it was asserting about. Nothing here
 * holds composer state above the gate, and the identity rule is the shipped
 * `handoffScopeIdentity`, not a second copy of it.
 *
 * It is not a full-shell authenticated end-to-end run; that is the independent
 * browser pass. What it pins is the lifetime rule the browser run found broken,
 * plus the ordinary route departure that must keep working.
 */

const FAMILY = 'fam-1'
const CHILD = { id: 'child-lincoln', name: 'Lincoln' }
const DRAFT = 'her private draft — nobody else may read this'

const OWNER: ComposerCustodyOwner = {
  familyId: FAMILY,
  profile: 'parents',
  chatContext: 'lincoln',
  contextChildId: CHILD.id,
}

interface Session {
  loading: boolean
  user: { isAnonymous: boolean } | null
  familyId: string | null
  profile: string | null
}

const SIGNED_IN: Session = {
  loading: false,
  user: { isAnonymous: false },
  familyId: FAMILY,
  profile: 'parents',
}
/** Ordinary logout. `profile` persists — `ProfileProvider` sits above the auth. */
const SIGNED_OUT: Session = { loading: false, user: null, familyId: null, profile: 'parents' }
const OTHER_ACCOUNT: Session = { ...SIGNED_IN, familyId: 'fam-2' }
/** The gate shuts on an anonymous user, and an anonymous user still has a uid. */
const ANONYMOUS: Session = { ...SIGNED_IN, user: { isAnonymous: true }, familyId: 'uid-anon' }
const PROFILE_EXIT: Session = { ...SIGNED_IN, profile: null }
const STILL_LOADING: Session = { loading: true, user: null, familyId: null, profile: null }

/** The real receiver, with its real custody lifecycle, inside the gate. */
function AskAiComposer({ familyId, profile }: { familyId: string; profile: string }) {
  const [draft, setDraft] = useState<ComposerDraft>(EMPTY_COMPOSER_DRAFT)
  usePlannerAskHandoff({
    familyId,
    profile,
    isParent: profile === 'parents',
    activeChildId: CHILD.id,
    childrenLoading: false,
    children: [CHILD],
    chatContext: 'lincoln',
    threadId: null,
    draft,
    applyDraft: setDraft,
    startFreshThread: () => {},
  })
  return (
    <textarea
      aria-label="composer"
      value={draft.text}
      onChange={(e) => setDraft({ ...draft, text: e.target.value })}
    />
  )
}

function Observer({ session }: { session: Session }) {
  useHandoffScopeWatch(handoffScopeIdentity(session), session.profile)
  return null
}

/** `AuthGate` → `ProfileGate` → the route, in that order and on the same rule. */
function Gate({ session, onRoute }: { session: Session; onRoute: boolean }) {
  const familyId = handoffScopeIdentity(session)
  if (session.loading) return <div>loading</div>
  if (!familyId) return <div>login screen</div>
  if (session.profile === null) return <div>choose a profile</div>
  if (!onRoute) return <div>some other page</div>
  return <AskAiComposer familyId={familyId} profile={session.profile} />
}

function Harness({ initial = SIGNED_IN }: { initial?: Session }) {
  const [session, setSession] = useState<Session>(initial)
  const [onRoute, setOnRoute] = useState(true)
  return (
    <MemoryRouter>
      {/* Above the gate, exactly as in `App.tsx`: the gate closing below must
          not take the observer with it. */}
      <Observer session={session} />
      <Gate session={session} onRoute={onRoute} />
      <button onClick={() => setSession(SIGNED_OUT)}>log out</button>
      <button onClick={() => setSession(SIGNED_IN)}>log in, same account</button>
      <button onClick={() => setSession(OTHER_ACCOUNT)}>log in, other account</button>
      <button onClick={() => setSession(ANONYMOUS)}>downgrade to anonymous</button>
      <button onClick={() => setSession(PROFILE_EXIT)}>exit the profile</button>
      <button onClick={() => setOnRoute(false)}>leave the page</button>
      <button onClick={() => setOnRoute(true)}>come back</button>
    </MemoryRouter>
  )
}

const composer = () => screen.getByLabelText('composer') as HTMLTextAreaElement
const type = (text = DRAFT) => fireEvent.change(composer(), { target: { value: text } })
const click = (label: string) => fireEvent.click(screen.getByText(label))
const held = () => peekComposerCustody(OWNER, null).kind

function stage() {
  return stagePlannerAskHandoff({
    familyId: FAMILY,
    childId: CHILD.id,
    childName: CHILD.name,
    weekStart: '2026-11-01',
    question: 'add TGTB Math Level 1, 30 minutes daily',
    jobId: 'curriculum',
  })
}

beforeEach(() => {
  // The observer reads the child from the shared store, so the scope resolves.
  setActiveChildIdShared(CHILD.id)
  clearPlannerAskHandoff()
  clearComposerCustody()
})

afterEach(() => {
  clearPlannerAskHandoff()
  clearComposerCustody()
})

describe('an ordinary route departure still keeps her work', () => {
  it('saves it on the way out and hands it back on the way in', () => {
    render(<Harness />)
    type()

    click('leave the page')
    expect(screen.getByText('some other page')).toBeInTheDocument()
    expect(held()).toBe('same-thread')

    click('come back')
    expect(composer().value).toBe(DRAFT)
  })

  it('keeps it across a departure under StrictMode too', () => {
    render(
      <StrictMode>
        <Harness />
      </StrictMode>,
    )
    type()
    click('leave the page')
    click('come back')
    expect(composer().value).toBe(DRAFT)
  })
})

describe('a logout ends the hand-off scope, even with Ask AI unmounted', () => {
  it('drops the draft the gate closing handed to custody', () => {
    render(<Harness />)
    type()

    click('log out')

    expect(screen.getByText('login screen')).toBeInTheDocument()
    expect(held()).toBe('none')
  })

  it('does not hand it back when the same account signs straight in again', () => {
    render(<Harness />)
    type()
    click('log out')
    click('log in, same account')

    // The reported defect: the observer's `seen` came back as `null` on the
    // remount and the slot was still full, so the restore looked like a first
    // load and filled the box for whoever is holding the phone.
    expect(composer().value).toBe('')
    expect(held()).toBe('none')
  })

  it('does not hand it to a different account either', () => {
    render(<Harness />)
    type()
    click('log out')
    click('log in, other account')
    expect(held()).toBe('none')
  })

  it('treats leaving the profile the same way, and coming back to it', () => {
    render(<Harness />)
    type()
    click('exit the profile')
    expect(screen.getByText('choose a profile')).toBeInTheDocument()
    expect(held()).toBe('none')

    click('log in, same account')
    expect(composer().value).toBe('')
  })

  it('treats an authority downgraded to anonymous as the session ending', () => {
    // `AuthContext` keeps a uid for an anonymous user while `AuthGate` shows the
    // login page, so the uid alone would read this as an unchanged session.
    render(<Harness />)
    type()

    click('downgrade to anonymous')

    expect(screen.getByText('login screen')).toBeInTheDocument()
    expect(held()).toBe('none')
  })

  it('drops a staged question that was still in flight at logout', () => {
    render(<Harness />)
    expect(stage()).not.toBeNull()

    click('log out')

    expect(takePlannerAskHandoff()).toBeNull()
  })

  it('survives StrictMode, where the composer replays its save', () => {
    render(
      <StrictMode>
        <Harness />
      </StrictMode>,
    )
    type()
    click('log out')
    click('log in, same account')

    expect(composer().value).toBe('')
    expect(held()).toBe('none')
  })
})

describe('work from a session that is over cannot come back late', () => {
  it('refuses a save that lands after the logout', () => {
    render(<Harness />)
    type()
    const sessionSheTypedUnder = currentComposerCustodySession()

    click('log out')
    expect(held()).toBe('none')

    // A cleanup or an upload/image callback that outlived the route and settles
    // after the session ended. Ordering is not what makes this safe: the save
    // carries the session the work was typed under, and that one is over.
    saveComposerCustody(
      OWNER,
      null,
      { ...EMPTY_COMPOSER_DRAFT, text: DRAFT },
      Date.now(),
      sessionSheTypedUnder,
    )

    expect(held()).toBe('none')
    click('log in, same account')
    expect(composer().value).toBe('')
  })
})

describe('an initial unresolved load is not a logout', () => {
  it('keeps a brand-new arrival staged while the identity is still settling', () => {
    render(<Harness initial={STILL_LOADING} />)
    expect(screen.getByText('loading')).toBeInTheDocument()
    const staged = stage()
    expect(staged).not.toBeNull()

    click('log in, same account')

    // Clearing here would discard the payload of a legitimate arrival: `''`
    // before anything has resolved is a page loading, not a session ending.
    expect(takePlannerAskHandoff()?.generation).toBe(staged?.generation)
  })

  it('still clears once that identity has resolved and then goes away', () => {
    render(<Harness initial={STILL_LOADING} />)
    click('log in, same account')
    expect(stage()).not.toBeNull()

    click('log out')

    expect(takePlannerAskHandoff()).toBeNull()
  })
})
