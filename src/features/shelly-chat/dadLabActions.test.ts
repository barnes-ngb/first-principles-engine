import { describe, expect, it } from 'vitest'

import type { ConceptArc } from '../../core/types'
import { ArcOrigin, ArcStepStatus } from '../../core/types/enums'

import {
  buildArcStepsFromAction,
  DAD_LAB_NOTICES,
  dadLabActionFootnote,
  describeDadLabAction,
  formatChildNames,
  isDadLabAction,
  resolveDadLabAction,
  resolveDadLabActionForDisplay,
  stepOutOfRangeNotice,
  type DadLabAction,
} from './dadLabActions'

const CHILDREN = [
  { id: 'lincoln1', name: 'Lincoln' },
  { id: 'london1', name: 'London' },
]

const ARC: ConceptArc = {
  id: 'arc_elec',
  title: 'The Electricity Arc',
  domainLabel: 'Electricity',
  childIds: ['lincoln1', 'london1'],
  steps: [
    { title: 'Static electricity', conceptBeat: 'Charge jumps', status: ArcStepStatus.Done },
    { title: 'Make a circuit', conceptBeat: 'A loop lets current flow', status: ArcStepStatus.Active },
  ],
  createdFrom: ArcOrigin.OwnerAuthored,
  createdAt: '2026-08-01T00:00:00.000Z',
  updatedAt: '2026-08-01T00:00:00.000Z',
}

const CREATE_ARC: DadLabAction = {
  kind: 'createConceptArc',
  childId: 'lincoln1',
  title: 'The Motor Arc',
  steps: [{ title: 'Spin a magnet' }, { title: 'Build the motor', conceptBeat: 'Current makes torque' }],
}

const PLAN_LAB: DadLabAction = {
  kind: 'planLab',
  childId: 'lincoln1',
  title: 'Make a bulb light up',
  labType: 'science',
}

describe('resolveDadLabAction — the gate before a card (FEAT-157)', () => {
  it('refuses everything for a kid profile, with the reason shown', () => {
    const out = resolveDadLabAction(CREATE_ARC, [ARC], CHILDREN, false)
    expect(out).toEqual({ ok: false, notice: DAD_LAB_NOTICES.notPermitted })
    expect(resolveDadLabAction(PLAN_LAB, [ARC], CHILDREN, false).ok).toBe(false)
  })

  it('resolves an arc create, defaulting the audience to every child (DATA-04)', () => {
    const out = resolveDadLabAction(CREATE_ARC, [], CHILDREN, true)
    expect(out).toEqual({
      ok: true,
      resolved: { action: CREATE_ARC, childNames: ['Lincoln', 'London'] },
    })
  })

  it('resolves a named audience to names, and refuses an unknown child WHOLE', () => {
    const named = { ...CREATE_ARC, childIds: ['london1'] }
    const out = resolveDadLabAction(named, [], CHILDREN, true)
    expect(out).toEqual({ ok: true, resolved: { action: named, childNames: ['London'] } })

    const bad = { ...CREATE_ARC, childIds: ['london1', 'stranger'] }
    expect(resolveDadLabAction(bad, [], CHILDREN, true)).toEqual({
      ok: false,
      notice: DAD_LAB_NOTICES.unknownChild,
    })
  })

  it('resolves an unlinked lab without needing any arcs at all', () => {
    const out = resolveDadLabAction(PLAN_LAB, [], CHILDREN, true)
    expect(out).toEqual({
      ok: true,
      resolved: { action: PLAN_LAB, childNames: ['Lincoln', 'London'] },
    })
  })

  it('a hallucinated arcId never reaches a card — dropped with the reason shown', () => {
    const linked = { ...PLAN_LAB, arcId: 'arc_made_up' }
    expect(resolveDadLabAction(linked, [ARC], CHILDREN, true)).toEqual({
      ok: false,
      notice: DAD_LAB_NOTICES.unknownArc,
    })
  })

  it('an out-of-range step index is refused by the arc, by name and step count', () => {
    const linked = { ...PLAN_LAB, arcId: 'arc_elec', arcStepIndex: 2 }
    expect(resolveDadLabAction(linked, [ARC], CHILDREN, true)).toEqual({
      ok: false,
      notice: stepOutOfRangeNotice('The Electricity Arc', 2),
    })
  })

  it('a real arc + in-range step resolves, carrying the arc for the card', () => {
    const linked = { ...PLAN_LAB, arcId: 'arc_elec', arcStepIndex: 1 }
    const out = resolveDadLabAction(linked, [ARC], CHILDREN, true)
    expect(out).toEqual({
      ok: true,
      resolved: { action: linked, arc: ARC, childNames: ['Lincoln', 'London'] },
    })
  })
})

