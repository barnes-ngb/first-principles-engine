import Box from '@mui/material/Box'
import Typography from '@mui/material/Typography'

import type { PhotoRef } from '../../core/types'
import { usePhotoUrl } from './usePhotoUrl'

interface MonthlyPhotoProps {
  photo: PhotoRef
  caption?: string
  aspectRatio?: string
  size?: number
}

export function MonthlyPhoto({
  photo,
  caption,
  aspectRatio = '1 / 1',
  size,
}: MonthlyPhotoProps) {
  const { url, failed } = usePhotoUrl(photo.storagePath)

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
      <Box
        sx={{
          width: size ? `${size}px` : '100%',
          aspectRatio,
          borderRadius: 2,
          overflow: 'hidden',
          bgcolor: 'grey.200',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        {url && !failed ? (
          <Box
            component="img"
            src={url}
            alt={caption ?? ''}
            loading="lazy"
            onError={() => {
              /* Soft failure: handled visually via `failed` */
            }}
            sx={{ width: '100%', height: '100%', objectFit: 'cover' }}
          />
        ) : (
          <Box
            sx={{
              fontSize: 32,
              color: 'text.disabled',
              userSelect: 'none',
            }}
          >
            {'\u{1F4F7}'}
          </Box>
        )}
      </Box>
      {caption && (
        <Typography
          variant="caption"
          sx={{ color: 'text.secondary', textAlign: 'center', px: 0.5 }}
        >
          {caption}
        </Typography>
      )}
    </Box>
  )
}
