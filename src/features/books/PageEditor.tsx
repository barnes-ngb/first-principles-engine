import { Fragment, useCallback, useEffect, useRef, useState } from 'react'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Stack from '@mui/material/Stack'
import TextField from '@mui/material/TextField'
import ToggleButton from '@mui/material/ToggleButton'
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup'
import Typography from '@mui/material/Typography'
import IconButton from '@mui/material/IconButton'
import Menu from '@mui/material/Menu'
import MenuItem from '@mui/material/MenuItem'
import ListItemIcon from '@mui/material/ListItemIcon'
import ListItemText from '@mui/material/ListItemText'
import Tooltip from '@mui/material/Tooltip'
import AddPhotoAlternateIcon from '@mui/icons-material/AddPhotoAlternate'
import AutoFixHighIcon from '@mui/icons-material/AutoFixHigh'
import CropFreeIcon from '@mui/icons-material/CropFree'
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline'
import FitScreenIcon from '@mui/icons-material/FitScreen'
import HistoryIcon from '@mui/icons-material/History'
import VolumeUpIcon from '@mui/icons-material/VolumeUp'
import WallpaperIcon from '@mui/icons-material/Wallpaper'
import Dialog from '@mui/material/Dialog'
import DialogActions from '@mui/material/DialogActions'
import DialogContent from '@mui/material/DialogContent'
import DialogTitle from '@mui/material/DialogTitle'
import ImageList from '@mui/material/ImageList'
import ImageListItem from '@mui/material/ImageListItem'

import type { BookPage } from '../../core/types'
import { PAGE_LAYOUTS, TEXT_SIZES, TEXT_FONTS, TEXT_SIZE_STYLES, TEXT_FONT_FAMILIES } from './bookTypes'
import DraggableImage from './DraggableImage'
import type { ImagePosition } from './DraggableImage'
import LayersPanel from './LayersPanel'
import { stackOrder } from './draggableImageUtils'
import {
  applyBackgroundFit,
  backgroundFitOf,
  hasFitBackdrop,
  hasFittableBackground,
  resolveImageFit,
} from './imageFit'
import ImageFitBackdrop from './ImageFitBackdrop'

/**
 * Human wording for `ImageVersion.replacedBy` (UX-132c). The stored value is a
 * raw enum — `reimagine` / `upload` / `gallery` / `generate` — and it was
 * printed verbatim as the caption under each earlier picture. These say what
 * actually happened, in the same words the doors that did it now use.
 */
const REPLACED_BY_LABEL: Record<string, string> = {
  reimagine: 'Replaced by a reimagined drawing',
  upload: 'Replaced by a photo you added',
  gallery: 'Replaced from the gallery',
  generate: 'Replaced by a made picture',
}

interface PageEditorProps {
  page: BookPage
  onUpdate: (changes: Partial<BookPage>) => void
  onAddImage: (file: File) => void
  onRemoveImage?: (imageId: string) => void
  onChangeBackground?: () => void
  onReRecord?: () => void
  onImagePositionChange?: (imageId: string, position: ImagePosition) => void
  /** Move an image one step in the layer stack ('up' = toward the top). */
  onReorderImage?: (imageId: string, direction: 'up' | 'down') => void
  childName: string
  /** Increment to deselect all images from parent (e.g. when action buttons are clicked) */
  deselectSignal?: number
  /** Notifies parent when the selected image changes (for contextual action bar). */
  onSelectedImageChange?: (imageId: string | null, imageType: 'sticker' | 'background' | null) => void
  /** Called when user restores a previous version of an image. */
  onRestoreVersion?: (imageId: string, versionIndex: number) => void
}

