/**
 * The parent's door: propose, confirm, enable (LOCAL-BUILD-001).
 *
 * ── Propose → confirm → write ─────────────────────────────────────────────
 *
 * `CLAUDE.md`'s rule for any user-facing write to a child's record, and it is
 * the right shape here on its own merits: enabling this opens a surface that
 * loads a third-party editor in the child's browser, so the second tap is
 * where that is said in words rather than in a tooltip. Turning it OFF is
 * confirmed too — a mis-tap that closed a child out of his own games with no
 * confirmation would be the same defect pointing the other way.
 *
 * ── Capability, never a name ───────────────────────────────────────────────
 *
 * The list is every child in the family, each row a permission of its own.
 * Nothing here reads a name, an age, a grade or a calibration to decide who
 * MAY be offered the toggle, because the whole feature's rule is that the
 * opt-in is the only thing that opens the door.
 *
 * It writes exactly one settings document per child
 * (`settings/buildStudio_{childId}`) and nothing else — not the child's own
 * record, not a snapshot, not a learner model.
 */

import { useState } from 'react'
import Alert from '@mui/material/Alert'
import Button from '@mui/material/Button'
import Stack from '@mui/material/Stack'
import Switch from '@mui/material/Switch'
import Typography from '@mui/material/Typography'

import { useFamilyId } from '../../core/auth/useAuth'
import { useChildren } from '../../core/hooks/useChildren'
import type { Child } from '../../core/types'
import { OptInStatus } from './buildStudioAccess'
import { useBuildStudioOptInControl } from './useBuildStudioOptIn'

export default function BuildStudioSettingsSection() {
  const familyId = useFamilyId()
  const { children, isLoading } = useChildren()

  if (isLoading) return null

  return (
    <Stack spacing={1.5}>
      <Typography variant="h6">Build Studio</Typography>
      <Typography variant="body2" color="text.secondary">
        A private page where one child can change a small game Dad wrote, in
        Microsoft&apos;s MakeCode Arcade editor, and keep his own saved versions
        here. Saved games are never published or shared. Off for every child until
        you turn it on.
      </Typography>
      {children.map((child) => (
        <BuildStudioChildRow key={child.id} familyId={familyId} child={child} />
      ))}
    </Stack>
  )
}

function BuildStudioChildRow({
  familyId,
  child,
}: {
  familyId: string
  child: Child
}) {
  const { read, saving, error, confirm } = useBuildStudioOptInControl(familyId, child.id)
  /** The change a parent has proposed and not yet confirmed. */
  const [proposed, setProposed] = useState<boolean | null>(null)

  const settled = read.status === OptInStatus.Ready
  const enabled = settled && read.enabled

  return (
    <Stack spacing={0.75}>
      <Stack direction="row" spacing={1.5} alignItems="center">
        <Switch
          checked={proposed ?? enabled}
          // An unsettled or FAILED read is not a state to toggle from: the
          // control would be acting on a value nobody has. The access rule
          // refuses the same way, for the same reason.
          disabled={!settled || saving}
          onChange={(_, checked) => setProposed(checked)}
          inputProps={{ 'aria-label': `Build Studio for ${child.name}` }}
        />
        <Typography variant="body2">Build Studio for {child.name}</Typography>
      </Stack>

      {read.status === OptInStatus.Failed && (
        <Alert severity="warning">
          Couldn&apos;t read this setting just now, so it can&apos;t be changed from
          here yet. Nothing has been turned on or off.
        </Alert>
      )}

      {proposed !== null && proposed !== enabled && (
        <Alert
          severity="info"
          action={
            <Stack direction="row" spacing={1}>
              <Button
                size="small"
                disabled={saving}
                onClick={() => {
                  void confirm(proposed).then(() => setProposed(null))
                }}
                sx={{ textTransform: 'none', fontWeight: 600 }}
              >
                {saving ? 'Saving…' : proposed ? 'Turn it on' : 'Turn it off'}
              </Button>
              <Button
                size="small"
                disabled={saving}
                onClick={() => setProposed(null)}
                sx={{ textTransform: 'none' }}
              >
                Cancel
              </Button>
            </Stack>
          }
        >
          {proposed
            ? `This gives ${child.name} a Build Studio page that loads Microsoft’s MakeCode Arcade editor. His saved games stay in this family’s records.`
            : `${child.name} will not be able to open the Build Studio. His saved games are kept, not deleted.`}
        </Alert>
      )}

      {error && <Alert severity="error">Could not save that: {error}</Alert>}
    </Stack>
  )
}
