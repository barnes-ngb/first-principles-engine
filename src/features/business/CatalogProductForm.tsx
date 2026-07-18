import { useState } from 'react'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Chip from '@mui/material/Chip'
import InputAdornment from '@mui/material/InputAdornment'
import Stack from '@mui/material/Stack'
import TextField from '@mui/material/TextField'
import Typography from '@mui/material/Typography'

import { useChildren } from '../../core/hooks/useChildren'
import type { BusinessItemType, CatalogProductStatus } from '../../core/types/business'
import {
  BusinessItemType as ItemType,
  BusinessItemTypeLabel,
  CatalogProductStatus as Status,
  CatalogProductStatusLabel,
} from '../../core/types/business'
import type { NewCatalogProduct } from './useCatalogProducts'

const TYPE_ORDER: BusinessItemType[] = [
  ItemType.StarterKit,
  ItemType.PartyKit,
  ItemType.CustomKit,
  ItemType.StickerSheet,
  ItemType.Book,
  ItemType.Other,
]

const STATUS_ORDER: CatalogProductStatus[] = [Status.Draft, Status.Listed, Status.Retired]

interface CatalogProductFormProps {
  /**
   * Pre-fill values. Manual "add" passes nothing; promote-from-artifact passes
   * `title` / `type` / `madeBy` / `images` / `sourceRef`. `images` + `sourceRef`
   * are carried through verbatim — this slice does not edit them in the form.
   */
  initial?: Partial<NewCatalogProduct>
  onSave: (body: NewCatalogProduct) => Promise<void>
  onCancel: () => void
}

/**
 * Parent catalog-entry form (FEAT-81). Authors a `CatalogProduct` from scratch
 * (manual) or from a pre-filled source (promote). Pricing + status are
 * parent-set here (§6). `images` + `sourceRef` pass through untouched — the
 * catalog references existing art, it never picks/regenerates it in this slice.
 */
export default function CatalogProductForm({ initial, onSave, onCancel }: CatalogProductFormProps) {
  const { children } = useChildren()
  const [title, setTitle] = useState(initial?.title ?? '')
  const [type, setType] = useState<BusinessItemType>(initial?.type ?? ItemType.StarterKit)
  const [description, setDescription] = useState(initial?.description ?? '')
  const [price, setPrice] = useState(
    initial?.priceCents != null && initial.priceCents > 0 ? String(initial.priceCents / 100) : '',
  )
  const [madeBy, setMadeBy] = useState<string[]>(initial?.madeBy ?? [])
  const [status, setStatus] = useState<CatalogProductStatus>(initial?.status ?? Status.Draft)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const toggleMadeBy = (name: string) => {
    setMadeBy((prev) => (prev.includes(name) ? prev.filter((n) => n !== name) : [...prev, name]))
  }

  const canSave = title.trim() !== '' && !saving

  const handleSave = async () => {
    if (!canSave) return
    const priceNum = Number(price)
    const priceCents =
      price.trim() !== '' && Number.isFinite(priceNum) && priceNum >= 0
        ? Math.round(priceNum * 100)
        : 0
    setSaving(true)
    setError(null)
    try {
      await onSave({
        title: title.trim(),
        type,
        description: description.trim(),
        priceCents,
        images: initial?.images ?? [],
        ...(initial?.sourceRef ? { sourceRef: initial.sourceRef } : {}),
        madeBy,
        status,
      })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save product.')
      setSaving(false)
    }
  }

  return (
    <Stack spacing={2}>
      <TextField
        label="Title"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="e.g. Seed Vault Kit"
        fullWidth
        required
      />

      <Box>
        <Typography variant="body2" color="text.secondary" gutterBottom>
          Type
        </Typography>
        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
          {TYPE_ORDER.map((t) => (
            <Chip
              key={t}
              label={BusinessItemTypeLabel[t]}
              color={t === type ? 'primary' : 'default'}
              variant={t === type ? 'filled' : 'outlined'}
              onClick={() => setType(t)}
            />
          ))}
        </Box>
      </Box>

      <TextField
        label="Description"
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        placeholder="What is it? What makes it fun?"
        multiline
        minRows={2}
        fullWidth
      />

      <TextField
        label="Price"
        value={price}
        onChange={(e) => setPrice(e.target.value)}
        type="number"
        inputMode="decimal"
        placeholder="Leave blank for no price yet"
        slotProps={{
          input: { startAdornment: <InputAdornment position="start">$</InputAdornment> },
          htmlInput: { min: 0, step: '0.01' },
        }}
        fullWidth
      />

      {children.length > 0 && (
        <Box>
          <Typography variant="body2" color="text.secondary" gutterBottom>
            Made by
          </Typography>
          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
            {children.map((c) => (
              <Chip
                key={c.id}
                label={c.name}
                color={madeBy.includes(c.name) ? 'primary' : 'default'}
                variant={madeBy.includes(c.name) ? 'filled' : 'outlined'}
                onClick={() => toggleMadeBy(c.name)}
              />
            ))}
          </Box>
        </Box>
      )}

      <Box>
        <Typography variant="body2" color="text.secondary" gutterBottom>
          Status
        </Typography>
        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
          {STATUS_ORDER.map((s) => (
            <Chip
              key={s}
              label={CatalogProductStatusLabel[s]}
              color={s === status ? 'primary' : 'default'}
              variant={s === status ? 'filled' : 'outlined'}
              onClick={() => setStatus(s)}
            />
          ))}
        </Box>
      </Box>

      {error && (
        <Typography variant="body2" color="error">
          {error}
        </Typography>
      )}

      <Stack direction="row" spacing={1}>
        <Button variant="contained" disabled={!canSave} onClick={handleSave}>
          {saving ? 'Saving…' : 'Save product'}
        </Button>
        <Button variant="text" onClick={onCancel} disabled={saving}>
          Cancel
        </Button>
      </Stack>
    </Stack>
  )
}
