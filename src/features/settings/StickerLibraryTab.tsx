import { useCallback, useEffect, useState } from 'react'
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
import Typography from '@mui/material/Typography'
import AutoAwesomeIcon from '@mui/icons-material/AutoAwesome'
import CheckCircleIcon from '@mui/icons-material/CheckCircle'
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline'
import EditIcon from '@mui/icons-material/Edit'
import PrintIcon from '@mui/icons-material/Print'
import { deleteDoc, doc, getDocs, orderBy, query, updateDoc } from 'firebase/firestore'

import { EmptyState, LoadingState } from '../../components/states'
import { stickerLibraryCollection } from '../../core/firebase/firestore'
import { useFamilyId } from '../../core/auth/useAuth'
import { useAI } from '../../core/ai/useAI'
import type { Sticker, StickerTag } from '../../core/types'
import { canPromoteSticker } from '../business/catalogOnramps'
import { StickerCatalogButton, StickerCatalogPromoteDialog } from './StickerCatalogPromote'
import { groupStickers } from '../books/stickerGrouping'
import DrawingGroupCard from '../books/DrawingGroupCard'
import { generateStickerVersion } from '../books/generateStickerVersion'
import { FANCY_STYLE_OPTIONS, DEFAULT_FANCY_STYLE_ID } from '../books/drawingStickerStyles'
import { CHECKERBOARD_BG } from '../books/DrawingChoiceDialog'
import { printStickerSheet } from '../books/printStickerSheet'
import {
  STICKER_PAGE_SIZES,
  STICKER_SIZES,
} from '../books/stickerSheetLayout'
import type { StickerPageSize, StickerSizeId } from '../books/stickerSheetLayout'

const STICKER_TAG_LABELS: Record<StickerTag, string> = {
  animal: 'Animal',
  nature: 'Nature',
  minecraft: 'Minecraft',
  fantasy: 'Fantasy',
  character: 'Character',
  object: 'Object',
  vehicle: 'Vehicle',
  food: 'Food',
  faith: 'Faith',
  other: 'Other',
}

const STICKER_TAGS_ORDERED: StickerTag[] = [
  'animal', 'minecraft', 'fantasy', 'nature', 'character', 'object', 'vehicle', 'food', 'faith', 'other',
]

function withDefaults(sticker: Sticker): Sticker {
  return {
    ...sticker,
    tags: sticker.tags ?? ['other'],
    childProfile: sticker.childProfile ?? 'both',
  }
}

interface StickerLibraryTabProps {
  /** Bump to force a reload (e.g. after a new sticker is made elsewhere on the page). */
  refreshSignal?: number
  /** Empty-state copy. Defaults to the Settings/admin wording. */
  emptyDescription?: string
  /** When set, only show stickers for this child (or marked "both"). */
  childProfileFilter?: 'lincoln' | 'london'
  /** When set, only show stickers whose tags include this tag. */
  tagFilter?: StickerTag
  /**
   * When true, stickers sharing a `sourceDrawingId` collapse into one labeled
   * "drawing" card (original + themed versions, with add-version + delete).
   * Standalone stickers still render in the grid. Off by default so the
   * Settings admin tab is unchanged. (FEAT-33 slice 3)
   */
  groupByDrawing?: boolean
  /**
   * When true, enables sticker-sheet printing (FEAT-33): a "Print this" action
   * in the big preview, plus a "Make a sheet" select-to-print mode (tap to
   * select → sticky "Print N stickers" → grid PDF). Off by default so the
   * Settings admin tab is unaffected.
   */
  enableSelectToPrint?: boolean
  /**
   * Parent gate (FEAT-82). When true, the sticker preview shows an "Add to
   * catalog" affordance that promotes the sticker into a `CatalogProduct`
   * (pricing/publishing is parent-only — catalog design §6). Off by default so
   * the Settings admin tab and any kid-facing render stay unchanged.
   */
  canEdit?: boolean
}

