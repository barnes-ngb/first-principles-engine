import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'

// The three capture components are STUBBED, not reimplemented — which is the
// point of the test: this surface composes what already exists.
vi.mock('../../components/PhotoCapture', () => ({
  default: ({ onCaptureBatch }: { onCaptureBatch?: (f: File[]) => void }) => (
    <button
      data-testid="photo"
      onClick={() => onCaptureBatch?.([new File(['x'], 'e.jpg', { type: 'image/jpeg' })])}
    >
      photo
    </button>
  ),
}))
vi.mock('../../components/AudioRecorder', () => ({
  default: ({ onCapture }: { onCapture: (b: Blob) => void }) => (
    <button data-testid="audio" onClick={() => onCapture(new Blob(['a']))}>
      audio
    </button>
  ),
}))
vi.mock('../../components/VoiceInput', () => ({
  default: ({ onTranscript }: { onTranscript: (t: string) => void }) => (
    <button data-testid="voice" onClick={() => onTranscript('he told me about pyramids')}>
      voice
    </button>
  ),
}))

import type { ActivityConfig } from '../../core/types'
import { ActivityFrequency, ActivityType, SubjectBucket } from '../../core/types/enums'
import StrandSessionDialog from './StrandSessionDialog'
import { STRAND_SESSION_REFUSALS } from './strandSession'

function strand(overrides: Partial<ActivityConfig> = {}): ActivityConfig {
  return {
    id: 's1',
    name: 'History',
    type: ActivityType.Strand,
    subjectBucket: SubjectBucket.SocialStudies,
    defaultMinutes: 30,
    frequency: ActivityFrequency.TwoPerWeek,
    childId: 'c1',
    sortOrder: 0,
    completed: false,
    scannable: false,
    createdAt: '2026-08-01T00:00:00.000Z',
    updatedAt: '2026-08-01T00:00:00.000Z',
    ...overrides,
  } as ActivityConfig
}

const onSave = vi.fn()
const onClose = vi.fn()

function renderDialog(overrides: Record<string, unknown> = {}) {
  return render(
    <StrandSessionDialog
      open
      config={strand()}
      isChildProfile={false}
      voiceProfile={{ id: 'c1' }}
      onClose={onClose}
      onSave={onSave}
      {...overrides}
    />,
  )
}

const typeTopic = (value: string) => {
  fireEvent.change(screen.getByLabelText('What was this about?'), { target: { value } })
}

beforeEach(() => {
  onSave.mockClear()
  onClose.mockClear()
})

describe('a session needs a topic AND evidence', () => {
  it('will not save with neither', () => {
    renderDialog()
    expect(screen.getByRole('button', { name: 'Record session' })).toBeDisabled()
  })

  it('will not save with a topic alone, and says why', () => {
    renderDialog()
    typeTopic('Ancient Egypt')
    expect(screen.getByRole('button', { name: 'Record session' })).toBeDisabled()
    expect(screen.getByText(STRAND_SESSION_REFUSALS.noEvidence)).toBeInTheDocument()
  })

  it('will not save with evidence alone, and says why', () => {
    renderDialog()
    fireEvent.click(screen.getByTestId('photo'))
    expect(screen.getByRole('button', { name: 'Record session' })).toBeDisabled()
    expect(screen.getByText(STRAND_SESSION_REFUSALS.noTopic)).toBeInTheDocument()
  })

  it('saves once both are there', () => {
    renderDialog()
    typeTopic('Ancient Egypt')
    fireEvent.click(screen.getByTestId('photo'))
    fireEvent.click(screen.getByRole('button', { name: 'Record session' }))
    expect(onSave).toHaveBeenCalledTimes(1)
    expect(onSave.mock.calls[0][0]).toBe('Ancient Egypt')
    expect(onSave.mock.calls[0][1].photos).toHaveLength(1)
  })
})

