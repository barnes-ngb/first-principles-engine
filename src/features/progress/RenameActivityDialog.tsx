import { useMemo, useState } from 'react'
import Alert from '@mui/material/Alert'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Chip from '@mui/material/Chip'
import Dialog from '@mui/material/Dialog'
import DialogActions from '@mui/material/DialogActions'
import DialogContent from '@mui/material/DialogContent'
import DialogTitle from '@mui/material/DialogTitle'
import Stack from '@mui/material/Stack'
import TextField from '@mui/material/TextField'
import Typography from '@mui/material/Typography'

import type { ChatActivityConfig } from '../shelly-chat/useShellyChatActions'
import type { ActivityConfig } from '../../core/types/planning'
import { MAX_ACTIVITY_ALIASES, normalizeAliases } from '../../core/utils/activityNames'
import {
  ALIAS_FIELD_HELP,
  ALIAS_SECTION_LABEL,
  aliasCapNotice,
  renameFailureNotice,
} from './renameActivity'
import { planRename } from './renameActivity'

interface RenameActivityDialogProps {
  /** The row being renamed; `null` closes the dialog. */
  config: ActivityConfig | null
  /** The rows it sits beside, for the duplicate notice. */
  siblings: readonly ChatActivityConfig[]
  /** Resolves when the write has landed; REJECTS when it has not. */
  onSave: (configId: string, name: string, aliases: string[]) => Promise<void>
  onClose: () => void
}

/**
 * Rename a curriculum row (UX-279).
 *
 * Writes `name` — and the alternates, when the old name is carried into them —
 * and nothing else. The two sentences under the field are the whole point of
 * the feature: what the name is FOR (the plan and the row) and what still finds
 * it afterwards (a photo of the cover). A parent renaming a workbook to
 * something shorter than what is printed on it needs to know the scan will
 * still land, or she will not do it.
 */
export default function RenameActivityDialog({
  config,
  siblings,
  onSave,
  onClose,
}: RenameActivityDialogProps) {
  if (!config) return null
  // Keyed on the row, so opening a different one mounts a fresh field seeded
  // with that row's own name — rather than an effect resetting state after the
  // first render has already drawn the previous row's name.
  return (
    <RenameActivityDialogBody
      key={config.id}
      config={config}
      siblings={siblings}
      onSave={onSave}
      onClose={onClose}
    />
  )
}

function RenameActivityDialogBody({
  config,
  siblings,
  onSave,
  onClose,
}: RenameActivityDialogProps & { config: ActivityConfig }) {
  const [name, setName] = useState(config.name)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState('')
  /** The alternates as edited here — the carried old name is added at save. */
  const [aliases, setAliases] = useState<string[]>(() => config.aliases ?? [])
  const [draftAlias, setDraftAlias] = useState('')

  const plan = useMemo(
    () => planRename(config, name, aliases, siblings),
    [config, aliases, name, siblings],
  )

  const canSave = plan.name != null && plan.refusal === ''
  /** What the alternates will be after this save — what the list must show. */
  const resolvedAliases = plan.aliases ?? normalizeAliases(aliases, name)
  const atCap = resolvedAliases.length >= MAX_ACTIVITY_ALIASES

  const addAlias = () => {
    const next = normalizeAliases([...aliases, draftAlias], name)
    setAliases(next)
    setDraftAlias('')
  }

  return (
    // Codex round 2, P2: `saving` disabled the buttons but not MUI's own close
    // routes. A backdrop click or Escape unmounted the dialog with the write
    // still in flight, so a rejection landed on nothing — the failure notice
    // and her retained typing were never seen. Every close path waits now, not
    // only the Save button's.
    <Dialog open onClose={saving ? undefined : onClose} maxWidth="xs" fullWidth>
      {/* The menu item says "Rename" because that is the primary action and a
          phone menu has no room for the rest — but adding an alternate without
          renaming is first-class, so the title covers both once it is open. */}
      <DialogTitle>Names for this activity</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ mt: 1 }}>
          <TextField
            label="Name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            fullWidth
            autoFocus
            error={Boolean(plan.refusal)}
            helperText={plan.refusal || 'What you call it — on the row, and in the week you plan.'}
          />

          {plan.duplicateNotice ? (
            <Alert severity="info">{plan.duplicateNotice}</Alert>
          ) : null}

          {saveError ? <Alert severity="error">{saveError}</Alert> : null}

          {plan.carriesOldName ? (
            <Alert severity="success">
              We&rsquo;ll remember that this used to be called &ldquo;{config.name}&rdquo;, so a
              photo of the cover still finds it.
            </Alert>
          ) : null}

          {/* UX-280: "tags of alternate names beneath the curriculum" — the
              owner's own words. These are what a scan is matched against, so
              the cover's full title can live here while the row reads "Math K". */}
          <Box>
            <Typography variant="subtitle2" gutterBottom>
              {ALIAS_SECTION_LABEL}
            </Typography>
            {resolvedAliases.length > 0 ? (
              <Stack direction="row" spacing={0.5} useFlexGap flexWrap="wrap" sx={{ mb: 1 }}>
                {resolvedAliases.map((alias) => (
                  <Chip
                    key={alias}
                    label={alias}
                    size="small"
                    onDelete={() => setAliases(aliases.filter((a) => a !== alias))}
                  />
                ))}
              </Stack>
            ) : null}
            <Stack direction="row" spacing={1} alignItems="flex-start">
              <TextField
                label="Add another name"
                size="small"
                fullWidth
                value={draftAlias}
                disabled={atCap}
                onChange={(e) => setDraftAlias(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key !== 'Enter') return
                  e.preventDefault()
                  addAlias()
                }}
                helperText={atCap ? aliasCapNotice() : ALIAS_FIELD_HELP}
              />
              <Button
                onClick={addAlias}
                disabled={atCap || draftAlias.trim() === ''}
                sx={{ mt: 0.5 }}
              >
                Add
              </Button>
            </Stack>
          </Box>

          <Typography variant="caption" color="text.secondary">
            Renaming changes what this is called from now on. Days you have already logged keep the
            words they were logged with.
          </Typography>
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={saving}>
          Cancel
        </Button>
        {/* The dialog closes only once the write has LANDED (Codex round 1,
            P2). Closing on the tap and voiding the promise meant a rejected or
            timed-out write left the parent with no error, no retry and her
            edits discarded — she would read the unchanged row as her rename
            having been ignored. */}
        <Button
          variant="contained"
          disabled={!canSave || saving}
          onClick={() => {
            if (plan.name == null) return
            setSaving(true)
            setSaveError('')
            onSave(config.id, plan.name, plan.aliases ?? [])
              .then(onClose)
              .catch(() => setSaveError(renameFailureNotice(config.name)))
              .finally(() => setSaving(false))
          }}
        >
          {saving ? 'Saving…' : 'Save'}
        </Button>
      </DialogActions>
    </Dialog>
  )
}
