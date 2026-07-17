import { useState } from 'react'
import AddIcon from '@mui/icons-material/Add'
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import IconButton from '@mui/material/IconButton'
import MenuItem from '@mui/material/MenuItem'
import Stack from '@mui/material/Stack'
import TextField from '@mui/material/TextField'
import Typography from '@mui/material/Typography'

import type { KitDefender, KitInvader, KitRoster } from '../../core/types/business'
import { KitRosterStatus } from '../../core/types/business'
import type { NewKitRoster } from './useKitRosters'

let idCounter = 0
function newId(prefix: string): string {
  idCounter += 1
  return `${prefix}_${Date.now().toString(36)}_${idCounter}`
}

/** Editable draft — the roster fields the form controls (no stamped metadata). */
interface RosterDraft {
  vaultName: string
  heroName: string
  heroLook: string
  heroMove: string
  defenders: KitDefender[]
  invaders: KitInvader[]
  winCondition: string
  status: KitRosterStatus
}

function draftFromRoster(roster?: KitRoster): RosterDraft {
  return {
    vaultName: roster?.vaultName ?? '',
    heroName: roster?.heroName ?? '',
    heroLook: roster?.heroLook ?? '',
    heroMove: roster?.heroMove ?? '',
    defenders: roster?.defenders ? roster.defenders.map((d) => ({ ...d })) : [],
    invaders: roster?.invaders ? roster.invaders.map((i) => ({ ...i })) : [],
    winCondition: roster?.winCondition ?? '',
    status: roster?.status ?? KitRosterStatus.InProgress,
  }
}

export interface KitBuilderFormProps {
  /** Operator the roster belongs to (used when creating a new one). */
  childId: string
  /** When present, the form edits this roster; otherwise it creates a new one. */
  roster?: KitRoster
  /** Persist the roster body. Parent stamps source/timestamps via the hook. */
  onSave: (body: NewKitRoster, id?: string) => Promise<void>
  onCancel: () => void
}

/**
 * Parent-entry form for a Kit Builder roster (FEAT-80 slice 1). A plain MUI
 * form — NOT the voice flow (that's slice 2). It proves the `KitRoster` data
 * model end-to-end and lets a parent type in the kid's existing story cast today.
 *
 * Invariants (design §2/§6):
 *   - Targets (4–6 defenders / 3–4 invaders) are a gentle hint, never a cap —
 *     the form accepts any count, including a kid's 7.
 *   - The kid's words are stored VERBATIM — no trim, no capitalization fix, no
 *     spell-correction on vault/hero/defender/invader text. Only entirely-empty
 *     repeatable rows are dropped (unused add-row artifacts), never content.
 *   - Partial saves are valid — a roster with empty lists persists and is
 *     resumable.
 */
