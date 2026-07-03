import { describe, expect, it } from 'vitest'

import type { Child, ChildLabReport, DadLabReport } from '../../core/types'

import { normalizeChildRoles, resolveChildReport } from './childRoles'

const child = (id: string, name: string): Child => ({ id, name })

const LINCOLN = child('c-lincoln', 'Lincoln')
const LONDON = child('c-london', 'London')

type RoleReport = Pick<DadLabReport, 'childRoles' | 'lincolnRole' | 'londonRole'>

describe('normalizeChildRoles', () => {
  it('maps a legacy-only doc onto childIds by name (case-insensitive)', () => {
    const report: RoleReport = { lincolnRole: 'Leads the test', londonRole: 'Draws it' }
    expect(normalizeChildRoles(report, [LINCOLN, LONDON])).toEqual({
      'c-lincoln': 'Leads the test',
      'c-london': 'Draws it',
    })
  })

  it('reads a new-shape doc straight from childRoles', () => {
    const report: RoleReport = {
      childRoles: { 'c-lincoln': 'Predicts', 'c-london': 'Observes' },
    }
    expect(normalizeChildRoles(report, [LINCOLN, LONDON])).toEqual({
      'c-lincoln': 'Predicts',
      'c-london': 'Observes',
    })
  })

  it('prefers childRoles over legacy on a mixed doc, filling gaps from legacy', () => {
    const report: RoleReport = {
      childRoles: { 'c-lincoln': 'New role' },
      lincolnRole: 'Old role',
      londonRole: 'Legacy London',
    }
    // Lincoln: childRoles wins. London: only legacy present, so it fills the gap.
    expect(normalizeChildRoles(report, [LINCOLN, LONDON])).toEqual({
      'c-lincoln': 'New role',
      'c-london': 'Legacy London',
    })
  })

  it('omits an unknown child with no matching legacy field or childRoles entry', () => {
    const report: RoleReport = { lincolnRole: 'Leads' }
    const stranger = child('c-mystery', 'Riley')
    expect(normalizeChildRoles(report, [LINCOLN, stranger])).toEqual({
      'c-lincoln': 'Leads',
    })
  })

  it('matches legacy fields despite name-case variance', () => {
    const report: RoleReport = { lincolnRole: 'Leads', londonRole: 'Draws' }
    const lincolnLower = child('c-lincoln', 'lincoln')
    const londonUpper = child('c-london', 'LONDON')
    expect(normalizeChildRoles(report, [lincolnLower, londonUpper])).toEqual({
      'c-lincoln': 'Leads',
      'c-london': 'Draws',
    })
  })

  it('returns an empty map when nothing is set', () => {
    expect(normalizeChildRoles({}, [LINCOLN, LONDON])).toEqual({})
  })
})

describe('resolveChildReport', () => {
  const cr = (prediction: string): ChildLabReport => ({ prediction, artifacts: [] })

  it('resolves by Firestore id', () => {
    const reports = { 'c-lincoln': cr('by id') }
    expect(resolveChildReport(reports, LINCOLN)).toEqual(cr('by id'))
  })

  it('resolves by lowercase name key', () => {
    const reports = { lincoln: cr('by lowercase name') }
    expect(resolveChildReport(reports, LINCOLN)).toEqual(cr('by lowercase name'))
  })

  it('resolves by exact-name key', () => {
    const reports = { Lincoln: cr('by exact name') }
    expect(resolveChildReport(reports, LINCOLN)).toEqual(cr('by exact name'))
  })

  it('prefers the id key over name keys when both exist', () => {
    const reports = { 'c-lincoln': cr('id wins'), lincoln: cr('name loses') }
    expect(resolveChildReport(reports, LINCOLN)).toEqual(cr('id wins'))
  })

  it('returns an empty report for an unknown child', () => {
    expect(resolveChildReport({ london: cr('x') }, LINCOLN)).toEqual({ artifacts: [] })
  })

  it('tolerates an undefined childReports map', () => {
    expect(resolveChildReport(undefined, LINCOLN)).toEqual({ artifacts: [] })
  })
})
