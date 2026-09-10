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
import { droppedSaleNotice } from './businessChildSwitch'
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
  /** The operator's name, so the reset notice can say whose sale was dropped. */
  childName?: string
  onLogSale: (sale: NewBusinessSale) => Promise<void>
}

/**
 * Tap-first sale entry (FEAT-30 chunk 2). Pick a kit chip → amount prefills →
 * adjust to the real price → log. Minimal typing: Lincoln is the operator.
 */
export default function SaleEntryForm({ childId, childName, onLogSale }: SaleEntryFormProps) {
  const [presetKey, setPresetKey] = useState<string | null>(null)
  const [amount, setAmount] = useState('')
  const [date, setDate] = useState(todayKey())
  const [note, setNote] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  /**
   * UX-329 — a pending sale belongs to the operator it was entered for.
   *
   * `BusinessPage` has no `ChildSelector` of its own, so the header chip is the
   * only way the active child changes here — and this form stays mounted across
   * that change while `handleLog` passes the LIVE `childId` prop. A chip picked
   * and a price typed while looking at one operator's sales log was appended to
   * the other's `businessLog`, where it counts toward that child's goal
   * thermometer and total earnings.
   *
   * RESET, the `QuickAddHours` / `GoalBuilder` answer: a filled-in form is an
   * INTENT — no sale has been recorded for anybody, a chip and a number are two
   * taps to re-enter, and the log beside it already shows the new operator's
   * entries. Binding would post one child's sale to a log the person is no
   * longer looking at. The receipt list goes with it: "just added" is a receipt
   * for the child it was logged under, so carrying it across would attribute
   * real, saved sales to the wrong name on screen.
   *
   * Adjusting state during render is React's own answer to a changed prop; this
   * repo's lint forbids the set-state-in-effect form.
   */
  const [formChildId, setFormChildId] = useState(childId)
  const [formChildName, setFormChildName] = useState(childName)
  const [droppedFor, setDroppedFor] = useState<string | null>(null)
  if (formChildId !== childId) {
    const hadEntry = presetKey !== null || amount.trim() !== '' || note.trim() !== ''
    setFormChildId(childId)
    setFormChildName(childName)
    setDroppedFor(droppedSaleNotice(hadEntry, formChildName))
    setPresetKey(null)
    setAmount('')
    setDate(todayKey())
    setNote('')
    setError(null)
  }

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

  const selectPresetAndClearNotice = (preset: SalePreset) => {
    setDroppedFor(null)
    selectPreset(preset)
  }

  return (
    <Stack spacing={2}>
      {/* UX-329 — the switch dropped a half-entered sale; say so rather than
          blanking the form as if nothing had been typed. */}
      {droppedFor && (
        <Typography variant="body2" color="text.secondary">
          {droppedFor}
        </Typography>
      )}

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
              onClick={() => selectPresetAndClearNotice(preset)}
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