export default function KitBuilderForm({ childId, roster, onSave, onCancel }: KitBuilderFormProps) {
  const [draft, setDraft] = useState<RosterDraft>(() => draftFromRoster(roster))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const set = <K extends keyof RosterDraft>(key: K, value: RosterDraft[K]) =>
    setDraft((prev) => ({ ...prev, [key]: value }))

  const addDefender = () =>
    setDraft((prev) => ({
      ...prev,
      defenders: [...prev.defenders, { id: newId('def'), name: '', power: '' }],
    }))
  const updateDefender = (id: string, patch: Partial<KitDefender>) =>
    setDraft((prev) => ({
      ...prev,
      defenders: prev.defenders.map((d) => (d.id === id ? { ...d, ...patch } : d)),
    }))
  const removeDefender = (id: string) =>
    setDraft((prev) => ({ ...prev, defenders: prev.defenders.filter((d) => d.id !== id) }))

  const addInvader = () =>
    setDraft((prev) => ({
      ...prev,
      invaders: [...prev.invaders, { id: newId('inv'), name: '', menace: '' }],
    }))
  const updateInvader = (id: string, patch: Partial<KitInvader>) =>
    setDraft((prev) => ({
      ...prev,
      invaders: prev.invaders.map((i) => (i.id === id ? { ...i, ...patch } : i)),
    }))
  const removeInvader = (id: string) =>
    setDraft((prev) => ({ ...prev, invaders: prev.invaders.filter((i) => i.id !== id) }))

  const handleSave = async () => {
    setError(null)
    setSaving(true)
    try {
      // Drop only ENTIRELY-empty rows (unused add-row artifacts). Never touch
      // the content of a row a kid partially filled — words are verbatim.
      const defenders = draft.defenders.filter((d) => d.name !== '' || d.power !== '')
      const invaders = draft.invaders.filter((i) => i.name !== '' || i.menace !== '')
      const body: NewKitRoster = {
        childId,
        vaultName: draft.vaultName,
        heroName: draft.heroName,
        heroLook: draft.heroLook,
        heroMove: draft.heroMove,
        defenders,
        invaders,
        winCondition: draft.winCondition,
        status: draft.status,
      }
      await onSave(body, roster?.id)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save this kit.')
      setSaving(false)
    }
  }

  const defenderCount = draft.defenders.length
  const invaderCount = draft.invaders.length

  return (
    <Stack spacing={3}>
      <Typography variant="body2" color="text.secondary">
        Type in a kit roster — the cast and rules a different family plays. Nothing is required; save a
        little now and fill the rest in later.
      </Typography>

      <TextField
        label="Vault name"
        value={draft.vaultName}
        onChange={(e) => set('vaultName', e.target.value)}
        placeholder="The safe place the seeds live"
        fullWidth
      />

      <Box>
        <Typography variant="subtitle2" gutterBottom>
          Hero
        </Typography>
        <Stack spacing={1.5}>
          <TextField
            label="Name"
            value={draft.heroName}
            onChange={(e) => set('heroName', e.target.value)}
            fullWidth
          />
          <TextField
            label="Look"
            value={draft.heroLook}
            onChange={(e) => set('heroLook', e.target.value)}
            placeholder="What does the hero look like?"
            fullWidth
          />
          <TextField
            label="Special move"
            value={draft.heroMove}
            onChange={(e) => set('heroMove', e.target.value)}
            fullWidth
          />
        </Stack>
      </Box>

      <Box>
        <Stack direction="row" alignItems="baseline" justifyContent="space-between">
          <Typography variant="subtitle2">Defenders</Typography>
          <Typography variant="caption" color="text.secondary">
            {defenderCount} · aim for 4–6
          </Typography>
        </Stack>
        {defenderCount === 0 ? (
          <Typography variant="body2" color="text.secondary" sx={{ py: 1 }}>
            No defenders yet — add a plant defender and its power.
          </Typography>
        ) : (
          <Stack spacing={1.5} sx={{ mt: 1 }}>
            {draft.defenders.map((d, i) => (
              <Box key={d.id} sx={{ border: 1, borderColor: 'divider', borderRadius: 2, p: 1.5 }}>
                <Stack direction="row" spacing={1} alignItems="flex-start">
                  <Stack spacing={1} sx={{ flexGrow: 1, minWidth: 0 }}>
                    <TextField
                      label={`Defender ${i + 1} name`}
                      value={d.name}
                      onChange={(e) => updateDefender(d.id, { name: e.target.value })}
                      size="small"
                      fullWidth
                    />
                    <TextField
                      label="Power"
                      value={d.power}
                      onChange={(e) => updateDefender(d.id, { power: e.target.value })}
                      placeholder="shoots sticky sap"
                      size="small"
                      fullWidth
                    />
                  </Stack>
                  <IconButton
                    aria-label="Remove defender"
                    size="small"
                    color="error"
                    onClick={() => removeDefender(d.id)}
                  >
                    <DeleteOutlineIcon fontSize="small" />
                  </IconButton>
                </Stack>
              </Box>
            ))}
          </Stack>
        )}
        <Button startIcon={<AddIcon />} onClick={addDefender} sx={{ mt: 1 }}>
          Add a defender
        </Button>
      </Box>

      <Box>
        <Stack direction="row" alignItems="baseline" justifyContent="space-between">
          <Typography variant="subtitle2">Invaders</Typography>
          <Typography variant="caption" color="text.secondary">
            {invaderCount} · aim for 3–4
          </Typography>
        </Stack>
        {invaderCount === 0 ? (
          <Typography variant="body2" color="text.secondary" sx={{ py: 1 }}>
            No invaders yet — add a bad guy and what makes it scary.
          </Typography>
        ) : (
          <Stack spacing={1.5} sx={{ mt: 1 }}>
            {draft.invaders.map((inv, i) => (
              <Box key={inv.id} sx={{ border: 1, borderColor: 'divider', borderRadius: 2, p: 1.5 }}>
                <Stack direction="row" spacing={1} alignItems="flex-start">
                  <Stack spacing={1} sx={{ flexGrow: 1, minWidth: 0 }}>
                    <TextField
                      label={`Invader ${i + 1} name`}
                      value={inv.name}
                      onChange={(e) => updateInvader(inv.id, { name: e.target.value })}
                      size="small"
                      fullWidth
                    />
                    <TextField
                      label="Menace"
                      value={inv.menace}
                      onChange={(e) => updateInvader(inv.id, { menace: e.target.value })}
                      placeholder="steals the seeds"
                      size="small"
                      fullWidth
                    />
                  </Stack>
                  <IconButton
                    aria-label="Remove invader"
                    size="small"
                    color="error"
                    onClick={() => removeInvader(inv.id)}
                  >
                    <DeleteOutlineIcon fontSize="small" />
                  </IconButton>
                </Stack>
              </Box>
            ))}
          </Stack>
        )}
        <Button startIcon={<AddIcon />} onClick={addInvader} sx={{ mt: 1 }}>
          Add an invader
        </Button>
      </Box>

      <TextField
        label="Win condition"
        value={draft.winCondition}
        onChange={(e) => set('winCondition', e.target.value)}
        placeholder="How does a defender beat an invader?"
        multiline
        minRows={2}
        fullWidth
      />

      <TextField
        select
        label="Status"
        value={draft.status}
        onChange={(e) => set('status', e.target.value as KitRosterStatus)}
        sx={{ maxWidth: 220 }}
      >
        <MenuItem value={KitRosterStatus.InProgress}>In progress</MenuItem>
        <MenuItem value={KitRosterStatus.Complete}>Ready</MenuItem>
      </TextField>

      {error && (
        <Typography variant="body2" color="error">
          {error}
        </Typography>
      )}

      <Stack direction="row" spacing={1}>
        <Button variant="contained" size="large" onClick={handleSave} disabled={saving}>
          {saving ? 'Saving…' : 'Save kit'}
        </Button>
        <Button onClick={onCancel} disabled={saving}>
          Cancel
        </Button>
      </Stack>
    </Stack>
  )
}
