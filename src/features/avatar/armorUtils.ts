import type { ArmorPiece, AvatarProfile } from '../../core/types'

// ── Overlay positions ─────────────────────────────────────────────
// Approximate % positions of each piece over the full-body character image.

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
  helmet_of_salvation:          { top: '5%',  left: '50%', transform: 'translateX(-50%)', width: '38%' },
  breastplate_of_righteousness: { top: '30%', left: '50%', transform: 'translateX(-50%)', width: '42%' },
  belt_of_truth:                { top: '52%', left: '50%', transform: 'translateX(-50%)', width: '38%' },
  shield_of_faith:              { top: '42%', left: '4%',  width: '28%' },
  sword_of_the_spirit:          { top: '42%', right: '4%', width: '24%' },
  shoes_of_peace:               { top: '87%', left: '50%', transform: 'translateX(-50%)', width: '48%' },
}

// ── Helpers ───────────────────────────────────────────────────────

/** Check if a piece has been unlocked at any tier. */
export function isPieceEarned(profile: AvatarProfile, pieceId: ArmorPiece): boolean {
  const entry = profile.pieces.find((p) => p.pieceId === pieceId)
  if (!entry) return false
  if (profile.themeStyle === 'minecraft') return entry.unlockedTiers.length > 0
  return (entry.unlockedTiersPlatformer ?? []).length > 0
}
