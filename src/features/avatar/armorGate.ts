/**
 * Backward-compatible armor gate API.
 *
 * All logic now delegates to `armorStatus.ts` — the single source of truth.
 * This file exists only to avoid mass-renaming imports across the codebase;
 * new code should import from `./armorStatus` directly.
 */
import type { ArmorPiece, AvatarProfile, DailyArmorSession, VoxelArmorPieceId } from '../../core/types'
import { getDailyArmorStatus, getDailyArmorStatusFromSession, getAllForgedSlots } from './armorStatus'

export interface ArmorGateStatus {
  complete: boolean
  equipped: number
  total: number
  missing: VoxelArmorPieceId[]
  hasForgedPieces: boolean
}

function toGateStatus(s: ReturnType<typeof getDailyArmorStatus>): ArmorGateStatus {
  return {
    complete: s.isSuitedUp,
    equipped: s.equippedCount,
    total: s.gateTotal,
    missing: s.missing,
    hasForgedPieces: s.hasForgedPieces,
  }
}

/**
 * All forged piece slots across tiers ≤ active forge tier.
 * Used by suitUpAll to equip all forged pieces on the 3D model.
 */
export function getForgedVoxelPieces(profile: AvatarProfile): VoxelArmorPieceId[] {
  return getAllForgedSlots(profile)
}

export function getArmorGateStatus(
  profile: AvatarProfile,
  appliedPiecesToday?: ArmorPiece[],
): ArmorGateStatus {
  return toGateStatus(getDailyArmorStatus(profile, appliedPiecesToday))
}

export function isArmorComplete(profile: AvatarProfile, appliedPiecesToday?: ArmorPiece[]): boolean {
  return getDailyArmorStatus(profile, appliedPiecesToday).isSuitedUp
}

export function getArmorGateStatusFromSession(
  profile: AvatarProfile,
  session: Pick<DailyArmorSession, 'appliedPieces'> | null | undefined,
): ArmorGateStatus {
  return toGateStatus(getDailyArmorStatusFromSession(profile, session))
}
