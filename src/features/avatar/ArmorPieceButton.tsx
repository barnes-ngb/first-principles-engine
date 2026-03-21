import { forwardRef, useEffect, useState } from 'react'
import Box from '@mui/material/Box'
import Typography from '@mui/material/Typography'
import CancelIcon from '@mui/icons-material/Cancel'
import CheckCircleIcon from '@mui/icons-material/CheckCircle'
import LockIcon from '@mui/icons-material/Lock'

import type { ArmorPiece, AvatarProfile } from '../../core/types/domain'
import { ARMOR_PIECES, ARMOR_PIECE_SHEET_INDEX } from '../../core/types/domain'
import { cropArmorPiece } from '../../core/avatar/cropArmorSheet'
import { isPieceEarned } from './armorUtils'
import { ArmorIcon } from './icons/ArmorIcons'
import type { ArmorTierColor } from './icons/ArmorIcons'

// Map profile tier to TIER_COLORS key
function toTierColor(tier: string): ArmorTierColor {
  const valid: ArmorTierColor[] = ['stone', 'diamond', 'netherite', 'basic', 'powerup', 'champion']
  return valid.includes(tier as ArmorTierColor) ? (tier as ArmorTierColor) : 'stone'
}

function getLegacyImageUrl(
  profile: AvatarProfile,
  pieceId: ArmorPiece,
): string | undefined {
  const entry = profile.pieces.find((p) => p.pieceId === pieceId)
  if (!entry) return undefined
  const tier = profile.currentTier
  return (entry.generatedImageUrls as Record<string, string | undefined>)[tier]
}

interface ArmorPieceButtonProps {
  pieceId: ArmorPiece
  profile: AvatarProfile
  appliedToday: boolean
  croppedImageUrl?: string
  onTap: (pieceId: ArmorPiece) => void
}

const ArmorPieceButton = forwardRef<HTMLDivElement, ArmorPieceButtonProps>(
  function ArmorPieceButton({ pieceId, profile, appliedToday, croppedImageUrl, onTap }, ref) {
    const pieceDef = ARMOR_PIECES.find((p) => p.id === pieceId)
    if (!pieceDef) return null

    const isLincoln = profile.themeStyle === 'minecraft'
    const earned = isPieceEarned(profile, pieceId)
    const tier = toTierColor(profile.currentTier)

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
        ref={ref}
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
          '&:hover': earned
            ? (appliedToday
                ? { transform: 'scale(0.97)', borderColor: 'error.light', boxShadow: 1 }
                : { transform: 'scale(1.04)', boxShadow: 3 })
            : {},
          scrollSnapAlign: 'start',
        }}
      >
        {/* Image, SVG icon, or lock icon */}
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
            <Box sx={{ width: 90, height: 90, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <ArmorIcon pieceId={pieceId} size={72} tier={tier} applied={appliedToday} />
            </Box>
          )
        ) : (
          <Box sx={{ width: 90, height: 90, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', flexShrink: 0, gap: 0.5 }}>
            <LockIcon sx={{ fontSize: 40, color: isLincoln ? 'rgba(255,255,255,0.2)' : 'rgba(0,0,0,0.2)' }} />
          </Box>
        )}

        {/* Applied checkmark + remove hint */}
        {appliedToday && (
          <>
            <CheckCircleIcon
              sx={{ position: 'absolute', top: 4, right: 4, fontSize: 18, color: accentColor }}
            />
            <CancelIcon
              sx={{ position: 'absolute', top: 4, left: 4, fontSize: 14, color: 'rgba(255,255,255,0.4)', opacity: 0.7 }}
            />
          </>
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

        {/* Scripture ref or XP needed */}
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
  },
)

export default ArmorPieceButton

// ── Sheet-aware wrapper that handles cropping ─────────────────────

interface ArmorPieceButtonWithSheetProps extends Omit<ArmorPieceButtonProps, 'croppedImageUrl'> {
  sheetUrl?: string
  onCropped?: (pieceId: ArmorPiece, dataUrl: string) => void
  cachedCroppedUrl?: string
  buttonRef?: React.Ref<HTMLDivElement>
}

export function ArmorPieceButtonWithSheet({
  pieceId,
  sheetUrl,
  onCropped,
  cachedCroppedUrl,
  buttonRef,
  ...rest
}: ArmorPieceButtonWithSheetProps) {
  const [asyncCroppedUrl, setAsyncCroppedUrl] = useState<string | undefined>(undefined)

  useEffect(() => {
    if (cachedCroppedUrl || !sheetUrl) return
    let cancelled = false
    const pieceIndex = ARMOR_PIECE_SHEET_INDEX[pieceId]
    cropArmorPiece(sheetUrl, pieceIndex, 256)
      .then((dataUrl) => {
        if (!cancelled) {
          setAsyncCroppedUrl(dataUrl)
          onCropped?.(pieceId, dataUrl)
        }
      })
      .catch(() => {
        // Silently fall back to legacy URL
      })
    return () => { cancelled = true }
  }, [sheetUrl, pieceId, cachedCroppedUrl, onCropped])

  return (
    <ArmorPieceButton
      ref={buttonRef}
      {...rest}
      pieceId={pieceId}
      croppedImageUrl={cachedCroppedUrl ?? asyncCroppedUrl}
    />
  )
}
