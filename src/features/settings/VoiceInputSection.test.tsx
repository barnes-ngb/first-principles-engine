import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'

const mockUpdateDoc = vi.fn<(...args: unknown[]) => Promise<undefined>>(
  async () => undefined,
)
const mockDoc = vi.fn((_col: unknown, id: string) => ({ id }))

vi.mock('firebase/firestore', () => ({
  doc: (col: unknown, id: string) => mockDoc(col, id),
  updateDoc: (ref: unknown, data: unknown) => mockUpdateDoc(ref, data),
}))

vi.mock('../../core/auth/useAuth', () => ({
  useFamilyId: () => 'fam-1',
}))

vi.mock('../../core/firebase/firestore', () => ({
  childrenCollection: (familyId: string) => ({ familyId }),
}))

const mockUseChildren = vi.fn()
vi.mock('../../core/hooks/useChildren', () => ({
  useChildren: () => mockUseChildren(),
}))

import VoiceInputSection from './VoiceInputSection'

describe('VoiceInputSection', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockUseChildren.mockReturnValue({
      children: [
        { id: 'c-lincoln', name: 'Lincoln', voiceInputEnhanced: true },
        { id: 'c-london', name: 'London', voiceInputEnhanced: false },
      ],
      isLoading: false,
    })
  })

  it('renders a toggle per child reflecting current value', () => {
    render(<VoiceInputSection />)

    const lincoln = screen.getByLabelText(
      /Enhanced speech recognition for Lincoln/i,
      { selector: 'input' },
    ) as HTMLInputElement
    const london = screen.getByLabelText(
      /Enhanced speech recognition for London/i,
      { selector: 'input' },
    ) as HTMLInputElement

    expect(lincoln.checked).toBe(true)
    expect(london.checked).toBe(false)
  })

  it('calls updateDoc with voiceInputEnhanced=true when toggling on', async () => {
    render(<VoiceInputSection />)

    const london = screen.getByLabelText(
      /Enhanced speech recognition for London/i,
      { selector: 'input' },
    )

    fireEvent.click(london)

    await waitFor(() => {
      expect(mockUpdateDoc).toHaveBeenCalledTimes(1)
    })
    expect(mockUpdateDoc).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'c-london' }),
      { voiceInputEnhanced: true },
    )
  })

  it('reflects optimistic toggle state immediately', async () => {
    render(<VoiceInputSection />)
    const london = screen.getByLabelText(
      /Enhanced speech recognition for London/i,
      { selector: 'input' },
    ) as HTMLInputElement
    expect(london.checked).toBe(false)

    fireEvent.click(london)
    expect(london.checked).toBe(true)

    await waitFor(() => {
      expect(mockUpdateDoc).toHaveBeenCalled()
    })
  })

  it('renders nothing while children are loading', () => {
    mockUseChildren.mockReturnValue({ children: [], isLoading: true })
    const { container } = render(<VoiceInputSection />)
    expect(container.querySelector('input[type="checkbox"]')).toBeNull()
  })
})
