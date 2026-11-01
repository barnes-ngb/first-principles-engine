import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { getMission } from './missions'
import type { StonebridgeProgressData } from './useStonebridgeProgress'
import StonebridgeMissionCard from './StonebridgeMissionCard'

/**
 * The replayed thank-you — the REAL overlay, reached from the real board.
 *
 * ── The two defects this file inverts ───────────────────────────────────────
 *
 * `BannerRaiseCelebration` was written for a once-per-completion moment and its
 * only way out was `onClick` on the whole thing. Independent browser
 * verification found, in two rounds, what that costs once it is *replayable*
 * from a repaired tile:
 *
 *   • **round 1** — Escape did nothing, nothing took the focus and there was no
 *     control to tab to; and because it covered everything, a read or save
 *     failure arriving while it was up hid the *Try again* underneath it and
 *     swallowed the tap aimed at it.
 *   • **round 2** — `role="dialog"` and a key handler were **not containment**:
 *     Tab out of *Keep going* and the focus walked into the board behind it —
 *     the hidden board close, the Old Bridge tile, the Watchtower tile. And at
 *     390×400 with enlarged text the centred column was 568px tall in a 400px
 *     window with no `overflow-y`, so *Keep going* sat off the bottom of the
 *     screen.
 *
 * So the overlay is now a real MUI `Dialog`, and these are the assertions that
 * say so: Tab and Shift+Tab stay inside it, Escape after a Tab closes **it** and
 * not the board under it, the way out and the recovery door are outside the
 * scrolling region, and the focus comes back to the exact tile the replay came
 * from. The component is NOT stubbed — stubbing the thing under repair would
 * assert nothing. Only the Web Audio fanfare is mocked, as a spy, so the
 * fanfare can be proven to still play.
 *
 * ── What this file cannot prove ─────────────────────────────────────────────
 *
 * jsdom does no layout, so the short-screen case is asserted **structurally** —
 * the dialog goes full-screen and the controls live outside the scrolling
 * region, which is what makes them unreachable-proof — and the actual scroll at
 * 390×400 with 20px text is Sol's browser pass.
 */

const fx = vi.hoisted(() => ({
  fanfare: vi.fn(),
  retry: vi.fn(),
  data: null as unknown as StonebridgeProgressData,
}))

vi.mock('./useStonebridgeProgress', () => ({
  useStonebridgeProgress: () => fx.data,
}))

// Web Audio only. The overlay itself is the real one.
vi.mock('./bannerRaiseSound', () => ({
  playBannerRaiseFanfare: () => fx.fanfare(),
}))

const OLD_BRIDGE = getMission('old_bridge')!
const LIBRARY_HUT = getMission('library_hut')!
const OLD_BRIDGE_TILE = 'Visit The Old Bridge. Fixed.'
const REPLAY_VIEW = { name: 'The Old Bridge repaired' }

/** Two locations rebuilt, part-way through the third. */
const PARTIAL: StonebridgeProgressData = {
  mission: LIBRARY_HUT,
  active: { missionId: LIBRARY_HUT.id, current: 3, target: 8, percent: 38, complete: false },
  completedMissions: ['old_bridge', 'watchtower'],
  raisedBanners: ['old_bridge', 'watchtower'],
  totalReadingActions: 14,
  justCompletedMissionId: null,
  clearJustCompleted: () => {},
  loading: false,
  stale: false,
  readError: false,
  saveError: false,
  retrying: false,
  retry: fx.retry,
}

/**
 * Answer the media queries these components ask.
 *
 * `compact` is the 390×400-with-enlarged-text case — a narrow OR short viewport
 * — and `reduceMotion` makes the dialog transitions instant, which is what lets
 * the exit-ordered focus hand-off be asserted without waiting on a timer.
 */
