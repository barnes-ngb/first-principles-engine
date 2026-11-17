/**
 * `/build-studio` — the one page (LOCAL-BUILD-001).
 *
 * It decides WHICH of the two surfaces to draw and nothing else: the child's
 * studio, or the parent's read-only view of that child's versions. Both read
 * the same shelf component and the same access rule, so neither can show the
 * other's controls by accident.
 *
 * ── The child-switch answer, stated here because this is where it is made ──
 *
 * `BuildStudioEditor` is mounted with the resolved child as a PROP and is
 * keyed by it, so the identity the editor was started under cannot change
 * underneath it: a change of child or profile unmounts that editor and mounts
 * a new one for whoever the shell now resolves. Two things make that honest
 * rather than lossy:
 *
 *   • an accepted write already in flight is **BIND**ed to its own scope and
 *     completes against its own owner; its result is reported through
 *     `onOutOfScopeSave` rather than applied to the new visit or dropped;
 *   • unsaved EDITOR work cannot be carried across, so the loss is **made
 *     visible** — the notice below says it plainly instead of the page quietly
 *     reopening the starter for somebody else.
 *
 * A parent cannot reach the editor at all (`ParentView` has no editing
 * controls), and a child profile cannot change child, so in practice the
 * crossing happens on a profile change. It is still handled rather than
 * assumed away.
 */

import { useCallback, useState } from 'react'
import Alert from '@mui/material/Alert'
import AlertTitle from '@mui/material/AlertTitle'
import Box from '@mui/material/Box'
import CircularProgress from '@mui/material/CircularProgress'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'

import { useAuth } from '../../core/auth/useAuth'
import { useActiveChild } from '../../core/hooks/useActiveChild'
import { useProfile } from '../../core/profile/useProfile'
import type { BuildStudioVersion } from '../../core/types/buildStudio'
import { parseBuildStudioSource } from '../../core/types/buildStudio'
import {
  BuildStudioAccess,
  resolveBuildStudioAccess,
} from './buildStudioAccess'
import { buildStudioDownloads, downloadTextFile } from './buildStudioExport'
import BuildStudioEditor from './BuildStudioEditor'
import { BUILD_STUDIO_PROJECT_ID } from './buildStudioStarter'
import BuildStudioVersionShelf from './BuildStudioVersionShelf'
import { useBuildStudioOptIn } from './useBuildStudioOptIn'
import { useBuildStudioVersions, VersionsStatus } from './useBuildStudioVersions'

/**
 * What a parent is told about where this runs.
 *
 * Said in the parent view and nowhere else, because it is a parent's decision
 * to understand: "private" here means nothing is published, NOT that
 * Microsoft's editor is uninvolved. Overstating that would be the dishonest
 * version of this feature.
 */
export const BUILD_STUDIO_PRIVACY_LINE =
  'Saved games live only in this family’s own records. Nothing is published or shared. The editor itself is Microsoft’s MakeCode Arcade, loaded in a frame — only the game’s own source is sent to it, never a name, a note or a recording.'

export default function BuildStudioPage() {
  const { familyId } = useAuth()
  const { profile } = useProfile()
  const {
    activeChildId,
    activeChild,
    isChildProfile,
    isLoading,
    loadFailed,
    childrenFamilyId,
  } = useActiveChild()

  const optIn = useBuildStudioOptIn(familyId, activeChildId || null)
  const versions = useBuildStudioVersions(familyId, activeChildId || null)

  const access = resolveBuildStudioAccess({
    familyId,
    profile,
    isChildProfile,
    childId: activeChildId,
    resolvedChild: activeChild ?? null,
    childrenLoading: isLoading,
    childrenLoadFailed: loadFailed,
    childrenFamilyId,
    optIn,
  })

  /** A write that landed for a scope no longer on screen. Said, not hidden. */
  const [outOfScope, setOutOfScope] = useState<string | null>(null)
  const noteOutOfScope = useCallback((detail: string) => setOutOfScope(detail), [])

  const handleDownload = useCallback((version: BuildStudioVersion) => {
    try {
      for (const download of buildStudioDownloads(
        parseBuildStudioSource(version.sourceArchive),
        version.label,
      )) {
        downloadTextFile(download)
      }
    } catch {
      // A version whose archive will not parse is a real (and recorded) state;
      // it must not take the page down with it.
    }
  }, [])

  if (access === BuildStudioAccess.Unsettled) {
    return (
      <Box sx={{ p: 3, display: 'flex', justifyContent: 'center' }}>
        <CircularProgress />
      </Box>
    )
  }

  if (access === BuildStudioAccess.Closed) {
    // The route guard normally gets here first; this is the page refusing on
    // its own account, because a surface that trusts its guard is a surface
    // with one check instead of two.
    return (
      <Box sx={{ p: 2 }}>
        <Alert severity="info">
          The Build Studio is not open for this profile.
        </Alert>
      </Box>
    )
  }

  // Unreachable: `resolveBuildStudioAccess` has already refused both of these.
  // Kept so the narrowing below is the compiler's rather than a cast, which is
  // the difference between a guarantee and a comment.
  if (!familyId || !activeChildId) return null

  const shelfChildIsCurrent = versions.childId === activeChildId

  if (access === BuildStudioAccess.ParentView) {
    return (
      <Stack spacing={2} sx={{ p: 2 }}>
        <Stack spacing={0.5}>
          <Typography variant="h5" sx={{ fontWeight: 800 }}>
            Build Studio — {activeChild?.name ?? 'this child'}
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Read-only. You can see and download what he has saved; the editing is
            his.
          </Typography>
        </Stack>
        <Alert severity="info">{BUILD_STUDIO_PRIVACY_LINE}</Alert>
        {outOfScope && <Alert severity="warning">{outOfScope}</Alert>}
        <BuildStudioVersionShelf
          read={versions}
          // The parent view's whole contract, in one prop. There is no `onOpen`
          // to pass, so there is no control to hide.
          canOpen={false}
          onDownload={handleDownload}
        />
        {!shelfChildIsCurrent && (
          <Typography variant="caption" color="text.secondary">
            Loading this child&apos;s list…
          </Typography>
        )}
      </Stack>
    )
  }

  // ── The child's own studio ─────────────────────────────────────────────
  return (
    <Stack spacing={2} sx={{ p: 2 }}>
      {outOfScope && (
        <Alert severity="warning">
          <AlertTitle>One more save finished</AlertTitle>
          {outOfScope}
        </Alert>
      )}
      <BuildStudioEditor
        // Keyed by the child AND the family, so the editor for one identity can
        // never be reused for another — a remount is the only way across.
        key={`${familyId}\u0000${activeChildId}`}
        familyId={familyId}
        childId={activeChildId}
        childName={activeChild?.name ?? 'Your'}
        projectId={BUILD_STUDIO_PROJECT_ID}
        // A shelf read that is about another child is reported as still
        // loading rather than shown: a previous child's versions under this
        // child's heading would be the worst kind of wrong.
        versions={
          shelfChildIsCurrent
            ? versions
            : { ...versions, status: VersionsStatus.Loading, versions: [] }
        }
        onOutOfScopeSave={noteOutOfScope}
      />
    </Stack>
  )
}
