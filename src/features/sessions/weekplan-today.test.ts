import { describe, expect, it } from 'vitest'

import type { Child, DayLog, WeekPlan } from '../../core/types/domain'
import { DayBlockType } from '../../core/types/enums'
import { buildTodayBlocks, BlockStatus } from './weekplan-today'

const makeWeekPlan = (overrides?: Partial<WeekPlan>): WeekPlan => ({
  startDate: '2026-02-16',
  endDate: '2026-02-22',
  theme: '',
  virtue: '',
  scriptureRef: '',
  heartQuestion: '',
  tracks: [],
  flywheelPlan: '',
  buildLab: { title: '', materials: [], steps: [] },
  childGoals: [{ childId: 'child1', goals: [] }],
  ...overrides,
})

const makeChild = (overrides?: Partial<Child>): Child => ({
  id: 'child1',
  name: 'TestChild',
  ...overrides,
})

const makeDayLog = (overrides?: Partial<DayLog>): DayLog => ({
  childId: 'child1',
  date: '2026-02-16',
  blocks: [
    { type: DayBlockType.Formation },
    { type: DayBlockType.Reading },
    { type: DayBlockType.Speech },
    { type: DayBlockType.Math },
    { type: DayBlockType.Together },
    { type: DayBlockType.Movement },
    { type: DayBlockType.Project },
    { type: DayBlockType.FieldTrip },
    { type: DayBlockType.Other },
  ],
  ...overrides,
})

// ─── buildTodayBlocks ────────────────────────────────────────────────────────

