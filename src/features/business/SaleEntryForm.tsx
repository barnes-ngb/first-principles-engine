import { useState } from 'react'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Chip from '@mui/material/Chip'
import InputAdornment from '@mui/material/InputAdornment'
import Stack from '@mui/material/Stack'
import TextField from '@mui/material/TextField'
import Typography from '@mui/material/Typography'

import { BusinessItemType } from '../../core/types/business'
import { todayKey } from '../../core/utils/dateKey'
import type { NewBusinessSale } from './useBusinessLog'

/**
 * A tap-friendly sale preset. Each chip sets the stored `itemType` and prefills
 * a suggested amount (override-able). Prices track the GDQ tier table in
 * docs/GARDEN_DEFENSE_QUEST_PLAN.md — they are starting points, not locked.
 */
interface SalePreset {
  /** Stable key for selection state. */
  key: string
  label: string
  itemType: BusinessItemType
  /** Suggested prefill in dollars; undefined = no prefill (kid types it). */
  suggestedAmount?: number
}

const SALE_PRESETS: SalePreset[] = [
  { key: 'starter-pdf', label: 'Starter (PDF)', itemType: BusinessItemType.StarterKit, suggestedAmount: 8 },
  { key: 'starter-print', label: 'Starter (Printed)', itemType: BusinessItemType.StarterKit, suggestedAmount: 15 },
  { key: 'party', label: 'Party Kit', itemType: BusinessItemType.PartyKit, suggestedAmount: 40 },
  { key: 'custom', label: 'Custom Kit', itemType: BusinessItemType.CustomKit, suggestedAmount: 30 },
  { key: 'addon', label: 'Add-on', itemType: BusinessItemType.StickerSheet, suggestedAmount: 5 },
  { key: 'other', label: 'Other', itemType: BusinessItemType.Other },
]

interface SaleEntryFormProps {
  /** Operator logging the sale (Lincoln for now). */
  childId: string
  onLogSale: (sale: NewBusinessSale) => Promise<void>
}

/**
 * Tap-first sale entry (FEAT-30 chunk 2). Pick a kit chip → amount prefills →
 * adjust to the real price → log. Minimal typing: Lincoln is the operator.
 */
export default function SaleEntryForm({ childId, onLogSale }: SaleEntryFormProps) {
  const [presetKey, setPresetKey] = useState<string | null>(null)
  const [amount, setAmount] = useState('')
  const [date, setDate] = useState(todayKey())
  const [note, setNote] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const selectPreset = (preset: SalePreset) => {
    setPresetKey(preset.key)
    if (preset.suggestedAmount != null) {
      setAmount(String(preset.suggestedAmount))
    }
  }

  const selected = SALE_PRESETS.find((p) => p.key === presetKey)
  const amountNum = Number(amount)
  const canLog =
    !!selected && Number.isFinite(amountNum) && amountNum >= 0 && amount.trim() !== '' && !saving

  const reset = () => {
    setPresetKey(null)
    setAmount('')
    setDate(todayKey())
    setNote('')
  }

  const handleLog = async () => {
    if (!selected || !canLog) return
    setSaving(true)
    setError(null)
    try {
      await onLogSale({
        childId,
        amount: amountNum,
        itemType: selected.itemType,
        date,
        note: note.trim() || undefined,
      })
      reset()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not log sale.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Stack spacing={2}>
      <Box>
        <Typography variant="body2" color="text.secondary" gutterBottom>
          What did you sell?
        </Typography>
        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
          {SALE_PRESETS.map((preset) => (
            <Chip
              key={preset.key}
              label={preset.label}
              color={preset.key === presetKey ? 'primary' : 'default'}
              variant={preset.key === presetKey ? 'filled' : 'outlined'}
              onClick={() => selectPreset(preset)}
            />
          ))}
        </Box>
      </Box>

      <TextField
        label="Amount"
        value={amount}
        onChange={(e) => setAmount(e.target.value)}
        type="number"
        inputMode="decimal"
        slotProps={{
          input: {
            startAdornment: <InputAdornment position="start">$</InputAdornment>,
          },
          htmlInput: { min: 0, step: '0.01' },
        }}
        fullWidth
      />

      <TextField
        label="Date"
        value={date}
        onChange={(e) => setDate(e.target.value)}
        type="date"
        slotProps={{ inputLabel: { shrink: true } }}
        fullWidth
      />

      <TextField
        label="Note (optional)"
        value={note}
        onChange={(e) => setNote(e.target.value)}
        placeholder="e.g. sold to the neighbors"
        fullWidth
      />

      {error && (
        <Typography variant="body2" color="error">
          {error}
        </Typography>
      )}

      <Button variant="contained" size="large" disabled={!canLog} onClick={handleLog}>
        {saving ? 'Logging…' : 'Log sale'}
      </Button>
    </Stack>
  )
}
