import Box from '@mui/material/Box'
import CircularProgress from '@mui/material/CircularProgress'
import Typography from '@mui/material/Typography'

import type { ArmorPiece, AvatarProfile } from '../../core/types/domain'
import { ARMOR_PIECES } from '../../core/types/domain'
import { isPieceEarned, PIECE_OVERLAY_POSITIONS } from './armorUtils'

// ── Helpers ───────────────────────────────────────────────────────

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

// ── Component ─────────────────────────────────────────────────────

interface CharacterDisplayProps {
  profile: AvatarProfile
  appliedPieces: ArmorPiece[]
  /** Height of the character display area (default 60vh) */
  height?: string | number
}

export default function CharacterDisplay({
  profile,
  appliedPieces,
  height = '55vw',
}: CharacterDisplayProps) {
  const isLincoln = profile.themeStyle === 'minecraft'
  const accentColor = isLincoln ? '#7EFC20' : '#E8A0BF'

  return (
    <Box
      sx={{
        position: 'relative',
        width: '100%',
        maxWidth: 320,
        mx: 'auto',
        height,
        maxHeight: 380,
        borderRadius: isLincoln ? 0 : 3,
        border: `2px solid ${accentColor}`,
        overflow: 'hidden',
        bgcolor: isLincoln ? '#0d1117' : '#f0f7ff',
      }}
    >
      {/* Base character layer — photo transform takes priority over generated base */}
      {(profile.photoTransformUrl ?? profile.baseCharacterUrl) ? (
        <Box
          component="img"
          src={profile.photoTransformUrl ?? profile.baseCharacterUrl}
          alt="Your character"
          sx={{
            position: 'absolute',
            inset: 0,
            width: '100%',
            height: '100%',
            objectFit: 'cover',
            imageRendering: isLincoln ? 'pixelated' : 'auto',
          }}
        />
      ) : (
        <Box
          sx={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 1,
          }}
        >
          <CircularProgress size={28} sx={{ color: accentColor }} />
          <Typography
            variant="caption"
            sx={{
              color: isLincoln ? '#aaa' : '#999',
              fontFamily: isLincoln ? '"Press Start 2P", monospace' : undefined,
              fontSize: isLincoln ? '0.32rem' : '0.6rem',
              textAlign: 'center',
              px: 2,
            }}
          >
            Creating your character...
          </Typography>
        </Box>
      )}

      {/* Piece overlay layers */}
      {ARMOR_PIECES.map((pieceDef) => {
        const pos = PIECE_OVERLAY_POSITIONS[pieceDef.id]
        const earned = isPieceEarned(profile, pieceDef.id)
        const applied = appliedPieces.includes(pieceDef.id)
        const imageUrl = getPieceImageUrl(profile, pieceDef.id)

        if (!earned) return null

        return (
          <Box
            key={pieceDef.id}
            component={imageUrl ? 'img' : 'div'}
            {...(imageUrl ? { src: imageUrl, alt: pieceDef.name } : {})}
            sx={{
              position: 'absolute',
              width: pos.width,
              top: pos.top,
              ...(pos.left ? { left: pos.left } : {}),
              ...(pos.right ? { right: pos.right } : {}),
              ...(pos.transform ? { transform: pos.transform } : {}),
              opacity: applied ? 1 : 0.18,
              imageRendering: isLincoln ? 'pixelated' : 'auto',
              // Slide-in animation when piece is applied
              ...(applied && imageUrl
                ? {
                    animation: `pieceSlideIn_${pieceDef.id} 0.4s ease-out`,
                    [`@keyframes pieceSlideIn_${pieceDef.id}`]: {
                      from: { opacity: 0, transform: `${pos.transform ?? ''} scale(0.5)` },
                      to:   { opacity: 1, transform: pos.transform ?? 'none' },
                    },
                  }
                : {}),
            }}
          />
        )
      })}
    </Box>
  )
}
