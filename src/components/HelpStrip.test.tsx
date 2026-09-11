import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import HelpStrip from './HelpStrip'

describe('page help on request', () => {
  it('starts closed, opens on request, closes with Escape, and stays closed on a return visit', async () => {
    const user = userEvent.setup()
    const props = { pageKey: 'progress', text: 'Explore skills by subject.' }
    const { unmount } = render(<HelpStrip {...props} />)
    expect(screen.queryByText(props.text)).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Help' }))
    expect(screen.getByRole('dialog', { name: 'Page help' })).toHaveTextContent(props.text)
    await user.keyboard('{Escape}')
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(screen.getByRole('button', { name: 'Help' })).toHaveFocus()
    unmount()
    render(<HelpStrip {...props} />)
    expect(screen.queryByText(props.text)).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Help' }))
    await user.click(screen.getByRole('button', { name: 'Close help' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  })
})
