import Box from '@mui/material/Box'
import Typography from '@mui/material/Typography'

import type { AccessoryId, AccessorySlot } from '../../core/types'
import { ACCESSORIES, ACCESSORY_SLOTS, ACCESSORY_XP_THRESHOLDS } from '../../core/types'

interface AccessoriesPanelProps {
  totalXp: number
  equippedAccessories: AccessoryId[]
  equippedArmor: string[]
  isLincoln: boolean
  onToggle: (id: AccessoryId) => void
}

/** Resolve slot conflicts: only one accessory per slot */
function getSlotForAccessory(id: AccessoryId): AccessorySlot {
  for (const [slot, ids] of Object.entries(ACCESSORY_SLOTS)) {
    if ((ids as readonly string[]).includes(id)) return slot as AccessorySlot
  }
  return 'eyes'
}

export default function AccessoriesPanel({
  totalXp,
  equippedAccessories,
  equippedArmor,
  isLincoln,
  onToggle,
}: AccessoriesPanelProps) {
  const accentColor = isLincoln ? '#7EFC20' : '#E8A0BF'
  const titleFont = isLincoln ? '"Press Start 2P", monospace' : '"Fredoka", cursive'

  // Check if any accessories are unlocked yet
  const anyUnlocked = ACCESSORIES.some((a) => totalXp >= a.xpRequired)
  if (!anyUnlocked) return null

  // Conflict info for display
  const helmetEquipped = equippedArmor.includes('helmet')
  const shieldEquipped = equippedArmor.includes('shield')

  return (
    <Box
      sx={{
        mt: 2,
        mx: 1,
        p: 2,
        borderRadius: isLincoln ? '8px' : '18px',
        border: `1px solid ${isLincoln ? 'rgba(126,252,32,0.1)' : 'rgba(232,160,191,0.18)'}`,
        background: isLincoln
          ? 'linear-gradient(135deg, rgba(20,22,36,0.95) 0%, rgba(26,30,46,0.95) 100%)'
          : 'linear-gradient(135deg, rgba(255,254,249,0.95) 0%, rgba(250,245,240,0.95) 100%)',
        boxShadow: isLincoln
          ? '0 4px 16px rgba(0,0,0,0.2)'
          : '0 4px 16px rgba(0,0,0,0.04)',
      }}
    >
      <Typography
        sx={{
          fontFamily: titleFont,
          fontSize: isLincoln ? '0.42rem' : '15px',
          fontWeight: 600,
          color: accentColor,
          mb: 1.5,
        }}
      >
        Accessories
      </Typography>

      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: 'repeat(5, 1fr)',
          gap: '8px',
        }}
      >
        {ACCESSORIES.map((accessory) => {
          const isUnlocked = totalXp >= accessory.xpRequired
          const isEquipped = equippedAccessories.includes(accessory.id)
          const xpAway = accessory.xpRequired - totalXp

          // Check armor conflicts
          const isConflicted =
            (accessory.id === 'crown' && helmetEquipped) ||
            (accessory.id === 'book' && shieldEquipped)

          // Check slot conflict — is another item in the same slot equipped?
          const slot = getSlotForAccessory(accessory.id)
          const slotItems = ACCESSORY_SLOTS[slot]
          const slotConflict = !isEquipped && equippedAccessories.some(
            (eq) => eq !== accessory.id && (slotItems as readonly string[]).includes(eq),
          )

          return (
            <Box
              key={accessory.id}
              onClick={() => {
                if (isUnlocked) onToggle(accessory.id)
              }}
              sx={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: '4px',
                p: '8px 4px',
                borderRadius: isLincoln ? '6px' : '14px',
                border: isEquipped
                  ? `2px solid ${isConflicted ? '#ff9800' : accentColor}`
                  : `1px solid ${isLincoln ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)'}`,
                background: isEquipped
                  ? (isLincoln ? 'rgba(126,252,32,0.1)' : 'rgba(232,160,191,0.1)')
                  : 'transparent',
                cursor: isUnlocked ? 'pointer' : 'default',
                opacity: isUnlocked ? 1 : 0.4,
                transition: 'all 0.2s ease',
                position: 'relative',
                '&:hover': isUnlocked ? {
                  transform: 'translateY(-1px)',
                  background: isLincoln ? 'rgba(126,252,32,0.08)' : 'rgba(232,160,191,0.08)',
                } : {},
                '&:active': isUnlocked ? { transform: 'scale(0.95)' } : {},
              }}
            >
              {/* Icon */}
              <Box sx={{ fontSize: '22px', filter: isUnlocked ? 'none' : 'grayscale(1)' }}>
                {accessory.icon}
              </Box>

              {/* Name */}
              <Typography
                sx={{
                  fontFamily: isLincoln ? '"Press Start 2P", monospace' : '"Fredoka", cursive',
                  fontSize: isLincoln ? '0.2rem' : '9px',
                  color: isEquipped
                    ? accentColor
                    : (isLincoln ? 'rgba(255,255,255,0.5)' : 'rgba(0,0,0,0.45)'),
                  textAlign: 'center',
                  lineHeight: 1.2,
                }}
              >
                {accessory.name}
              </Typography>

              {/* Status */}
              {!isUnlocked && (
                <Typography
                  sx={{
                    fontFamily: isLincoln ? '"Press Start 2P", monospace' : '"Fredoka", cursive',
                    fontSize: isLincoln ? '0.16rem' : '8px',
                    color: isLincoln ? 'rgba(255,255,255,0.3)' : 'rgba(0,0,0,0.25)',
                  }}
                >
                  {xpAway} XP
                </Typography>
              )}

              {isEquipped && isConflicted && (
                <Typography
                  sx={{
                    fontFamily: isLincoln ? '"Press Start 2P", monospace' : '"Fredoka", cursive',
                    fontSize: isLincoln ? '0.14rem' : '7px',
                    color: '#ff9800',
                  }}
                >
                  hidden
                </Typography>
              )}

              {isUnlocked && !isEquipped && slotConflict && (
                <Typography
                  sx={{
                    fontFamily: isLincoln ? '"Press Start 2P", monospace' : '"Fredoka", cursive',
                    fontSize: isLincoln ? '0.14rem' : '7px',
                    color: isLincoln ? 'rgba(255,255,255,0.3)' : 'rgba(0,0,0,0.25)',
                  }}
                >
                  swap
                </Typography>
              )}

              {/* Equipped check */}
              {isEquipped && !isConflicted && (
                <Box
                  sx={{
                    position: 'absolute',
                    top: -4,
                    right: -4,
                    width: 14,
                    height: 14,
                    borderRadius: '50%',
                    bgcolor: '#4caf50',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: 8,
                    color: '#fff',
                    fontWeight: 700,
                  }}
                >
                  ✓
                </Box>
              )}

              {/* Lock icon */}
              {!isUnlocked && (
                <Box
                  sx={{
                    position: 'absolute',
                    top: -2,
                    right: -2,
                    fontSize: 10,
                  }}
                >
                  🔒
                </Box>
              )}
            </Box>
          )
        })}
      </Box>
    </Box>
  )
}
