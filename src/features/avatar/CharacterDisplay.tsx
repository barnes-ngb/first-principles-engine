import Box from '@mui/material/Box'
import CircularProgress from '@mui/material/CircularProgress'
import Typography from '@mui/material/Typography'

import type { ArmorPiece, AvatarProfile } from '../../core/types/domain'
import { ARMOR_PIECES } from '../../core/types/domain'

// ── Overlay positions ─────────────────────────────────────────────
// Approximate % positions of each piece over the full-body character image.
// These are intentionally approximate — piece images are standalone items.

export const PIECE_OVERLAY_POSITIONS: Record<
  ArmorPiece,
  {
    top: string
    left?: string
    right?: string
    transform?: string
    width: string
  }
> = {
  helmet_of_salvation:         { top: '5%',  left: '50%', transform: 'translateX(-50%)', width: '38%' },
  breastplate_of_righteousness:{ top: '30%', left: '50%', transform: 'translateX(-50%)', width: '42%' },
  belt_of_truth:               { top: '52%', left: '50%', transform: 'translateX(-50%)', width: '38%' },
  shield_of_faith:             { top: '42%', left: '4%',  width: '28%' },
  sword_of_the_spirit:         { top: '42%', right: '4%', width: '24%' },
  shoes_of_peace:              { top: '87%', left: '50%', transform: 'translateX(-50%)', width: '48%' },
}

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

/** Check if a piece has been unlocked at any tier. */
export function isPieceEarned(profile: AvatarProfile, pieceId: ArmorPiece): boolean {
  const entry = profile.pieces.find((p) => p.pieceId === pieceId)
  if (!entry) return false
  if (profile.themeStyle === 'minecraft') return entry.unlockedTiers.length > 0
  return (entry.unlockedTiersPlatformer ?? []).length > 0
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
      {/* Base character layer */}
      {profile.baseCharacterUrl ? (
        <Box
          component="img"
          src={profile.baseCharacterUrl}
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
