import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'

import VillageStepsHelp from './VillageStepsHelp'
import { VILLAGE_STEPS_HELP_LABEL, VILLAGE_STEPS_HELP_LINES } from './villageStepsCopy'

/**
 * *What adds steps?* — how it opens, how it closes, and what it leaves alone.
 *
 * Real browser focus, real touch targets and the three viewport widths are
 * Sol's independent pass; what is asserted here is the behaviour jsdom can
 * actually tell the truth about: the disclosure contract, Escape, the focus
 * hand-off back to the control, and that a change of child closes it without
 * remounting the surface it sits in.
 */

const toggle = () => screen.getByRole('button', { name: VILLAGE_STEPS_HELP_LABEL })

describe('the step help is closed until it is asked for', () => {
  it('offers one control, collapsed, and says so', () => {
    render(<VillageStepsHelp isLincoln scopeKey="fam_lincoln" />)

    expect(toggle()).toHaveAttribute('aria-expanded', 'false')
    // `hidden`, so a closed panel is out of the accessibility tree and out of
    // the tab order rather than merely painted away.
    const panelId = toggle().getAttribute('aria-controls')
    expect(document.getElementById(panelId!)).toHaveAttribute('hidden')
    for (const line of VILLAGE_STEPS_HELP_LINES) {
      expect(screen.getByText(line)).not.toBeVisible()
    }
  })

  it('opens on a tap and shows every line', async () => {
    const user = userEvent.setup()
    render(<VillageStepsHelp isLincoln scopeKey="fam_lincoln" />)

    await user.click(toggle())

    expect(toggle()).toHaveAttribute('aria-expanded', 'true')
    for (const line of VILLAGE_STEPS_HELP_LINES) {
      expect(screen.getByText(line)).toBeVisible()
    }
    // The control it is named by actually points at the panel that opened.
    const panelId = toggle().getAttribute('aria-controls')
    expect(panelId).toBeTruthy()
    const panel = document.getElementById(panelId!)
    expect(panel).not.toHaveAttribute('hidden')
    expect(panel).toContainElement(screen.getByText(VILLAGE_STEPS_HELP_LINES[0]))
  })

  it('opens from the keyboard and closes again on the same control', async () => {
    const user = userEvent.setup()
    render(<VillageStepsHelp isLincoln={false} scopeKey="fam_london" />)

    await user.tab()
    expect(toggle()).toHaveFocus()
    await user.keyboard('{Enter}')
    expect(toggle()).toHaveAttribute('aria-expanded', 'true')

    await user.keyboard('{Enter}')
    expect(toggle()).toHaveAttribute('aria-expanded', 'false')
    expect(toggle()).toHaveFocus()
  })

  it('closes on Escape and hands the keyboard back to the control', async () => {
    const user = userEvent.setup()
    render(<VillageStepsHelp isLincoln scopeKey="fam_lincoln" />)

    await user.click(toggle())
    await user.keyboard('{Escape}')

    expect(toggle()).toHaveAttribute('aria-expanded', 'false')
    // Not `document.body`: a child who pressed Escape has not left the surface.
    expect(toggle()).toHaveFocus()
    expect(screen.getByText(VILLAGE_STEPS_HELP_LINES[0])).not.toBeVisible()
  })
})

describe('an open panel does not follow a child change', () => {
  it('closes when the scope changes, and the control stays the same control', async () => {
    const user = userEvent.setup()
    const { rerender } = render(<VillageStepsHelp isLincoln scopeKey="fam_lincoln" />)

    await user.click(toggle())
    const opened = toggle()
    expect(opened).toHaveAttribute('aria-expanded', 'true')

    rerender(<VillageStepsHelp isLincoln scopeKey="fam_london" />)

    expect(toggle()).toHaveAttribute('aria-expanded', 'false')
    expect(screen.getByText(VILLAGE_STEPS_HELP_LINES[0])).not.toBeVisible()
    // Reset in the render phase, not by keying: the same node is still there,
    // so nothing around it was remounted to get the panel closed.
    expect(toggle()).toBe(opened)
  })

  it('and stays open across an ordinary re-render of the same scope', async () => {
    const user = userEvent.setup()
    const { rerender } = render(<VillageStepsHelp isLincoln scopeKey="fam_lincoln" />)

    await user.click(toggle())
    rerender(<VillageStepsHelp isLincoln={false} scopeKey="fam_lincoln" />)

    expect(toggle()).toHaveAttribute('aria-expanded', 'true')
  })
})
