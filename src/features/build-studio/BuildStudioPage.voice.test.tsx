import { cleanup, render } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * The page resolves WHOSE voice setting the studio's mic gets
 * (PR #1974 round 1).
 *
 * The editor is handed its child as a prop and never reads the shell, so the
 * child's configured voice engine has to be threaded the same way — exactly as
 * `TodayPage` and the books chats thread it. It was not: the mic was given an
 * id and nothing else, so `VoiceInput` saw `voiceInputEnhanced === undefined`
 * and took the Web Speech path for a child whose settings say Whisper.
 *
 * These cases are about the THREADING: the value that reaches the editor is the
 * resolved child's own, it follows a switch, and it is never another child's.
 * What the flag then selects is `VoiceInput`'s own contract and is asserted in
 * that component's suite.
 */

// ── The shell, as the page reads it ──────────────────────────────────────

const activeChildState: {
  activeChildId: string
  activeChild: { id: string; name: string; voiceInputEnhanced?: boolean } | undefined
} = {
  activeChildId: 'c-lincoln',
  activeChild: { id: 'c-lincoln', name: 'Lincoln', voiceInputEnhanced: true },
}

vi.mock('../../core/auth/useAuth', () => ({
  useAuth: () => ({ familyId: 'fam1' }),
}))

vi.mock('../../core/hooks/useActiveChild', () => ({
  useActiveChild: () => ({
    activeChildId: activeChildState.activeChildId,
    activeChild: activeChildState.activeChild,
    children: activeChildState.activeChild ? [activeChildState.activeChild] : [],
    childrenFamilyId: 'fam1',
    setActiveChildId: () => {},
    isChildProfile: true,
    isLoading: false,
    addChild: () => {},
    loadFailed: false,
    retryLoad: () => {},
    // The signed-in child profile really is this child's own record, which is
    // what the access rule requires before any editor is drawn.
    profileChildResolved: true,
  }),
}))

vi.mock('../../core/profile/useProfile', () => ({
  useProfile: () => ({ profile: 'lincoln' }),
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
  useBuildStudioVersions: (
    _familyId: string | null,
    childId: string | null,
    projectId: string,
  ) => ({
    status: 'ready',
    versions: [],
    childId,
    projectId,
    error: null,
    retry: () => {},
  }),
}))

vi.mock('./BuildStudioVersionShelf', () => ({ default: () => null }))
vi.mock('./BuildStudioSettingsSection', () => ({ default: () => null }))

/** Every set of props the editor was mounted with, newest last. */
const editorProps: Array<{ childId: string; childVoiceInputEnhanced?: boolean }> = []
vi.mock('./BuildStudioEditor', () => ({
  default: (props: { childId: string; childVoiceInputEnhanced?: boolean }) => {
    editorProps.push({
      childId: props.childId,
      childVoiceInputEnhanced: props.childVoiceInputEnhanced,
    })
    return null
  },
}))

const { default: BuildStudioPage } = await import('./BuildStudioPage')

const lastEditor = () => editorProps.at(-1)

beforeEach(() => {
  editorProps.length = 0
  activeChildState.activeChildId = 'c-lincoln'
  activeChildState.activeChild = {
    id: 'c-lincoln',
    name: 'Lincoln',
    voiceInputEnhanced: true,
  }
})

describe('the page threads the resolved child’s voice setting to the studio', () => {
  /**
   * POSITIVE CONTROL: drop the `childVoiceInputEnhanced` prop from
   * `BuildStudioPage` and this case reads `undefined`, which is the defect —
   * `VoiceInput` requires an explicit `true`.
   */
  it('passes TRUE for a child configured for enhanced input', () => {
    render(<BuildStudioPage />)
    expect(lastEditor()).toEqual({
      childId: 'c-lincoln',
      childVoiceInputEnhanced: true,
    })
  })

  it('passes FALSE for a child configured off', () => {
    activeChildState.activeChild = {
      id: 'c-lincoln',
      name: 'Lincoln',
      voiceInputEnhanced: false,
    }
    render(<BuildStudioPage />)
    expect(lastEditor()?.childVoiceInputEnhanced).toBe(false)
  })

  it('passes FALSE when the child has no setting at all', () => {
    activeChildState.activeChild = { id: 'c-lincoln', name: 'Lincoln' }
    render(<BuildStudioPage />)
    expect(lastEditor()?.childVoiceInputEnhanced).toBe(false)
  })

  /**
   * A switch mounts a new editor for whoever the shell now resolves, and the
   * setting must arrive with the id rather than lagging a child behind.
   */
  it('follows a child switch, with that child’s own setting', () => {
    render(<BuildStudioPage />)
    expect(lastEditor()).toEqual({
      childId: 'c-lincoln',
      childVoiceInputEnhanced: true,
    })
    cleanup()
    activeChildState.activeChildId = 'c-london'
    activeChildState.activeChild = {
      id: 'c-london',
      name: 'London',
      voiceInputEnhanced: false,
    }
    render(<BuildStudioPage />)
    expect(lastEditor()).toEqual({
      childId: 'c-london',
      childVoiceInputEnhanced: false,
    })
  })

  /**
   * The resolved record must BE the child being asked about. `useActiveChild`
   * falls back to the selected id when a child profile matches no document, so
   * a mismatched record is a SIBLING's — and a sibling's setting is not an
   * answer about this child.
   */
  it('never carries a record that is not this child’s', () => {
    activeChildState.activeChildId = 'c-lincoln'
    activeChildState.activeChild = {
      id: 'c-london',
      name: 'London',
      voiceInputEnhanced: true,
    }
    render(<BuildStudioPage />)
    // The access rule refuses a mismatched record outright, so there is no
    // editor and therefore no sibling's setting to carry into one.
    expect(editorProps).toHaveLength(0)
  })

  it('draws no studio at all while the child record has not resolved', () => {
    activeChildState.activeChild = undefined
    render(<BuildStudioPage />)
    expect(editorProps).toHaveLength(0)
  })
})
