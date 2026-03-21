import Box from '@mui/material/Box'
import Typography from '@mui/material/Typography'
import LockIcon from '@mui/icons-material/Lock'
import CheckCircleIcon from '@mui/icons-material/CheckCircle'
import type { ArmorPiece, AvatarProfile } from '../../core/types'
import { ARMOR_PIECES } from '../../core/types'
import { isPieceEarned } from './armorUtils'

interface ArmorPieceCardProps {
  pieceId: ArmorPiece
  profile: AvatarProfile | null
  croppedImageUrl?: string
  onTap: (pieceId: ArmorPiece) => void
}

function getPieceImageUrl(profile: AvatarProfile, pieceId: ArmorPiece): string | undefined {
  const entry = profile.pieces.find((p) => p.pieceId === pieceId)
  if (!entry) return undefined
  const tier = profile.currentTier
  return (entry.generatedImageUrls as Record<string, string | undefined>)[tier]
}

export default function ArmorPieceCard({ pieceId, profile, croppedImageUrl, onTap }: ArmorPieceCardProps) {
  const pieceDef = ARMOR_PIECES.find((p) => p.id === pieceId)
  if (!pieceDef) return null

  const isLincoln = profile?.themeStyle === 'minecraft'
  const isUnlocked = profile ? isPieceEarned(profile, pieceId) : false
  const legacyUrl = profile ? getPieceImageUrl(profile, pieceId) : undefined
  const imageUrl = croppedImageUrl ?? legacyUrl

  const bgColor = isLincoln
    ? (isUnlocked ? 'rgba(78,160,78,0.15)' : 'rgba(0,0,0,0.5)')
    : (isUnlocked ? 'rgba(255,182,193,0.3)' : 'rgba(200,200,210,0.3)')

  const borderColor = isLincoln
    ? (isUnlocked ? '#4EA04E' : '#333')
    : (isUnlocked ? '#E8A0BF' : '#ccc')

  return (
    <Box
      onClick={() => isUnlocked && onTap(pieceId)}
      sx={{
        position: 'relative',
        borderRadius: isLincoln ? 0 : 3,
        border: '2px solid',
        borderColor,
        bgcolor: bgColor,
        p: 1.5,
        cursor: isUnlocked ? 'pointer' : 'default',
        transition: 'transform 0.15s, box-shadow 0.15s',
        '&:hover': isUnlocked ? { transform: 'scale(1.03)', boxShadow: 4 } : {},
        overflow: 'hidden',
        aspectRatio: '1',
        minHeight: 160,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      {/* Image or placeholder */}
      {isUnlocked && imageUrl ? (
        <Box
          component="img"
          src={imageUrl}
          alt={pieceDef.name}
          sx={{
            width: '100%',
            aspectRatio: '1',
            objectFit: 'contain',
            borderRadius: isLincoln ? 0 : 2,
            imageRendering: 'pixelated',
          }}
        />
      ) : isUnlocked ? (
        <Box
          sx={{
            width: '100%',
            aspectRatio: '1',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '3rem',
          }}
        >
          ✨
        </Box>
      ) : (
        <Box
          sx={{
            position: 'relative',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            width: '100%',
            aspectRatio: '1',
            gap: 0.5,
          }}
        >
          {/* Locked silhouette — dimmed crop if available */}
          {imageUrl && (
            <Box
              component="img"
              src={imageUrl}
              alt={pieceDef.name}
              sx={{
                position: 'absolute',
                inset: 0,
                width: '100%',
                height: '100%',
                objectFit: 'contain',
                filter: 'brightness(0.3) grayscale(1)',
                imageRendering: 'pixelated',
              }}
            />
          )}
          <LockIcon sx={{ fontSize: 36, color: isLincoln ? '#555' : '#aaa', zIndex: 1 }} />
          <Typography
            variant="caption"
            sx={{
              color: isLincoln ? '#888' : '#999',
              fontFamily: isLincoln ? '"Press Start 2P", monospace' : undefined,
              fontSize: isLincoln ? '0.4rem' : '0.65rem',
              textAlign: 'center',
              zIndex: 1,
            }}
          >
            {pieceDef.xpToUnlockStone} XP
          </Typography>
        </Box>
      )}

      {/* Unlock badge */}
      {isUnlocked && (
        <CheckCircleIcon
          sx={{
            position: 'absolute',
            top: 4,
            right: 4,
            fontSize: 20,
            color: 'success.main',
            bgcolor: 'background.paper',
            borderRadius: '50%',
          }}
        />
      )}

      {/* Piece name */}
      <Typography
        variant="caption"
        sx={{
          mt: 0.5,
          textAlign: 'center',
          fontWeight: 600,
          color: isUnlocked
            ? (isLincoln ? '#7EFC20' : 'text.primary')
            : (isLincoln ? '#555' : 'text.disabled'),
          fontFamily: isLincoln ? '"Press Start 2P", monospace' : undefined,
          fontSize: isLincoln ? '0.38rem' : '0.65rem',
          lineHeight: 1.3,
        }}
      >
        {pieceDef.name}
      </Typography>
    </Box>
  )
}
