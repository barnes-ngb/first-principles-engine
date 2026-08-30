import { useCallback, useState } from 'react'
import { deleteDoc, doc, writeBatch } from 'firebase/firestore'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Chip from '@mui/material/Chip'
import CircularProgress from '@mui/material/CircularProgress'
import Dialog from '@mui/material/Dialog'
import DialogActions from '@mui/material/DialogActions'
import DialogContent from '@mui/material/DialogContent'
import DialogTitle from '@mui/material/DialogTitle'
import IconButton from '@mui/material/IconButton'
import Stack from '@mui/material/Stack'
import TextField from '@mui/material/TextField'
import Typography from '@mui/material/Typography'
import AddIcon from '@mui/icons-material/Add'
import AutoAwesomeIcon from '@mui/icons-material/AutoAwesome'
import CheckCircleIcon from '@mui/icons-material/CheckCircle'
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline'
import EditIcon from '@mui/icons-material/Edit'

import { db, stickerLibraryCollection } from '../../core/firebase/firestore'
import { useAI } from '../../core/ai/useAI'
import type { Sticker } from '../../core/types'
import { ART_QUOTA_MESSAGE } from '../business/useArtQuota'
import { recordStickerArtGeneration } from './useStickerArtQuota'
import {
  FANCY_STYLE_OPTIONS,
  DEFAULT_FANCY_STYLE_ID,
  fancyStyleLabel,
} from './drawingStickerStyles'
import { generateStickerVersion } from './generateStickerVersion'
import { planDrawingRename } from './stickerLabelEdit'
import { CHECKERBOARD_BG } from './DrawingChoiceDialog'
import type { DrawingGroup } from './stickerGrouping'

interface DrawingGroupCardProps {
  group: DrawingGroup
  familyId: string
  /** Reload the library after a version is added or deleted. */
  onChanged: () => void
  /**
   * Open the big preview for a tapped version (FEAT-33 fix). When omitted,
   * version tiles are not preview-tappable (e.g. Settings admin tab).
   */
  onPreview?: (sticker: Sticker) => void
  /** Select-to-print mode is active — tiles toggle selection instead of preview. */
  selectMode?: boolean
  /** Ids of currently-selected stickers (for the check overlay). */
  selectedIds?: Set<string>
  /** Toggle a version's selection in select mode. */
  onToggleSelect?: (sticker: Sticker) => void
  /**
   * Every version of this drawing, including any the caller's active filters
   * hide from `group.versions` (Codex P1, PR #1708). Tags and "For" are
   * **per-version**, so a tag or child filter can split a group — and a rename
   * that promised one name for every version would then write only the visible
   * subset, leaving the stored drawing permanently split. Defaults to
   * `group.versions` for callers that render the library unfiltered.
   */
  allVersions?: Sticker[]
  /**
   * The actor has spent today's art budget (FEAT-165). "Add version" is this
   * card's whole invitation and each tap is a paid `enhanceSketch` call, so a
   * kid gets the Kit Builder's light daily cap here: the theme picker swaps
   * "Make it" for a warm nudge. Defaults to uncapped so the parent-only
   * Settings render is unchanged.
   */
  capReached?: boolean
  /** Count one paid generation against the day's counter (FEAT-165). */
  recordGeneration?: () => Promise<void>
}

/** Friendly label for a version chip — "Original", or the theme's emoji + name. */
function versionLabel(sticker: Sticker): string {
  if (sticker.isOriginal || !sticker.theme) return 'Original'
  return fancyStyleLabel(sticker.theme)
}

/**
 * One labeled "drawing" card (FEAT-33 slice 3): the cleaned original plus every
 * AI-imagined themed version of a single source drawing, with controls to add
 * another version (theme picker → transform on the saved original) and to delete
 * a single version or the whole drawing. All generations are kept unless a kid
 * explicitly deletes them.
 */