describe('buildTodayBlocks', () => {
  it('returns blocks for all default block types', () => {
    const blocks = buildTodayBlocks(makeWeekPlan(), makeChild(), null)
    expect(blocks.length).toBe(9) // all DayBlockTypes
    expect(blocks[0].type).toBe(DayBlockType.Formation)
    expect(blocks[0].title).toBe('Formation')
    expect(blocks[0].suggestedMinutes).toBe(15)
  })

  it('respects child-specific dayBlocks order', () => {
    const child = makeChild({
      dayBlocks: [DayBlockType.Math, DayBlockType.Reading],
    })
    const blocks = buildTodayBlocks(makeWeekPlan(), child, null)
    expect(blocks.length).toBe(2)
    expect(blocks[0].type).toBe(DayBlockType.Math)
    expect(blocks[1].type).toBe(DayBlockType.Reading)
  })

  it('marks all blocks as NotStarted when dayLog is null', () => {
    const blocks = buildTodayBlocks(makeWeekPlan(), makeChild(), null)
    expect(blocks.every((b) => b.status === BlockStatus.NotStarted)).toBe(true)
    expect(blocks.every((b) => b.done === false)).toBe(true)
  })

  it('marks block as Logged when reading routine has done items', () => {
    const dayLog = makeDayLog({
      reading: {
        handwriting: { done: true },
        spelling: { done: false },
        sightWords: { done: false },
        minecraft: { done: false },
        readingEggs: { done: false },
      },
    })
    const blocks = buildTodayBlocks(makeWeekPlan(), makeChild(), dayLog)
    const readingBlock = blocks.find((b) => b.type === DayBlockType.Reading)
    expect(readingBlock?.status).toBe(BlockStatus.Logged)
    expect(readingBlock?.done).toBe(true)
  })

  it('marks block as Logged when block has actualMinutes', () => {
    const dayLog = makeDayLog({
      blocks: [
        { type: DayBlockType.Formation, actualMinutes: 15 },
        { type: DayBlockType.Reading },
        { type: DayBlockType.Speech },
        { type: DayBlockType.Math },
        { type: DayBlockType.Together },
        { type: DayBlockType.Movement },
        { type: DayBlockType.Project },
        { type: DayBlockType.FieldTrip },
        { type: DayBlockType.Other },
      ],
    })
    const blocks = buildTodayBlocks(makeWeekPlan(), makeChild(), dayLog)
    const formationBlock = blocks.find((b) => b.type === DayBlockType.Formation)
    expect(formationBlock?.status).toBe(BlockStatus.Logged)
  })

  it('marks block as InProgress when block has notes', () => {
    const dayLog = makeDayLog({
      blocks: [
        { type: DayBlockType.Formation },
        { type: DayBlockType.Reading },
        { type: DayBlockType.Speech },
        { type: DayBlockType.Math, notes: 'Working on it' },
        { type: DayBlockType.Together },
        { type: DayBlockType.Movement },
        { type: DayBlockType.Project },
        { type: DayBlockType.FieldTrip },
        { type: DayBlockType.Other },
      ],
    })
    const blocks = buildTodayBlocks(makeWeekPlan(), makeChild(), dayLog)
    const mathBlock = blocks.find((b) => b.type === DayBlockType.Math)
    expect(mathBlock?.status).toBe(BlockStatus.InProgress)
  })

  it('uses weekPlan virtue/heartQuestion for Formation instructions', () => {
    const weekPlan = makeWeekPlan({
      virtue: 'Patience',
      heartQuestion: 'How can we be patient?',
    })
    const blocks = buildTodayBlocks(weekPlan, makeChild(), null)
    const formation = blocks.find((b) => b.type === DayBlockType.Formation)
    expect(formation?.instructions).toContain('Virtue: Patience')
    expect(formation?.instructions).toContain('How can we be patient?')
  })

  it('uses weekPlan theme for Together instructions', () => {
    const weekPlan = makeWeekPlan({ theme: 'Ancient Egypt' })
    const blocks = buildTodayBlocks(weekPlan, makeChild(), null)
    const together = blocks.find((b) => b.type === DayBlockType.Together)
    expect(together?.instructions).toContain('Theme: Ancient Egypt')
  })

  it('uses weekPlan buildLab for Project instructions', () => {
    const weekPlan = makeWeekPlan({
      buildLab: {
        title: 'Volcano',
        materials: ['baking soda'],
        steps: ['Mix ingredients', 'Add vinegar'],
      },
    })
    const blocks = buildTodayBlocks(weekPlan, makeChild(), null)
    const project = blocks.find((b) => b.type === DayBlockType.Project)
    expect(project?.instructions).toContain('Volcano')
    expect(project?.instructions).toContain('Mix ingredients')
  })

  it('falls back to default instructions when weekPlan is empty', () => {
    const blocks = buildTodayBlocks(makeWeekPlan(), makeChild(), null)
    const movement = blocks.find((b) => b.type === DayBlockType.Movement)
    expect(movement?.instructions).toContain('Outdoor play or exercise')
  })

  it('uses child goals for default blocks when available', () => {
    const weekPlan = makeWeekPlan({
      childGoals: [{ childId: 'child1', goals: ['Practice multiplication'] }],
    })
    const blocks = buildTodayBlocks(weekPlan, makeChild(), null)
    const math = blocks.find((b) => b.type === DayBlockType.Math)
    expect(math?.instructions).toContain('Practice multiplication')
  })

  it('marks Formation as Logged when formation.done is true', () => {
    const dayLog = makeDayLog({
      formation: { done: true },
    })
    const blocks = buildTodayBlocks(makeWeekPlan(), makeChild(), dayLog)
    const formation = blocks.find((b) => b.type === DayBlockType.Formation)
    expect(formation?.status).toBe(BlockStatus.Logged)
  })

  it('marks Formation as InProgress when it has partial data', () => {
    const dayLog = makeDayLog({
      formation: { done: false, gratitude: 'thankful for sun' },
    })
    const blocks = buildTodayBlocks(makeWeekPlan(), makeChild(), dayLog)
    const formation = blocks.find((b) => b.type === DayBlockType.Formation)
    expect(formation?.status).toBe(BlockStatus.InProgress)
  })
})
