import { render } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { state, scanner } = vi.hoisted(() => ({
  state: {
    profile: 'lincoln', activeChildId: 'b', isChildProfile: true,
    activeChild: undefined as { id: string; name: string } | undefined,
    children: [] as { id: string; name: string }[],
  },
  scanner: vi.fn(),
}))
vi.mock('react-router-dom', () => ({ useNavigate: () => vi.fn() }))
vi.mock('../../../core/auth/useAuth', () => ({ useFamilyId: () => 'f1' }))
vi.mock('../../../core/hooks/useActiveChild', () => ({ useActiveChild: () => state }))
vi.mock('../../../core/profile/useProfile', () => ({ useProfile: () => ({ profile: state.profile }) }))
vi.mock('../../../components/Page', () => ({ default: ({ children }: { children: React.ReactNode }) => <div>{children}</div> }))
vi.mock('../useStickerArtQuota', () => ({ useStickerArtQuota: () => ({ atLimit: false, limit: 100, remaining: 100, recordGeneration: vi.fn() }) }))
vi.mock('../SketchScanner', () => ({ default: (props: object) => { scanner(props); return null } }))
vi.mock('../MakeStickerDialog', () => ({ default: () => null }))
vi.mock('../../settings/StickerLibraryTab', () => ({ default: () => null }))
import StickersPage from '../StickersPage'

const props = () => scanner.mock.calls.at(-1)![0]
describe('StickersPage capture identity wiring', () => {
  beforeEach(() => {
    scanner.mockClear()
    Object.assign(state, { profile: 'lincoln', activeChildId: 'b', isChildProfile: true, activeChild: undefined, children: [] })
  })

  it('withholds the parent selection until a locked profile child actually exists', () => {
    const view = render(<StickersPage />)
    expect(props()).toMatchObject({ childName: undefined, childProfile: undefined, ownerContext: { activeChildId: undefined, pendingProfile: 'lincoln', children: [] } })
    const london = { id: 'b', name: 'London' }
    Object.assign(state, { activeChild: london, children: [london] })
    view.rerender(<StickersPage />)
    expect(props()).toMatchObject({ childName: undefined, childProfile: undefined, ownerContext: { activeChildId: undefined, pendingProfile: 'lincoln' } })
    const lincoln = { id: 'a', name: 'Lincoln' }
    Object.assign(state, { activeChildId: 'a', activeChild: lincoln, children: [london, lincoln] })
    view.rerender(<StickersPage />)
    expect(props()).toMatchObject({ childName: 'Lincoln', childProfile: 'lincoln', ownerContext: { activeChildId: 'a', pendingProfile: 'lincoln' } })
  })

  it('passes a parent selected ID before metadata and keeps both records available across a switch', () => {
    Object.assign(state, { profile: 'parents', isChildProfile: false, activeChildId: 'a' })
    const view = render(<StickersPage />)
    expect(props()).toMatchObject({ childName: undefined, ownerContext: { activeChildId: 'a', pendingProfile: undefined, children: [] } })
    const london = { id: 'b', name: 'London' }, lincoln = { id: 'a', name: 'Lincoln' }
    Object.assign(state, { activeChildId: 'b', activeChild: london, children: [london, lincoln] })
    view.rerender(<StickersPage />)
    expect(props().ownerContext).toEqual({ activeChildId: 'b', pendingProfile: undefined, children: [{ ...london, profile: 'london' }, { ...lincoln, profile: 'lincoln' }] })
  })
})
