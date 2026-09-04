import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Typography from '@mui/material/Typography'
import { useNavigate } from 'react-router-dom'

import Page from '../../components/Page'
import type { AvatarProfile, VoxelArmorPieceId } from '../../core/types'
import type { ArmorGateStatus } from './armorGate'
import { VOXEL_ARMOR_PIECES } from './voxel/buildArmorPiece'
import AvatarThumbnail from './AvatarThumbnail'
import { kidPalette } from '../../app/tokens'

interface ArmorGateScreenProps {
  gateStatus: ArmorGateStatus
  avatarProfile: AvatarProfile | null
  childName: string
  equippedToday?: VoxelArmorPieceId[]
}

export default function ArmorGateScreen({
  gateStatus,
  avatarProfile,
  childName,
  equippedToday = [],
}: ArmorGateScreenProps) {
  const navigate = useNavigate()
  // Cosmetic retro/minecraft styling follows the avatar profile's themeStyle —
  // not the child's name (ARCH-15). `childName` is used only for the greeting.
  const isLincoln = avatarProfile?.themeStyle === 'minecraft'

  return (
    <Page>
      <Box
        sx={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          minHeight: '70vh',
          px: 3,
          textAlign: 'center',
        }}
      >
        {/* Avatar thumbnail (partial armor shown) */}
        {avatarProfile && (
          <AvatarThumbnail
            features={avatarProfile.characterFeatures}
            ageGroup={avatarProfile.ageGroup}
            equippedPieces={equippedToday}
            totalXp={avatarProfile.totalXp}
            size={120}
            animated
          />
        )}

        <Typography
          sx={{
            fontFamily: isLincoln ? '"Press Start 2P", monospace' : 'monospace',
            fontSize: isLincoln ? '14px' : '20px',
            fontWeight: 500,
            mt: 2.5,
          }}
        >
          Put on the armor of God
        </Typography>

        <Typography
          sx={{
            fontFamily: isLincoln ? '"Press Start 2P", monospace' : 'monospace',
            fontSize: isLincoln ? '12px' : '14px',
            color: 'text.secondary',
            mt: 1,
            maxWidth: 300,
            lineHeight: 1.6,
          }}
        >
          {/* FEAT-186 (part of UX-73). "equipped" is three syllables and
              "before starting your day" is four words of scaffolding around a
              two-word instruction. Kid Today already says "pieces on" for the
              same count, so this now matches it. The Ephesians 6:11 quotation
              below is left VERBATIM — a quoted verse cannot be shortened
              without misquoting it, and UX-73's real complaint is the screen's
              shape (a whole day replaced by one control), which is a design,
              not a wording pass. UX-73 stays open. */}
          Suit up first, {childName}.
          <br />
          {gateStatus.equipped} of {gateStatus.total} pieces on.
        </Typography>

        {/* Progress dots */}
        <Box sx={{ display: 'flex', gap: 1, mt: 2 }}>
          {VOXEL_ARMOR_PIECES.slice(0, gateStatus.total).map((piece) => {
            const isEquipped = !gateStatus.missing.includes(piece.id)
            return (
              <Box
                key={piece.id}
                sx={{
                  width: 12,
                  height: 12,
                  borderRadius: '50%',
                  bgcolor: isEquipped ? '#4caf50' : 'action.disabledBackground',
                  transition: 'background-color 0.3s',
                }}
              />
            )
          })}
        </Box>

        {/* Go Suit Up button */}
        <Button
          variant="outlined"
          onClick={() => navigate('/avatar')}
          sx={{
            mt: 3,
            px: 4,
            py: 1.5,
            borderRadius: isLincoln ? '2px' : '24px',
            borderColor: isLincoln ? kidPalette.xpGreen : '#4caf50',
            color: isLincoln ? kidPalette.xpGreen : '#4caf50',
            fontFamily: isLincoln ? '"Press Start 2P", monospace' : 'monospace',
            fontSize: isLincoln ? '12px' : '16px',
            fontWeight: 500,
            '&:hover': {
              borderColor: isLincoln ? kidPalette.xpGreen : '#4caf50',
              bgcolor: isLincoln ? 'rgba(126,252,32,0.15)' : 'rgba(76,175,80,0.15)',
            },
          }}
        >
          Go Suit Up
        </Button>

        {/* Ephesians 6:11 */}
        <Typography
          sx={{
            fontFamily: 'monospace',
            fontSize: '12px',
            color: 'text.disabled',
            mt: 2.5,
            fontStyle: 'italic',
            maxWidth: 280,
          }}
        >
          "Put on the full armor of God, so that you can take your stand against the devil's schemes."
          <br />
          — Ephesians 6:11
        </Typography>
      </Box>
    </Page>
  )
}
