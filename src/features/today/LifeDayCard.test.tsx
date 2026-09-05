import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import type { DayLog } from '../../core/types'
import { DayBlockType, SubjectBucket } from '../../core/types/enums'
import LifeDayCard from './LifeDayCard'
import { LIFE_DAY_CHIPS, LIFE_DAY_COPY, lifeDayMinutes, recordedLifeDayChipIds } from './lifeDay'

function day(overrides: Partial<DayLog> = {}): DayLog {
  return {
    childId: 'lincoln',
    date: '2026-09-07',
    blocks: [],
    checklist: [],
    ...overrides,
  }
}

describe('the Life Day surface is a record, not a list', () => {
  it('says what the day is, not what it lacks', () => {
    render(<LifeDayCard dayLog={day()} persistDayLogImmediate={vi.fn()} />)
    expect(screen.getByText(LIFE_DAY_COPY.description)).toBeInTheDocument()
  })

  it('shows the time, the chips and one optional line', () => {
    render(<LifeDayCard dayLog={day()} persistDayLogImmediate={vi.fn()} />)
    expect(screen.getByText(LIFE_DAY_COPY.timeHeading)).toBeInTheDocument()
    expect(screen.getByText(LIFE_DAY_COPY.chipsHeading)).toBeInTheDocument()
    for (const chip of LIFE_DAY_CHIPS) {
      expect(screen.getByText(chip.label)).toBeInTheDocument()
    }
    expect(screen.getByLabelText(LIFE_DAY_COPY.noteLabel)).toBeInTheDocument()
  })

  it('leaves the note optional — it is never marked required', () => {
    render(<LifeDayCard dayLog={day()} persistDayLogImmediate={vi.fn()} />)
    expect(screen.getByLabelText(LIFE_DAY_COPY.noteLabel)).not.toBeRequired()
  })

  /**
   * The assertion this whole plan type exists for: on a hard day, nothing on
   * this screen may read as unfinished. Asserted as an ABSENCE, because that is
   * the property — no progress bar, no "3 of 6", no percentage, no shortfall.
   */
  it('offers nothing that can read as incomplete', () => {
    const { container } = render(
      <LifeDayCard dayLog={day()} persistDayLogImmediate={vi.fn()} />,
    )
    expect(screen.queryByRole('progressbar')).toBeNull()
    expect(container.querySelector('.MuiLinearProgress-root')).toBeNull()
    expect(container.querySelector('.MuiCircularProgress-root')).toBeNull()

    const text = container.textContent ?? ''
    expect(text).not.toMatch(/\d+\s*(of|\/)\s*\d+/i) // "3 of 6", "3/6"
    expect(text).not.toMatch(/%/)
    expect(text).not.toMatch(/\b(left|remaining|to go|incomplete|unfinished|missed)\b/i)
  })
})

describe('recording, one tap at a time', () => {
  it('starts at the two-hour default with no write of its own', () => {
    const persist = vi.fn()
    render(<LifeDayCard dayLog={day()} persistDayLogImmediate={persist} />)
    // The default is shown, not written — an untouched Life Day claims nothing.
    expect(persist).not.toHaveBeenCalled()
    expect(screen.getByText('2h')).toBeInTheDocument()
  })

  it('is editable — a tap on another amount records it', async () => {
    const persist = vi.fn()
    render(<LifeDayCard dayLog={day()} persistDayLogImmediate={persist} />)
    await userEvent.click(screen.getByText('3h'))
    expect(persist).toHaveBeenCalledTimes(1)
    expect(lifeDayMinutes(persist.mock.calls[0][0] as DayLog)).toBe(180)
  })

  it('records a chip in one tap, with no minutes step in between', async () => {
    const persist = vi.fn()
    render(<LifeDayCard dayLog={day()} persistDayLogImmediate={persist} />)
    await userEvent.click(screen.getByText(LIFE_DAY_CHIPS[0].label))
    expect(persist).toHaveBeenCalledTimes(1)
    const written = persist.mock.calls[0][0] as DayLog
    expect(recordedLifeDayChipIds(written).has(LIFE_DAY_CHIPS[0].id)).toBe(true)
  })

  it('shows the amount already recorded on the day', () => {
    const recorded = day({
      blocks: [
        {
          type: DayBlockType.Other,
          title: 'Life Day',
          subjectBucket: SubjectBucket.Other,
          actualMinutes: 60,
        },
      ],
    })
    render(<LifeDayCard dayLog={recorded} persistDayLogImmediate={vi.fn()} />)
    expect(screen.getByText('1h')).toBeInTheDocument()
  })

  it('records nothing when the day is read-only', async () => {
    const persist = vi.fn()
    render(
      <LifeDayCard dayLog={day()} persistDayLogImmediate={persist} canEdit={false} />,
    )
    // The controls are genuinely disabled (`pointer-events: none`), so the
    // pointer check is waived to prove the handler is inert as well.
    const user = userEvent.setup({ pointerEventsCheck: 0 })
    await user.click(screen.getByText(LIFE_DAY_CHIPS[0].label))
    await user.click(screen.getByText('3h'))
    expect(persist).not.toHaveBeenCalled()
  })
})
