/**
 * `/build-studio` — the one page (LOCAL-BUILD-001).
 *
 * It decides WHICH of the two surfaces to draw and nothing else: the child's
 * studio, or the parent's read-only view of the selected child's versions.
 * Both read the same shelf component and the same access rule, so neither can
 * show the other's controls by accident.
 *
 * ── The parent's door is open before enrolment, deliberately ─────────────
 *
 * Gating her view on `enabled` made Build Studio vanish from her nav and
 * redirect her route on first use — so the only way to turn it on was a
 * Settings section she had no reason to open — and it hid versions a child had
 * already saved the moment she turned it off. Her view now opens on a resolved
 * family and child, SHOWS the enrolment state, and hosts the same
 * propose→confirm control the Settings section uses. The child's editor still
 * needs the affirmative opt-in, which is the capability.
 *
 * ── Identity is affirmative ──────────────────────────────────────────────
 *
 * `profileChildResolved` is passed through from `useActiveChild`, because
 * `activeChild.id === activeChildId` can be true about a SIBLING: the hook
 * falls back to the selected id when a child profile matches no document.
 *
 * ── The child-switch answer ──────────────────────────────────────────────
 *
 * Because the editor is handed its child rather than reading the shell, every
 * per-child SETTING it needs has to come the same way — including the voice
 * engine his record configures (`childVoiceInputEnhanced`), which is resolved
 * here for that exact child and passed down, as `TodayPage` and the books chats
 * do. `VoiceInput` selects the existing Whisper recording only on an explicit
 * `true`, so a mic handed nothing but an id silently gave a configured child
 * the browser's own engine instead.
 *
 * `BuildStudioEditor` is mounted with the resolved child as a PROP and keyed by
 * it, so a change of child or profile unmounts that editor and mounts a new one
 * for whoever the shell now resolves. Two things make that honest rather than
 * lossy: an accepted write already in flight is **BIND**ed to its own scope and
 * reports through `onOutOfScopeSave`; and an unfinished Save is held for its own
 * owner in `buildStudioPendingStore`, so the exact retry is offered back when
 * that child's editor mounts again rather than being lost with the component.
 */

import { useCallback, useState } from 'react'
import Alert from '@mui/material/Alert'
import AlertTitle from '@mui/material/AlertTitle'
import Box from '@mui/material/Box'
import CircularProgress from '@mui/material/CircularProgress'
import Divider from '@mui/material/Divider'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'

import { useAuth } from '../../core/auth/useAuth'
import { useActiveChild } from '../../core/hooks/useActiveChild'
import { useProfile } from '../../core/profile/useProfile'
import type { BuildStudioVersion } from '../../core/types/buildStudio'
import { parseBuildStudioSource } from '../../core/types/buildStudio'
import {
  BuildStudioAccess,
  buildStudioChildEnrolled,
  resolveBuildStudioAccess,
} from './buildStudioAccess'
import { buildStudioDownloads, downloadTextFile } from './buildStudioExport'
import BuildStudioEditor from './BuildStudioEditor'
import BuildStudioSettingsSection from './BuildStudioSettingsSection'
import { BUILD_STUDIO_PROJECT_ID } from './buildStudioStarter'
import BuildStudioVersionShelf from './BuildStudioVersionShelf'
import { useBuildStudioOptIn } from './useBuildStudioOptIn'
import { useBuildStudioVersions, VersionsStatus } from './useBuildStudioVersions'

/**
 * What a parent is told about where this runs.
 *
 * Two claims, both true and neither larger than it should be: saved versions
 * are **not published** from here, and the editor is Microsoft's, which
 * **receives the game's files**. It deliberately does not promise that nothing
 * is ever shared — MakeCode is a third-party service with its own telemetry,
 * and a child who later uses its own share button is outside this app.
 */
