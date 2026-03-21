import Box from '@mui/material/Box'
import Dialog from '@mui/material/Dialog'
import DialogContent from '@mui/material/DialogContent'
import IconButton from '@mui/material/IconButton'
import Typography from '@mui/material/Typography'
import CloseIcon from '@mui/icons-material/Close'
import type { ArmorPiece, AvatarProfile } from '../../core/types'
import { ARMOR_PIECES } from '../../core/types'

interface ArmorPieceModalProps {
  pieceId: ArmorPiece | null
  profile: AvatarProfile | null
  onClose: () => void
}

function getPieceImageUrl(profile: AvatarProfile, pieceId: ArmorPiece): string | undefined {
  const entry = profile.pieces.find((p) => p.pieceId === pieceId)
  if (!entry) return undefined
  const tier = profile.currentTier
  return (entry.generatedImageUrls as Record<string, string | undefined>)[tier]
}

export default function ArmorPieceModal({ pieceId, profile, onClose }: ArmorPieceModalProps) {
  const pieceDef = pieceId ? ARMOR_PIECES.find((p) => p.id === pieceId) : null
  const isLincoln = profile?.themeStyle === 'minecraft'
  const imageUrl = pieceId && profile ? getPieceImageUrl(profile, pieceId) : undefined

  const bgColor = isLincoln ? '#1a1a2e' : '#fff9f0'
  const textColor = isLincoln ? '#e0e0e0' : '#3d3d3d'
  const accentColor = isLincoln ? '#7EFC20' : '#E8A0BF'

  return (
    <Dialog
      open={Boolean(pieceId)}
      onClose={onClose}
      maxWidth="xs"
      fullWidth
      PaperProps={{
        sx: {
          bgcolor: bgColor,
          color: textColor,
          borderRadius: isLincoln ? 0 : 4,
          border: isLincoln ? `2px solid ${accentColor}` : 'none',
        },
      }}
    >
      <DialogContent sx={{ p: 3, position: 'relative' }}>
        <IconButton
          onClick={onClose}
          sx={{ position: 'absolute', top: 8, right: 8, color: textColor }}
          size="small"
        >
          <CloseIcon />
        </IconButton>

        {pieceDef && (
          <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
            {imageUrl ? (
              <Box
                component="img"
                src={imageUrl}
                alt={pieceDef.name}
                sx={{
                  width: 200,
                  height: 200,
                  objectFit: 'contain',
                  borderRadius: isLincoln ? 0 : 3,
                  imageRendering: isLincoln ? 'pixelated' : 'auto',
                  border: `2px solid ${accentColor}`,
                }}
              />
            ) : (
              <Box
                sx={{
                  width: 200,
                  height: 200,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '5rem',
                  border: `2px solid ${accentColor}`,
                  borderRadius: isLincoln ? 0 : 3,
                }}
              >
                ✨
              </Box>
            )}

            <Typography
              variant="h6"
              sx={{
                fontWeight: 700,
                textAlign: 'center',
                color: accentColor,
                fontFamily: isLincoln ? '"Press Start 2P", monospace' : '"Fredoka", cursive',
                fontSize: isLincoln ? '0.65rem' : '1.2rem',
              }}
            >
              {pieceDef.name}
            </Typography>

            <Typography
              variant="caption"
              sx={{
                color: isLincoln ? '#aaa' : '#999',
                fontFamily: isLincoln ? '"Press Start 2P", monospace' : undefined,
                fontSize: isLincoln ? '0.4rem' : '0.75rem',
              }}
            >
              {pieceDef.scripture}
            </Typography>

            <Box
              sx={{
                bgcolor: isLincoln ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.04)',
                borderRadius: 2,
                p: 2,
                borderLeft: `3px solid ${accentColor}`,
              }}
            >
              <Typography
                variant="body2"
                sx={{
                  fontStyle: 'italic',
                  color: textColor,
                  fontFamily: isLincoln ? '"Press Start 2P", monospace' : undefined,
                  fontSize: isLincoln ? '0.45rem' : '0.875rem',
                  lineHeight: 1.6,
                }}
              >
                "{pieceDef.verseText}"
              </Typography>
            </Box>

            <Typography
              variant="caption"
              sx={{
                color: isLincoln ? '#7EFC20' : '#E8A0BF',
                fontWeight: 600,
                textAlign: 'center',
                fontFamily: isLincoln ? '"Press Start 2P", monospace' : '"Fredoka", cursive',
                fontSize: isLincoln ? '0.4rem' : '0.8rem',
              }}
            >
              This is part of your Armor of God ⚔️
            </Typography>
          </Box>
        )}
      </DialogContent>
    </Dialog>
  )
}
