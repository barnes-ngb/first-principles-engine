import Box from '@mui/material/Box'
import Typography from '@mui/material/Typography'
import CheckCircleIcon from '@mui/icons-material/CheckCircle'
import LockIcon from '@mui/icons-material/Lock'

import type { ArmorPiece, AvatarProfile } from '../../core/types/domain'
import { ARMOR_PIECES } from '../../core/types/domain'
import { isPieceEarned } from './CharacterDisplay'

interface ArmorPieceButtonProps {
  pieceId: ArmorPiece
  profile: AvatarProfile
  appliedToday: boolean
  onTap: (pieceId: ArmorPiece) => void
}

/** Get the image URL for the current tier of a piece. */
function getPieceImageUrl(
  profile: AvatarProfile,
  pieceId: ArmorPiece,
): string | undefined {
  const entry = profile.pieces.find((p) => p.pieceId === pieceId)
  if (!entry) return undefined
  const tier = profile.currentTier
  return (entry.generatedImageUrls as Record<string, string | undefined>)[tier]
}

export default function ArmorPieceButton({
  pieceId,
  profile,
  appliedToday,
  onTap,
}: ArmorPieceButtonProps) {
  const pieceDef = ARMOR_PIECES.find((p) => p.id === pieceId)
  if (!pieceDef) return null

  const isLincoln = profile.themeStyle === 'minecraft'
  const earned = isPieceEarned(profile, pieceId)
  const imageUrl = getPieceImageUrl(profile, pieceId)

  const accentColor = isLincoln ? '#7EFC20' : '#E8A0BF'
  const bgColor = earned
    ? (appliedToday
        ? (isLincoln ? 'rgba(126,252,32,0.15)' : 'rgba(232,160,191,0.2)')
        : (isLincoln ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.03)'))
    : (isLincoln ? '#1a1a2e' : '#f0f0f0')

  const borderColor = earned
    ? (appliedToday ? accentColor : (isLincoln ? '#444' : '#ccc'))
    : (isLincoln ? '#333' : '#e0e0e0')

  return (
    <Box
      onClick={() => earned && !appliedToday && onTap(pieceId)}
      sx={{
        position: 'relative',
        flexShrink: 0,
        width: 76,
        cursor: earned && !appliedToday ? 'pointer' : 'default',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 0.5,
        p: 0.75,
        borderRadius: isLincoln ? 0 : 2,
        border: '2px solid',
        borderColor,
        bgcolor: bgColor,
        transition: 'transform 0.15s, box-shadow 0.15s',
        '&:hover': (earned && !appliedToday) ? { transform: 'scale(1.05)', boxShadow: 3 } : {},
      }}
    >
      {/* Image or placeholder */}
      {earned ? (
        imageUrl ? (
          <Box
            component="img"
            src={imageUrl}
            alt={pieceDef.name}
            sx={{
              width: 48,
              height: 48,
              objectFit: 'contain',
              imageRendering: isLincoln ? 'pixelated' : 'auto',
              opacity: appliedToday ? 1 : 0.85,
            }}
          />
        ) : (
          <Box
            sx={{
              width: 48,
              height: 48,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '1.8rem',
            }}
          >
            ✨
          </Box>
        )
      ) : (
        <Box
          sx={{
            width: 48,
            height: 48,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <LockIcon sx={{ fontSize: 28, color: isLincoln ? '#555' : '#bbb' }} />
        </Box>
      )}

      {/* Applied checkmark */}
      {appliedToday && (
        <CheckCircleIcon
          sx={{
            position: 'absolute',
            top: 2,
            right: 2,
            fontSize: 16,
            color: accentColor,
          }}
        />
      )}

      {/* Piece name */}
      <Typography
        variant="caption"
        sx={{
          textAlign: 'center',
          lineHeight: 1.2,
          color: earned
            ? (isLincoln ? '#ccc' : 'text.primary')
            : (isLincoln ? '#444' : 'text.disabled'),
          fontFamily: isLincoln ? '"Press Start 2P", monospace' : undefined,
          fontSize: isLincoln ? '0.28rem' : '0.6rem',
          fontWeight: appliedToday ? 700 : 400,
        }}
      >
        {pieceDef.name}
      </Typography>
    </Box>
  )
}