export const BUILD_STUDIO_PRIVACY_LINE =
  'Saved versions are kept in this family’s own records and are not published from here. The editor is Microsoft’s MakeCode Arcade, loaded in a frame, and it receives the game’s own files — nothing else is sent to it: no name, no note and no recording. MakeCode is a third-party service with its own terms and telemetry.'

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
    profileChildResolved,
  } = useActiveChild()

  const optIn = useBuildStudioOptIn(familyId, activeChildId || null)
  const versions = useBuildStudioVersions(
    familyId,
    activeChildId || null,
    BUILD_STUDIO_PROJECT_ID,
  )

  const access = resolveBuildStudioAccess({
    familyId,
    profile,
    isChildProfile,
    childId: activeChildId,
    resolvedChild: activeChild ?? null,
    childrenLoading: isLoading,
    childrenLoadFailed: loadFailed,
    childrenFamilyId,
    profileChildResolved,
    optIn,
  })

  /** A write that landed, or failed, for a scope no longer on screen. */
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
    // its own account, because a surface that trusts its guard has one check
    // instead of two.
    return (
      <Box sx={{ p: 2 }}>
        <Alert severity="info">
          The Build Studio is not open for this profile.
        </Alert>
      </Box>
    )
  }

  // Unreachable: `resolveBuildStudioAccess` has already refused both of these.
  // Kept so the narrowing below is the compiler's rather than a cast.
  if (!familyId || !activeChildId) return null

  const shelfIsCurrent =
    versions.childId === activeChildId && versions.projectId === BUILD_STUDIO_PROJECT_ID
  const enrolled = buildStudioChildEnrolled(optIn, activeChildId)

  if (access === BuildStudioAccess.ParentView) {
    return (
      <Stack spacing={2} sx={{ p: 2 }}>
        <Stack spacing={0.5}>
          <Typography variant="h5" sx={{ fontWeight: 800 }}>
            Build Studio — {activeChild?.name ?? 'this child'}
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Read-only. You can see and download what has been saved; the editing
            is his.
          </Typography>
        </Stack>

        {/* The enrolment state, said plainly, with the control beside it. */}
        <Alert severity={enrolled ? 'success' : 'info'}>
          <AlertTitle>
            {enrolled
              ? `The Build Studio is on for ${activeChild?.name ?? 'this child'}`
              : `The Build Studio is off for ${activeChild?.name ?? 'this child'}`}
          </AlertTitle>
          {enrolled
            ? 'He can open it and save his own versions. You can turn it off below; saved versions are kept either way.'
            : 'He cannot open it yet. Turning it on below is what gives him the editor — anything already saved stays on the shelf regardless.'}
        </Alert>

        {outOfScope && <Alert severity="warning">{outOfScope}</Alert>}

        {/* The SAME propose→confirm control as the Settings section, reused
            rather than reimplemented, so the two cannot drift. */}
        <BuildStudioSettingsSection onlyChildId={activeChildId} hideHeading />

        <Divider />

        <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
          Saved versions
        </Typography>
        <BuildStudioVersionShelf
          read={
            shelfIsCurrent
              ? versions
              : { ...versions, status: VersionsStatus.Loading, versions: [] }
          }
          // The parent view's whole contract, in one prop. There is no `onOpen`
          // to pass, so there is no control to hide.
          canOpen={false}
          onDownload={handleDownload}
          onRetryRead={versions.retry}
          // Her question is "is this the source I think it is", so she keeps the
          // digest, the byte size and the file count. The kid page does not.
          showTechnicalDetail
        />

        <Alert severity="info">{BUILD_STUDIO_PRIVACY_LINE}</Alert>
      </Stack>
    )
  }

  // ── The child's own studio ─────────────────────────────────────────────
  return (
    <Stack spacing={2} sx={{ p: 2 }}>
      {outOfScope && (
        <Alert severity="warning">
          <AlertTitle>About an earlier save</AlertTitle>
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
        // The resolved child's own voice setting, as Today and the books
        // chats pass it. The id is re-checked rather than assumed: this must
        // be the configured value of the child the editor is FOR, and a read
        // that has not settled is `false` — the same thing an unset flag has
        // always meant — never another child's answer.
        childVoiceInputEnhanced={
          activeChild !== undefined &&
          activeChild.id === activeChildId &&
          activeChild.voiceInputEnhanced === true
        }
        // A shelf read that is about another child or another project is
        // reported as still loading rather than shown.
        versions={
          shelfIsCurrent
            ? versions
            : { ...versions, status: VersionsStatus.Loading, versions: [] }
        }
        onOutOfScopeSave={noteOutOfScope}
      />
    </Stack>
  )
}
