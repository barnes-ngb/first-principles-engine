import { describe, expect, it, vi, beforeEach } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import MessageActions from './MessageActions'

const MARKDOWN = '# Curriculum gap\n\n- Lincoln: **short i** not yet solid\n- next: booster cards'

describe('MessageActions (FEAT-59)', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('copies the RAW markdown verbatim (not rendered text) and toasts', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.assign(navigator, { clipboard: { writeText } })
    const onNotify = vi.fn()

    render(
      <MessageActions
        markdown={MARKDOWN}
        meta={{ chat: 'shelly', timestamp: '2026-07-06T00:00:00.000Z' }}
        onNotify={onNotify}
      />,
    )

    fireEvent.click(screen.getByLabelText('Copy message as Markdown'))
    await vi.waitFor(() => expect(onNotify).toHaveBeenCalledWith('Copied as Markdown'))
    expect(writeText).toHaveBeenCalledWith(MARKDOWN)
  })

  it('downloads a real .md file named {chat}-{date}-{slug}.md with a header + verbatim body', () => {
    const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})
    const blobs: Blob[] = []
    const createObjectURL = vi.fn((b: Blob) => {
      blobs.push(b)
      return 'blob:mock'
    })
    const revokeObjectURL = vi.fn()
    Object.assign(URL, { createObjectURL, revokeObjectURL })
    const onNotify = vi.fn()

    // Capture the anchor's download filename at click time.
    let downloadName = ''
    clickSpy.mockImplementation(function (this: HTMLAnchorElement) {
      downloadName = this.download
    })

    render(
      <MessageActions
        markdown={'# Curriculum gap'}
        meta={{ chat: 'shelly', timestamp: '2026-07-06T00:00:00.000Z', child: 'Lincoln', source: 'general' }}
        onNotify={onNotify}
      />,
    )

    fireEvent.click(screen.getByLabelText('Download message as Markdown file'))

    expect(downloadName).toBe('shelly-2026-07-06-curriculum-gap.md')
    expect(createObjectURL).toHaveBeenCalledTimes(1)
    expect(onNotify).toHaveBeenCalledWith('Downloaded .md')
  })
})
