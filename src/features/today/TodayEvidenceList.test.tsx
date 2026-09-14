// ── Today's evidence, as a person reads it (UX-431) ─────────────────────────
//
// **The clock assertions do not depend on `process.env.TZ`**, which the suite
// does not pin: every time below is read in a NAMED zone by `formatClockTime`,
// so the expectations hold under any runtime zone. Verified by running this
// file under `TZ=Asia/Tokyo` as well as the default — which is the strongest
// form of "pin TZ", since a pinned suite only proves the answer under the one
// zone it pinned. `clockTime.test.ts` carries the positive control showing the
// bare `toLocaleTimeString` pattern this replaces DOES move with the runtime.
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import TodayEvidenceList from './TodayEvidenceList'
import {
  EVIDENCE_EMPTY_LINE,
  EVIDENCE_FAILED_LINE,
  EvidenceAudience,
  FILE_MISSING_LABEL,
  KID_EVIDENCE_EMPTY_LINE,
  KID_FILE_MISSING_LABEL,
} from './todayEvidence'
import type { Artifact, ChecklistItem } from '../../core/types'
import {
  EngineStage,
  EvidenceType,
  LearningLocation,
  SubjectBucket,
} from '../../core/types/enums'

const artifact = (over: Partial<Artifact>): Artifact => ({
  childId: 'lincoln',
  title: 'Work',
  type: EvidenceType.Photo,
  createdAt: '2026-09-14T14:05:00Z',
  tags: {
    engineStage: EngineStage.Build,
    domain: '',
    subjectBucket: SubjectBucket.Reading,
    location: LearningLocation.Home,
  },
  ...over,
})

const readingRow: ChecklistItem = {
  label: 'Reading (20m)',
  completed: true,
  evidenceArtifactId: 'a-photo',
}

// The five types, one of each, as a day actually produces them.
const FIVE: Artifact[] = [
  artifact({
    id: 'a-photo',
    type: EvidenceType.Photo,
    title: 'Reading — Lincoln’s work',
    uri: 'https://x/photo.jpg',
    createdAt: '2026-09-14T13:00:00Z',
  }),
  artifact({
    id: 'a-note',
    type: EvidenceType.Note,
    title: 'Narration',
    content: 'He retold the whole chapter.',
    createdAt: '2026-09-14T14:00:00Z',
  }),
  artifact({
    id: 'a-audio',
    type: EvidenceType.Audio,
    title: 'Read aloud',
    uri: 'https://x/clip.webm',
    createdAt: '2026-09-14T15:00:00Z',
  }),
  artifact({
    id: 'a-video',
    type: EvidenceType.Video,
    title: 'Pyramids clip',
    uri: 'https://youtube.com/watch?v=abc',
    content: 'https://youtube.com/watch?v=abc',
    createdAt: '2026-09-14T16:00:00Z',
  }),
  artifact({
    id: 'a-page',
    type: EvidenceType.Worksheet,
    title: 'Math lesson 41',
    uri: 'https://x/page.jpg',
    createdAt: '2026-09-14T17:00:00Z',
  }),
]

describe('TodayEvidenceList — the parent (UX-431)', () => {
  it('renders all five types, none of them as a bare title', () => {
    const { container } = render(
      <TodayEvidenceList
        artifacts={FIVE}
        checklist={[readingRow]}
        audience={EvidenceAudience.Parent}
      />,
    )
    for (const word of ['Photo', 'Note', 'Audio', 'Video', 'Page']) {
      expect(screen.getByText(word)).toBeTruthy()
    }
    // The photo's picture, the audio's player and the video's link all reached
    // the screen — before this, only Photo and Audio did, and only from `uri`.
    expect(container.querySelector('img[src="https://x/photo.jpg"]')).toBeTruthy()
    expect(container.querySelector('audio[src="https://x/clip.webm"]')).toBeTruthy()
    expect(
      container.querySelector('a[href="https://youtube.com/watch?v=abc"]'),
    ).toBeTruthy()
  })

  it('shows the time each one was added, in the family zone', () => {
    render(<TodayEvidenceList artifacts={FIVE} audience={EvidenceAudience.Parent} />)
    expect(screen.getByText('8:00 AM')).toBeTruthy() // 13:00Z
    expect(screen.getByText('12:00 PM')).toBeTruthy() // 17:00Z
  })

  it('reads oldest first — the order the day happened in', () => {
    const { container } = render(
      <TodayEvidenceList artifacts={[...FIVE].reverse()} audience={EvidenceAudience.Parent} />,
    )
    const text = container.textContent ?? ''
    expect(text.indexOf('Narration')).toBeLessThan(text.indexOf('Read aloud'))
    expect(text.indexOf('Read aloud')).toBeLessThan(text.indexOf('Math lesson 41'))
  })

  it('names the row a piece of evidence is attached to', () => {
    render(
      <TodayEvidenceList
        artifacts={[FIVE[0]]}
        checklist={[readingRow]}
        audience={EvidenceAudience.Parent}
      />,
    )
    // The planner's trailing `(20m)` is not what a person calls the row.
    expect(screen.getByText('Reading')).toBeTruthy()
    expect(screen.queryByText(FILE_MISSING_LABEL)).toBeNull()
  })

  it('says so plainly when it cannot tell which row', () => {
    render(<TodayEvidenceList artifacts={[FIVE[1]]} audience={EvidenceAudience.Parent} />)
    expect(screen.getByText('(not attached to a row)')).toBeTruthy()
  })

  it('a Note with no file renders its text, not an empty card', () => {
    render(<TodayEvidenceList artifacts={[FIVE[1]]} audience={EvidenceAudience.Parent} />)
    expect(screen.getByText('He retold the whole chapter.')).toBeTruthy()
    expect(screen.queryByText(FILE_MISSING_LABEL)).toBeNull()
  })

  it('renders the parent’s own notes verbatim', () => {
    render(
      <TodayEvidenceList
        artifacts={[artifact({ id: 'n', notes: 'Did it standing up at the counter.' })]}
        audience={EvidenceAudience.Parent}
      />,
    )
    expect(screen.getByText('Did it standing up at the counter.')).toBeTruthy()
  })

  it('a media artifact with no file SAYS so', () => {
    render(
      <TodayEvidenceList
        artifacts={[artifact({ id: 'broken', type: EvidenceType.Photo, title: 'Lost photo' })]}
        audience={EvidenceAudience.Parent}
      />,
    )
    expect(screen.getByText('Lost photo')).toBeTruthy()
    expect(screen.getByText(FILE_MISSING_LABEL)).toBeTruthy()
  })

  it('an empty day is ONE line, not an empty card', () => {
    const { container } = render(
      <TodayEvidenceList artifacts={[]} audience={EvidenceAudience.Parent} />,
    )
    expect(screen.getByText(EVIDENCE_EMPTY_LINE)).toBeTruthy()
    expect(container.querySelectorAll('img')).toHaveLength(0)
  })

  it('a FAILED read is never rendered as an empty day', () => {
    render(<TodayEvidenceList artifacts={[]} audience={EvidenceAudience.Parent} failed />)
    expect(screen.getByText(EVIDENCE_FAILED_LINE)).toBeTruthy()
    expect(screen.queryByText(EVIDENCE_EMPTY_LINE)).toBeNull()
  })

  it('and a failed read shows no stale rows either', () => {
    render(<TodayEvidenceList artifacts={FIVE} audience={EvidenceAudience.Parent} failed />)
    expect(screen.getByText(EVIDENCE_FAILED_LINE)).toBeTruthy()
    expect(screen.queryByText('Narration')).toBeNull()
  })
})

