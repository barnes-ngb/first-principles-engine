import { render, fireEvent } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import ScanButton from './ScanButton'

function fileInputs(container: HTMLElement): HTMLInputElement[] {
  return Array.from(container.querySelectorAll('input[type="file"]'))
}

describe('ScanButton', () => {
  it('(d) single mode: onCapture fires with exactly one file; gallery is not multiple', () => {
    const onCapture = vi.fn()
    const { container } = render(<ScanButton onCapture={onCapture} />)

    const [gallery] = fileInputs(container)
    expect(gallery.multiple).toBe(false)

    const file = new File(['x'], 'page.jpg', { type: 'image/jpeg' })
    fireEvent.change(gallery, { target: { files: [file] } })

    expect(onCapture).toHaveBeenCalledTimes(1)
    expect(onCapture).toHaveBeenCalledWith(file)
  })

  it('multiple mode: gallery is multiple and onCaptureFiles gets the full array', () => {
    const onCaptureFiles = vi.fn()
    const { container } = render(
      <ScanButton multiple onCaptureFiles={onCaptureFiles} />,
    )

    const [gallery] = fileInputs(container)
    expect(gallery.multiple).toBe(true)

    const files = [
      new File(['a'], 'p1.jpg', { type: 'image/jpeg' }),
      new File(['b'], 'p2.jpg', { type: 'image/jpeg' }),
    ]
    fireEvent.change(gallery, { target: { files } })

    expect(onCaptureFiles).toHaveBeenCalledTimes(1)
    expect(onCaptureFiles).toHaveBeenCalledWith(files)
  })

  it('multiple mode: the camera stays one-at-a-time (single shot appends one)', () => {
    const onCaptureFiles = vi.fn()
    const { container } = render(
      <ScanButton multiple onCaptureFiles={onCaptureFiles} />,
    )

    const [, camera] = fileInputs(container)
    expect(camera.multiple).toBe(false)

    const shot = new File(['c'], 'shot.jpg', { type: 'image/jpeg' })
    fireEvent.change(camera, { target: { files: [shot] } })

    expect(onCaptureFiles).toHaveBeenCalledWith([shot])
  })
})
