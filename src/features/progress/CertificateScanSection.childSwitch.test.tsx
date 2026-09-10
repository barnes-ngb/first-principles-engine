import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * UX-329, Codex round 1 on PR #1820 — a scanned certificate awaiting Confirm
 * must not be applied to whoever the header moved to.
 *
 * `handleConfirmApply` calls `applyUpdate(familyId, activeChildId,
 * pendingResult)`, which writes `activityConfigs` and `skillSnapshots`. Since
 * UX-326 this door renders inside `CurriculumTab`, below that tab's own
 * `ChildSelector` — so the switch is reachable today, with the shell switcher
 * off. The census's first heuristic could not see this surface at all, because
 * the child id is passed **positionally**; that hole is closed in the same
 * commit, and `childSwitchSurfaces.invariant.test.ts` now derives this file.
 *
 * The last case is the positive control: with the reset removed, the pending
 * result survives the switch and Confirm is still on screen.
 */

const mockUseActiveChild = vi.fn()
vi.mock('../../core/hooks/useActiveChild', () => ({
  useActiveChild: () => mockUseActiveChild(),
}))

vi.mock('../../core/auth/useAuth', () => ({
  useFamilyId: () => 'fam-1',
  useAuth: () => ({ familyId: 'fam-1' }),
}))

const applyUpdate = vi.fn()
const clearCertState = vi.fn()
const buildPreview = vi.fn(async () => {})
/**
 * Left null throughout. The reset block runs on any child change, and
 * `clearCertState` / `clearScan` are the observable proxies for the pending
 * result and the confirm dialog being dropped with it — asserting those keeps
 * this test on the rule rather than on the preview card's field shape.
 */
const preview = null
vi.mock('../../core/hooks/useCertificateProgress', () => ({
  useCertificateProgress: () => ({
    buildPreview: (...args: unknown[]) => buildPreview(...(args as [])),
    applyUpdate: (family: unknown, child: unknown, result: unknown) =>
      applyUpdate(family, child, result),
    preview,
    applying: false,
    applied: false,
    error: null,
    clearState: () => clearCertState(),
  }),
}))

const clearScan = vi.fn()
vi.mock('../../core/hooks/useScan', () => ({
  useScan: () => ({
    scan: vi.fn(),
    scanResult: null,
    scanning: false,
    error: null,
    clearScan: () => clearScan(),
    lastError: () => null,
  }),
  ScanDoor: { Certificate: 'certificate' },
}))

vi.mock('../../core/hooks/useScanToActivityConfig', () => ({
  useScanToActivityConfig: () => ({ syncScanToConfig: vi.fn() }),
}))

const LINCOLN = { id: 'lincoln', name: 'Lincoln' }
const LONDON = { id: 'london', name: 'London' }

function setActive(child: { id: string; name: string }) {
  mockUseActiveChild.mockReturnValue({
    activeChildId: child.id,
    activeChild: child,
    children: [LINCOLN, LONDON],
    setActiveChildId: vi.fn(),
    isChildProfile: false,
    isLoading: false,
    addChild: vi.fn(),
  })
}

describe('CertificateScanSection — a pending certificate is not applied to another child', () => {
  beforeEach(() => {
    applyUpdate.mockClear()
    clearCertState.mockClear()
    clearScan.mockClear()
    setActive(LINCOLN)
  })

  it('drops the pending certificate on a child change and says to scan again', async () => {
    const { default: CertificateScanSection } = await import('./CertificateScanSection')
    const { rerender } = render(<CertificateScanSection />)

    setActive(LONDON)
    rerender(<CertificateScanSection />)

    // POSITIVE CONTROL — before the fix nothing cleared here, so a Confirm tap
    // wrote Lincoln's certificate onto London's activityConfigs + skillSnapshot.
    expect(clearCertState).toHaveBeenCalled()
    expect(clearScan).toHaveBeenCalled()
    expect(applyUpdate).not.toHaveBeenCalled()
  })

  it('does not clear anything while the child is unchanged', async () => {
    const { default: CertificateScanSection } = await import('./CertificateScanSection')
    const { rerender } = render(<CertificateScanSection />)
    clearCertState.mockClear()
    clearScan.mockClear()

    rerender(<CertificateScanSection />)

    // A re-render is not a switch: clearing here would throw away a staged
    // certificate every time the page happened to re-render.
    expect(clearCertState).not.toHaveBeenCalled()
    expect(clearScan).not.toHaveBeenCalled()
  })

  it('renders without a child selected', async () => {
    const { default: CertificateScanSection } = await import('./CertificateScanSection')
    mockUseActiveChild.mockReturnValue({
      activeChildId: '',
      activeChild: undefined,
      children: [],
      setActiveChildId: vi.fn(),
      isChildProfile: false,
      isLoading: false,
      addChild: vi.fn(),
    })
    render(<CertificateScanSection />)
    expect(screen.queryByText(/was not applied/i)).not.toBeInTheDocument()
  })
})
