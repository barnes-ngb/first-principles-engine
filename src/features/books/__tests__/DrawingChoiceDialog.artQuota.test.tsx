import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { ART_QUOTA_MESSAGE } from '../../business/useArtQuota'
import DrawingChoiceDialog from '../DrawingChoiceDialog'

const capturedFile = new File(['x'], 'drawing.png', { type: 'image/png' })

function renderDialog(props: Partial<React.ComponentProps<typeof DrawingChoiceDialog>> = {}) {
  return render(
    <DrawingChoiceDialog
      open
      capturedFile={capturedFile}
      capturedPreviewUrl="blob:preview"
      onClose={vi.fn()}
      onChoose={vi.fn()}
      processing={false}
      {...props}
    />,
  )
}

describe('DrawingChoiceDialog — daily art budget (FEAT-168)', () => {
  it('at the cap the paid Reimagine choice is not offered, and the nudge takes its place', () => {
    renderDialog({ capReached: true })

    expect(screen.queryByText('Reimagine')).toBeNull()
    expect(screen.getByText(ART_QUOTA_MESSAGE)).toBeTruthy()
  })

  it('free choices stay offered at the cap — a kid can still use, clean and sticker their drawing', () => {
    renderDialog({ capReached: true })

    expect(screen.getByText('Use as-is')).toBeTruthy()
    expect(screen.getByText('Clean up')).toBeTruthy()
    expect(screen.getByText('Make a sticker')).toBeTruthy()
  })

  it('"Make a scene" stays offered — it routes to the page’s AI dialog, which carries the same cap', () => {
    renderDialog({ capReached: true })

    expect(screen.getByText('Make a scene')).toBeTruthy()
  })

  it('a capped tap cannot reach the paid choice even if something routes to it', async () => {
    const onChoose = vi.fn()
    const { rerender } = renderDialog({ capReached: false, onChoose })

    // Below the cap the choice exists.
    expect(screen.getByText('Reimagine')).toBeTruthy()

    rerender(
      <DrawingChoiceDialog
        open
        capturedFile={capturedFile}
        capturedPreviewUrl="blob:preview"
        onClose={vi.fn()}
        onChoose={onChoose}
        processing={false}
        capReached
      />,
    )
    expect(screen.queryByText('Reimagine')).toBeNull()
    expect(onChoose).not.toHaveBeenCalled()
  })

  it('the post-cleanup grid drops both Reimagine paths at the cap and keeps the free two', () => {
    renderDialog({
      capReached: true,
      resultPreviewUrl: 'blob:cleaned',
      resultIsCleaned: true,
      onPickPostCleanup: vi.fn(),
    })

    expect(screen.queryByText('Reimagine as sticker')).toBeNull()
    expect(screen.queryByText('Reimagine as scene')).toBeNull()
    expect(screen.getByText('Add as sticker')).toBeTruthy()
    expect(screen.getByText('Save to gallery')).toBeTruthy()
    expect(screen.getByText(ART_QUOTA_MESSAGE)).toBeTruthy()
  })

  it('uncapped by default — every choice is offered and no nudge shows', () => {
    renderDialog()

    expect(screen.getByText('Reimagine')).toBeTruthy()
    expect(screen.queryByText(ART_QUOTA_MESSAGE)).toBeNull()
  })
})
