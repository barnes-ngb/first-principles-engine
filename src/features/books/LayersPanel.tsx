import Box from '@mui/material/Box'
import Collapse from '@mui/material/Collapse'
import IconButton from '@mui/material/IconButton'
import Paper from '@mui/material/Paper'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import Tooltip from '@mui/material/Tooltip'
import LayersIcon from '@mui/icons-material/Layers'
import KeyboardArrowUpIcon from '@mui/icons-material/KeyboardArrowUp'
import KeyboardArrowDownIcon from '@mui/icons-material/KeyboardArrowDown'
import ExpandMoreIcon from '@mui/icons-material/ExpandMore'
import ExpandLessIcon from '@mui/icons-material/ExpandLess'

import type { PageImage } from '../../core/types'
import { stackOrder } from './draggableImageUtils'

interface LayersPanelProps {
  images: PageImage[]
  selectedImageId: string | null
  onSelect: (imageId: string) => void
  onReorder: (imageId: string, direction: 'up' | 'down') => void
  open: boolean
  onToggle: () => void
}

const TYPE_LABEL: Record<PageImage['type'], string> = {
  'ai-generated': 'Scene',
  photo: 'Photo',
  sticker: 'Sticker',
  sketch: 'Drawing',
}

/**
 * Collapsible layers drawer for the book page composer. Lists every placed
 * element top-of-stack first (how layer panels universally read), with the
 * selected element highlighted and per-row move up / move down. Phone-first: a
 * sheet that collapses so it never permanently eats the canvas.
 */
export default function LayersPanel({
  images,
  selectedImageId,
  onSelect,
  onReorder,
  open,
  onToggle,
}: LayersPanelProps) {
  if (images.length === 0) return null

  // Top of stack first — matches every photo-editor layers panel.
  const topFirst = [...stackOrder(images)].reverse()

  return (
    <Paper
      variant="outlined"
      sx={{ borderRadius: 2, overflow: 'hidden' }}
    >
      <Box
        component="button"
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        aria-label={open ? 'Hide layers' : 'Show layers'}
        sx={{
          width: '100%',
          display: 'flex',
          alignItems: 'center',
          gap: 1,
          px: 1.5,
          py: 1,
          border: 'none',
          bgcolor: 'transparent',
          cursor: 'pointer',
          color: 'text.primary',
          font: 'inherit',
          textAlign: 'left',
        }}
      >
        <LayersIcon fontSize="small" color="action" />
        <Typography variant="subtitle2" sx={{ flex: 1 }}>
          Layers ({images.length})
        </Typography>
        {open ? <ExpandLessIcon fontSize="small" /> : <ExpandMoreIcon fontSize="small" />}
      </Box>

      <Collapse in={open} unmountOnExit>
        <Stack sx={{ px: 0.5, pb: 0.5 }}>
          {topFirst.map((img, i) => {
            const selected = img.id === selectedImageId
            const isTop = i === 0
            const isBottom = i === topFirst.length - 1
            return (
              <Stack
                key={img.id}
                direction="row"
                alignItems="center"
                spacing={1}
                onClick={() => onSelect(img.id)}
                sx={{
                  px: 1,
                  py: 0.5,
                  borderRadius: 1.5,
                  cursor: 'pointer',
                  bgcolor: selected ? 'primary.main' : 'transparent',
                  color: selected ? 'primary.contrastText' : 'text.primary',
                  '&:hover': { bgcolor: selected ? 'primary.main' : 'action.hover' },
                }}
              >
                {img.url ? (
                  <Box
                    component="img"
                    src={img.url}
                    alt={img.label ?? TYPE_LABEL[img.type]}
                    sx={{
                      width: 40,
                      height: 40,
                      objectFit: 'cover',
                      borderRadius: 1,
                      border: '1px solid',
                      borderColor: 'divider',
                      bgcolor: 'background.paper',
                      flex: 'none',
                    }}
                  />
                ) : (
                  <Box
                    sx={{
                      width: 40,
                      height: 40,
                      borderRadius: 1,
                      border: '1px solid',
                      borderColor: 'divider',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      flex: 'none',
                    }}
                  >
                    <LayersIcon fontSize="small" color="disabled" />
                  </Box>
                )}
                <Typography variant="body2" sx={{ flex: 1, minWidth: 0 }} noWrap>
                  {img.label?.trim() || TYPE_LABEL[img.type]}
                </Typography>
                <Tooltip title="Move up">
                  <span>
                    <IconButton
                      size="small"
                      disabled={isTop}
                      onClick={(e) => {
                        e.stopPropagation()
                        onReorder(img.id, 'up')
                      }}
                      sx={{ color: 'inherit' }}
                    >
                      <KeyboardArrowUpIcon fontSize="small" />
                    </IconButton>
                  </span>
                </Tooltip>
                <Tooltip title="Move down">
                  <span>
                    <IconButton
                      size="small"
                      disabled={isBottom}
                      onClick={(e) => {
                        e.stopPropagation()
                        onReorder(img.id, 'down')
                      }}
                      sx={{ color: 'inherit' }}
                    >
                      <KeyboardArrowDownIcon fontSize="small" />
                    </IconButton>
                  </span>
                </Tooltip>
              </Stack>
            )
          })}
        </Stack>
      </Collapse>
    </Paper>
  )
}
