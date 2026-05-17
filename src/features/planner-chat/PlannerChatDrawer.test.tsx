import { render, screen, fireEvent } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import PlannerChatDrawer from './PlannerChatDrawer'
import type { ChatMessage } from '../../core/types'
import { ChatMessageRole } from '../../core/types/enums'

function makeMessage(role: ChatMessageRole, text: string): ChatMessage {
  return {
    id: `${role}-${text}`,
    role,
    text,
    createdAt: new Date().toISOString(),
  }
}

function defaultProps(overrides: Partial<React.ComponentProps<typeof PlannerChatDrawer>> = {}) {
  return {
    messages: [] as ChatMessage[],
    inputText: '',
    onInputChange: vi.fn(),
    onSend: vi.fn(),
    loading: false,
    ...overrides,
  }
}

describe('PlannerChatDrawer — collapse state', () => {
  it('renders the toggle bar collapsed by default', () => {
    render(<PlannerChatDrawer {...defaultProps()} />)
    const toggle = screen.getByRole('button', { name: /free-form chat/i })
    expect(toggle).toBeInTheDocument()
    expect(toggle).toHaveAttribute('aria-expanded', 'false')
  })

  it('expands when the toggle is clicked', () => {
    render(<PlannerChatDrawer {...defaultProps()} />)
    const toggle = screen.getByRole('button', { name: /free-form chat/i })
    fireEvent.click(toggle)
    expect(toggle).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByPlaceholderText(/swap tue and thu/i)).toBeInTheDocument()
  })

  it('shows hint copy on first open with no messages', () => {
    render(<PlannerChatDrawer {...defaultProps()} />)
    fireEvent.click(screen.getByRole('button', { name: /free-form chat/i }))
    expect(screen.getByText(/use chat for things the form above can/i)).toBeInTheDocument()
  })

  it('hides hint when there are existing messages', () => {
    const messages = [makeMessage(ChatMessageRole.User, 'hi')]
    render(<PlannerChatDrawer {...defaultProps({ messages })} />)
    fireEvent.click(screen.getByRole('button', { name: /free-form chat/i }))
    expect(screen.queryByText(/use chat for things the form above can/i)).not.toBeInTheDocument()
  })
})

describe('PlannerChatDrawer — input', () => {
  it('renders existing messages when open', () => {
    const messages = [makeMessage(ChatMessageRole.Assistant, 'Updated plan')]
    render(<PlannerChatDrawer {...defaultProps({ messages })} />)
    fireEvent.click(screen.getByRole('button', { name: /free-form chat/i }))
    expect(screen.getByText('Updated plan')).toBeInTheDocument()
  })

  it('calls onInputChange when input is edited', () => {
    const onInputChange = vi.fn()
    render(<PlannerChatDrawer {...defaultProps({ onInputChange })} />)
    fireEvent.click(screen.getByRole('button', { name: /free-form chat/i }))
    fireEvent.change(screen.getByPlaceholderText(/swap tue and thu/i), { target: { value: 'make Wed light' } })
    expect(onInputChange).toHaveBeenCalledWith('make Wed light')
  })

  it('calls onSend when send button is clicked with non-empty input', () => {
    const onSend = vi.fn()
    render(<PlannerChatDrawer {...defaultProps({ inputText: 'hi', onSend })} />)
    fireEvent.click(screen.getByRole('button', { name: /free-form chat/i }))
    fireEvent.click(screen.getByRole('button', { name: /send chat message/i }))
    expect(onSend).toHaveBeenCalledTimes(1)
  })

  it('disables send button when input is empty', () => {
    render(<PlannerChatDrawer {...defaultProps({ inputText: '   ' })} />)
    fireEvent.click(screen.getByRole('button', { name: /free-form chat/i }))
    expect(screen.getByRole('button', { name: /send chat message/i })).toBeDisabled()
  })

  it('sends on Enter key (no shift)', () => {
    const onSend = vi.fn()
    render(<PlannerChatDrawer {...defaultProps({ inputText: 'go', onSend })} />)
    fireEvent.click(screen.getByRole('button', { name: /free-form chat/i }))
    fireEvent.keyDown(screen.getByPlaceholderText(/swap tue and thu/i), { key: 'Enter' })
    expect(onSend).toHaveBeenCalledTimes(1)
  })
})