export default function DrawingGroupCard({
  group,
  familyId,
  onChanged,
  onPreview,
  selectMode = false,
  selectedIds,
  onToggleSelect,
  allVersions,
  capReached = false,
  recordGeneration,
}: DrawingGroupCardProps) {
  const { enhanceSketch } = useAI()
  const [picking, setPicking] = useState(false)
  const [styleId, setStyleId] = useState(DEFAULT_FANCY_STYLE_ID)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // null = no pending delete; a sticker = delete that version; 'group' = delete all.
  const [deleteTarget, setDeleteTarget] = useState<Sticker | 'group' | null>(null)
  const [deleting, setDeleting] = useState(false)
  // Rename (FEAT-160): one name per drawing — every version is renamed together.
  const [renaming, setRenaming] = useState(false)
  const [renameText, setRenameText] = useState('')
  const [renameBusy, setRenameBusy] = useState(false)
  const [renameError, setRenameError] = useState<string | null>(null)

  // New versions transform the saved original image (its stored cutout), so a
  // drawing can grow new themed versions any time — not just in the capture
  // session. If the original was deleted, fall back to the card representative.
  const source = group.versions.find((v) => v.isOriginal) ?? group.representative
  const label = group.representative.label
  // The rename is a group operation, so it must see the whole group — not the
  // slice a tag/child filter left visible. Deleting deliberately still acts on
  // the visible versions only; that the group *delete* and the version count
  // also read a filtered group is a pre-existing gap, filed as UX-99 in
  // `docs/review/UX_AUDIT_2026-08.md` §12 rather than widened into this change.
  const renameTargets = allVersions ?? group.versions

  const handleAddVersion = useCallback(async () => {
    // At the cap the paid call never goes out (FEAT-165) — the picker shows the
    // nudge instead of "Make it", and this guard holds the rule for real.
    if (busy || capReached) return
    setBusy(true)
    setError(null)
    try {
      // Always adds a new version; repeating a theme keeps both.
      const res = await generateStickerVersion({
        familyId,
        source,
        styleId,
        sourceDrawingId: group.sourceDrawingId,
        label,
        enhanceSketch,
      })
      if (!res.ok) {
        // The model produced nothing usable — no image, so no charge to the
        // kid's daily budget.
        setError(res.error)
        return
      }
      // A real version came back: count the paid call (FEAT-165). Repeating a
      // theme counts again — each is another real call.
      await recordStickerArtGeneration(recordGeneration)
      setPicking(false)
      onChanged()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.')
    } finally {
      setBusy(false)
    }
  }, [
    busy,
    capReached,
    enhanceSketch,
    familyId,
    source,
    styleId,
    label,
    group.sourceDrawingId,
    onChanged,
    recordGeneration,
  ])

  const handleOpenRename = useCallback(() => {
    setRenameText(label)
    setRenameError(null)
    setRenaming(true)
  }, [label])

  const handleConfirmRename = useCallback(async () => {
    if (renameBusy) return
    // A no-op is not a write: renaming to the name already showing plans no
    // updateDoc at all, so the card never claims a change it did not make.
    const plan = planDrawingRename(renameText, renameTargets)
    if (plan.kind === 'invalid') {
      setRenameError('Give the drawing a name.')
      return
    }
    if (plan.kind === 'noop') {
      setRenaming(false)
      return
    }
    setRenameBusy(true)
    setRenameError(null)
    try {
      // One batch, not N independent updates (Codex P2, PR #1708): a partial
      // fan-out would leave the group with mixed names — exactly the invariant
      // this dialog promises. Batched updates are all-or-nothing, and a member
      // deleted from under us fails the whole commit rather than half of it.
      // Still partial patches (never a bare setDoc) — a rename must not drop
      // sourceDrawingId / theme / isOriginal.
      const batch = writeBatch(db)
      for (const w of plan.writes) {
        batch.update(doc(stickerLibraryCollection(familyId), w.id), w.patch)
      }
      await batch.commit()
      setRenaming(false)
      onChanged()
    } catch (err) {
      // Failure says so and keeps the dialog open with the typed name intact.
      setRenameError(err instanceof Error ? err.message : 'Could not rename. Try again.')
    } finally {
      setRenameBusy(false)
    }
  }, [renameBusy, renameText, renameTargets, familyId, onChanged])

  const handleConfirmDelete = useCallback(async () => {
    if (!deleteTarget) return
    setDeleting(true)
    try {
      const targets =
        deleteTarget === 'group' ? group.versions : [deleteTarget]
      await Promise.all(
        targets
          .filter((s) => s.id)
          .map((s) => deleteDoc(doc(stickerLibraryCollection(familyId), s.id!))),
      )
      setDeleteTarget(null)
      onChanged()
    } finally {
      setDeleting(false)
    }
  }, [deleteTarget, group.versions, familyId, onChanged])

  return (
    <Box
      sx={{
        borderRadius: 2,
        border: '1px solid',
        borderColor: 'divider',
        p: 1.5,
        bgcolor: 'background.paper',
      }}
    >
      {/* Header: drawing label + rename + delete-whole-drawing */}
      <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 1 }}>
        <Typography variant="subtitle2" sx={{ fontWeight: 700, flex: 1 }} noWrap>
          {label}
        </Typography>
        <Chip
          label={`${group.versions.length} version${group.versions.length !== 1 ? 's' : ''}`}
          size="small"
          variant="outlined"
          sx={{ fontSize: '0.65rem', height: 18 }}
        />
        {!selectMode && (
          <IconButton size="small" aria-label="Rename drawing" onClick={handleOpenRename}>
            <EditIcon sx={{ fontSize: 18 }} />
          </IconButton>
        )}
        {!selectMode && (
          <IconButton size="small" aria-label="Delete drawing" onClick={() => setDeleteTarget('group')}>
            <DeleteOutlineIcon sx={{ fontSize: 18 }} />
          </IconButton>
        )}
      </Stack>

      {/* Version strip */}
      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(96px, 1fr))',
          gap: 1,
        }}
      >
        {group.versions.map((version) => {
          const isSelected = !!version.id && !!selectedIds?.has(version.id)
          const tappable = selectMode || !!onPreview
          return (
          <Box
            key={version.id}
            sx={{
              borderRadius: 2,
              border: '2px solid',
              borderColor: isSelected ? 'primary.main' : 'divider',
              overflow: 'hidden',
              position: 'relative',
            }}
          >
            <Box
              component="img"
              src={version.url}
              alt={versionLabel(version)}
              role={tappable ? 'button' : undefined}
              aria-label={
                selectMode
                  ? `${isSelected ? 'Deselect' : 'Select'} ${label} ${versionLabel(version)}`
                  : onPreview
                    ? `Preview ${label} ${versionLabel(version)}`
                    : undefined
              }
              aria-pressed={selectMode ? isSelected : undefined}
              onClick={
                selectMode
                  ? () => onToggleSelect?.(version)
                  : onPreview
                    ? () => onPreview(version)
                    : undefined
              }
              sx={{
                width: '100%',
                aspectRatio: '1',
                objectFit: 'contain',
                display: 'block',
                background: CHECKERBOARD_BG,
                cursor: tappable ? 'pointer' : 'default',
              }}
            />
            {/* Selection check overlay (select-to-print mode) */}
            {selectMode && isSelected && (
              <CheckCircleIcon
                color="primary"
                sx={{
                  position: 'absolute',
                  top: 4,
                  left: 4,
                  bgcolor: 'background.paper',
                  borderRadius: '50%',
                }}
              />
            )}
            <Typography
              variant="caption"
              sx={{ display: 'block', textAlign: 'center', px: 0.5, py: 0.25, fontSize: '0.6rem' }}
              noWrap
            >
              {versionLabel(version)}
            </Typography>
            {/* Delete hidden in select mode so taps only toggle selection. */}
            {!selectMode && (
              <IconButton
                size="small"
                aria-label={`Delete ${versionLabel(version)}`}
                onClick={() => setDeleteTarget(version)}
                sx={{
                  position: 'absolute',
                  top: 2,
                  right: 2,
                  p: 0.25,
                  bgcolor: 'rgba(255,255,255,0.85)',
                }}
              >
                <DeleteOutlineIcon sx={{ fontSize: 14 }} />
              </IconButton>
            )}
          </Box>
          )
        })}

        {/* Add-version tile — hidden in select mode so taps only toggle selection. */}
        {!selectMode && (
          <Button
            variant="outlined"
            onClick={() => { setError(null); setPicking(true) }}
            sx={{
              aspectRatio: '1',
              minWidth: 0,
              flexDirection: 'column',
              textTransform: 'none',
              borderStyle: 'dashed',
            }}
          >
            <AddIcon />
            <Typography variant="caption" sx={{ fontSize: '0.6rem' }}>
              Add version
            </Typography>
          </Button>
        )}
      </Box>

      {/* Rename dialog (FEAT-160) — one name for every version of the drawing. */}
      <Dialog
        open={renaming}
        onClose={() => !renameBusy && setRenaming(false)}
        maxWidth="xs"
        fullWidth
      >
        <DialogTitle>Name this drawing</DialogTitle>
        <DialogContent>
          <Stack spacing={1.5} sx={{ pt: 0.5 }}>
            <TextField
              label="Drawing name"
              value={renameText}
              onChange={(e) => setRenameText(e.target.value)}
              fullWidth
              size="small"
              autoFocus
            />
            <Typography variant="body2" color="text.secondary">
              Every version of this drawing gets the new name.
            </Typography>
            {renameError && (
              <Typography variant="body2" color="error">
                {renameError}
              </Typography>
            )}
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setRenaming(false)} disabled={renameBusy}>
            Cancel
          </Button>
          <Button
            variant="contained"
            onClick={() => void handleConfirmRename()}
            disabled={renameBusy || !renameText.trim()}
            sx={{ minHeight: 44 }}
          >
            {renameBusy ? 'Saving...' : 'Save name'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Theme picker dialog */}
      <Dialog open={picking} onClose={() => !busy && setPicking(false)} maxWidth="xs" fullWidth>
        <DialogTitle>Make another version</DialogTitle>
        <DialogContent>
          <Stack spacing={1.5} sx={{ pt: 0.5 }}>
            {capReached ? (
              /* Daily cap reached (FEAT-165): the same warm nudge the Kit
                 Builder shows — no style picker, no error styling, no lock. */
              <Typography variant="body2" color="text.secondary">
                {ART_QUOTA_MESSAGE}
              </Typography>
            ) : (
              <>
                <Typography variant="body2" color="text.secondary">
                  Pick a style — we'll imagine "{label}" that way and keep it with the others.
                </Typography>
                <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.75 }}>
                  {FANCY_STYLE_OPTIONS.map((option) => (
                    <Chip
                      key={option.id}
                      label={`${option.emoji} ${option.label}`}
                      size="small"
                      variant={styleId === option.id ? 'filled' : 'outlined'}
                      color={styleId === option.id ? 'primary' : 'default'}
                      onClick={() => setStyleId(option.id)}
                    />
                  ))}
                </Box>
              </>
            )}
            {error && (
              <Typography variant="body2" color="error">
                {error}
              </Typography>
            )}
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setPicking(false)} disabled={busy}>
            {capReached ? 'Close' : 'Cancel'}
          </Button>
          {/* No "Make it" at the cap — refuse before the spend (FEAT-165). */}
          {!capReached && (
            <Button
              variant="contained"
              startIcon={busy ? <CircularProgress size={16} color="inherit" /> : <AutoAwesomeIcon />}
              onClick={() => void handleAddVersion()}
              disabled={busy}
              sx={{ minHeight: 44 }}
            >
              {busy ? 'Making...' : 'Make it'}
            </Button>
          )}
        </DialogActions>
      </Dialog>

      {/* Delete confirmation (single version or whole drawing) */}
      <Dialog open={!!deleteTarget} onClose={() => !deleting && setDeleteTarget(null)} maxWidth="xs">
        <DialogTitle>
          {deleteTarget === 'group' ? 'Delete this drawing?' : 'Delete this version?'}
        </DialogTitle>
        <DialogContent>
          <Typography variant="body2">
            {deleteTarget === 'group'
              ? `This removes "${label}" and all ${group.versions.length} of its versions.`
              : 'This removes just this version. The others stay.'}
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteTarget(null)} disabled={deleting}>
            Cancel
          </Button>
          <Button
            variant="contained"
            color="error"
            onClick={() => void handleConfirmDelete()}
            disabled={deleting}
          >
            {deleting ? 'Deleting...' : 'Delete'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  )
}
