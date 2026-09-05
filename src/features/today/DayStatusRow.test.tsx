/**
 * UX-182 — FEAT-200's day-type control has to be reachable on a phone.
 *
 * The defect this guards was invisible to every existing test: the control
 * rendered, it was in the document, it was even accessible by role — and on a
 * ~390px screen it was cut in half at the right edge of a non-wrapping row while
 * the save indicator sat off-screen entirely. A test asserting "it is in the
 * document" would have passed on the broken build, which is exactly the test
 * worth not writing.
 *
 * ── What can honestly be asserted here, and what cannot ─────────────────────
 *
 * jsdom does no layout: every `getBoundingClientRect` is zero, so "is it clipped
 * at 390px" is a question it physically cannot answer, and a test claiming to
 * measure it would be a test that passes for the wrong reason. What jsdom DOES
 * do is apply emotion's injected class rules, so the layout PROPERTY that makes
 * clipping impossible — the row wraps rather than overflowing — is real and
 * readable through `getComputedStyle`. That is what is asserted, alongside the
 * structural facts that carry the rest of the rule: the control is on its own
 * row rather than sharing one with the energy toggle, and it says what kind of
 * day this is in words.
 *
 * The residual risk is stated plainly rather than papered over: only a real
 * browser at a real width proves the pixels. This suite proves the row can no
 * longer be the reason they fail.
 */
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import DayStatusRow from './DayStatusRow'
import { EnergyLevel, PlanType } from '../../core/types/enums'

/** The owner's phone. Set before render so any width-conditional style resolves. */
function atPhoneWidth(width = 390) {
  window.innerWidth = width
  window.dispatchEvent(new Event('resize'))
}

function renderRow(over: Partial<React.ComponentProps<typeof DayStatusRow>> = {}) {
  const props = {
    energy: EnergyLevel.Normal,
    onEnergyChange: vi.fn(),
    planType: PlanType.Normal,
    canEditDayType: true,
    onDayTypeChange: vi.fn(),
    saveState: 'saved' as const,
    ...over,
  }
  const utils = render(<DayStatusRow {...props} />)
  return { ...utils, props }
}

describe('DayStatusRow — the day-type control survives a phone width', () => {
  it('renders the day-type control in words, not an icon', () => {
    atPhoneWidth()
    renderRow()
    // FEAT-200's rule: a parent can read what kind of day this is without
    // tapping anything. Shrinking it to an icon would be a different bug.
    expect(screen.getByText('Normal Day')).toBeInTheDocument()
  })

  it('names each of the three kinds of day when it is that kind of day', () => {
    for (const [planType, label] of [
      [PlanType.Normal, 'Normal Day'],
      [PlanType.Mvd, 'Minimum Viable Day'],
      [PlanType.Life, 'Life Day'],
    ] as const) {
      atPhoneWidth()
      const { unmount } = renderRow({ planType })
      expect(screen.getByText(label)).toBeInTheDocument()
      unmount()
    }
  })

  it('puts the day-type control on a row that wraps instead of overflowing', () => {
    atPhoneWidth()
    renderRow()
    const row = screen.getByTestId('day-type-row')
    // The layout property that makes clipping impossible. Not a pixel
    // measurement — jsdom cannot give one honestly.
    expect(getComputedStyle(row).flexWrap).toBe('wrap')
  })

  it('does not leave the control sharing one line with the energy toggle', () => {
    atPhoneWidth()
    renderRow()
    const row = screen.getByTestId('day-type-row')
    // The row the control lives on contains the control and its caption, and
    // NOT the three energy buttons — that shared row is what clipped it.
    expect(within(row).getByText('Normal Day')).toBeInTheDocument()
    expect(within(row).queryByRole('button', { name: 'Overwhelmed' })).toBeNull()
    expect(screen.getByRole('button', { name: 'Overwhelmed' })).toBeInTheDocument()
  })

  it('stays whole at 320px — the narrowest phone — with the longest label', () => {
    atPhoneWidth(320)
    // "Minimum Viable Day" is the widest of the three, so it is the one that
    // would run out of room first.
    renderRow({ planType: PlanType.Mvd })
    expect(screen.getByText('Minimum Viable Day')).toBeInTheDocument()
    expect(getComputedStyle(screen.getByTestId('day-type-row')).flexWrap).toBe('wrap')
  })

  it('still opens the picker and reports the parent’s choice', async () => {
    atPhoneWidth()
    const user = userEvent.setup()
    const { props } = renderRow()
    await user.click(screen.getByText('Normal Day'))
    await user.click(await screen.findByText('Life Day'))
    expect(props.onDayTypeChange).toHaveBeenCalledWith(PlanType.Life)
  })

  it('offers no picker to a profile that cannot edit the day', async () => {
    atPhoneWidth()
    const user = userEvent.setup()
    const { props } = renderRow({ canEditDayType: false })
    await user.click(screen.getByText('Normal Day'))
    expect(screen.queryByText(/The full routine/)).toBeNull()
    expect(props.onDayTypeChange).not.toHaveBeenCalled()
  })
})