export default function StickerLibraryTab({
  refreshSignal,
  emptyDescription = 'Generate some in the book editor!',
  childProfileFilter,
  tagFilter,
  groupByDrawing = false,
  enableSelectToPrint = false,
  canEdit = false,
}: StickerLibraryTabProps = {}) {
  const familyId = useFamilyId()
  const { enhanceSketch } = useAI()
  // Catalog on-ramp (FEAT-82): promote a sticker into a CatalogProduct. The
  // catalog hooks (useChildren/useCatalogProducts) live in the `canEdit`-gated
  // child components below, never at this level — so the kid-facing / Settings
  // renders (canEdit=false) never take that dependency.
  const [promoteSticker, setPromoteSticker] = useState<Sticker | null>(null)
  const [stickers, setStickers] = useState<Sticker[]>([])
  const [loading, setLoading] = useState(false)
  const [editTarget, setEditTarget] = useState<Sticker | null>(null)
  const [editTags, setEditTags] = useState<StickerTag[]>([])
  const [editProfile, setEditProfile] = useState<'lincoln' | 'london' | 'both'>('both')
  // Big-preview dialog (FEAT-33): tapping a sticker opens it large with quick actions.
  const [previewTarget, setPreviewTarget] = useState<Sticker | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<Sticker | null>(null)
  // Print-to-sheet (FEAT-33, enableSelectToPrint): select mode + options dialog.
  const [selectMode, setSelectMode] = useState(false)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set())
  // Stickers queued for the print-options dialog (single from preview, or a sheet).
  const [printTargets, setPrintTargets] = useState<Sticker[] | null>(null)
  const [printPageSize, setPrintPageSize] = useState<StickerPageSize>('letter')
  const [printStickerSize, setPrintStickerSize] = useState<StickerSizeId>('medium')
  const [printing, setPrinting] = useState(false)
  const [printError, setPrintError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  // "Make more versions" flow (FEAT-33 slice 4): theme picker for the sticker
  // being edited. Adopts a standalone sticker into a drawing group on first use.
  const [makeVersionsOpen, setMakeVersionsOpen] = useState(false)
  const [makeStyleId, setMakeStyleId] = useState(DEFAULT_FANCY_STYLE_ID)
  const [makingVersion, setMakingVersion] = useState(false)
  const [makeError, setMakeError] = useState<string | null>(null)

  const load = useCallback(async () => {
    if (!familyId) return
    setLoading(true)
    const q = query(stickerLibraryCollection(familyId), orderBy('createdAt', 'desc'))
    const snap = await getDocs(q)
    setStickers(snap.docs.map((d) => withDefaults({ ...d.data(), id: d.id })))
    setLoading(false)
  }, [familyId])

  useEffect(() => { void load() }, [load, refreshSignal])

  const visibleStickers = stickers.filter((s) => {
    if (childProfileFilter) {
      const cp = s.childProfile ?? 'both'
      if (cp !== 'both' && cp !== childProfileFilter) return false
    }
    if (tagFilter) {
      const tags = s.tags ?? ['other']
      if (!tags.includes(tagFilter)) return false
    }
    return true
  })

  // When grouping is on, source-drawing versions render as labeled cards and
  // only standalone stickers fill the flat grid below them.
  const grouped = groupByDrawing
    ? groupStickers(visibleStickers)
    : { drawings: [], standalone: visibleStickers }
  const gridStickers = grouped.standalone
  // Everything that can be selected for a print sheet: grouped versions + the
  // flat-grid standalone stickers. Used to resolve the current selection.
  const selectableStickers = [
    ...grouped.drawings.flatMap((g) => g.versions),
    ...gridStickers,
  ]

  const handleOpenEdit = useCallback((sticker: Sticker) => {
    setEditTarget(sticker)
    setEditTags(sticker.tags ?? ['other'])
    setEditProfile(sticker.childProfile ?? 'both')
    setMakeVersionsOpen(false)
    setMakeStyleId(DEFAULT_FANCY_STYLE_ID)
    setMakeError(null)
  }, [])

  // Preview → Edit: hand the sticker to the existing edit dialog.
  const handlePreviewEdit = useCallback((sticker: Sticker) => {
    setPreviewTarget(null)
    handleOpenEdit(sticker)
  }, [handleOpenEdit])

  // Preview → Make more versions: open the edit dialog's theme picker directly.
  // handleOpenEdit clears makeVersionsOpen, so re-open it after (last setState wins).
  const handlePreviewMakeVersions = useCallback((sticker: Sticker) => {
    setPreviewTarget(null)
    handleOpenEdit(sticker)
    setMakeError(null)
    setMakeVersionsOpen(true)
  }, [handleOpenEdit])

  const handleSaveEdit = useCallback(async () => {
    if (!editTarget?.id) return
    setSaving(true)
    // Partial update (never a bare setDoc): editing tags/profile must not drop
    // link fields (sourceDrawingId / theme / isOriginal) or anything else.
    const patch = { tags: editTags, childProfile: editProfile }
    try {
      await updateDoc(doc(stickerLibraryCollection(familyId), editTarget.id), patch)
      setStickers((prev) => prev.map((s) => (s.id === editTarget.id ? { ...s, ...patch } : s)))
    } finally {
      setSaving(false)
      setEditTarget(null)
    }
  }, [editTarget, editTags, editProfile, familyId])

  const handleMakeVersion = useCallback(async () => {
    if (!editTarget?.id || makingVersion) return
    setMakingVersion(true)
    setMakeError(null)
    try {
      // Adopt if needed: a standalone sticker becomes a drawing group's original
      // via an additive, non-destructive write. Never a bare setDoc.
      let sourceDrawingId = editTarget.sourceDrawingId
      let source = editTarget
      if (!sourceDrawingId) {
        sourceDrawingId = crypto.randomUUID()
        const adoption = { sourceDrawingId, isOriginal: true }
        await updateDoc(doc(stickerLibraryCollection(familyId), editTarget.id), adoption)
        source = { ...editTarget, ...adoption }
      }
      const res = await generateStickerVersion({
        familyId,
        source,
        styleId: makeStyleId,
        sourceDrawingId,
        label: editTarget.label,
        enhanceSketch,
      })
      if (!res.ok) {
        setMakeError(res.error)
        return
      }
      setMakeVersionsOpen(false)
      setEditTarget(null)
      void load()
    } catch (err) {
      setMakeError(err instanceof Error ? err.message : 'Something went wrong.')
    } finally {
      setMakingVersion(false)
    }
  }, [editTarget, makingVersion, makeStyleId, familyId, enhanceSketch, load])

  const handleDelete = useCallback(async () => {
    if (!deleteTarget?.id) return
    await deleteDoc(doc(stickerLibraryCollection(familyId), deleteTarget.id))
    setStickers((prev) => prev.filter((s) => s.id !== deleteTarget.id))
    setDeleteTarget(null)
  }, [deleteTarget, familyId])

  const toggleSelectMode = useCallback(() => {
    setSelectMode((on) => {
      if (on) setSelectedIds(new Set()) // leaving select mode clears the selection
      return !on
    })
  }, [])

  const toggleSelected = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }, [])

  const handleRunPrint = useCallback(async () => {
    if (!printTargets || printTargets.length === 0 || printing) return
    setPrinting(true)
    setPrintError(null)
    try {
      await printStickerSheet(printTargets, {
        pageSize: printPageSize,
        stickerSize: printStickerSize,
        fileName: printTargets.length === 1 ? printTargets[0].label || 'sticker' : 'sticker-sheet',
      })
      setPrintTargets(null)
      // A completed sheet print ends select mode and clears the selection.
      setSelectMode(false)
      setSelectedIds(new Set())
    } catch (err) {
      setPrintError(err instanceof Error ? err.message : 'Something went wrong.')
    } finally {
      setPrinting(false)
    }
  }, [printTargets, printing, printPageSize, printStickerSize])

  if (loading) {
    return <LoadingState fullHeight />
  }

  if (visibleStickers.length === 0) {
    // When a tag filter hides everything, point the kid back at the filter
    // rather than the generic "make your first one" copy.
    if (tagFilter && stickers.length > 0) {
      return (
        <EmptyState
          title={`No ${STICKER_TAG_LABELS[tagFilter]} stickers yet`}
          description="Try another tag, or make one!"
        />
      )
    }
    return (
      <EmptyState
        title="No stickers yet"
        description={emptyDescription}
      />
    )
  }

  return (
    <>
      <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 2 }}>
        <Typography variant="body2" color="text.secondary">
          {visibleStickers.length} sticker{visibleStickers.length !== 1 ? 's' : ''} in your library
        </Typography>
        <Box sx={{ flex: 1 }} />
        {enableSelectToPrint && selectableStickers.length > 0 && (
          <Button
            size="small"
            variant={selectMode ? 'contained' : 'outlined'}
            startIcon={<PrintIcon />}
            onClick={toggleSelectMode}
            sx={{ textTransform: 'none', minHeight: 36 }}
          >
            {selectMode ? 'Done' : 'Make a sheet'}
          </Button>
        )}
      </Stack>

      {/* Source-drawing groups (FEAT-33 slice 3) — only when grouping is enabled */}
      {grouped.drawings.length > 0 && familyId && (
        <Stack spacing={2} sx={{ mb: 3 }}>
          {grouped.drawings.map((group) => (
            <DrawingGroupCard
              key={group.sourceDrawingId}
              group={group}
              familyId={familyId}
              onChanged={() => { void load() }}
              onPreview={setPreviewTarget}
              selectMode={enableSelectToPrint && selectMode}
              selectedIds={selectedIds}
              onToggleSelect={(sticker) => { if (sticker.id) toggleSelected(sticker.id) }}
            />
          ))}
        </Stack>
      )}

      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))',
          gap: 2,
        }}
      >
        {gridStickers.map((sticker) => {
          const isSelected = !!sticker.id && selectedIds.has(sticker.id)
          return (
          <Box
            key={sticker.id}
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
              src={sticker.url}
              alt={sticker.label}
              role="button"
              aria-label={
                selectMode
                  ? `${isSelected ? 'Deselect' : 'Select'} ${sticker.label}`
                  : `Preview ${sticker.label}`
              }
              aria-pressed={selectMode ? isSelected : undefined}
              onClick={() => {
                if (selectMode) {
                  if (sticker.id) toggleSelected(sticker.id)
                } else {
                  setPreviewTarget(sticker)
                }
              }}
              sx={{
                width: '100%',
                aspectRatio: '1',
                objectFit: 'cover',
                display: 'block',
                cursor: 'pointer',
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
            <Box sx={{ p: 0.75 }}>
              {/* Child profile badge */}
              {sticker.childProfile && sticker.childProfile !== 'both' && (
                <Chip
                  label={sticker.childProfile.charAt(0).toUpperCase() + sticker.childProfile.slice(1)}
                  size="small"
                  color="primary"
                  sx={{ mb: 0.5, fontSize: '0.65rem', height: 18 }}
                />
              )}
              {/* Tag chips */}
              <Box sx={{ display: 'flex', gap: 0.25, flexWrap: 'wrap' }}>
                {(sticker.tags ?? ['other']).map((tag) => (
                  <Chip
                    key={tag}
                    label={STICKER_TAG_LABELS[tag]}
                    size="small"
                    variant="outlined"
                    sx={{ fontSize: '0.6rem', height: 16 }}
                  />
                ))}
              </Box>
            </Box>
            {/* Action buttons — hidden in select mode so taps only toggle selection */}
            {!selectMode && (
              <Stack
                direction="row"
                sx={{
                  position: 'absolute',
                  top: 2,
                  right: 2,
                  bgcolor: 'rgba(255,255,255,0.85)',
                  borderRadius: 1,
                }}
              >
                <IconButton
                  size="small"
                  aria-label={`Edit ${sticker.label}`}
                  onClick={() => handleOpenEdit(sticker)}
                  sx={{ p: 0.5 }}
                >
                  <EditIcon sx={{ fontSize: 14 }} />
                </IconButton>
                <IconButton
                  size="small"
                  aria-label={`Delete ${sticker.label}`}
                  onClick={() => setDeleteTarget(sticker)}
                  sx={{ p: 0.5 }}
                >
                  <DeleteOutlineIcon sx={{ fontSize: 14 }} />
                </IconButton>
              </Stack>
            )}
          </Box>
          )
        })}
      </Box>

      {/* Sticky "Print N stickers" action (select-to-print mode) */}
      {enableSelectToPrint && selectMode && (() => {
        const selected = selectableStickers.filter((s) => s.id && selectedIds.has(s.id))
        return (
          <Box
            sx={{
              position: 'sticky',
              bottom: 0,
              mt: 2,
              py: 1.5,
              display: 'flex',
              justifyContent: 'center',
              bgcolor: 'background.paper',
              borderTop: '1px solid',
              borderColor: 'divider',
              zIndex: 1,
            }}
          >
            <Button
              variant="contained"
              startIcon={<PrintIcon />}
              disabled={selected.length === 0}
              onClick={() => { setPrintError(null); setPrintTargets(selected) }}
              sx={{ minHeight: 48, textTransform: 'none' }}
            >
              {selected.length === 0
                ? 'Tap stickers to add them'
                : `Print ${selected.length} sticker${selected.length !== 1 ? 's' : ''}`}
            </Button>
          </Box>
        )
      })()}

      {/* Print options dialog (single from preview, or a selected sheet) */}
      <Dialog
        open={!!printTargets}
        onClose={() => !printing && setPrintTargets(null)}
        maxWidth="xs"
        fullWidth
      >
        <DialogTitle>
          {printTargets && printTargets.length === 1
            ? 'Print this sticker'
            : `Print ${printTargets?.length ?? 0} stickers`}
        </DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ pt: 0.5 }}>
            <Typography variant="body2" color="text.secondary">
              We'll make a printable PDF on a white background, sized for cutting.
            </Typography>
            <Box>
              <Typography variant="caption" color="text.secondary" sx={{ mb: 0.5, display: 'block' }}>
                Page size:
              </Typography>
              <Box sx={{ display: 'flex', gap: 0.75 }}>
                {(Object.keys(STICKER_PAGE_SIZES) as StickerPageSize[]).map((id) => (
                  <Chip
                    key={id}
                    label={STICKER_PAGE_SIZES[id].label}
                    size="small"
                    variant={printPageSize === id ? 'filled' : 'outlined'}
                    color={printPageSize === id ? 'primary' : 'default'}
                    onClick={() => setPrintPageSize(id)}
                  />
                ))}
              </Box>
            </Box>
            <Box>
              <Typography variant="caption" color="text.secondary" sx={{ mb: 0.5, display: 'block' }}>
                Sticker size:
              </Typography>
              <Box sx={{ display: 'flex', gap: 0.75 }}>
                {(Object.keys(STICKER_SIZES) as StickerSizeId[]).map((id) => (
                  <Chip
                    key={id}
                    label={STICKER_SIZES[id].label}
                    size="small"
                    variant={printStickerSize === id ? 'filled' : 'outlined'}
                    color={printStickerSize === id ? 'primary' : 'default'}
                    onClick={() => setPrintStickerSize(id)}
                  />
                ))}
              </Box>
            </Box>
            {printError && (
              <Typography variant="body2" color="error">
                {printError}
              </Typography>
            )}
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setPrintTargets(null)} disabled={printing}>
            Cancel
          </Button>
          <Button
            variant="contained"
            startIcon={printing ? <CircularProgress size={16} color="inherit" /> : <PrintIcon />}
            onClick={() => { void handleRunPrint() }}
            disabled={printing}
            sx={{ minHeight: 44 }}
          >
            {printing ? 'Making PDF...' : 'Print'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Big-preview dialog (FEAT-33): tap a sticker → see it large + quick actions */}
      <Dialog
        open={!!previewTarget}
        onClose={() => setPreviewTarget(null)}
        maxWidth="sm"
        fullWidth
      >
        {previewTarget && (
          <>
            <DialogContent>
              <Stack spacing={1.5} alignItems="center">
                <Box
                  sx={{
                    width: '100%',
                    maxWidth: 360,
                    aspectRatio: '1',
                    borderRadius: 2,
                    background: CHECKERBOARD_BG,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    overflow: 'hidden',
                  }}
                >
                  <Box
                    component="img"
                    src={previewTarget.url}
                    alt={previewTarget.label}
                    sx={{
                      width: '100%',
                      height: '100%',
                      objectFit: 'contain',
                      display: 'block',
                    }}
                  />
                </Box>
                <Typography variant="h6" sx={{ textAlign: 'center' }}>
                  {previewTarget.label}
                </Typography>
                <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5, justifyContent: 'center' }}>
                  {/* Mark the group's original so it's obvious when opened (FEAT-33). */}
                  {previewTarget.isOriginal && (
                    <Chip label="Original" size="small" color="secondary" />
                  )}
                  {previewTarget.childProfile && previewTarget.childProfile !== 'both' && (
                    <Chip
                      label={
                        previewTarget.childProfile.charAt(0).toUpperCase() +
                        previewTarget.childProfile.slice(1)
                      }
                      size="small"
                      color="primary"
                    />
                  )}
                  {(previewTarget.tags ?? ['other']).map((tag) => (
                    <Chip key={tag} label={STICKER_TAG_LABELS[tag]} size="small" variant="outlined" />
                  ))}
                </Box>
              </Stack>
            </DialogContent>
            <DialogActions sx={{ flexWrap: 'wrap', justifyContent: 'center', gap: 0.5 }}>
              <Button startIcon={<EditIcon />} onClick={() => handlePreviewEdit(previewTarget)}>
                Edit
              </Button>
              <Button
                startIcon={<AutoAwesomeIcon />}
                onClick={() => handlePreviewMakeVersions(previewTarget)}
              >
                Make more versions
              </Button>
              {enableSelectToPrint && (
                <Button
                  startIcon={<PrintIcon />}
                  onClick={() => {
                    const target = previewTarget
                    setPreviewTarget(null)
                    setPrintError(null)
                    setPrintTargets([target])
                  }}
                >
                  Print this
                </Button>
              )}
              {/* Add to catalog (FEAT-82) — parent-only (§6). Read-only of the
                  sticker; opens the pre-filled catalog product form. Gated so the
                  catalog hooks never run in the kid-facing / Settings render. */}
              {canPromoteSticker(previewTarget, canEdit) && (
                <StickerCatalogButton
                  sticker={previewTarget}
                  onPromote={(s) => {
                    setPreviewTarget(null)
                    setPromoteSticker(s)
                  }}
                />
              )}
              <Button
                color="error"
                startIcon={<DeleteOutlineIcon />}
                onClick={() => {
                  const target = previewTarget
                  setPreviewTarget(null)
                  setDeleteTarget(target)
                }}
              >
                Delete
              </Button>
              <Button variant="contained" onClick={() => setPreviewTarget(null)}>
                Close
              </Button>
            </DialogActions>
          </>
        )}
      </Dialog>

      {/* Edit dialog */}
      <Dialog open={!!editTarget} onClose={() => setEditTarget(null)} maxWidth="xs" fullWidth>
        <DialogTitle>Edit Sticker</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ pt: 1 }}>
            {editTarget && (
              <Box sx={{ textAlign: 'center' }}>
                <Box
                  component="img"
                  src={editTarget.url}
                  alt={editTarget.label}
                  sx={{ width: 96, height: 96, objectFit: 'contain', borderRadius: 2 }}
                />
              </Box>
            )}

            <Box>
              <Typography variant="caption" color="text.secondary" sx={{ mb: 0.5, display: 'block' }}>
                Tags:
              </Typography>
              <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.75 }}>
                {STICKER_TAGS_ORDERED.map((tag) => (
                  <Chip
                    key={tag}
                    label={STICKER_TAG_LABELS[tag]}
                    size="small"
                    variant={editTags.includes(tag) ? 'filled' : 'outlined'}
                    onClick={() =>
                      setEditTags((prev) =>
                        prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag],
                      )
                    }
                  />
                ))}
              </Box>
            </Box>

            <Box>
              <Typography variant="caption" color="text.secondary" sx={{ mb: 0.5, display: 'block' }}>
                For:
              </Typography>
              <Box sx={{ display: 'flex', gap: 0.75 }}>
                {(['lincoln', 'london', 'both'] as const).map((p) => (
                  <Chip
                    key={p}
                    label={p === 'both' ? 'Both' : p.charAt(0).toUpperCase() + p.slice(1)}
                    size="small"
                    variant={editProfile === p ? 'filled' : 'outlined'}
                    onClick={() => setEditProfile(p)}
                  />
                ))}
              </Box>
            </Box>

            {/* Make more versions (FEAT-33 slice 4): any sticker can grow a
                themed version. Adopts standalone stickers into a drawing group. */}
            <Button
              variant="outlined"
              startIcon={<AutoAwesomeIcon />}
              onClick={() => { setMakeError(null); setMakeVersionsOpen(true) }}
              sx={{ textTransform: 'none', alignSelf: 'flex-start' }}
            >
              Make more versions
            </Button>
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setEditTarget(null)}>Cancel</Button>
          <Button
            variant="contained"
            onClick={() => { void handleSaveEdit() }}
            disabled={saving}
          >
            {saving ? 'Saving...' : 'Save'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Make-more-versions theme picker (FEAT-33 slice 4) */}
      <Dialog
        open={makeVersionsOpen}
        onClose={() => !makingVersion && setMakeVersionsOpen(false)}
        maxWidth="xs"
        fullWidth
      >
        <DialogTitle>Make another version</DialogTitle>
        <DialogContent>
          <Stack spacing={1.5} sx={{ pt: 0.5 }}>
            <Typography variant="body2" color="text.secondary">
              Pick a style — we'll imagine "{editTarget?.label}" that way and keep it with
              this drawing.
            </Typography>
            <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.75 }}>
              {FANCY_STYLE_OPTIONS.map((option) => (
                <Chip
                  key={option.id}
                  label={`${option.emoji} ${option.label}`}
                  size="small"
                  variant={makeStyleId === option.id ? 'filled' : 'outlined'}
                  color={makeStyleId === option.id ? 'primary' : 'default'}
                  onClick={() => setMakeStyleId(option.id)}
                />
              ))}
            </Box>
            {makeError && (
              <Typography variant="body2" color="error">
                {makeError}
              </Typography>
            )}
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setMakeVersionsOpen(false)} disabled={makingVersion}>
            Cancel
          </Button>
          <Button
            variant="contained"
            startIcon={makingVersion ? <CircularProgress size={16} color="inherit" /> : <AutoAwesomeIcon />}
            onClick={() => { void handleMakeVersion() }}
            disabled={makingVersion}
            sx={{ minHeight: 44 }}
          >
            {makingVersion ? 'Making...' : 'Make it'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Delete confirmation */}
      <Dialog open={!!deleteTarget} onClose={() => setDeleteTarget(null)} maxWidth="xs">
        <DialogTitle>Delete sticker?</DialogTitle>
        <DialogContent>
          <Typography variant="body2">
            This will permanently remove the sticker from your library.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteTarget(null)}>Cancel</Button>
          <Button
            variant="contained"
            color="error"
            onClick={() => { void handleDelete() }}
          >
            Delete
          </Button>
        </DialogActions>
      </Dialog>

      {/* Promote-to-catalog dialog (FEAT-82) — read-only of the sticker; writes
          only a CatalogProduct via useCatalogProducts.createProduct. Gated by
          canEdit so its catalog hooks stay out of the Settings/kid render. */}
      {canEdit && (
        <StickerCatalogPromoteDialog
          sticker={promoteSticker}
          onClose={() => setPromoteSticker(null)}
        />
      )}
    </>
  )
}
