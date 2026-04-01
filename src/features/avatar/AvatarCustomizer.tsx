import Box from '@mui/material/Box'

import type {
  ArmorPiece,
  AvatarProfile,
  CharacterProportions,
  HelmetCrest,
  ShieldEmblem,
  VoxelArmorPieceId,
} from '../../core/types'
import type { AccessoryId } from '../../core/types'
import SectionErrorBoundary from '../../components/SectionErrorBoundary'
import OutfitCustomizer from './OutfitCustomizer'
import ArmorDyePanel from './ArmorDyePanel'
import AccessoriesPanel from './AccessoriesPanel'
import ShieldEmblemPicker from './ShieldEmblemPicker'
import HelmetCrestPicker from './HelmetCrestPicker'
import MinecraftSkinExport from './MinecraftSkinExport'
import AvatarPhotoUpload from './AvatarPhotoUpload'
import CharacterTunerPanel from './CharacterTunerPanel'

interface AvatarCustomizerProps {
  profile: AvatarProfile
  familyId: string
  childId: string
  childName: string | undefined
  isLincoln: boolean
  ageGroup: 'older' | 'younger'
  appliedPieces: ArmorPiece[]
  unlockedVoxel: VoxelArmorPieceId[]
  appliedVoxel: string[]
  currentTierName: string
  accentColor: string
  textColor: string
  onOutfitColorChange: (slot: 'shirt' | 'pants' | 'shoes', hex: string) => void
  onArmorDyeChange: (pieceId: VoxelArmorPieceId, hex: string) => void
  onArmorDyeReset: () => void
  onEmblemChange: (emblem: ShieldEmblem) => void
  onCrestChange: (crest: HelmetCrest) => void
  onAccessoryToggle: (accessoryId: AccessoryId) => void
  // Character tuner
  tunerOpen: boolean
  tunerProportions: CharacterProportions
  tunerOutfitColors: { shirtColor: string; pantsColor: string; shoeColor: string; capeColor: string }
  onTunerProportionsChange: (proportions: CharacterProportions) => void
  onTunerCapeColorChange: (hex: string) => void
  onTunerDone: () => void
  onTunerReset: () => void
}

export default function AvatarCustomizer({
  profile,
  familyId,
  childId,
  childName,
  isLincoln,
  ageGroup,
  appliedPieces,
  unlockedVoxel,
  appliedVoxel,
  currentTierName,
  accentColor,
  textColor,
  onOutfitColorChange,
  onArmorDyeChange,
  onArmorDyeReset,
  onEmblemChange,
  onCrestChange,
  onAccessoryToggle,
  tunerOpen,
  tunerProportions,
  tunerOutfitColors,
  onTunerProportionsChange,
  onTunerCapeColorChange,
  onTunerDone,
  onTunerReset,
}: AvatarCustomizerProps) {
  return (
    <SectionErrorBoundary section="customizer">
      {/* ── Character Tuner Panel ─────────────────────────────── */}
      {tunerOpen && (
        <CharacterTunerPanel
          proportions={tunerProportions}
          isLincoln={isLincoln}
          outfitColors={tunerOutfitColors}
          onProportionsChange={onTunerProportionsChange}
          onOutfitColorChange={onOutfitColorChange}
          onCapeColorChange={onTunerCapeColorChange}
          onDone={onTunerDone}
          onReset={onTunerReset}
        />
      )}

      {/* ── Shield Emblem & Helmet Crest Pickers ──────────────── */}
      {(appliedPieces.includes('shield_of_faith' as ArmorPiece) || appliedPieces.includes('helmet_of_salvation' as ArmorPiece)) && (
        <Box sx={{ display: 'flex', gap: 1.5, mt: 1, mx: 2, flexWrap: 'wrap' }}>
          {appliedPieces.includes('shield_of_faith' as ArmorPiece) && (
            <ShieldEmblemPicker
              currentEmblem={profile.customization?.shieldEmblem}
              isIronOrAbove={!['WOOD', 'STONE'].includes(currentTierName)}
              isLincoln={isLincoln}
              onSelect={(emblem) => void onEmblemChange(emblem)}
            />
          )}
          {appliedPieces.includes('helmet_of_salvation' as ArmorPiece) && (
            <HelmetCrestPicker
              currentCrest={profile.customization?.helmetCrest}
              isIronOrAbove={!['WOOD', 'STONE'].includes(currentTierName)}
              isLincoln={isLincoln}
              onSelect={(crest) => void onCrestChange(crest)}
            />
          )}
        </Box>
      )}

      {/* ── Outfit Customizer ─────────────────────────────────── */}
      <OutfitCustomizer
        customization={profile.customization}
        ageGroup={ageGroup}
        onColorChange={(slot, hex) => void onOutfitColorChange(slot, hex)}
      />

      {/* ── Armor Dye Panel ──────────────────────────────────── */}
      <ArmorDyePanel
        armorColors={profile.customization?.armorColors}
        unlockedPieces={unlockedVoxel}
        tierName={currentTierName}
        isStoneOrAbove={currentTierName !== 'WOOD'}
        isLincoln={isLincoln}
        onColorChange={(pieceId, hex) => void onArmorDyeChange(pieceId, hex)}
        onReset={() => void onArmorDyeReset()}
      />

      {/* ── Accessories Panel ──────────────────────────────────── */}
      <AccessoriesPanel
        totalXp={profile.totalXp}
        equippedAccessories={profile.customization?.accessories ?? []}
        equippedArmor={appliedVoxel}
        isLincoln={isLincoln}
        onToggle={(accId) => void onAccessoryToggle(accId)}
      />

      {/* ── Minecraft Skin Export ─────────────────────────────── */}
      <Box sx={{ mt: 2, mx: 1 }}>
        <MinecraftSkinExport
          profile={profile}
          childName={childName ?? 'avatar'}
          tierName={currentTierName}
          isLincoln={isLincoln}
        />
      </Box>

      {/* ── Photo Upload Section ──────────────────────────────── */}
      <AvatarPhotoUpload
        profile={profile}
        familyId={familyId}
        childId={childId}
        isLincoln={isLincoln}
        accentColor={accentColor}
        textColor={textColor}
      />
    </SectionErrorBoundary>
  )
}
