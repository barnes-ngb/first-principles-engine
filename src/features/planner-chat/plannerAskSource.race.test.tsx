import { createRef, useState } from 'react'
import { act, fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import type { ChatMessage } from '../../core/types'
import { ChatMessageRole } from '../../core/types/enums'
import PlannerChatMessages from './PlannerChatMessages'
import { withDeclinedAskCleared } from './plannerRequest'
import {
  clearPlannerAskHandoff,
  takePlannerAskHandoff,
  type PlannerAskSourceKey,
} from './plannerAskHandoff'
import { usePlannerAskSource } from './usePlannerAskSource'

/**
 * UX-273 — **a refusal may only carry the question of the transcript it is IN.**
 *
 * The independent review's third blocker, from the frozen source: the hand-off
 * source was derived from the live family / child / week on every render, while
 * `messages` is local state installed by a listener and by awaited model
 * replies. So a child or week change during an `await` puts the OLD refusal in
 * the view the shell has already relabelled, and the link under it carries her
 * old question stamped with the new child and the new week. The receiver cannot
 * detect that: the payload is mislabelled at source and every field it re-checks
 * agrees with itself.
 *
 * The race is driven here with a model call that does not resolve until the test
 * releases it, against the REAL `usePlannerAskSource`, the REAL
 * `PlannerChatMessages` and the REAL `PlannerBoundaryLink` — so what is pinned
 * is the rail the page runs, not a restatement of it. The harness stands in for
 * `PlannerChatPage`'s three couplings and nothing else: the listener re-keys on
 * (child, week), the send captures its scope before the await, and the reply
 * installs the transcript afterwards.
 *
 * It is NOT a full-page `PlannerChatPage` mount — that remains the independent
 * pass's job, and is stated as an outstanding gap rather than implied here.
 */

const FAMILY = 'fam-1'
const CHILD_A = 'child-a'
const CHILD_B = 'child-b'
const WEEK_A = '2026-11-01'
const WEEK_B = '2026-11-08'
const ASK = 'add TGTB Math Level 1, 30 minutes daily'
const REFUSAL = "I can't change curriculum from here."

/** The exact shape UX-269 leaves behind: her turn, un-flagged, then the refusal. */
function refusalTranscript(ask = ASK): ChatMessage[] {
  const typed: ChatMessage[] = [
    {
      id: 'u1',
      role: ChatMessageRole.User,
      text: ask,
      typedByParent: true,
      createdAt: '2026-10-30T10:00:00.000Z',
    },
  ]
  return [
    ...withDeclinedAskCleared(typed, 'u1'),
    {
      id: 'a1',
      role: ChatMessageRole.Assistant,
      text: REFUSAL,
      boundaryJobId: 'curriculum',
      createdAt: '2026-10-30T10:00:01.000Z',
    },
  ]
}

/** The in-flight model call, released by the test. */
let release: (() => void) | null = null

function PlannerHarness() {
  const [childId, setChildId] = useState(CHILD_A)
  const [weekStart, setWeekStart] = useState(WEEK_A)
  const [isParent, setIsParent] = useState(true)
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const { live, stampTranscript, handoffSource, authorizeHandoff } = usePlannerAskSource({
    isParent,
    familyId: FAMILY,
    activeChildId: childId,
    childName: 'Lincoln',
    weekStart,
  })

  // `PlannerChatPage`'s conversation listener, DELIVERED EXPLICITLY. The real
  // one is a Firestore subscription whose snapshot arrives after the subscribe,
  // and this is a race test: the test owning the delivery moment is the point,
  // and it keeps the harness free of an effect that sets state on its own.
  const deliverSnapshot = () => {
    setMessages([])
    stampTranscript(live)
  }

  // `PlannerChatPage`'s free-form send: capture the scope, await the model,
  // install the transcript, stamp it with the scope the REQUEST was made under.
  const send = () => {
    const requestSource: PlannerAskSourceKey = live
    const pending = new Promise<void>((resolve) => {
      release = resolve
    })
    void pending.then(() => {
      setMessages(refusalTranscript())
      stampTranscript(requestSource)
    })
  }

  return (
    <>
      <PlannerChatMessages
        messages={messages}
        messagesEndRef={createRef<HTMLDivElement>()}
        {...(handoffSource ? { askHandoffSource: handoffSource } : {})}
        authorizeHandoff={authorizeHandoff}
      />
      <button onClick={deliverSnapshot}>deliver the snapshot</button>
      <button onClick={send}>ask</button>
      <button onClick={() => setChildId(CHILD_B)}>switch to London</button>
      <button onClick={() => setChildId(CHILD_A)}>switch back to Lincoln</button>
      <button onClick={() => setWeekStart(WEEK_B)}>plan next week</button>
      {/*
        The profile menu's `selectProfile`, which changes the profile in place:
        this route sits outside the parent gate, so no remount and no new
        snapshot — the child and the week do not move, and the listener is keyed
        on those.
      */}
      <button onClick={() => setIsParent(false)}>open a child profile</button>
      <button onClick={() => setIsParent(true)}>return to the parent profile</button>
    </>
  )
}

function renderPlanner() {
  const result = render(
    <MemoryRouter initialEntries={['/planner/chat']}>
      <Routes>
        <Route path="/planner/chat" element={<PlannerHarness />} />
        <Route path="/chat" element={<div>ask ai</div>} />
      </Routes>
    </MemoryRouter>,
  )
  // The mount's own subscription lands: an empty transcript, stamped with the
  // scope it subscribed under. Until something is stamped nothing is owned,
  // which is the fail-closed starting point.
  deliver()
  return result
}

const ask = () => fireEvent.click(screen.getByText('ask'))
/** The listener's snapshot for whatever scope is live now. */
const deliver = () => fireEvent.click(screen.getByText('deliver the snapshot'))
const switchChild = () => {
  fireEvent.click(screen.getByText('switch to London'))
  deliver()
}
const switchBack = () => {
  fireEvent.click(screen.getByText('switch back to Lincoln'))
  deliver()
}
const nextWeek = () => {
  fireEvent.click(screen.getByText('plan next week'))
  deliver()
}
/** Leave the parent role, then come back to it — child and week held constant. */
const leaveParentRole = () => fireEvent.click(screen.getByText('open a child profile'))
const returnToParentRole = () => fireEvent.click(screen.getByText('return to the parent profile'))
const tapRefusal = () => fireEvent.click(screen.getByRole('button', { name: /Open Ask AI/ }))
const carries = () => screen.queryByText(/Takes your question with you/)

async function releaseReply() {
  await act(async () => {
    release?.()
  })
}

beforeEach(() => {
  release = null
  clearPlannerAskHandoff()
})

afterEach(() => {
  clearPlannerAskHandoff()
})

describe('the refusal carries her question when the transcript belongs to this scope', () => {
  it('stages the source the ask was actually made under', async () => {
    renderPlanner()
    ask()
    await releaseReply()

    expect(screen.getByText(REFUSAL)).toBeInTheDocument()
    expect(carries()).toBeInTheDocument()

    tapRefusal()
    const staged = takePlannerAskHandoff()
    expect(staged?.question).toBe(ASK)
    expect(staged?.childId).toBe(CHILD_A)
    expect(staged?.weekStart).toBe(WEEK_A)
    expect(screen.getByText('ask ai')).toBeInTheDocument()
  })
})

describe('a scope change during the model call revokes the hand-off', () => {
  it('refuses to carry it when the child changed under the reply', async () => {
    renderPlanner()
    ask()
    switchChild()
    await releaseReply()

    // The transcript still installs — this run changes nothing about what the
    // planner writes or shows. What it may no longer do is OFFER the question.
    expect(screen.getByText(REFUSAL)).toBeInTheDocument()
    expect(carries()).toBeNull()

    tapRefusal()
    expect(takePlannerAskHandoff()).toBeNull()
    expect(screen.getByText('ask ai')).toBeInTheDocument()
  })

  it('refuses after a switch away and BACK, where the ids match again', async () => {
    renderPlanner()
    ask()
    switchChild()
    switchBack()
    await releaseReply()

    // Family, child and week are all equal to the request's again, so a
    // field-by-field comparison would hand the old transcript its authority
    // back. The epoch is the only thing that knows the scope was left.
    expect(screen.getByText(REFUSAL)).toBeInTheDocument()
    expect(carries()).toBeNull()

    tapRefusal()
    expect(takePlannerAskHandoff()).toBeNull()
  })

  it('refuses when the planning WEEK moved under the reply', async () => {
    renderPlanner()
    ask()
    nextWeek()
    await releaseReply()

    expect(carries()).toBeNull()
    tapRefusal()
    expect(takePlannerAskHandoff()).toBeNull()
  })

  it('leaves an ordinary later refusal alone — the suppression is not sticky', async () => {
    renderPlanner()
    ask()
    switchChild()
    await releaseReply()
    expect(carries()).toBeNull()

    // She asks again, in the scope she is now actually in.
    ask()
    await releaseReply()

    expect(carries()).toBeInTheDocument()
    tapRefusal()
    expect(takePlannerAskHandoff()?.childId).toBe(CHILD_B)
  })
})

describe('a role departure and return during the model call revokes the hand-off', () => {
  /**
   * The independent run's fourth finding, on the same frozen source: the ask is
   * made as a parent, the profile menu selects a child profile and then the
   * parents profile again, and the awaited refusal lands. `/planner/chat` is
   * outside `RequireParent` and `selectProfile` does not remount, so the page
   * is the same instance throughout and the active child and the week never
   * move — a field-by-field comparison, and a plain `isParent` gate on the
   * answer, both hand the in-flight transcript its authority back. The role has
   * to be part of the scope identity for the epoch to know it was left.
   */
  it('refuses to carry it after the parent role was left and resumed', async () => {
    renderPlanner()
    ask()
    leaveParentRole()
    returnToParentRole()
    await releaseReply()

    expect(screen.getByText(REFUSAL)).toBeInTheDocument()
    expect(carries()).toBeNull()

    tapRefusal()
    expect(takePlannerAskHandoff()).toBeNull()
  })

  it('still carries an ask made AFTER the round trip — the role is not sticky', async () => {
    renderPlanner()
    leaveParentRole()
    returnToParentRole()
    ask()
    await releaseReply()

    expect(carries()).toBeInTheDocument()
    tapRefusal()
    const staged = takePlannerAskHandoff()
    expect(staged?.question).toBe(ASK)
    expect(staged?.childId).toBe(CHILD_A)
    expect(staged?.weekStart).toBe(WEEK_A)
  })
})
