import { render, screen, fireEvent } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import WeekInEvidence from './WeekInEvidence'
import { hasAnyEvidenceToShow } from './weekInEvidence.logic'
import type { WeekEvidence } from '../../core/types'

const emptyEvidence: WeekEvidence = {
  books: {
    booksCreated: [],
    booksCompleted: [],
    readingSessions: { count: 0, totalMinutes: 0, booksRead: [] },
  },
  teachBacks: {
    count: 0,
    bySubject: {},
    audioCount: 0,
    textCount: 0,
    examples: [],
  },
}

describe('hasAnyEvidenceToShow', () => {
  it('returns false when nothing was captured', () => {
    expect(hasAnyEvidenceToShow(emptyEvidence)).toBe(false)
  })

  it('returns true when books exist', () => {
    expect(
      hasAnyEvidenceToShow({
        ...emptyEvidence,
        books: {
          ...emptyEvidence.books,
          booksCreated: [{ title: 'x', pages: 1, isAiGenerated: false }],
        },
      }),
    ).toBe(true)
  })

  it('returns true when teach-backs exist', () => {
    expect(
      hasAnyEvidenceToShow({
        ...emptyEvidence,
        teachBacks: {
          count: 1,
          bySubject: { Reading: 1 },
          audioCount: 0,
          textCount: 1,
          examples: [],
        },
      }),
    ).toBe(true)
  })
})

describe('WeekInEvidence', () => {
  it('renders nothing when there is no evidence for the child', () => {
    const { container } = render(
      <WeekInEvidence childName="Lincoln" evidence={emptyEvidence} />,
    )
    expect(container.firstChild).toBeNull()
  })

  it('renders the section title with the child name when evidence exists', () => {
    render(
      <WeekInEvidence
        childName="Lincoln"
        evidence={{
          ...emptyEvidence,
          teachBacks: {
            count: 2,
            bySubject: { Reading: 2 },
            audioCount: 1,
            textCount: 1,
            examples: [],
          },
        }}
      />,
    )
    expect(screen.getByText('Week in Evidence — Lincoln')).toBeInTheDocument()
  })

  it('renders books column with counts and titles', () => {
    render(
      <WeekInEvidence
        childName="London"
        evidence={{
          books: {
            booksCreated: [
              { title: 'Magic Forest', pages: 5, isAiGenerated: true, theme: 'fantasy' },
            ],
            booksCompleted: [{ title: 'Old Tale' }],
            readingSessions: {
              count: 2,
              totalMinutes: 45,
              booksRead: [
                { title: 'Lion the Witch', totalMinutes: 30 },
                { title: 'Another', totalMinutes: 15 },
              ],
            },
          },
          teachBacks: emptyEvidence.teachBacks,
        }}
      />,
    )
    expect(screen.getByText(/1 created, 1 completed/)).toBeInTheDocument()
    expect(screen.getByText(/2 reading sessions/)).toBeInTheDocument()
    expect(screen.getByText(/45 min cumulative/)).toBeInTheDocument()
    expect(screen.getByText(/Lion the Witch/)).toBeInTheDocument()
    expect(screen.getByText(/Magic Forest/)).toBeInTheDocument()
  })

  it('renders teach-back subject chips and audio listen button', () => {
    render(
      <WeekInEvidence
        childName="Lincoln"
        evidence={{
          ...emptyEvidence,
          teachBacks: {
            count: 4,
            bySubject: { Reading: 3, Math: 1 },
            audioCount: 3,
            textCount: 1,
            examples: [
              {
                subject: 'Reading',
                hasAudio: true,
                audioUrl: 'https://example.com/a.webm',
                createdAt: '2026-02-26',
              },
            ],
          },
        }}
      />,
    )
    expect(screen.getByText(/4 moments captured/)).toBeInTheDocument()
    expect(screen.getByText('Reading (3)')).toBeInTheDocument()
    expect(screen.getByText('Math (1)')).toBeInTheDocument()
    expect(screen.getByText(/3 audio, 1 text-only/)).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: /listen to highlights/i }),
    ).toBeInTheDocument()
  })

  it('expands audio playback when "Listen to highlights" is clicked', () => {
    const { container } = render(
      <WeekInEvidence
        childName="Lincoln"
        evidence={{
          ...emptyEvidence,
          teachBacks: {
            count: 1,
            bySubject: { Reading: 1 },
            audioCount: 1,
            textCount: 0,
            examples: [
              {
                subject: 'Reading',
                hasAudio: true,
                audioUrl: 'https://example.com/a.webm',
                excerpt: 'I taught London about words',
                createdAt: '2026-02-26',
              },
            ],
          },
        }}
      />,
    )
    const listenBtn = screen.getByRole('button', { name: /listen to highlights/i })
    fireEvent.click(listenBtn)
    const audio = container.querySelector('audio')
    expect(audio).not.toBeNull()
    expect(audio?.getAttribute('src')).toBe('https://example.com/a.webm')
    expect(screen.getByText(/I taught London about words/)).toBeInTheDocument()
  })

  it('does not show the listen button when no audio examples exist', () => {
    render(
      <WeekInEvidence
        childName="Lincoln"
        evidence={{
          ...emptyEvidence,
          teachBacks: {
            count: 1,
            bySubject: { Reading: 1 },
            audioCount: 0,
            textCount: 1,
            examples: [
              {
                subject: 'Reading',
                hasAudio: false,
                excerpt: 'I told London',
                createdAt: '2026-02-26',
              },
            ],
          },
        }}
      />,
    )
    expect(
      screen.queryByRole('button', { name: /listen to highlights/i }),
    ).not.toBeInTheDocument()
  })
})