export default function PageEditor({
  page,
  onUpdate,
  onAddImage,
  onRemoveImage,
  onChangeBackground,
  onReRecord,
  onImagePositionChange,
  onReorderImage,
  childName,
  deselectSignal,
  onSelectedImageChange,
  onRestoreVersion,
}: PageEditorProps) {
  const isLincoln = childName.toLowerCase() === 'lincoln'
  const [selectedImageId, setSelectedImageId] = useState<string | null>(null)
  const [layersOpen, setLayersOpen] = useState(false)
  const [bgMenuAnchor, setBgMenuAnchor] = useState<HTMLElement | null>(null)
  const [versionHistoryImageId, setVersionHistoryImageId] = useState<string | null>(null)
  const imageContainerRef = useRef<HTMLDivElement>(null)

  // Deselect when parent signals (action buttons, dialogs, etc.)
  // eslint-disable-next-line react-hooks/set-state-in-effect -- signal-driven deselect from parent
  useEffect(() => { setSelectedImageId(null) }, [deselectSignal])

  // Notify parent of selection changes for contextual action bar
  useEffect(() => {
    if (!onSelectedImageChange) return
    if (!selectedImageId) {
      onSelectedImageChange(null, null)
      return
    }
    const img = page.images.find((i) => i.id === selectedImageId)
    if (!img) {
      onSelectedImageChange(null, null)
      return
    }
    onSelectedImageChange(selectedImageId, img.type === 'sticker' ? 'sticker' : 'background')
  }, [selectedImageId, page.images, onSelectedImageChange])

  const handleTextChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      onUpdate({ text: e.target.value })
    },
    [onUpdate],
  )

  const handleLayoutChange = useCallback(
    (_: React.MouseEvent<HTMLElement>, value: BookPage['layout'] | null) => {
      if (value) onUpdate({ layout: value })
    },
    [onUpdate],
  )

  const handleFileSelect = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0]
      if (file) onAddImage(file)
      e.target.value = ''
    },
    [onAddImage],
  )

  const handleTextSizeChange = useCallback(
    (_: React.MouseEvent<HTMLElement>, value: BookPage['textSize'] | null) => {
      if (value) onUpdate({ textSize: value })
    },
    [onUpdate],
  )

  const handleTextFontChange = useCallback(
    (_: React.MouseEvent<HTMLElement>, value: BookPage['textFont'] | null) => {
      if (value) onUpdate({ textFont: value })
    },
    [onUpdate],
  )

  const textSizeKey = page.textSize ?? 'medium'
  const textFontKey = page.textFont ?? 'print'

  const isFullImage = page.layout === 'full-image'
  const isTextOnly = page.layout === 'text-only'
  const isImageLeft = page.layout === 'image-left'

  // Background images (scenes, photos, sketches, AI-generated) drive the
  // "Change background" menu. Stacking/render order over *all* images comes
  // from stackOrder — no fixed background-vs-sticker container split.
  const backgroundImages = page.images.filter((img) => img.type !== 'sticker')
  const orderedImages = stackOrder(page.images)

  // FEAT-177 — "show the whole picture" vs "fill the page", per background,
  // through the page's existing update path (no second write lane). Only the
  // background PLANE is offered or stamped: stickers and FEAT-116 placed
  // elements are composed overlays and stay exactly as they are.
  const canToggleFit = hasFittableBackground(page.images)
  const currentBgFit = backgroundFitOf(page.images)

  /**
   * One "Remove picture" behaviour on this screen (UX-129).
   *
   * This menu item used to confirm and then remove EVERY background on the
   * page, while the action-bar chip with the same words removed the selected
   * one without asking. Two behaviours behind one label, and the confirmed
   * plural was the surprising one. Both are undoable — `onRemoveImage` is the
   * editor's tracked remover — and the house rule is: undoable → don't ask.
   * So this now does what the chip does: remove one, the selected background
   * when there is one, otherwise the page's only/top background.
   */
  const removeOneBackground = () => {
    if (!onRemoveImage) return
    const target =
      backgroundImages.find((img) => img.id === selectedImageId) ??
      backgroundImages[backgroundImages.length - 1]
    if (!target) return
    onRemoveImage(target.id)
    setSelectedImageId(null)
  }
  const toggleBackgroundFit = () => {
    const next = currentBgFit === 'fit' ? 'fill' : 'fit'
    onUpdate({ images: applyBackgroundFit(page.images, next) })
  }

  const imageSection = !isTextOnly && (
    <Box sx={{ width: isImageLeft ? '50%' : '100%' }}>
      {/* Background edit icon — sits above the image container */}
      {backgroundImages.length > 0 && (onChangeBackground || onRemoveImage) && (
        <Box sx={{ display: 'flex', justifyContent: 'flex-end', mb: 0.5, px: 1 }}>
          <Tooltip title="Change picture">
            <IconButton
              size="small"
              onClick={(e) => setBgMenuAnchor(e.currentTarget)}
              sx={{ opacity: 0.6, '&:hover': { opacity: 1 } }}
            >
              <WallpaperIcon fontSize="small" />
            </IconButton>
          </Tooltip>
          <Menu
            anchorEl={bgMenuAnchor}
            open={Boolean(bgMenuAnchor)}
            onClose={() => setBgMenuAnchor(null)}
          >
            {onChangeBackground && (
              <MenuItem onClick={() => { setBgMenuAnchor(null); onChangeBackground() }}>
                <ListItemIcon><AutoFixHighIcon fontSize="small" /></ListItemIcon>
                <ListItemText>Change picture</ListItemText>
              </MenuItem>
            )}
            {/* FEAT-177 — the whole picture, or the page filled. */}
            {canToggleFit && (
            <MenuItem onClick={() => { setBgMenuAnchor(null); toggleBackgroundFit() }}>
              <ListItemIcon>
                {currentBgFit === 'fit'
                  ? <CropFreeIcon fontSize="small" />
                  : <FitScreenIcon fontSize="small" />}
              </ListItemIcon>
              <ListItemText>
                {currentBgFit === 'fit' ? 'Fill the page' : 'Show the whole picture'}
              </ListItemText>
            </MenuItem>
            )}
            {onRemoveImage && (
              <MenuItem onClick={() => { setBgMenuAnchor(null); removeOneBackground() }}>
                <ListItemIcon><DeleteOutlineIcon fontSize="small" color="error" /></ListItemIcon>
                <ListItemText>Remove picture</ListItemText>
              </MenuItem>
            )}
            {onRestoreVersion && backgroundImages.some((img) => (img.previousVersions?.length ?? 0) > 0) && (
              <MenuItem onClick={() => {
                setBgMenuAnchor(null)
                const imgWithVersions = backgroundImages.find((img) => (img.previousVersions?.length ?? 0) > 0)
                if (imgWithVersions) setVersionHistoryImageId(imgWithVersions.id)
              }}>
                <ListItemIcon><HistoryIcon fontSize="small" /></ListItemIcon>
                <ListItemText>Earlier pictures</ListItemText>
              </MenuItem>
            )}
          </Menu>
        </Box>
      )}

      {/* Image container — clean, no overlays */}
      <Box
        ref={imageContainerRef}
        sx={{
          aspectRatio: '3 / 2',
          bgcolor: 'grey.100',
          borderRadius: 2,
          position: 'relative',
          overflow: 'hidden',
          touchAction: 'none',
        }}
        onClick={() => setSelectedImageId(null)}
      >
        {page.images.length > 0 ? (
          // Single stacking container — every element ordered by stackOrder
          // (bottom → top). Stickers stay interactive; backgrounds are
          // selectable + orderable but not dragged. Explicit per-element
          // zIndex = stack position keeps stacking tie-free.
          <Box sx={{ position: 'absolute', inset: 0 }}>
            {orderedImages.map((img, stackIdx) => {
              // Two z slots per element: the element itself and, one below it,
              // the FEAT-177 blurred backdrop copy. Doubling keeps every
              // element strictly ordered (no ties) while giving a fitted
              // background somewhere to put its backdrop.
              const renderZ = (stackIdx + 1) * 2
              if (img.type === 'sticker') {
                return (
                  <DraggableImage
                    key={img.id}
                    image={img}
                    selected={selectedImageId === img.id}
                    onSelect={() => setSelectedImageId(img.id)}
                    onPositionChange={(pos) => onImagePositionChange?.(img.id, pos)}
                    onRemove={onRemoveImage ? () => onRemoveImage(img.id) : undefined}
                    onReorder={onReorderImage ? (dir) => onReorderImage(img.id, dir) : undefined}
                    style={{ zIndex: renderZ, pointerEvents: 'auto' }}
                  />
                )
              }
              const pos = img.position ?? { x: 0, y: 0, width: 100, height: 100 }
              const transforms: string[] = []
              if (pos.rotation) transforms.push(`rotate(${pos.rotation}deg)`)
              if (pos.flipH) transforms.push('scaleX(-1)')
              if (pos.flipV) transforms.push('scaleY(-1)')
              const geometry = {
                position: 'absolute' as const,
                left: `${pos.x}%`,
                top: `${pos.y}%`,
                width: `${pos.width}%`,
                height: `${pos.height}%`,
                transformOrigin: 'center center',
              }
              return (
                <Fragment key={img.id}>
                  {/* FEAT-177 — a fitted background leaves space; fill it with a
                      blurred, slightly enlarged copy of the same picture rather
                      than a flat grey bar. Same transforms as the sharp copy so
                      the two can never disagree. */}
                  {hasFitBackdrop(img) && (
                    <ImageFitBackdrop
                      url={img.url}
                      sx={{
                        ...geometry,
                        transform: transforms.length > 0 ? transforms.join(' ') : undefined,
                        zIndex: renderZ - 1,
                      }}
                    />
                  )}
                  <Box
                    component="img"
                    src={img.url}
                    onClick={(e: React.MouseEvent) => {
                      e.stopPropagation()
                      setSelectedImageId(img.id)
                    }}
                    sx={{
                      ...geometry,
                      objectFit: resolveImageFit(img),
                      zIndex: renderZ,
                      pointerEvents: 'auto',
                      transform: transforms.length > 0 ? transforms.join(' ') : undefined,
                      border: selectedImageId === img.id ? '2px dashed' : 'none',
                      borderColor: 'warning.main',
                      cursor: 'pointer',
                    }}
                  />
                </Fragment>
              )
            })}
          </Box>
      ) : (
        <label style={{ cursor: 'pointer', textAlign: 'center', width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <input
            type="file"
            accept="image/*"
            onChange={handleFileSelect}
            style={{ display: 'none' }}
          />
          <Stack alignItems="center" spacing={1}>
            <AddPhotoAlternateIcon sx={{ fontSize: 48, color: 'text.disabled' }} />
            <Typography variant="body2" color="text.secondary">
              Add a picture
            </Typography>
          </Stack>
        </label>
      )}
      </Box>

      {/* Layers panel — reorder every placed element (collapsible, phone-first) */}
      {page.images.length > 1 && onReorderImage && (
        <Box sx={{ mt: 1 }}>
          <LayersPanel
            images={page.images}
            selectedImageId={selectedImageId}
            onSelect={(id) => setSelectedImageId(id)}
            onReorder={onReorderImage}
            open={layersOpen}
            onToggle={() => setLayersOpen((v) => !v)}
          />
        </Box>
      )}
    </Box>
  )

  const textSection = !isFullImage && (
    <TextField
      multiline
      minRows={4}
      maxRows={10}
      fullWidth
      value={page.text ?? ''}
      onChange={handleTextChange}
      onFocus={() => setSelectedImageId(null)}
      placeholder={
        isLincoln
          ? 'Write your story...'
          : 'What happens next in your story?'
      }
      sx={{
        width: isImageLeft ? '50%' : '100%',
        '& .MuiInputBase-root': {
          fontSize: TEXT_SIZE_STYLES[textSizeKey].fontSize,
          lineHeight: TEXT_SIZE_STYLES[textSizeKey].lineHeight,
          fontFamily: TEXT_FONT_FAMILIES[textFontKey],
        },
      }}
    />
  )

  return (
    <Stack spacing={2}>
      {/* Page content area */}
      {isImageLeft ? (
        <Stack direction="row" spacing={2} sx={{ alignItems: 'flex-start' }}>
          {imageSection}
          {textSection}
        </Stack>
      ) : (
        <>
          {imageSection}
          {textSection}
        </>
      )}

      {/* Audio playback */}
      {page.audioUrl && (
        <Box
          sx={{
            p: 1.5,
            borderRadius: 2,
            bgcolor: 'grey.50',
            border: '1px solid',
            borderColor: 'divider',
          }}
        >
          <Stack direction="row" alignItems="center" spacing={1}>
            <VolumeUpIcon color="primary" fontSize="small" />
            <Typography variant="body2" color="text.secondary" sx={{ flex: 'none' }}>
              Listen to this page
            </Typography>
            <Box
              component="audio"
              controls
              src={page.audioUrl}
              sx={{ flex: 1, height: 36 }}
            />
          </Stack>
          {onReRecord && (
            <Button size="small" onClick={onReRecord} sx={{ mt: 0.5 }}>
              Re-record
            </Button>
          )}
        </Box>
      )}

      {/* Layout switcher */}
      <Box>
        <Typography variant="caption" color="text.secondary" sx={{ mb: 0.5, display: 'block' }}>
          Page layout
        </Typography>
        <ToggleButtonGroup
          value={page.layout}
          exclusive
          onChange={handleLayoutChange}
          size="small"
        >
          {PAGE_LAYOUTS.map((layout) => (
            <ToggleButton key={layout.value} value={layout.value} sx={{ textTransform: 'none', px: 1.5 }}>
              {layout.label}
            </ToggleButton>
          ))}
        </ToggleButtonGroup>
      </Box>

      {/* Text size toggle */}
      <Box>
        <Typography variant="caption" color="text.secondary" sx={{ mb: 0.5, display: 'block' }}>
          Text size
        </Typography>
        <ToggleButtonGroup
          value={textSizeKey}
          exclusive
          onChange={handleTextSizeChange}
          size="small"
        >
          {TEXT_SIZES.map((s) => (
            <ToggleButton key={s.value} value={s.value} sx={{ textTransform: 'none', px: 1.5 }}>
              {s.label}
            </ToggleButton>
          ))}
        </ToggleButtonGroup>
      </Box>

      {/* Text font toggle */}
      <Box>
        <Typography variant="caption" color="text.secondary" sx={{ mb: 0.5, display: 'block' }}>
          Font
        </Typography>
        <ToggleButtonGroup
          value={textFontKey}
          exclusive
          onChange={handleTextFontChange}
          size="small"
        >
          {TEXT_FONTS.map((f) => (
            <ToggleButton
              key={f.value}
              value={f.value}
              sx={{
                textTransform: 'none',
                px: 1.5,
                fontFamily: TEXT_FONT_FAMILIES[f.value],
                fontSize: f.value === 'pixel' ? '0.6rem' : undefined,
              }}
            >
              {f.label}
            </ToggleButton>
          ))}
        </ToggleButtonGroup>
      </Box>

      {/* Previous versions dialog */}
      <Dialog
        open={!!versionHistoryImageId}
        onClose={() => setVersionHistoryImageId(null)}
        maxWidth="xs"
        fullWidth
      >
        <DialogTitle>Earlier pictures</DialogTitle>
        <DialogContent>
          {(() => {
            const img = page.images.find((i) => i.id === versionHistoryImageId)
            if (!img?.previousVersions?.length) {
              return (
                <Typography variant="body2" color="text.secondary">
                  No earlier pictures yet.
                </Typography>
              )
            }
            return (
              <Stack spacing={1}>
                <Box sx={{ textAlign: 'center' }}>
                  <Typography variant="caption" color="text.secondary" sx={{ mb: 0.5, display: 'block' }}>
                    Current
                  </Typography>
                  <Box
                    component="img"
                    src={img.url}
                    sx={{ width: '100%', maxHeight: 120, objectFit: 'contain', borderRadius: 1, border: '2px solid', borderColor: 'primary.main' }}
                  />
                </Box>
                <ImageList cols={3} gap={8}>
                  {img.previousVersions.map((v, idx) => (
                    <ImageListItem
                      key={idx}
                      onClick={() => {
                        onRestoreVersion?.(img.id, idx)
                        setVersionHistoryImageId(null)
                      }}
                      sx={{ cursor: 'pointer', borderRadius: 1, overflow: 'hidden' }}
                    >
                      <img
                        src={v.url}
                        alt={`Earlier picture from ${new Date(v.replacedAt).toLocaleDateString()}`}
                        loading="lazy"
                        style={{ borderRadius: 8, objectFit: 'cover', height: 80, width: '100%' }}
                      />
                      <Typography variant="caption" color="text.secondary" sx={{ textAlign: 'center', display: 'block' }}>
                        {REPLACED_BY_LABEL[v.replacedBy] ?? v.replacedBy}
                      </Typography>
                    </ImageListItem>
                  ))}
                </ImageList>
                <Typography variant="caption" color="text.secondary" sx={{ textAlign: 'center' }}>
                  Tap an earlier picture to bring it back
                </Typography>
              </Stack>
            )
          })()}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setVersionHistoryImageId(null)}>Close</Button>
        </DialogActions>
      </Dialog>
    </Stack>
  )
}
