/**
 * UX-188 — the seven record-write kinds are parent-only, and say so.
 *
 * The property under test is exhaustiveness, not sampling: a new kind added to
 * the union without a decision about who may confirm it is the exact hole this
 * closes, so the list of gated kinds is asserted whole.
 */
import { describe, expect, it } from 'vitest'

import type { ChatAction } from '../../core/types'
import {
  isRecordWriteAction,
  recordWriteNotice,
  resolveRecordWriteAction,
  RECORD_WRITE_NOTICES,
  type RecordWriteAction,
} from './recordWriteAccess'

const CHILD = 'lincoln1'

/** One of every kind that writes a child's own record. */
const RECORD_WRITES: RecordWriteAction[] = [
  { kind: 'addSightWord', childId: CHILD, word: 'said' },
  { kind: 'removeSightWord', childId: CHILD, word: 'said' },
  { kind: 'editProfileField', childId: CHILD, field: 'motivators', value: 'Lego' },
  { kind: 'addPrioritySkill', childId: CHILD, skill: 'blends' },
  { kind: 'addSupport', childId: CHILD, support: 'sit beside him' },
  { kind: 'addStopRule', childId: CHILD, rule: 'stop at ten minutes' },
  { kind: 'markSkillProgress', childId: CHILD, skill: 'th digraph' },
]

describe('isRecordWriteAction', () => {
  it('names all seven kinds that write a child’s own record', () => {
    expect(RECORD_WRITES.every(isRecordWriteAction)).toBe(true)
    expect(RECORD_WRITES).toHaveLength(7)
  })

  it('claims none of the kinds that carry their own resolver', () => {
    const others: ChatAction[] = [
      { kind: 'setActivityMinutes', childId: CHILD, activityConfigId: 'cfg', minutes: 20 },
      {
        kind: 'addActivity',
        childId: CHILD,
        name: 'Explode the Code 4',
        type: 'workbook',
        subjectBucket: 'LanguageArts',
        defaultMinutes: 15,
        frequency: 'daily',
      } as ChatAction,
      { kind: 'removeItemFromDay', childId: CHILD, dateKey: '2026-09-07', itemKey: 'k' } as ChatAction,
    ]
    expect(others.some(isRecordWriteAction)).toBe(false)
  })
})

describe('resolveRecordWriteAction (UX-188)', () => {
  it('refuses every one of the seven for a profile that cannot edit', () => {
    for (const action of RECORD_WRITES) {
      const resolution = resolveRecordWriteAction(action, false)
      expect(resolution.ok, action.kind).toBe(false)
      // Never silent: the model's reply promises "confirm with a tap", so a
      // dropped proposal that says nothing leaves a card that never comes.
      if (!resolution.ok) {
        expect(resolution.notice.length, action.kind).toBeGreaterThan(0)
        expect(resolution.notice, action.kind).toContain('nothing was changed')
      }
    }
  })

  it('allows every one of the seven for a parent', () => {
    for (const action of RECORD_WRITES) {
      expect(resolveRecordWriteAction(action, true).ok, action.kind).toBe(true)
    }
  })

  it('gives each family of record its own reason', () => {
    expect(recordWriteNotice(RECORD_WRITES[0])).toBe(RECORD_WRITE_NOTICES.sightWord)
    expect(recordWriteNotice(RECORD_WRITES[1])).toBe(RECORD_WRITE_NOTICES.sightWord)
    expect(recordWriteNotice(RECORD_WRITES[2])).toBe(RECORD_WRITE_NOTICES.profile)
    for (const action of RECORD_WRITES.slice(3)) {
      expect(recordWriteNotice(action), action.kind).toBe(RECORD_WRITE_NOTICES.snapshot)
    }
  })

  it('fails closed — the refusal is what an absent capability produces', () => {
    // The dep defaults to `false` upstream, so a surface that forgets to thread
    // the capability refuses rather than permits.
    expect(resolveRecordWriteAction(RECORD_WRITES[6], undefined as unknown as boolean).ok).toBe(
      false,
    )
  })

  it('never names a child to decide — capability only', () => {
    const london: RecordWriteAction = { ...RECORD_WRITES[6], childId: 'london1' }
    expect(resolveRecordWriteAction(london, true).ok).toBe(true)
    expect(resolveRecordWriteAction(london, false).ok).toBe(false)
  })
})
