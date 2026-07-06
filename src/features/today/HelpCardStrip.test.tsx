import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { ChecklistItem, HelpCard } from '../../core/types'

// ── Mocks ─────────────────────────────────────────────────────────

const getDocMock = vi.fn<(ref: unknown) => unknown>()
const setDocMock = vi.fn<(ref: unknown, data: unknown, opts: unknown) => Promise<void>>()
const chatMock = vi.fn<(req: unknown) => unknown>()

vi.mock('firebase/firestore', () => ({
  doc: vi.fn(() => ({})),
  getDoc: (ref: unknown) => getDocMock(ref),
  setDoc: (ref: unknown, data: unknown, opts: unknown) => setDocMock(ref, data, opts),
}))

vi.mock('../../core/firebase/firestore', () => ({
  helpCardsCollection: vi.fn(() => ({})),
}))

vi.mock('../../core/ai/useAI', () => ({
  TaskType: { LessonVideo: 'lessonVideo' },
  useAI: () => ({ chat: chatMock }),
}))

import HelpCardStrip from './HelpCardStrip'

// ── Fixtures ──────────────────────────────────────────────────────

const CARD: HelpCard = {
  childId: 'c1',
  itemLabel: 'Phonics — short i',
  subjectBucket: 'Reading',
  body: {
    playIt: {
      title: 'Sound Box Slam',
      howTo: ['Draw 3 boxes', 'Say a word', 'Tap a box per sound'],
      minutes: 6,
      materials: ['paper', 'pencil'],
    },
    twoKid: 'Lincoln teaches London to tap the sounds.',
    sayThis: ['Let us build words.', 'Tap slowly if stuck.', 'Good today: reads 3 of 4.'],
    attentionRescue: 'Hop one hop per sound across the room.',
    mvdVersion: 'Just tap out 3 words on fingers.',
    skipSignal: 'If two misses in a row, end on a win.',
  },
}

const ITEM: ChecklistItem = {
  label: 'Phonics — short i (15m)',
  completed: false,
  subjectBucket: 'Reading',
  category: 'must-do',
  contentGuide: 'Lesson 35 — short i',
}

function cardSnap(card: HelpCard | null) {
  return {
    exists: () => card !== null,
    id: 'c1__reading__phonics-short-i',
    data: () => card,
  }
}

beforeEach(() => {
  getDocMock.mockReset()
  setDocMock.mockClear()
  chatMock.mockReset()
})

// ── Tests ─────────────────────────────────────────────────────────

describe('HelpCardStrip', () => {
  it('renders nothing when no card exists for the item', async () => {
    getDocMock.mockResolvedValue(cardSnap(null))
    const { container } = render(
      <HelpCardStrip familyId="f1" childId="c1" item={ITEM} isMvd={false} />,
    )
    await waitFor(() => expect(getDocMock).toHaveBeenCalled())
    expect(container.textContent).not.toMatch(/Help with this/)
  })

  it('is collapsed by default: the strip shows, but section content is hidden', async () => {
    getDocMock.mockResolvedValue(cardSnap(CARD))
    render(<HelpCardStrip familyId="f1" childId="c1" item={ITEM} isMvd={false} />)
    await screen.findByText('Help with this')
    // Collapsed: the game title is not visible yet.
    expect(screen.queryByText('Sound Box Slam')).toBeNull()
  })

  it('expands to reveal all sections and lazy-fetches the video', async () => {
    getDocMock.mockResolvedValue(cardSnap(CARD))
    chatMock.mockResolvedValue({
      message: JSON.stringify({
        title: 'Short I Song',
        url: 'https://example.com/v',
        source: 'YouTube — Khan Kids',
        why: 'Teaches short i.',
        lengthNote: 'about 3 minutes',
      }),
      model: 'claude-sonnet-5',
    })

    render(<HelpCardStrip familyId="f1" childId="c1" item={ITEM} isMvd={false} />)
    const toggle = await screen.findByText('Help with this')

    // Video is NOT fetched until first expand.
    expect(chatMock).not.toHaveBeenCalled()

    fireEvent.click(toggle)

    // Sections now visible.
    expect(await screen.findByText('Sound Box Slam')).toBeInTheDocument()
    expect(screen.getByText(/Not landing\? Try this/)).toBeInTheDocument()
    expect(screen.getByText(/Hop one hop per sound/)).toBeInTheDocument()
    expect(screen.getByText(/When to stop/)).toBeInTheDocument()

    // Video lazy path: chat called with the LessonVideo task, pick rendered + cached.
    await waitFor(() => expect(chatMock).toHaveBeenCalledTimes(1))
    expect(chatMock.mock.calls[0][0]).toMatchObject({ taskType: 'lessonVideo' })
    expect(await screen.findByText('Short I Song')).toBeInTheDocument()
    await waitFor(() => expect(setDocMock).toHaveBeenCalled())
  })

  it('surfaces the 5-minute version above Play it on an MVD day', async () => {
    getDocMock.mockResolvedValue(cardSnap(CARD))
    chatMock.mockResolvedValue({ message: 'not-json', model: 'm' })

    render(<HelpCardStrip familyId="f1" childId="c1" item={ITEM} isMvd />)
    fireEvent.click(await screen.findByText('Help with this'))

    const fiveMin = await screen.findByText('5-minute version')
    const playIt = screen.getByText(/^Play it/)
    // MVD renders the 5-min block earlier in the DOM than Play it.
    expect(
      fiveMin.compareDocumentPosition(playIt) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy()
  })
})
