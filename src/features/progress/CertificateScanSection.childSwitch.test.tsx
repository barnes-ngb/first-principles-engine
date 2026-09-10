import { fireEvent, render, screen, waitFor } from '@testing-library/react'
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
/** Resolves only when the test releases it — a scan still in flight. */
let releaseScan: ((record: unknown) => void) | null = null
const scan = vi.fn(
  () =>
    new Promise((resolve) => {
      releaseScan = resolve as (record: unknown) => void
    }),
)
const syncScanToConfig = vi.fn(async () => ({ action: 'updated', configName: 'Math', position: 12 }))
vi.mock('../../core/hooks/useScan', () => ({
  useScan: () => ({
    scan: (...args: unknown[]) => scan(...(args as [])),
    scanResult: null,
    scanning: false,
    error: null,
    clearScan: () => clearScan(),
    lastError: () => null,
  }),
  ScanDoor: { Certificate: 'certificate' },
}))

vi.mock('../../core/hooks/useScanToActivityConfig', () => ({
  useScanToActivityConfig: () => ({
    syncScanToConfig: (...args: unknown[]) => syncScanToConfig(...(args as [])),
  }),
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
    scan.mockClear()
    syncScanToConfig.mockClear()
    releaseScan = null
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

  /**
   * Codex round 3, P1 — the render-phase reset closes every door a PERSON can
   * tap and leaves the one the app opens itself. `scan()` awaits an upload and
   * an AI call, and `useScan` sets its result unconditionally on completion, so
   * a scan started for one child used to repopulate after the switch and reach
   * `syncScanToConfig` with the NEW child's id.
   */
  it('discards a scan that completes after the child changed', async () => {
    const { default: CertificateScanSection } = await import('./CertificateScanSection')
    const { rerender } = render(<CertificateScanSection />)

    // Start a scan for Lincoln and leave it in flight.
    const input = document.querySelector('input[type="file"]') as HTMLInputElement
    const file = new File(['x'], 'cert.jpg', { type: 'image/jpeg' })
    fireEvent.change(input, { target: { files: [file] } })
    await waitFor(() => expect(scan).toHaveBeenCalled())

    // The header moves while it is still running.
    setActive(LONDON)
    rerender(<CertificateScanSection />)

    // Lincoln's scan now lands.
    releaseScan?.({
      id: 'scan-1',
      results: { pageType: 'worksheet', skillsTargeted: [], lessonNumber: 12 },
    })
    await waitFor(() => expect(clearScan).toHaveBeenCalled())

    // POSITIVE CONTROL — without the run token this reached
    // `syncScanToConfig(activeChildId, …)` with London's id, writing Lincoln's
    // certificate into London's activityConfigs.
    expect(syncScanToConfig).not.toHaveBeenCalled()
    expect(applyUpdate).not.toHaveBeenCalled()
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
