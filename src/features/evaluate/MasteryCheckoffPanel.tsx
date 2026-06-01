import { useMemo, useState } from 'react'
import CheckCircleIcon from '@mui/icons-material/CheckCircle'
import Alert from '@mui/material/Alert'
import Button from '@mui/material/Button'
import Chip from '@mui/material/Chip'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'

import SectionCard from '../../components/SectionCard'
import type { SkillSnapshot } from '../../core/types/evaluation'
import { commitMasteryRollup } from './commitMasteryRollup'
import { pendingCheckoffs } from './masteryRollup'
import { MASTERY_WINDOW_DAYS, useMasteryCheckoffs } from './useMasteryCheckoffs'

/**
 * FEAT-09 surface — "Checked off — looks mastered".
 *
 * Keeps the foundation map *transparent*: it shows exactly which skills already
 * on the map now look mastered from repeated got-it chips and quest performance
 * (over the last {@link MASTERY_WINDOW_DAYS} days), with the evidence. Nothing
 * is written silently — Shelly confirms ("Check off"), and the write goes
 * through the central additive writer (never downgrades). Below-threshold and
 * still-struggling skills never appear here.
 */
export default function MasteryCheckoffPanel({
  familyId,
  childId,
  snapshot,
}: {
  familyId: string
  childId: string | undefined
  snapshot: SkillSnapshot | null
}) {
  const { rollups, loading, reload } = useMasteryCheckoffs(familyId, childId)
  const [saving, setSaving] = useState(false)
  const [note, setNote] = useState<string | null>(null)

  const pending = useMemo(() => pendingCheckoffs(rollups, snapshot), [rollups, snapshot])

  if (loading || !childId) return null
  if (pending.length === 0) return null

  const handleCheckOff = async () => {
    if (!childId || saving) return
    setSaving(true)
    setNote(null)
    try {
      const { checkedOff } = await commitMasteryRollup(familyId, childId, pending)
      setNote(
        checkedOff.length > 0
          ? `Checked off ${checkedOff.length} skill${checkedOff.length === 1 ? '' : 's'}.`
          : 'Nothing to update.',
      )
      reload()
    } catch (err) {
      console.error('Failed to check off mastered skills', err)
      setNote('Could not update the snapshot.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <SectionCard title="Checked off — looks mastered">
      <Stack spacing={1.5}>
        <Typography variant="body2" color="text.secondary">
          Repeated got-it and quest evidence over the last {MASTERY_WINDOW_DAYS} days suggests
          these are mastered. Check them off to advance the snapshot and drop them from rotation.
        </Typography>
        {pending.map((r) => (
          <Stack
            key={r.skillKey}
            spacing={0.5}
            sx={{ p: 1.5, border: '1px solid', borderColor: 'divider', borderRadius: 1 }}
          >
            <Stack direction="row" spacing={1} alignItems="center">
              <CheckCircleIcon color="success" fontSize="small" />
              <Typography sx={{ fontWeight: 600 }}>{r.label}</Typography>
              {r.sources.map((s) => (
                <Chip key={s} label={s} size="small" variant="outlined" />
              ))}
            </Stack>
            <Typography variant="caption" color="text.secondary">
              {r.evidence}
            </Typography>
          </Stack>
        ))}
        <Stack direction="row" spacing={1} alignItems="center">
          <Button
            variant="contained"
            color="success"
            startIcon={<CheckCircleIcon />}
            disabled={saving}
            onClick={() => void handleCheckOff()}
          >
            {saving ? 'Checking off…' : `Check off ${pending.length}`}
          </Button>
          {note && (
            <Alert severity="info" sx={{ py: 0 }}>
              {note}
            </Alert>
          )}
        </Stack>
      </Stack>
    </SectionCard>
  )
}
