import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi, beforeEach } from 'vitest'

// The page is the ONE place the Stickers surface asks "is there budget?"
// (FEAT-165). These probes prove the answer actually reaches all three doors —
// the dialog and the library (which forwards it to every drawing card).
const { useStickerArtQuotaMock, recordGenerationMock } = vi.hoisted(() => ({
  useStickerArtQuotaMock: vi.fn(),
  recordGenerationMock: vi.fn(),
}))

vi.mock('../useStickerArtQuota', () => ({
  useStickerArtQuota: useStickerArtQuotaMock,
  recordStickerArtGeneration: vi.fn(),
}))

vi.mock('react-router-dom', () => ({
  useNavigate: () => vi.fn(),
}))

vi.mock('../../../core/auth/useAuth', () => ({
  useFamilyId: () => 'family-1',
}))

vi.mock('../../../core/hooks/useActiveChild', () => ({
  useActiveChild: () => ({ activeChild: { id: 'child-1', name: 'Lincoln' } }),
}))

vi.mock('../../../core/profile/useProfile', () => ({
  useProfile: () => ({ profile: 'lincoln' }),
}))

vi.mock('../../../components/Page', () => ({
  default: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}))

vi.mock('../SketchScanner', () => ({ default: () => null }))

vi.mock('../MakeStickerDialog', () => ({
  default: ({
    capReached,
    recordGeneration,
  }: {
    capReached?: boolean
    recordGeneration?: () => Promise<void>
  }) => (
    <div
      data-testid="make-dialog"
      data-cap={String(Boolean(capReached))}
      data-has-recorder={String(recordGeneration === recordGenerationMock)}
    />
  ),
}))

vi.mock('../../settings/StickerLibraryTab', () => ({
  default: ({
    capReached,
    recordGeneration,
  }: {
    capReached?: boolean
    recordGeneration?: () => Promise<void>
  }) => (
    <div
      data-testid="library"
      data-cap={String(Boolean(capReached))}
      data-has-recorder={String(recordGeneration === recordGenerationMock)}
    />
  ),
}))

import StickersPage from '../StickersPage'

describe('StickersPage — art cap plumbing (FEAT-165 / UX-95)', () => {
  beforeEach(() => {
    useStickerArtQuotaMock.mockReset()
  })

  it('hands the cap answer and the counter to every paid door', () => {
    useStickerArtQuotaMock.mockReturnValue({
      count: 10,
      limit: 10,
      remaining: 0,
      atLimit: true,
      recordGeneration: recordGenerationMock,
    })

    render(<StickersPage />)

    expect(screen.getByTestId('make-dialog')).toHaveAttribute('data-cap', 'true')
    expect(screen.getByTestId('make-dialog')).toHaveAttribute('data-has-recorder', 'true')
    expect(screen.getByTestId('library')).toHaveAttribute('data-cap', 'true')
    expect(screen.getByTestId('library')).toHaveAttribute('data-has-recorder', 'true')
  })

  it('leaves the doors open below the cap', () => {
    useStickerArtQuotaMock.mockReturnValue({
      count: 1,
      limit: 10,
      remaining: 9,
      atLimit: false,
      recordGeneration: recordGenerationMock,
    })

    render(<StickersPage />)

    expect(screen.getByTestId('make-dialog')).toHaveAttribute('data-cap', 'false')
    expect(screen.getByTestId('library')).toHaveAttribute('data-cap', 'false')
  })
})
