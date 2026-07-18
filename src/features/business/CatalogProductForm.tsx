import { useState } from 'react'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Chip from '@mui/material/Chip'
import FormControlLabel from '@mui/material/FormControlLabel'
import InputAdornment from '@mui/material/InputAdornment'
import Stack from '@mui/material/Stack'
import Switch from '@mui/material/Switch'
import TextField from '@mui/material/TextField'
import Typography from '@mui/material/Typography'

import { useChildren } from '../../core/hooks/useChildren'
import {
  clampPreviewPageCount,
  PREVIEW_DEFAULT_PAGES,
  PREVIEW_MAX_PAGES,
} from './catalogPreview'
import type { BusinessItemType, CatalogProductStatus } from '../../core/types/business'
import {
  BusinessItemType as ItemType,
  BusinessItemTypeLabel,
  CatalogProductStatus as Status,
  CatalogProductStatusLabel,
} from '../../core/types/business'
import type { NewCatalogProduct } from './useCatalogProducts'
import {
  buildProductImageDownloads,
  downloadArtFiles,
  productImagesZipName,
} from './stickerArtExport'

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
  const [includePreview, setIncludePreview] = useState<boolean>(initial?.includePreview ?? false)
  const [previewPageCount, setPreviewPageCount] = useState<number>(
    clampPreviewPageCount(initial?.previewPageCount),
  )
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // A book preview only makes sense for a product promoted from a Book — a
  // manual/kit/sticker product has no pages to page through (FEAT-85, §4).
  const canPreview = initial?.sourceRef?.kind === 'book'

  const toggleMadeBy = (name: string) => {
    setMadeBy((prev) => (prev.includes(name) ? prev.filter((n) => n !== name) : [...prev, name]))
  }

  const canSave = title.trim() !== '' && !saving

  // Downloadable art on this product (FEAT-93). The catalog only ever references
  // existing images, so these are the product's own art — named from the live
  // (possibly unsaved) title so the files match what the parent sees.
  const images = initial?.images ?? []
  const hasImages = images.some((img) => img.url)
  const [downloading, setDownloading] = useState(false)

  const handleDownloadImages = async () => {
    setDownloading(true)
    try {
      await downloadArtFiles(
        buildProductImageDownloads({ images }, title),
        productImagesZipName(title),
      )
    } finally {
      setDownloading(false)
    }
  }

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
        // Only persist preview settings for book-sourced products; keep them off
        // (and out of the doc) otherwise so the flag stays additive + default-off.
        ...(canPreview
          ? { includePreview, previewPageCount: clampPreviewPageCount(previewPageCount) }
          : {}),
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

      {canPreview && (
        <Box>
          <Typography variant="body2" color="text.secondary" gutterBottom>
            Book preview
          </Typography>
          <FormControlLabel
            control={
              <Switch
                checked={includePreview}
                onChange={(e) => setIncludePreview(e.target.checked)}
              />
            }
            label="Let families peek inside"
          />
          <Typography variant="caption" color="text.secondary" display="block">
            Shows the cover + the first few pages on the public site — never the whole book.
          </Typography>
          {includePreview && (
            <TextField
              label="Preview pages"
              value={previewPageCount}
              onChange={(e) => setPreviewPageCount(clampPreviewPageCount(Number(e.target.value)))}
              type="number"
              inputMode="numeric"
              helperText={`Cover + up to ${PREVIEW_MAX_PAGES} pages (default ${PREVIEW_DEFAULT_PAGES}).`}
              slotProps={{ htmlInput: { min: 1, max: PREVIEW_MAX_PAGES, step: 1 } }}
              sx={{ mt: 1, maxWidth: 180 }}
            />
          )}
        </Box>
      )}

      {hasImages && (
        <Box>
          <Typography variant="body2" color="text.secondary" gutterBottom>
            Art
          </Typography>
          <Button variant="outlined" onClick={handleDownloadImages} disabled={downloading}>
            {downloading ? 'Downloading…' : 'Download image(s)'}
          </Button>
          <Typography variant="caption" color="text.secondary" display="block" sx={{ mt: 0.5 }}>
            Saves transparent PNGs — print on sticker paper, or upload to a sticker service.
          </Typography>
        </Box>
      )}

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
