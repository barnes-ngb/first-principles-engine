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
  // Canonical identity defaults for known profile children (ARCH-15).
  getCanonicalIdentity: (name: string) =>
    name.toLowerCase() === 'london'
      ? { birthdate: '2020-02-20', grade: '1st grade' }
      : name.toLowerCase() === 'lincoln'
        ? { birthdate: '2015-09-30', grade: '4th grade' }
        : undefined,
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
          birthdate: '2015-09-30',
          grade: '4th grade',
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

  it('seeds birthdate/grade from the stored child doc', () => {
    render(<SoftProfileSection />)
    const birthdate = screen.getByLabelText(/Birthdate for Lincoln/i, {
      selector: 'input',
    }) as HTMLInputElement
    const grade = screen.getByLabelText(/Grade for Lincoln/i, {
      selector: 'input',
    }) as HTMLInputElement
    expect(birthdate.value).toBe('2015-09-30')
    expect(grade.value).toBe('4th grade')
  })

  it('pre-fills identity from the canonical default when the doc is empty', () => {
    render(<SoftProfileSection />)
    // London has no stored birthdate/grade — the editor pre-fills the canonical
    // default so backfill is one tap (parent still confirms via Save).
    const birthdate = screen.getByLabelText(/Birthdate for London/i, {
      selector: 'input',
    }) as HTMLInputElement
    const grade = screen.getByLabelText(/Grade for London/i, {
      selector: 'input',
    }) as HTMLInputElement
    expect(birthdate.value).toBe('2020-02-20')
    expect(grade.value).toBe('1st grade')
  })

  it('renders empty soft-profile inputs for a child without the fields (no migration)', () => {
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

  it('writes identity + soft-profile fields (trimmed) on save', async () => {
    render(<SoftProfileSection />)

    const interests = screen.getByLabelText(/Interests for London/i, {
      selector: 'input',
    })
    fireEvent.change(interests, { target: { value: '  stories  ' } })

    fireEvent.click(
      screen.getByRole('button', { name: /Save London's profile/i }),
    )

    // Identity writer + soft-profile writer = two updateDoc calls.
    await waitFor(() => {
      expect(mockUpdateDoc).toHaveBeenCalledTimes(2)
    })
    expect(mockDoc).toHaveBeenCalledWith(
      expect.objectContaining({ familyId: 'fam-1' }),
      'c-london',
    )
    expect(mockUpdateDoc).toHaveBeenCalledWith(expect.anything(), {
      birthdate: '2020-02-20',
      grade: '1st grade',
    })
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
