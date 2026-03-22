// Avatar module barrel exports — for cross-app usage

export { buildCharacter, applyFeatures } from './voxel/buildCharacter'
export { buildArmorPiece, VOXEL_ARMOR_PIECES, XP_THRESHOLDS, ARMOR_PIECE_COLORS } from './voxel/buildArmorPiece'
export type { ArmorPieceMeta } from './voxel/buildArmorPiece'
export {
  calculateTier,
  applyTierToArmor,
  animateTierUpgrade,
  getTierBadgeColor,
  getTierTextColor,
  TIERS,
  TIER_MATERIALS,
} from './voxel/tierMaterials'
export type { TierDefinition, TierMaterials } from './voxel/tierMaterials'
export { animateEquip, animateUnequip } from './voxel/equipAnimation'
export { frameCameraToCharacter } from './voxel/cameraUtils'
export { default as AvatarThumbnail } from './AvatarThumbnail'
export { default as VoxelCharacter } from './VoxelCharacter'
