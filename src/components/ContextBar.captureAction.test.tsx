/**
 * `FIX-266` — the jump to the extra-work form says what it is, where a caller
 * asks it to.
 *
 * Reported (2026-10-20): logging extra work on Today is unclear. In source the
 * only control that jumps to the capture card is a camera `IconButton` named by
 * its tooltip, so this run adds an opt-in label.
 *
 * What these tests hold:
 *
 *   • a caller that passes `captureActionLabel` gets ONE control, in words, with
 *     that accessible name, calling the SAME callback — the existing scroll
 *     target, not a second form;
 *   • the label is **opt-in**: a caller that passes only `onCaptureArtifact`
 *     keeps the icon control, so `page='week'` / `'artifacts'` and any other
 *     caller are untouched;
 *   • the labelled control replaces the icon rather than joining it, so there is
 *     one entry point to the target and not two;
 *   • a caller with no capture callback gets neither, label or not.
 *
 * Regression sensitivity: against the strip as it stood, the first test fails —
 * there is no control with that name — and the second and third fail the moment
 * the label stops being opt-in or starts rendering alongside the icon.
 *
 * Synthetic only: the auth and avatar edges are stubbed; the strip itself is
 * imported normally. Layout and on-device legibility are not asserted here.
 */
import { fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'

vi.mock('../core/auth/useAuth', () => ({
  useAuth: () => ({ familyId: 'family-1' }),
  useFamilyId: () => 'family-1',
}))
vi.mock('../features/avatar/useAvatarProfile', () => ({ useAvatarProfile: () => null }))

import ContextBar, { type ContextBarPage } from './ContextBar'

function renderBar(props: {
  page?: ContextBarPage
  onCaptureArtifact?: () => void
  captureActionLabel?: string
}) {
  render(
    <MemoryRouter>
      <ContextBar
        page={props.page ?? 'today'}
        dateKey="2026-10-20"
        onCaptureArtifact={props.onCaptureArtifact}
        captureActionLabel={props.captureActionLabel}
      />
    </MemoryRouter>,
  )
}

/** The icon-only control, found the way a screen reader would find it. */
const iconControl = () => screen.queryByRole('button', { name: /capture artifact/i })

describe('ContextBar — the extra-work jump, in words (FIX-266)', () => {
  it('renders the label as a control and calls the existing callback', () => {
    const onCaptureArtifact = vi.fn()
    renderBar({ onCaptureArtifact, captureActionLabel: 'Log extra work' })

    fireEvent.click(screen.getByRole('button', { name: 'Log extra work' }))

    expect(onCaptureArtifact).toHaveBeenCalledTimes(1)
  })

  it('replaces the icon rather than joining it — one way in, not two', () => {
    const onCaptureArtifact = vi.fn()
    renderBar({ onCaptureArtifact, captureActionLabel: 'Log extra work' })

    expect(iconControl()).toBeNull()
    // Asserted positively, so the line above cannot pass on a strip that
    // renders no capture control at all.
    expect(screen.getByRole('button', { name: 'Log extra work' })).toBeInTheDocument()
  })

  it('leaves a caller that does not opt in exactly as it was', () => {
    const onCaptureArtifact = vi.fn()
    renderBar({ page: 'week', onCaptureArtifact })

    const icon = iconControl()
    expect(icon).not.toBeNull()
    expect(screen.queryByRole('button', { name: 'Log extra work' })).toBeNull()

    fireEvent.click(icon as HTMLElement)
    expect(onCaptureArtifact).toHaveBeenCalledTimes(1)
  })

  it('renders no capture control at all without a callback, label or not', () => {
    renderBar({ captureActionLabel: 'Log extra work' })

    expect(iconControl()).toBeNull()
    expect(screen.queryByRole('button', { name: 'Log extra work' })).toBeNull()
  })
})
