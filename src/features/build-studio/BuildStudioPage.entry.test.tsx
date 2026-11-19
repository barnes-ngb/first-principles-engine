import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * Which surface the page draws, now that the child's half has a door in front
 * of it.
 *
 * The page's whole job is still to choose between two surfaces and nothing
 * else. What changed is that the child's surface is the saved-game entry rather
 * than the editor itself, so these cases pin the two things a reader of this
 * run will want to know: the child goes through the entry, with the page's own
 * stale-read fence intact; and **the parent's view is exactly what it was** —
 * her read-only shelf, her enrolment control, her technical detail, and no
 * entry choice anywhere near it.
 */

const shell = {
  profile: 'lincoln' as 'lincoln' | 'parents',
  isChildProfile: true,
  activeChildId: 'c1',
  /** Which child the versions read is ABOUT. The page fences on this. */
  readChildId: 'c1',
}

vi.mock('../../core/auth/useAuth', () => ({ useAuth: () => ({ familyId: 'fam1' }) }))
vi.mock('../../core/profile/useProfile', () => ({
  useProfile: () => ({ profile: shell.profile }),
}))
vi.mock('../../core/hooks/useActiveChild', () => ({
  useActiveChild: () => ({
    activeChildId: shell.activeChildId,
    activeChild: { id: shell.activeChildId, name: 'Lincoln' },
    children: [{ id: shell.activeChildId, name: 'Lincoln' }],
    childrenFamilyId: 'fam1',
    setActiveChildId: () => {},
    isChildProfile: shell.isChildProfile,
    isLoading: false,
    addChild: () => {},
    loadFailed: false,
    retryLoad: () => {},
    profileChildResolved: true,
  }),
}))
vi.mock('./useBuildStudioOptIn', () => ({
  useBuildStudioOptIn: (_familyId: string | null, childId: string | null) => ({
    status: 'ready',
    enabled: true,
    childId,
  }),
}))
vi.mock('./useBuildStudioVersions', () => ({
  VersionsStatus: { Loading: 'loading', Ready: 'ready', Failed: 'failed' },
  versionBelongsTo: () => true,
  useBuildStudioVersions: (_familyId: string | null, _childId: string | null, projectId: string) => ({
    status: 'ready',
    versions: [{ id: 'row-1', versionId: 'v1', label: 'My version 1' }],
    childId: shell.readChildId,
    projectId,
    error: null,
    retry: () => {},
  }),
}))
vi.mock('./BuildStudioSettingsSection', () => ({
  default: () => <div>settings control</div>,
}))

/** Every read the ENTRY was handed, newest last. */
const entryReads: Array<{ childId: string; status: string; versions: unknown[] }> = []
vi.mock('./BuildStudioChildEntry', () => ({
  default: (props: {
    childId: string
    versions: { status: string; versions: unknown[] }
  }) => {
    entryReads.push({
      childId: props.childId,
      status: props.versions.status,
      versions: props.versions.versions,
    })
    return <div>the saved-game entry</div>
  },
}))

/** Every read the read-only shelf was handed, with the props that gate it. */
const shelfProps: Array<{
  canOpen: boolean
  showTechnicalDetail?: boolean
  hasOnOpen: boolean
  status: string
}> = []
vi.mock('./BuildStudioVersionShelf', () => ({
  default: (props: {
    canOpen: boolean
    showTechnicalDetail?: boolean
    onOpen?: unknown
    read: { status: string }
  }) => {
    shelfProps.push({
      canOpen: props.canOpen,
      showTechnicalDetail: props.showTechnicalDetail,
      hasOnOpen: props.onOpen !== undefined,
      status: props.read.status,
    })
    return <div>the read-only shelf</div>
  },
}))

const { default: BuildStudioPage } = await import('./BuildStudioPage')

beforeEach(() => {
  entryReads.length = 0
  shelfProps.length = 0
  shell.profile = 'lincoln'
  shell.isChildProfile = true
  shell.activeChildId = 'c1'
  shell.readChildId = 'c1'
})
afterEach(cleanup)

describe('the child’s half goes through the saved-game entry', () => {
  it('draws the entry, and no editor of its own', () => {
    render(<BuildStudioPage />)
    expect(screen.getByText('the saved-game entry')).toBeInTheDocument()
    expect(entryReads.at(-1)).toMatchObject({ childId: 'c1', status: 'ready' })
    expect(entryReads.at(-1)?.versions).toHaveLength(1)
  })

  /**
   * The page's existing fence, unchanged and now protecting the entry's label
   * and date as well as the shelf: a read about another child is reported as
   * still LOADING rather than shown.
   */
  it('reports a read about another child as not settled', () => {
    shell.readChildId = 'c-sibling'
    render(<BuildStudioPage />)
    expect(entryReads.at(-1)).toMatchObject({ status: 'loading' })
    expect(entryReads.at(-1)?.versions).toHaveLength(0)
  })
})

describe('the parent’s view is unchanged', () => {
  beforeEach(() => {
    shell.profile = 'parents'
    shell.isChildProfile = false
  })

  it('draws her read-only shelf, with no entry choice and no editor', () => {
    render(<BuildStudioPage />)
    expect(screen.getByText('the read-only shelf')).toBeInTheDocument()
    expect(screen.queryByText('the saved-game entry')).not.toBeInTheDocument()
    expect(entryReads).toHaveLength(0)
    // Her whole contract, in the props: she may not open, there is no open
    // handler to hide, and she keeps the digest she identifies versions by.
    expect(shelfProps.at(-1)).toMatchObject({
      canOpen: false,
      hasOnOpen: false,
      showTechnicalDetail: true,
      status: 'ready',
    })
  })

  it('still shows the enrolment state and the same propose→confirm control', () => {
    render(<BuildStudioPage />)
    expect(screen.getByText(/The Build Studio is on for Lincoln/)).toBeInTheDocument()
    expect(screen.getByText('settings control')).toBeInTheDocument()
  })

  it('still fences HER shelf on a read about another child', () => {
    shell.readChildId = 'c-sibling'
    render(<BuildStudioPage />)
    expect(shelfProps.at(-1)).toMatchObject({ status: 'loading' })
  })
})
