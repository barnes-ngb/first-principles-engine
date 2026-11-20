import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

// `VersionsStatus` lives beside the hook that reads Firestore; stubbed so this
// suite initialises no Firebase app.
vi.mock('../../core/firebase/firestore', () => ({
  db: { __db: true },
  buildStudioVersionsCollection: () => ({ __col: 'buildStudioVersions' }),
}))

import {
  buildStudioVersionDocId,
  serializeBuildStudioSource,
  type BuildStudioVersion,
} from '../../core/types/buildStudio'
import BuildStudioVersionShelf from './BuildStudioVersionShelf'
import { VersionsStatus } from './useBuildStudioVersions'

/**
 * The parent's compact challenge line on exact version rows
 * (LOCAL-VISION-007): present only where a validated, row-scoped record exists,
 * only in the parent's view, and absent from every older row.
 */

const CHILD = 'c1'
const PROJECT = 'apple-dash-starter'

function row(versionId: string, extra: Partial<BuildStudioVersion> = {}): BuildStudioVersion {
  return {
    id: buildStudioVersionDocId(CHILD, PROJECT, versionId),
    childId: CHILD,
    projectId: PROJECT,
    versionId,
    label: `Version ${versionId}`,
    createdAt: '2026-11-20T10:00:00.000Z',
    sourceArchive: serializeBuildStudioSource({ 'main.ts': 'a', 'pxt.json': '{}' }),
    byteSize: 10,
    fileCount: 2,
    sourceDigest: 'd',
    ...extra,
  }
}

const withAttempt = (versionId: string) =>
  row(versionId, {
    goalId: 'one-more-life',
    challengeAttempt: {
      childId: CHILD,
      projectId: PROJECT,
      versionId,
      attemptId: 'a-attempt1',
      challengeId: 'faster-hero',
      challengeRevision: 1,
      subjectBucket: 'PracticalArts',
      prediction: { optionId: 'faster', at: '2026-11-20T10:00:00.000Z' },
      playRequest: { at: '2026-11-20T10:01:00.000Z' },
      reportedOutcome: { result: 'different', at: '2026-11-20T10:02:00.000Z' },
    },
  })

function shelf(versions: BuildStudioVersion[], showChallengeLine?: boolean) {
  return (
    <BuildStudioVersionShelf
      read={{
        status: VersionsStatus.Ready,
        versions,
        childId: CHILD,
        projectId: PROJECT,
        error: null,
        retry: vi.fn(),
      }}
      canOpen={false}
      onDownload={vi.fn()}
      onRetryRead={vi.fn()}
      showChallengeLine={showChallengeLine}
    />
  )
}

afterEach(cleanup)

describe('the parent’s challenge line', () => {
  it('shows the record and the authored follow-up on the exact row, and nothing on older rows', () => {
    render(shelf([withAttempt('v-new-1'), row('v-old-1', { goalId: 'one-more-life' })], true))
    const lines = screen.getAllByText(/Challenge: “Make the hero faster\.”/)
    expect(lines).toHaveLength(1)
    expect(lines[0].textContent).toContain('Guess: Faster.')
    expect(lines[0].textContent).toContain('Pressed Play.')
    expect(lines[0].textContent).toContain('Said: Different.')
    expect(lines[0].textContent).toContain('Ask: ')
    // The older row, which carries only the legacy goal id, has no line.
    expect(screen.getByText('Version v-old-1').closest('li')!.textContent).not.toContain('Challenge')
  })

  it('is absent from the child’s shelf, which does not ask for it', () => {
    render(shelf([withAttempt('v-new-1')]))
    expect(screen.queryByText(/Challenge:/)).not.toBeInTheDocument()
  })

  it('does not draw a record that belongs to a different version row', () => {
    const wrong = withAttempt('v-new-1')
    wrong.challengeAttempt = { ...wrong.challengeAttempt!, versionId: 'v-someone-else' }
    render(shelf([wrong], true))
    expect(screen.queryByText(/Challenge:/)).not.toBeInTheDocument()
  })
})
