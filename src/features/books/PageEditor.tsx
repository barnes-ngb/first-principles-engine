import { useCallback, useRef, useState } from 'react'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Stack from '@mui/material/Stack'
import TextField from '@mui/material/TextField'
import ToggleButton from '@mui/material/ToggleButton'
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup'
import Typography from '@mui/material/Typography'
import AddPhotoAlternateIcon from '@mui/icons-material/AddPhotoAlternate'
import VolumeUpIcon from '@mui/icons-material/VolumeUp'

import type { BookPage } from '../../core/types'
import { PAGE_LAYOUTS, TEXT_SIZES, TEXT_FONTS, TEXT_SIZE_STYLES, TEXT_FONT_FAMILIES } from './bookTypes'
import DraggableImage from './DraggableImage'
import type { ImagePosition } from './DraggableImage'

interface PageEditorProps {
  page: BookPage
  onUpdate: (changes: Partial<BookPage>) => void
  onAddImage: (file: File) => void
  onRemoveImage?: (imageId: string) => void
  onReRecord?: () => void
  onImagePositionChange?: (imageId: string, position: ImagePosition) => void
  childName: string
}

export default function PageEditor({
  page,
  onUpdate,
  onAddImage,
  onRemoveImage,
  onReRecord,
  onImagePositionChange,
  childName,
}: PageEditorProps) {
  const isLincoln = childName.toLowerCase() === 'lincoln'
  const [selectedImageId, setSelectedImageId] = useState<string | null>(null)
  const imageContainerRef = useRef<HTMLDivElement>(null)

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

  const imageSection = !isTextOnly && (
    <Box
      ref={imageContainerRef}
      sx={{
        width: isImageLeft ? '50%' : '100%',
        minHeight: isFullImage ? 300 : 200,
        height: isFullImage ? 400 : 250,
        bgcolor: 'grey.100',
        borderRadius: 2,
        position: 'relative',
        overflow: 'hidden',
        touchAction: 'none',
      }}
      onClick={() => setSelectedImageId(null)}
    >
      {page.images.length > 0 ? (
        page.images.map((img, idx) => (
          <DraggableImage
            key={img.id}
            image={img}
            selected={selectedImageId === img.id}
            onSelect={() => setSelectedImageId(img.id)}
            onPositionChange={(pos) => onImagePositionChange?.(img.id, pos)}
            onRemove={onRemoveImage ? () => onRemoveImage(img.id) : undefined}
            onZIndexChange={(delta) => {
              const currentZ = img.position?.zIndex ?? idx
              const newZ = Math.max(0, Math.min(page.images.length - 1, currentZ + delta))
              onImagePositionChange?.(img.id, {
                x: img.position?.x ?? 0,
                y: img.position?.y ?? 0,
                width: img.position?.width ?? 100,
                height: img.position?.height ?? 100,
                rotation: img.position?.rotation ?? 0,
                zIndex: newZ,
                flipH: img.position?.flipH ?? false,
                flipV: img.position?.flipV ?? false,
              })
            }}
            style={{ zIndex: img.position?.zIndex ?? idx + 1 }}
          />
        ))
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
  )

  const textSection = !isFullImage && (
    <TextField
      multiline
      minRows={4}
      maxRows={10}
      fullWidth
      value={page.text ?? ''}
      onChange={handleTextChange}
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
    </Stack>
  )
}