describe('resolveDadLabActionForDisplay — lenient once tapped (FEAT-157)', () => {
  it('renders a linked lab even after its arc vanished, without the arc line', () => {
    const linked = { ...PLAN_LAB, arcId: 'arc_gone', arcStepIndex: 0 }
    const out = resolveDadLabActionForDisplay(linked, [], CHILDREN)
    expect(out.action).toBe(linked)
    expect(out.arc).toBeUndefined()
  })

  it('renders an arc create with its named audience', () => {
    const named = { ...CREATE_ARC, childIds: ['lincoln1'] }
    expect(resolveDadLabActionForDisplay(named, [], CHILDREN).childNames).toEqual(['Lincoln'])
  })
})

describe('buildArcStepsFromAction — the steps land verbatim, first active (FEAT-157)', () => {
  it('keeps the order, defaults a missing conceptBeat to "", and activates only step 0', () => {
    const steps = buildArcStepsFromAction([
      { title: 'Spin a magnet' },
      { title: 'Build the motor', conceptBeat: 'Current makes torque' },
      { title: 'Race it' },
    ])
    expect(steps).toEqual([
      { title: 'Spin a magnet', conceptBeat: '', status: ArcStepStatus.Active },
      { title: 'Build the motor', conceptBeat: 'Current makes torque', status: ArcStepStatus.Upcoming },
      { title: 'Race it', conceptBeat: '', status: ArcStepStatus.Upcoming },
    ])
  })
})

describe('card wording (FEAT-157)', () => {
  it('describes an arc by title and audience, never an id', () => {
    const out = describeDadLabAction({ action: CREATE_ARC, childNames: ['Lincoln', 'London'] })
    expect(out).toBe('Create the concept arc "The Motor Arc" for Lincoln and London')
  })

  it('describes a linked lab by the arc TITLE and a 1-based step number', () => {
    const linked = { ...PLAN_LAB, arcId: 'arc_elec', arcStepIndex: 1 }
    const out = describeDadLabAction({ action: linked, arc: ARC, childNames: [] })
    expect(out).toBe('Plan the Science lab "Make a bulb light up" — step 2 of "The Electricity Arc"')
    expect(out).not.toContain('arc_elec')
  })

  it('the lab footnote carries the pinned sentence and the hours rule', () => {
    const out = dadLabActionFootnote(PLAN_LAB)
    expect(out).toContain('Adds to the Dad Lab backlog — start it from the Dad Lab page.')
    expect(out).toContain('No hours are recorded until the lab is completed there.')
  })

  it('the arc footnote says the steps shown ARE the record and the rest lives on the page', () => {
    const out = dadLabActionFootnote(CREATE_ARC)
    expect(out).toContain('exactly as its steps read above')
    expect(out).toContain('Dad Lab page')
    expect(out).toContain('No hours are recorded')
  })

  it('formatChildNames handles one, two, and none', () => {
    expect(formatChildNames(['Lincoln'])).toBe('Lincoln')
    expect(formatChildNames(['Lincoln', 'London'])).toBe('Lincoln and London')
    expect(formatChildNames([])).toBe('the whole family')
  })
})

describe('isDadLabAction', () => {
  it('narrows only the two Dad Lab kinds', () => {
    expect(isDadLabAction(CREATE_ARC)).toBe(true)
    expect(isDadLabAction(PLAN_LAB)).toBe(true)
    expect(
      isDadLabAction({ kind: 'addSightWord', childId: 'lincoln1', word: 'the' }),
    ).toBe(false)
  })
})
