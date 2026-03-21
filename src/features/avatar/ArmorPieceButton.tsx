import { useEffect, useState } from 'react'
import Box from '@mui/material/Box'
import Typography from '@mui/material/Typography'
import CheckCircleIcon from '@mui/icons-material/CheckCircle'
import LockIcon from '@mui/icons-material/Lock'

import type { ArmorPiece, AvatarProfile } from '../../core/types/domain'
import { ARMOR_PIECES, ARMOR_PIECE_SHEET_INDEX } from '../../core/types/domain'
import { cropArmorPiece } from '../../core/avatar/cropArmorSheet'
import { isPieceEarned } from './armorUtils'

interface ArmorPieceButtonProps {
  pieceId: ArmorPiece
  profile: AvatarProfile
  appliedToday: boolean
  /** Pre-cropped data URL from the armor sheet, if available */
  croppedImageUrl?: string
  onTap: (pieceId: ArmorPiece) => void
}

/** Get the individual piece image URL (legacy per-piece storage) for the current tier. */
function getLegacyImageUrl(
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
  croppedImageUrl,
  onTap,
}: ArmorPieceButtonProps) {
  const pieceDef = ARMOR_PIECES.find((p) => p.id === pieceId)
  if (!pieceDef) return null

  const isLincoln = profile.themeStyle === 'minecraft'
  const earned = isPieceEarned(profile, pieceId)

  // Resolve image: prefer croppedImageUrl (from sheet), fall back to legacy per-piece URL
  const legacyUrl = getLegacyImageUrl(profile, pieceId)
  const imageUrl = croppedImageUrl ?? legacyUrl

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
      onClick={() => onTap(pieceId)}
      sx={{
        position: 'relative',
        flexShrink: 0,
        width: 120,
        height: 160,
        cursor: 'pointer',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'flex-start',
        gap: 0.75,
        pt: 1.25,
        pb: 1,
        px: 0.75,
        borderRadius: isLincoln ? 0 : 2,
        border: '2px solid',
        borderColor,
        bgcolor: bgColor,
        transition: 'transform 0.15s, box-shadow 0.15s',
        '&:hover': earned && !appliedToday ? { transform: 'scale(1.04)', boxShadow: 3 } : {},
        scrollSnapAlign: 'start',
      }}
    >
      {/* Image or lock placeholder */}
      {earned ? (
        imageUrl ? (
          <Box
            component="img"
            src={imageUrl}
            alt={pieceDef.name}
            sx={{
              width: 90,
              height: 90,
              objectFit: 'contain',
              imageRendering: isLincoln ? 'pixelated' : 'auto',
              opacity: appliedToday ? 1 : 0.9,
              flexShrink: 0,
            }}
          />
        ) : (
          <Box
            sx={{
              width: 90,
              height: 90,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '2.5rem',
              flexShrink: 0,
            }}
          >
            ✨
          </Box>
        )
      ) : (
        <Box
          sx={{
            width: 90,
            height: 90,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
          }}
        >
          <LockIcon sx={{ fontSize: 38, color: isLincoln ? '#555' : '#bbb' }} />
        </Box>
      )}

      {/* Applied checkmark */}
      {appliedToday && (
        <CheckCircleIcon
          sx={{
            position: 'absolute',
            top: 4,
            right: 4,
            fontSize: 18,
            color: accentColor,
          }}
        />
      )}

      {/* Piece name */}
      <Typography
        sx={{
          textAlign: 'center',
          lineHeight: 1.3,
          fontSize: '14px',
          fontWeight: 500,
          color: earned
            ? (isLincoln ? '#ccc' : 'text.primary')
            : (isLincoln ? '#444' : 'text.disabled'),
          fontFamily: isLincoln ? '"Press Start 2P", monospace' : undefined,
          ...(isLincoln ? { fontSize: '0.38rem', lineHeight: 1.5 } : {}),
          whiteSpace: 'normal',
          wordBreak: 'break-word',
        }}
      >
        {pieceDef.name}
      </Typography>

      {/* Scripture reference (earned) or XP needed (locked) */}
      <Typography
        sx={{
          textAlign: 'center',
          lineHeight: 1.2,
          fontSize: '11px',
          color: isLincoln ? '#666' : '#999',
          fontFamily: isLincoln ? '"Press Start 2P", monospace' : undefined,
          ...(isLincoln ? { fontSize: '0.28rem' } : {}),
        }}
      >
        {earned ? pieceDef.scripture : `${pieceDef.xpToUnlockStone} XP needed`}
      </Typography>

      {/* Applied badge */}
      {appliedToday && (
        <Typography
          sx={{
            fontSize: '11px',
            color: isLincoln ? '#7EFC20' : '#2e7d32',
            fontWeight: 600,
            textAlign: 'center',
            lineHeight: 1,
            ...(isLincoln ? { fontSize: '0.28rem', fontFamily: '"Press Start 2P", monospace' } : {}),
          }}
        >
          ✓ Applied today
        </Typography>
      )}
    </Box>
  )
}

// ── Sheet-aware wrapper that handles cropping ─────────────────────

interface ArmorPieceButtonWithSheetProps extends Omit<ArmorPieceButtonProps, 'croppedImageUrl'> {
  sheetUrl?: string
  /** Cache bucket — pass a React state setter to store cropped URLs */
  onCropped?: (pieceId: ArmorPiece, dataUrl: string) => void
  cachedCroppedUrl?: string
}

export function ArmorPieceButtonWithSheet({
  pieceId,
  sheetUrl,
  onCropped,
  cachedCroppedUrl,
  ...rest
}: ArmorPieceButtonWithSheetProps) {
  const [croppedUrl, setCroppedUrl] = useState<string | undefined>(cachedCroppedUrl)

  useEffect(() => {
    if (cachedCroppedUrl) {
      setCroppedUrl(cachedCroppedUrl)
      return
    }
    if (!sheetUrl) return
    let cancelled = false
    const pieceIndex = ARMOR_PIECE_SHEET_INDEX[pieceId]
    cropArmorPiece(sheetUrl, pieceIndex, 256)
      .then((dataUrl) => {
        if (!cancelled) {
          setCroppedUrl(dataUrl)
          onCropped?.(pieceId, dataUrl)
        }
      })
      .catch(() => {
        // Silently fall back to legacy URL
      })
    return () => { cancelled = true }
  }, [sheetUrl, pieceId, cachedCroppedUrl, onCropped])

  return <ArmorPieceButton {...rest} pieceId={pieceId} croppedImageUrl={croppedUrl} />
}
