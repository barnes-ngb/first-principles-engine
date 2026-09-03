import Box from '@mui/material/Box'
import type { SxProps, Theme } from '@mui/material/styles'

import { FIT_BACKDROP_BLUR_PX, FIT_BACKDROP_SCALE, FIT_BACKDROP_TESTID } from './imageFit'

interface ImageFitBackdropProps {
  /** The same image URL as the sharp copy in front — never a different picture. */
  url: string
  /**
   * Geometry of the box being filled: position / size / zIndex / border radius,
   * plus the sharp copy's own rotation + flip transforms so the two can never
   * disagree. The enlarging scale is added inside, on the `<img>` itself.
   */
  sx?: SxProps<Theme>
}

/**
 * FEAT-177 — what sits behind a background shown whole.
 *
 * Contain-fitting a square-ish scene into a 3:2 page area leaves bars at the
 * sides. Filling them with a blurred, slightly enlarged copy of the same
 * picture reads as part of the illustration; a flat grey bar reads as a bug.
 *
 * The wrapper clips (`overflow: hidden`) so the enlarged copy never bleeds past
 * the box it is filling — the enlargement exists only to push the blur's soft
 * edge out of sight. Decorative: `aria-hidden`, empty `alt`, no pointer events.
 */
export default function ImageFitBackdrop({ url, sx }: ImageFitBackdropProps) {
  return (
    <Box
      aria-hidden
      data-testid={FIT_BACKDROP_TESTID}
      sx={[
        { overflow: 'hidden', pointerEvents: 'none' },
        ...(Array.isArray(sx) ? sx : [sx]),
      ]}
    >
      <Box
        component="img"
        src={url}
        alt=""
        draggable={false}
        sx={{
          display: 'block',
          width: '100%',
          height: '100%',
          objectFit: 'cover',
          filter: `blur(${FIT_BACKDROP_BLUR_PX}px)`,
          transform: `scale(${FIT_BACKDROP_SCALE})`,
        }}
      />
    </Box>
  )
}
