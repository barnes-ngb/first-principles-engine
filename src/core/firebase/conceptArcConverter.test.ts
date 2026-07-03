import { describe, expect, it, vi } from 'vitest'

import type { ConceptArc } from '../types'

// firestore.ts calls initializeFirestore() at module load and uses collection/doc
// inside its helpers. Mock the firebase surface so importing the module (for the
// real converter) doesn't require a live Firebase app.
vi.mock('firebase/firestore', () => ({
  collection: vi.fn(() => ({ withConverter: vi.fn(() => ({})) })),
  doc: vi.fn(() => ({})),
  initializeFirestore: vi.fn(() => ({})),
}))
vi.mock('./firebase', () => ({ app: {} }))

import { conceptArcConverter } from './firestore'

const NOW = '2026-07-03T00:00:00.000Z'

function snapshotOf(data: Record<string, unknown>, id: string) {
  return { id, data: () => data } as unknown as Parameters<
    typeof conceptArcConverter.fromFirestore
  >[0]
}

describe('conceptArcConverter', () => {
  it('round-trips an arc, taking the document id from the snapshot', () => {
    const arc: ConceptArc = {
      title: 'The Electricity Arc',
      domainLabel: 'Electricity',
      childIds: ['lincoln', 'london'],
      steps: [
        { title: 'Static', conceptBeat: 'Charges attract', status: 'done', completedReportId: 'r1', completedDateKey: '2026-06-28' },
        { title: 'Circuit', conceptBeat: 'A loop lets current flow', status: 'active' },
        { title: 'Switch', conceptBeat: 'A break stops the flow', status: 'upcoming' },
      ],
      createdFrom: 'owner-authored',
      createdAt: NOW,
      updatedAt: NOW,
    }

    const wire = conceptArcConverter.toFirestore(arc)
    const back = conceptArcConverter.fromFirestore(snapshotOf(wire as Record<string, unknown>, 'arc-1'), {})

    expect(back.id).toBe('arc-1')
    expect(back.title).toBe('The Electricity Arc')
    expect(back.domainLabel).toBe('Electricity')
    expect(back.childIds).toEqual(['lincoln', 'london'])
    expect(back.createdFrom).toBe('owner-authored')
    expect(back.steps).toHaveLength(3)
    expect(back.steps[0]).toMatchObject({ status: 'done', completedReportId: 'r1', completedDateKey: '2026-06-28' })
    expect(back.steps[1]).toMatchObject({ title: 'Circuit', status: 'active' })
  })

  it('strips undefined optional fields on write', () => {
    const arc: ConceptArc = {
      title: 'Bare Arc',
      childIds: ['lincoln'],
      steps: [{ title: 'Beat', conceptBeat: 'idea', status: 'upcoming' }],
      createdFrom: 'owner-authored',
      createdAt: NOW,
      updatedAt: NOW,
      // domainLabel / narrativeHook / archivedAt intentionally absent
    }

    const wire = conceptArcConverter.toFirestore(arc) as Record<string, unknown>

    expect('domainLabel' in wire).toBe(false)
    expect('narrativeHook' in wire).toBe(false)
    expect('archivedAt' in wire).toBe(false)
    // the step has no optional fields set — none should leak through as undefined keys
    expect((wire.steps as Array<Record<string, unknown>>)[0]).toEqual({
      title: 'Beat',
      conceptBeat: 'idea',
      status: 'upcoming',
    })
  })
})
