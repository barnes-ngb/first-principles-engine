import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

/**
 * UX-275 — "spinner then nothing" is the worst of the three behaviours the
 * owner described and was the only one with no test. This door already renders
 * `scanError`; this pins it, so a refactor cannot quietly drop the one surface
 * that reports.
 */

const REASON = "Can't read this picture — it's a HEIC file, and the scanner needs a JPEG."

vi.mock('../../core/auth/useAuth', () => ({ useFamilyId: () => 'fam-1' }))
vi.mock('../../core/hooks/useActiveChild', () => ({
  useActiveChild: () => ({
    activeChildId: 'lincoln',
    activeChild: { id: 'lincoln', name: 'Lincoln' },
    isChildProfile: false,
  }),
}))
vi.mock('../../core/hooks/useScan', () => ({
  useScan: () => ({
    scan: vi.fn(),
    scanResult: null,
    scanning: false,
    error: REASON,
    lastError: () => REASON,
    clearScan: vi.fn(),
  }),
}))
vi.mock('../../core/hooks/useCertificateProgress', () => ({
  useCertificateProgress: () => ({
    buildPreview: vi.fn(),
    applyUpdate: vi.fn(),
    preview: null,
    applying: false,
    applied: null,
    error: null,
    clearState: vi.fn(),
  }),
}))
vi.mock('../../core/hooks/useScanToActivityConfig', () => ({
  useScanToActivityConfig: () => ({ syncScanToConfig: vi.fn() }),
}))
vi.mock('../../components/ScanButton', () => ({ default: () => <div>SCAN_BUTTON</div> }))
vi.mock('../../components/ScanResultsPanel', () => ({ default: () => null }))

import CertificateScanSection from './CertificateScanSection'

describe('CertificateScanSection — the failure is rendered, not swallowed', () => {
  it('shows the scan failure reason on screen', () => {
    render(<CertificateScanSection />)
    expect(screen.getByText(new RegExp('HEIC'))).toBeInTheDocument()
  })
})