describe('all four evidence kinds are first-class', () => {
  it.each([
    ['photo', 'photos'],
    ['audio', 'audio'],
  ])('accepts %s from the existing component', (testId, key) => {
    renderDialog()
    typeTopic('Ancient Egypt')
    fireEvent.click(screen.getByTestId(testId))
    fireEvent.click(screen.getByRole('button', { name: 'Record session' }))
    expect(onSave.mock.calls[0][1][key]).toBeTruthy()
  })

  it('accepts a note and a link', () => {
    renderDialog()
    typeTopic('Ancient Egypt')
    fireEvent.change(screen.getByLabelText('A note'), { target: { value: 'we read a book' } })
    fireEvent.change(screen.getByLabelText('A link'), {
      target: { value: 'https://example.com/v' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Record session' }))
    expect(onSave.mock.calls[0][1].note).toBe('we read a book')
    expect(onSave.mock.calls[0][1].videoUrl).toBe('https://example.com/v')
  })

  it('accepts the bare domain a person actually pastes', () => {
    renderDialog()
    typeTopic('Ancient Egypt')
    fireEvent.change(screen.getByLabelText('A link'), {
      target: { value: 'youtube.com/watch?v=abc' },
    })
    expect(screen.getByRole('button', { name: 'Record session' })).toBeEnabled()
  })

  it('says so when the link is not one, rather than "add some evidence"', () => {
    renderDialog()
    typeTopic('Ancient Egypt')
    fireEvent.change(screen.getByLabelText('A link'), { target: { value: 'not a url ??' } })
    expect(screen.getByRole('button', { name: 'Record session' })).toBeDisabled()
    expect(screen.getByText(STRAND_SESSION_REFUSALS.badLink)).toBeInTheDocument()
  })

  it('offers voice beside the note — not a sixth typed-only surface (TEST-216)', () => {
    renderDialog()
    expect(screen.getByTestId('voice')).toBeInTheDocument()
  })

  it('appends a transcript rather than replacing what is there', () => {
    renderDialog()
    typeTopic('Ancient Egypt')
    fireEvent.change(screen.getByLabelText('A note'), { target: { value: 'London said:' } })
    fireEvent.click(screen.getByTestId('voice'))
    fireEvent.click(screen.getByRole('button', { name: 'Record session' }))
    expect(onSave.mock.calls[0][1].note).toBe('London said: he told me about pyramids')
  })
})

describe('topics she has used before', () => {
  it('offers them back', () => {
    renderDialog({ config: strand({ recentTopics: ['Ancient Egypt', 'The Pilgrims'] }) })
    fireEvent.focus(screen.getByLabelText('What was this about?'))
    fireEvent.keyDown(screen.getByLabelText('What was this about?'), { key: 'ArrowDown' })
    expect(screen.getByText('Ancient Egypt')).toBeInTheDocument()
    expect(screen.getByText('The Pilgrims')).toBeInTheDocument()
  })

  it('is never a closed list — a brand-new topic saves', () => {
    renderDialog({ config: strand({ recentTopics: ['Ancient Egypt'] }) })
    typeTopic('The Silk Road')
    fireEvent.click(screen.getByTestId('photo'))
    fireEvent.click(screen.getByRole('button', { name: 'Record session' }))
    expect(onSave.mock.calls[0][0]).toBe('The Silk Road')
  })

  it('says nothing about suggestions on a strand that has none', () => {
    renderDialog()
    expect(
      screen.queryByText('Pick one you have used before, or type something new.'),
    ).not.toBeInTheDocument()
  })
})

describe('the capability gate — never a name', () => {
  it('a child profile gets the notice and no way to record', () => {
    renderDialog({ isChildProfile: true })
    expect(screen.queryByRole('button', { name: 'Record session' })).not.toBeInTheDocument()
    expect(screen.queryByTestId('photo')).not.toBeInTheDocument()
    expect(screen.queryByLabelText('What was this about?')).not.toBeInTheDocument()
    expect(screen.getByText(/grown-up records a session/i)).toBeInTheDocument()
  })
})

describe('a failed write', () => {
  it('is shown without closing, so nothing she captured is lost', () => {
    renderDialog({ error: 'That session was not recorded. Nothing was saved — try again.' })
    expect(screen.getByText(/was not recorded/)).toBeInTheDocument()
    expect(screen.getByLabelText('What was this about?')).toBeInTheDocument()
  })

  it('cannot be cancelled mid-write', () => {
    renderDialog({ saving: true })
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(onClose).not.toHaveBeenCalled()
  })
})

describe('the count it is about to move', () => {
  it('says where the strand stands, with no total', () => {
    renderDialog({ config: strand({ currentPosition: 13 }) })
    const line = screen.getByText(/13 sessions so far/)
    expect(line).toBeInTheDocument()
    expect(line.textContent).not.toMatch(/ of |%/)
  })

  it('reads honestly before the first session', () => {
    renderDialog()
    expect(screen.getByText('This will be the first session.')).toBeInTheDocument()
  })
})
