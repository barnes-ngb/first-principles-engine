import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import type { Child } from '../../core/types'

// FEAT-183 / UX-152 (B3) — which conundrum flow a kid gets is an age question.
//
// Before: `if (isLincoln)` chose the audio + quick-picks flow; everyone else
// fell into the listen + picks + drawing flow. That is the right flow for a
// 6-year-old, but it was reached by accident of name — a third older child
// landed in it too.

vi.mock('firebase/firestore', () => ({
  addDoc: vi.fn(async () => ({ id: 'a1' })),
  updateDoc: vi.fn(),
}))
vi.mock('firebase/storage', () => ({
  ref: vi.fn(() => ({})),
  uploadBytes: vi.fn(),
  getDownloadURL: vi.fn(async () => 'https://example/x'),
}))
vi.mock('../../core/firebase/firestore', () => ({ artifactsCollection: () => ({}) }))
vi.mock('../../core/firebase/storage', () => ({ storage: {} }))
vi.mock('../../core/firebase/upload', () => ({
  generateFilename: () => 'f.webm',
  uploadArtifactFile: vi.fn(),
}))
vi.mock('../../core/xp/addXpEvent', () => ({ addXpEvent: vi.fn() }))
vi.mock('../../core/xp/addDiamondEvent', () => ({ addDiamondEvent: vi.fn() }))
vi.mock('../../components/PhotoCapture', () => ({ default: () => <div data-testid="photo" /> }))

import KidConundrumResponse from './KidConundrumResponse'

const CONUNDRUM = {
  title: 'The Last Cookie',
  scenario: 'There is one cookie left.',
  question: 'What do you do?',
  quickPicks: ['Share it', 'Save it'],
  lincolnPrompt: 'OLDER-BRANCH-PROMPT',
  londonPrompt: 'YOUNGER-BRANCH-PROMPT',
  londonDrawingPrompt: 'Draw what you would do',
}

/** Real birthdates, so nothing here leans on the canonical-name seed. */
const LINCOLN = { id: 'c-lincoln', name: 'Lincoln', birthdate: '2015-09-30' } as Child
const LONDON = { id: 'c-london', name: 'London', birthdate: '2020-02-20' } as Child
const ROWAN = { id: 'c-rowan', name: 'Rowan', birthdate: '2015-04-04' } as Child
const MAEVE = { id: 'c-maeve', name: 'Maeve', birthdate: '2020-04-04' } as Child

function renderFor(child: Child) {
  render(<KidConundrumResponse conundrum={CONUNDRUM} child={child} familyId="f1" />)
}

describe('KidConundrumResponse — the flow follows the age group (B3)', () => {
  it('gives an older, differently-named child the audio + picks flow', () => {
    renderFor(ROWAN)
    expect(screen.getByText('OLDER-BRANCH-PROMPT')).toBeInTheDocument()
    expect(screen.queryByText('YOUNGER-BRANCH-PROMPT')).toBeNull()
  })

  it('gives a younger, differently-named child the drawing flow', () => {
    renderFor(MAEVE)
    expect(screen.getByText('YOUNGER-BRANCH-PROMPT')).toBeInTheDocument()
    expect(screen.getByText('Draw what you would do')).toBeInTheDocument()
    expect(screen.queryByText('OLDER-BRANCH-PROMPT')).toBeNull()
  })

  it('leaves Lincoln on the flow he has today', () => {
    renderFor(LINCOLN)
    expect(screen.getByText('OLDER-BRANCH-PROMPT')).toBeInTheDocument()
    expect(screen.queryByText('YOUNGER-BRANCH-PROMPT')).toBeNull()
  })

  it('leaves London on the drawing flow he has today', () => {
    renderFor(LONDON)
    expect(screen.getByText('YOUNGER-BRANCH-PROMPT')).toBeInTheDocument()
    expect(screen.queryByText('OLDER-BRANCH-PROMPT')).toBeNull()
  })
})
