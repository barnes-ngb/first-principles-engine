import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { StrictMode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

// ── Mocks at the boundaries ────────────────────────────────────────────────
// `?diag=1` is a surface flag, not access control — force it open so the tests
// exercise the CAPABILITY gate rather than the query parameter.
const mockSearchParams = vi.fn(() => new URLSearchParams('diag=1'))
vi.mock('react-router-dom', () => ({
  useSearchParams: () => [mockSearchParams()],
}))

let family = 'fam-1'
vi.mock('../../core/auth/useAuth', () => ({ useFamilyId: () => family }))

const mockUseProfile = vi.fn()
vi.mock('../../core/profile/useProfile', () => ({
  useProfile: () => mockUseProfile(),
}))

const mockChildren = vi.fn()
vi.mock('./dataReviewExportChildren', () => ({ loadReviewExportChildren: (...args: unknown[]) => mockChildren(...args) }))
const mockBuild = vi.fn<(...args: unknown[]) => string>().mockReturnValue('# synthetic review')
vi.mock('./dataReviewExport.logic', () => ({
  DataReviewExportMode: { CurrentYear: 'current-year', FullHistory: 'full-history' },
  buildDataReviewExport: (...args: unknown[]) => mockBuild(...args),
  dataReviewExportFilename: (name: string) => `${name}-review.md`,
}))

// The loader is the only Firestore reach; stub it so the gate tests never touch
// the network. A gated render must not call it at all.
const mockLoad = vi.fn()
vi.mock('./dataReviewExportLoader', () => ({
  loadDataReviewExportInput: (...args: unknown[]) => mockLoad(...args),
}))

import DataReviewExportPanel from './DataReviewExportPanel'

const downloadButton = () =>
  screen.queryByRole('button', { name: /Download review export/i })

describe('DataReviewExportPanel — parent capability gate', () => {
  beforeEach(() => {
    family = 'fam-1'
    mockLoad.mockReset()
    mockChildren.mockReset().mockResolvedValue([{ id: 'lincoln', name: 'Lincoln' }])
    mockSearchParams.mockReturnValue(new URLSearchParams('diag=1'))
  })

  // Codex review (PR #1624, P1): `/progress` sits OUTSIDE the `RequireParent`
  // block in `app/router.tsx`, so a kid profile that types `/progress?diag=1`
  // reaches this component. The export carries every child's birthdate, parent
  // notes, assessment data, and artifact media URLs — `?diag=1` alone is not a
  // gate.
  it('renders nothing for a non-parent profile even with ?diag=1', () => {
    mockUseProfile.mockReturnValue({ canEdit: false })
    const { container } = render(<DataReviewExportPanel />)
    expect(container).toBeEmptyDOMElement()
    expect(downloadButton()).toBeNull()
  })

  it('renders the export controls for a parent profile', async () => {
    mockUseProfile.mockReturnValue({ canEdit: true })
    render(<DataReviewExportPanel />)
    await screen.findByRole('button', { name: /Download review export/i })
    expect(screen.getByText(/Data review export/i)).toBeInTheDocument()
  })

  it('still renders nothing for a parent without ?diag=1', () => {
    mockUseProfile.mockReturnValue({ canEdit: true })
    mockSearchParams.mockReturnValue(new URLSearchParams(''))
    const { container } = render(<DataReviewExportPanel />)
    expect(container).toBeEmptyDOMElement()
  })

  it('defaults the scope checkbox to OFF (full history is the default)', async () => {
    mockUseProfile.mockReturnValue({ canEdit: true })
    render(<DataReviewExportPanel />)
    const checkbox = await screen.findByRole('checkbox', {
      name: /Current school year only/i,
    })
    expect(checkbox).not.toBeChecked()
  })

  it('reads no review data until the parent asks for an export', async () => {
    mockUseProfile.mockReturnValue({ canEdit: true })
    render(<DataReviewExportPanel />)
    await screen.findByRole('button', { name: /Download review export/i })
    expect(mockLoad).not.toHaveBeenCalled()
  })
})

describe('Records export scope and download lifetime', () => {
  const click = vi.fn()
  const createUrl = vi.fn(() => 'blob:review')
  const revokeUrl = vi.fn()
  beforeEach(() => {
    family = 'fam-1'
    mockUseProfile.mockReturnValue({ canEdit: true })
    mockSearchParams.mockReturnValue(new URLSearchParams(''))
    mockChildren.mockReset().mockResolvedValue([{ id: 'child-a', name: 'Example' }])
    mockLoad.mockReset()
    mockBuild.mockClear()
    click.mockReset()
    createUrl.mockClear()
    revokeUrl.mockClear()
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(click)
    Object.defineProperty(window.URL, 'createObjectURL', { configurable: true, value: createUrl })
    Object.defineProperty(window.URL, 'revokeObjectURL', { configurable: true, value: revokeUrl })
  })
  const button = () => screen.findByRole('button', { name: /Download review export/i })
  it('exposes Records without a flag and snapshots its own scope in StrictMode', async () => {
    mockLoad.mockResolvedValue({ generatedAt: '2026-09-16T00:00:00Z' })
    render(<StrictMode><DataReviewExportPanel entry="records" /></StrictMode>)
    await button()
    expect(screen.getByRole('heading', { name: 'Export for review' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('checkbox'))
    fireEvent.click(await button())
    await waitFor(() => expect(click).toHaveBeenCalledOnce())
    expect(mockLoad).toHaveBeenCalledWith('fam-1', { id: 'child-a', name: 'Example', grade: undefined, birthdate: undefined }, 'current-year')
    expect(revokeUrl).toHaveBeenCalledWith('blob:review')
    expect(mockBuild.mock.calls[0][0]).toHaveProperty('appBuild')
  })
  it.each(['family', 'capability', 'unmount'])('discards pending download after %s changes', async change => {
    let resolve!: (value: object) => void
    mockLoad.mockReturnValue(new Promise(done => { resolve = done }))
    const view = render(<DataReviewExportPanel entry="records" />)
    fireEvent.click(await button())
    if (change === 'family') family = 'fam-2'
    if (change === 'capability') mockUseProfile.mockReturnValue({ canEdit: false })
    if (change === 'unmount') view.unmount()
    else view.rerender(<DataReviewExportPanel entry="records" />)
    await act(async () => resolve({ generatedAt: '2026-09-16T00:00:00Z' }))
    expect(click).not.toHaveBeenCalled()
    expect(mockBuild).not.toHaveBeenCalled()
  })
  it('gates a failed child-list read and retries without reading export data', async () => {
    mockChildren.mockRejectedValueOnce(new Error('offline'))
    render(<DataReviewExportPanel entry="records" />)
    await screen.findByRole('alert')
    expect(downloadButton()).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }))
    await button()
    expect(mockChildren).toHaveBeenLastCalledWith('fam-1')
    expect(mockLoad).not.toHaveBeenCalled()
  })
  it('discards a slow old-family child list even after switching back', async () => {
    let resolve!: (value: object[]) => void
    mockChildren.mockReturnValueOnce(new Promise(done => { resolve = done }))
    const view = render(<DataReviewExportPanel entry="records" />)
    family = 'fam-2'
    view.rerender(<DataReviewExportPanel entry="records" />)
    await button()
    family = 'fam-1'
    view.rerender(<DataReviewExportPanel entry="records" />)
    await button()
    await act(async () => resolve([{ id: 'stale', name: 'Stale child' }]))
    expect(screen.queryByText('Stale child')).not.toBeInTheDocument()
    fireEvent.click(await button())
    expect(mockLoad).toHaveBeenCalledWith('fam-1', expect.objectContaining({ id: 'child-a' }), 'full-history')
  })
  it('releases a download URL when the browser refuses the click and permits retry', async () => {
    mockLoad.mockResolvedValue({ generatedAt: '2026-09-16T00:00:00Z' })
    click.mockImplementationOnce(() => { throw new Error('Download unavailable') })
    render(<DataReviewExportPanel entry="records" />)
    fireEvent.click(await button())
    await screen.findByText('Download unavailable')
    expect(revokeUrl).toHaveBeenCalledOnce()
    expect(document.querySelector('a[download]')).toBeNull()
    fireEvent.click(await button())
    await screen.findByText('Example-review.md')
    expect(mockLoad).toHaveBeenCalledTimes(2)
  })
})