function emulateMedia({ compact = false, reduceMotion = true } = {}) {
  window.matchMedia = ((q: string) => ({
    matches: q.includes('prefers-reduced-motion')
      ? reduceMotion
      : /max-(width|height)/.test(q)
        ? compact
        : false,
    media: q,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia
}

const realMatchMedia = window.matchMedia

function renderCard(childId = 'lincoln') {
  return render(<StonebridgeMissionCard familyId="fam-1" childId={childId} isLincoln />)
}

const boardRegion = async () =>
  within(await screen.findByRole('dialog', { name: 'Stonebridge Village' }))

/** The celebration, once it is actually reachable. */
const replayView = async () => screen.findByRole('dialog', REPLAY_VIEW)

const replayGone = () =>
  waitFor(() => expect(screen.queryByRole('dialog', REPLAY_VIEW)).not.toBeInTheDocument())

/** Open the board, visit the repaired Old Bridge, and replay its thank-you. */
async function replayOldBridge() {
  renderCard()
  fireEvent.click(screen.getByText('🏰 Open Stonebridge'))
  fireEvent.click((await boardRegion()).getByRole('button', { name: OLD_BRIDGE_TILE }))
  fireEvent.click(
    within(screen.getByRole('dialog', { name: 'The Old Bridge' })).getByRole('button', {
      name: 'Hear the thank you',
    }),
  )
  return replayView()
}

/** The Keep going button, focused — the state every dismissal starts from. */
async function focusedKeepGoing() {
  const view = await replayView()
  const keepGoing = within(view).getByRole('button', { name: 'Keep going' })
  await waitFor(() => expect(keepGoing).toHaveFocus())
  return keepGoing
}

/** The whole modal — paper, container and focus sentinels. */
function modalOf(paper: HTMLElement): HTMLElement {
  const root = paper.closest('.MuiDialog-root')
  if (!(root instanceof HTMLElement)) throw new Error('the celebration is not a MUI Dialog')
  return root
}

beforeEach(() => {
  fx.fanfare.mockClear()
  fx.retry.mockClear()
  fx.data = PARTIAL
  emulateMedia()
})

afterEach(() => {
  window.matchMedia = realMatchMedia
})

describe('the replayed thank-you is a named view you can get out of', () => {
  it('names itself, plays the fanfare, and takes the focus to a real control', async () => {
    const view = await replayOldBridge()

    expect(within(view).getByText(`${OLD_BRIDGE.locationName} repaired`)).toBeVisible()
    expect(within(view).getByText(`${OLD_BRIDGE.locationName} repaired`).parentElement?.textContent)
      .toBe(`${OLD_BRIDGE.locationName} repaired!`)
    expect(within(view).getByText(OLD_BRIDGE.thankYou.name)).toBeInTheDocument()
    // Unchanged behaviour: the fanfare still plays on a replay.
    expect(fx.fanfare).toHaveBeenCalledTimes(1)
    // The focus is INSIDE the thing that covers everything else.
    await focusedKeepGoing()
  })

  it('is named by the location line itself, with nothing competing with it', async () => {
    /**
     * The defect every name query in this file was failing on: the name was an
     * `aria-label` on the paper, and MUI puts the `aria-labelledby` prop through
     * `useId`, so the paper ALWAYS had a labelledby relation — at the whole
     * `DialogTitle`, "🎉 BANNER RAISED!The Old Bridge repaired!" — which wins.
     *
     * POSITIVE CONTROL: put the name back as `slotProps.paper['aria-label']`
     * and this case fails on the first assertion, and every `REPLAY_VIEW` query
     * in this file fails with it.
     */
    const view = await replayOldBridge()

    expect(view).toHaveAccessibleName(`${OLD_BRIDGE.locationName} repaired`)
    // One mechanism, not two: an `aria-label` here could only lose to the
    // relation, which is the whole defect.
    expect(view).not.toHaveAttribute('aria-label')

    const nameId = view.getAttribute('aria-labelledby') ?? ''
    expect(nameId).not.toBe('')
    // The relation resolves to ONE element — the `DialogTitle` must not also
    // carry this id, or the duplicate resolves first and the name is the title
    // again — and that element is the location line, exclamation mark excluded.
    const named = document.querySelectorAll(`[id="${nameId}"]`)
    expect(named).toHaveLength(1)
    expect(named[0].textContent).toBe(`${OLD_BRIDGE.locationName} repaired`)
    // …while the line a child reads is unchanged.
    expect(within(view).getByText(`${OLD_BRIDGE.locationName} repaired`)).toBeVisible()
    expect(within(view).getByText(`${OLD_BRIDGE.locationName} repaired`).parentElement?.textContent)
      .toBe(`${OLD_BRIDGE.locationName} repaired!`)
    expect(within(view).getByText('🎉 BANNER RAISED!')).toBeInTheDocument()
  })

  it('Escape closes it, leaves the board open, and goes back to the tile', async () => {
    await replayOldBridge()
    await focusedKeepGoing()

    await userEvent.keyboard('{Escape}')

    await replayGone()
    // One Escape closed one layer: the board is still there…
    const board = await boardRegion()
    // …and the focus is back on the repaired tile the replay came from.
    await waitFor(() =>
      expect(board.getByRole('button', { name: OLD_BRIDGE_TILE })).toHaveFocus(),
    )
  })

  it('Keep going closes it the same way, by keyboard', async () => {
    await replayOldBridge()
    await focusedKeepGoing()

    // A native button, so Enter is the browser's job rather than a hand-rolled
    // keydown handler.
    await userEvent.keyboard('{Enter}')

    await replayGone()
    const board = await boardRegion()
    await waitFor(() =>
      expect(board.getByRole('button', { name: OLD_BRIDGE_TILE })).toHaveFocus(),
    )
  })

  it('dismisses on a tap outside it, which is now the only tap that does', async () => {
    // The behaviour that changed with the modal: tapping the celebration ITSELF
    // no longer continues — which is what stopped it swallowing the *Try again*
    // inside it — and the backdrop does.
    emulateMedia({ compact: false })
    const view = await replayOldBridge()
    const container = modalOf(view).querySelector('.MuiDialog-container')
    if (!(container instanceof HTMLElement)) throw new Error('no dialog container')

    fireEvent.mouseDown(container)
    fireEvent.click(container)

    await replayGone()
  })

  it('can be replayed again once it is closed', async () => {
    // Dismissal is synchronous — the 350 ms deferred `onDismiss` is gone — and
    // the view it renders is held locally so the prop clearing in that same
    // event cannot cut its own exit short.
    await replayOldBridge()
    fireEvent.click(await focusedKeepGoing())
    await replayGone()

    const board = await boardRegion()
    fireEvent.click(board.getByRole('button', { name: OLD_BRIDGE_TILE }))
    fireEvent.click(
      within(screen.getByRole('dialog', { name: 'The Old Bridge' })).getByRole('button', {
        name: 'Hear the thank you',
      }),
    )

    await replayView()
    expect(fx.fanfare).toHaveBeenCalledTimes(2)
  })
})

describe('the focus cannot walk out of the replay (round-2 blocker 1)', () => {
  /**
   * POSITIVE CONTROL: this is what a `role="dialog"` overlay with a key handler
   * could not do. Take the Dialog back out — render the same content in a
   * `position: fixed` Box — and every case here fails, because the next
   * tabbable after *Keep going* is the board's own close button.
   */
  it('Tab and Shift+Tab cycle inside it, never onto the board behind it', async () => {
    const view = await replayOldBridge()
    await focusedKeepGoing()
    const modal = modalOf(view)

    for (const press of [{}, {}, { shift: true }, { shift: true }]) {
      await userEvent.tab(press)
      // Wherever it lands — the control, the paper or a focus sentinel — it is
      // inside this modal.
      expect(modal.contains(document.activeElement)).toBe(true)
    }

    // And specifically not on the three things the reproduction named. They are
    // queried by label, which (unlike a role query) still sees them while the
    // modal has them `aria-hidden` — so this cannot pass by not finding them.
    expect(screen.getByLabelText('Close Stonebridge village')).not.toHaveFocus()
    expect(screen.getByLabelText(OLD_BRIDGE_TILE)).not.toHaveFocus()
    expect(screen.getByLabelText('Visit The Watchtower. Fixed.')).not.toHaveFocus()
  })

  it('Escape AFTER tabbing still closes the replay and not the board', async () => {
    await replayOldBridge()
    await focusedKeepGoing()
    await userEvent.tab()

    await userEvent.keyboard('{Escape}')

    await replayGone()
    const board = await boardRegion()
    expect(board.getByText('🎌 Banner Hall')).toBeInTheDocument()
    await waitFor(() =>
      expect(board.getByRole('button', { name: OLD_BRIDGE_TILE })).toHaveFocus(),
    )
  })

  it('marks the board underneath inert while it is up', async () => {
    const view = await replayOldBridge()
    // The board is still mounted and still readable as text…
    expect(screen.getByText('🎌 Banner Hall')).toBeInTheDocument()
    // …but it is not an addressable dialog while the replay is on top of it,
    // which is the same fact as "Tab cannot reach it".
    expect(screen.queryByRole('dialog', { name: 'Stonebridge Village' })).not.toBeInTheDocument()
    expect(view).toBeInTheDocument()
  })
})

describe('a short screen can still be got out of (round-2 blocker 2)', () => {
  /**
   * The reproduction: 390×400 with enlarged text, `scrollHeight` 568 in a 400px
   * window, *Keep going* at y 476–520 and no `overflow-y` anywhere.
   *
   * jsdom does no layout, so what is asserted here is the structure that makes
   * that impossible rather than the pixels: the dialog takes the whole screen,
   * and the way out and the recovery door are **outside** the one region that
   * scrolls. The pixel case at that exact viewport is Sol's browser pass.
   *
   * POSITIVE CONTROL: move the `Keep going` button into `DialogContent` and the
   * second case fails.
   */
  it('goes full screen and keeps its controls out of the scrolling region', async () => {
    emulateMedia({ compact: true })
    fx.data = { ...PARTIAL, stale: true, readError: true }
    const view = await replayOldBridge()

    expect(view.className).toContain('MuiDialog-paperFullScreen')

    const content = view.querySelector('.MuiDialogContent-root')
    const actions = view.querySelector('.MuiDialogActions-root')
    if (!(content instanceof HTMLElement) || !(actions instanceof HTMLElement)) {
      throw new Error('the celebration is not a scroll="paper" dialog')
    }

    // The long part scrolls…
    expect(content).toContainElement(within(view).getByText(`“${OLD_BRIDGE.thankYou.line}”`))
    // …and nothing a child has to reach is inside it.
    const keepGoing = within(view).getByRole('button', { name: 'Keep going' })
    expect(actions).toContainElement(keepGoing)
    expect(content).not.toContainElement(keepGoing)
    const retry = within(view).getByRole('button', { name: 'Try again' })
    expect(content).not.toContainElement(retry)
    expect(view).toContainElement(retry)
  })

  it('still works at every other size, with the same way out', async () => {
    // Regular phone, tablet and desktop all take the non-compact branch; the
    // controls are in the same place and the dialog is not full-screen.
    emulateMedia({ compact: false })
    const view = await replayOldBridge()

    expect(view.className).not.toContain('MuiDialog-paperFullScreen')
    const actions = view.querySelector('.MuiDialogActions-root')
    expect(actions).toContainElement(within(view).getByRole('button', { name: 'Keep going' }))
    await focusedKeepGoing()
  })

  it('keeps every word and every control with reduced motion', async () => {
    emulateMedia({ compact: true, reduceMotion: true })
    const view = await replayOldBridge()

    expect(within(view).getByText(`${OLD_BRIDGE.locationName} repaired`)).toBeVisible()
    expect(within(view).getByText(`${OLD_BRIDGE.locationName} repaired`).parentElement?.textContent)
      .toBe(`${OLD_BRIDGE.locationName} repaired!`)
    expect(within(view).getByText(`“${OLD_BRIDGE.thankYou.line}”`)).toBeInTheDocument()
    expect(
      within(view).getByText(new RegExp(OLD_BRIDGE.formationBeat!.name)),
    ).toBeInTheDocument()
    await focusedKeepGoing()
  })
})

describe('a failure that lands while the thank-you is up', () => {
  it('says so IN the celebration, and its Try again retries instead of closing', async () => {
    // POSITIVE CONTROL: drop the notice and the first assertion fails. The
    // click can no longer be swallowed by a whole-surface dismiss, because
    // there is no longer one — which is the other half of the round-1 repair.
    fx.data = { ...PARTIAL, stale: true, readError: true }
    const view = await replayOldBridge()

    expect(within(view).getByText('Showing your last village.')).toBeInTheDocument()
    fireEvent.click(within(view).getByRole('button', { name: 'Try again' }))

    expect(fx.retry).toHaveBeenCalledTimes(1)
    // The reported dead end: the door must not close the room.
    expect(screen.getByRole('dialog', REPLAY_VIEW)).toBeInTheDocument()
  })

  it('reports a rejected save in the topmost view too', async () => {
    fx.data = { ...PARTIAL, saveError: true }
    const view = await replayOldBridge()

    expect(within(view).getByText('Your village did not save.')).toBeInTheDocument()
    expect(within(view).queryByText('Showing your last village.')).not.toBeInTheDocument()
    fireEvent.click(within(view).getByRole('button', { name: 'Try again' }))
    expect(fx.retry).toHaveBeenCalledTimes(1)
  })

  it('keeps the retry inside the trap, not out on the board', async () => {
    fx.data = { ...PARTIAL, saveError: true }
    const view = await replayOldBridge()
    const modal = modalOf(view)

    within(view).getByRole('button', { name: 'Try again' }).focus()
    await userEvent.tab()
    expect(modal.contains(document.activeElement)).toBe(true)
    await userEvent.tab({ shift: true })
    expect(modal.contains(document.activeElement)).toBe(true)
  })

  it('says none of it when the read is current', async () => {
    const view = await replayOldBridge()

    expect(within(view).queryByRole('button', { name: 'Try again' })).not.toBeInTheDocument()
    expect(within(view).queryByText('Showing your last village.')).not.toBeInTheDocument()
    expect(within(view).getByRole('button', { name: 'Keep going' })).toBeInTheDocument()
  })
})

describe('the ordinary completion celebration is unchanged, and contained too', () => {
  it('still appears for an acknowledged completion, and clears it once', async () => {
    const clearJustCompleted = vi.fn()
    fx.data = { ...PARTIAL, justCompletedMissionId: 'watchtower', clearJustCompleted }
    renderCard()

    const view = await screen.findByRole('dialog', { name: 'The Watchtower repaired' })
    expect(within(view).getByText('🎉 BANNER RAISED!')).toBeInTheDocument()
    expect(fx.fanfare).toHaveBeenCalledTimes(1)

    const keepGoing = within(view).getByRole('button', { name: 'Keep going' })
    await waitFor(() => expect(keepGoing).toHaveFocus())
    fireEvent.click(keepGoing)
    expect(clearJustCompleted).toHaveBeenCalledTimes(1)
  })

  it('contains the focus when it arrives on the hub, not only inside the board', async () => {
    // It opens over the CARD rather than over the board, so this is a second
    // place containment has to hold — and the card has its own focusable Open
    // Stonebridge control sitting right underneath it.
    fx.data = { ...PARTIAL, justCompletedMissionId: 'watchtower', clearJustCompleted: vi.fn() }
    renderCard()

    const view = await screen.findByRole('dialog', { name: 'The Watchtower repaired' })
    const modal = modalOf(view)
    await waitFor(() =>
      expect(within(view).getByRole('button', { name: 'Keep going' })).toHaveFocus(),
    )

    await userEvent.tab()
    expect(modal.contains(document.activeElement)).toBe(true)
    expect(screen.getByText('🏰 Open Stonebridge')).not.toHaveFocus()
  })

  it('carries the recovery door for a failure during a completion, too', async () => {
    fx.data = {
      ...PARTIAL,
      justCompletedMissionId: 'watchtower',
      clearJustCompleted: vi.fn(),
      saveError: true,
    }
    renderCard()

    const view = within(await screen.findByRole('dialog', { name: 'The Watchtower repaired' }))
    expect(view.getByText('Your village did not save.')).toBeInTheDocument()
    fireEvent.click(view.getByRole('button', { name: 'Try again' }))
    expect(fx.retry).toHaveBeenCalledTimes(1)
  })
})

describe('a celebration does not outlive the child it belongs to', () => {
  it('a replay on screen goes with the switch, and takes its board with it', async () => {
    const { rerender } = renderCard('lincoln')
    fireEvent.click(screen.getByText('🏰 Open Stonebridge'))
    fireEvent.click((await boardRegion()).getByRole('button', { name: OLD_BRIDGE_TILE }))
    fireEvent.click(
      within(screen.getByRole('dialog', { name: 'The Old Bridge' })).getByRole('button', {
        name: 'Hear the thank you',
      }),
    )
    await replayView()

    rerender(<StonebridgeMissionCard familyId="fam-1" childId="london" isLincoln />)

    // Gone from the DOM, not merely hidden — the replay is dropped in the same
    // render the child changes, and a late acknowledgement for it is matched on
    // child AND mission before it clears anything.
    await waitFor(() => {
      expect(screen.queryByRole('dialog', { name: `${OLD_BRIDGE.locationName} repaired` })).not.toBeInTheDocument()
      expect(screen.queryByText('🎌 Banner Hall')).not.toBeInTheDocument()
    })
  })
})
