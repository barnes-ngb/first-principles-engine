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

import SoftProfileSection from './SoftProfileSection'

describe('SoftProfileSection', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockUseChildren.mockReturnValue({
      children: [
        {
          id: 'c-lincoln',
          name: 'Lincoln',
          motivators: 'Minecraft, Lego',
          interests: 'dinosaurs',
          strengths: 'persistence',
        },
        // London has no soft-profile fields — the no-migration case.
        { id: 'c-london', name: 'London' },
      ],
      isLoading: false,
    })
  })

  it('seeds inputs from existing child fields', () => {
    render(<SoftProfileSection />)
    const motivators = screen.getByLabelText(/Motivators for Lincoln/i, {
      selector: 'input',
    }) as HTMLInputElement
    expect(motivators.value).toBe('Minecraft, Lego')
  })

  it('renders empty inputs for a child without the fields (no migration)', () => {
    render(<SoftProfileSection />)
    const motivators = screen.getByLabelText(/Motivators for London/i, {
      selector: 'input',
    }) as HTMLInputElement
    const interests = screen.getByLabelText(/Interests for London/i, {
      selector: 'input',
    }) as HTMLInputElement
    expect(motivators.value).toBe('')
    expect(interests.value).toBe('')
  })

  it('writes all three fields (trimmed) on save', async () => {
    render(<SoftProfileSection />)

    const interests = screen.getByLabelText(/Interests for London/i, {
      selector: 'input',
    })
    fireEvent.change(interests, { target: { value: '  stories  ' } })

    fireEvent.click(
      screen.getByRole('button', { name: /Save London's profile/i }),
    )

    await waitFor(() => {
      expect(mockUpdateDoc).toHaveBeenCalledTimes(1)
    })
    expect(mockDoc).toHaveBeenCalledWith(
      expect.objectContaining({ familyId: 'fam-1' }),
      'c-london',
    )
    expect(mockUpdateDoc).toHaveBeenCalledWith(expect.anything(), {
      motivators: '',
      interests: 'stories',
      strengths: '',
    })
  })

  it('renders nothing while children are loading', () => {
    mockUseChildren.mockReturnValue({ children: [], isLoading: true })
    const { container } = render(<SoftProfileSection />)
    expect(container.querySelector('input')).toBeNull()
  })
})