describe('TodayEvidenceList — the kid', () => {
  it('renders the kid’s words, not the parent’s', () => {
    render(<TodayEvidenceList artifacts={FIVE} audience={EvidenceAudience.Kid} />)
    expect(screen.getByText('Sound')).toBeTruthy()
    expect(screen.getByText('Link')).toBeTruthy()
    expect(screen.queryByText('Audio')).toBeNull()
    expect(screen.queryByText('Video')).toBeNull()
  })

  it('gets the kid empty line and the kid file-missing wording', () => {
    render(<TodayEvidenceList artifacts={[]} audience={EvidenceAudience.Kid} />)
    expect(screen.getByText(KID_EVIDENCE_EMPTY_LINE)).toBeTruthy()

    render(
      <TodayEvidenceList
        artifacts={[artifact({ id: 'broken', type: EvidenceType.Photo })]}
        audience={EvidenceAudience.Kid}
      />,
    )
    expect(screen.getByText(KID_FILE_MISSING_LABEL)).toBeTruthy()
  })

  it('is never shown the filing phrase for an unattached entry', () => {
    render(<TodayEvidenceList artifacts={[FIVE[1]]} audience={EvidenceAudience.Kid} />)
    expect(screen.queryByText('(not attached to a row)')).toBeNull()
    // He still reads what he wrote.
    expect(screen.getByText('He retold the whole chapter.')).toBeTruthy()
  })

  it('sees the row name when there is one', () => {
    render(
      <TodayEvidenceList
        artifacts={[FIVE[0]]}
        checklist={[readingRow]}
        audience={EvidenceAudience.Kid}
      />,
    )
    expect(screen.getByText('Reading')).toBeTruthy()
  })
})

describe('a curated Watch completion (Codex round 3)', () => {
  const watched = artifact({
    id: 'a-watch',
    type: EvidenceType.Video,
    title: 'Watched How Volcanoes Work',
    tags: {
      engineStage: EngineStage.Build,
      domain: 'watch-vehicle',
      subjectBucket: SubjectBucket.Science,
      location: LearningLocation.Home,
      planItem: 'Watch: How Volcanoes Work',
      watchVideoId: 'wv-123',
    },
  })

  it('is NOT reported as a missing file — its address lives in the library', () => {
    // `buildWatchArtifact` writes no `uri` and no `mediaUrls` on purpose. Saying
    // "(file missing)" over a video the family actually watched is false, and
    // saying "(no file)" to a six-year-old about it is worse.
    render(<TodayEvidenceList artifacts={[watched]} audience={EvidenceAudience.Parent} />)
    expect(screen.getByText('Watched How Volcanoes Work')).toBeTruthy()
    expect(screen.queryByText(FILE_MISSING_LABEL)).toBeNull()

    render(<TodayEvidenceList artifacts={[watched]} audience={EvidenceAudience.Kid} />)
    expect(screen.queryByText(KID_FILE_MISSING_LABEL)).toBeNull()
  })
})

describe('it writes nothing and offers no control', () => {
  it('renders no button, checkbox or input', () => {
    const { container } = render(
      <TodayEvidenceList
        artifacts={FIVE}
        checklist={[readingRow]}
        audience={EvidenceAudience.Parent}
      />,
    )
    expect(container.querySelectorAll('button')).toHaveLength(0)
    expect(container.querySelectorAll('input')).toHaveLength(0)
  })
})
