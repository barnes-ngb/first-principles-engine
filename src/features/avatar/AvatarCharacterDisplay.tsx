import type { RefObject } from 'react'
import Box from '@mui/material/Box'
import PhotoCameraIcon from '@mui/icons-material/PhotoCamera'

import EditIcon from '@mui/icons-material/Edit'

import type { AvatarProfile, AvatarBackground, CharacterProportions, Child } from '../../core/types'
import { LINCOLN_FEATURES, LONDON_FEATURES } from '../../core/types'
import type { CharacterFeatures } from '../../core/types'
import type { VoxelCharacterHandle } from './VoxelCharacter'
import VoxelCharacter from './VoxelCharacter'
import BrothersVoxelScene from './BrothersVoxelScene'
import PoseButtons from './PoseButtons'

interface AvatarCharacterDisplayProps {
  profile: AvatarProfile
  isLincoln: boolean
  childId: string
  children: Child[]
  siblingProfile: AvatarProfile | null
  features: CharacterFeatures
  ageGroup: 'older' | 'younger'
  appliedVoxel: string[]
  brothersMode: boolean
  onBrothersModeToggle: () => void
  bgMode: AvatarBackground
  onBgToggle: () => void
  activePoseId: string | null
  onPoseChange: (poseId: string | null) => void
  voxelRef: RefObject<VoxelCharacterHandle | null>
  flashContainerRef: RefObject<HTMLDivElement | null>
  onCapture: () => void
  accentColor: string
  // VoxelCharacter-specific callbacks
  animateEquipId: string | null
  animateUnequipId: string | null
  onEquipAnimDone: () => void
  onUnequipAnimDone: () => void
  onTierUpStart: () => void
  onTierUp: (oldTier: string, newTier: string) => Promise<void>
  // Character tuner
  proportions?: Partial<CharacterProportions>
  onEditCharacter: () => void
  tunerOpen: boolean
}

export default function AvatarCharacterDisplay({
  profile,
  isLincoln,
  childId,
  children: childrenList,
  siblingProfile,
  features,
  ageGroup,
  appliedVoxel,
  brothersMode,
  onBrothersModeToggle,
  bgMode,
  onBgToggle,
  activePoseId,
  onPoseChange,
  voxelRef,
  flashContainerRef,
  onCapture,
  accentColor,
  animateEquipId,
  animateUnequipId,
  onEquipAnimDone,
  onUnequipAnimDone,
  onTierUpStart,
  onTierUp,
  proportions,
  onEditCharacter,
  tunerOpen,
}: AvatarCharacterDisplayProps) {
  return (
    <>
      {/* ── Brothers Toggle ────── */}
      {childrenList.length > 1 && (
        <Box sx={{ display: 'flex', justifyContent: 'center', mb: 1.5 }}>
          <Box
            component="button"
            onClick={onBrothersModeToggle}
            sx={{
              px: '16px',
              py: '8px',
              border: brothersMode
                ? `2px solid ${accentColor}`
                : `1.5px solid ${isLincoln ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.08)'}`,
              borderRadius: isLincoln ? '6px' : '18px',
              background: brothersMode
                ? (isLincoln ? 'rgba(126,252,32,0.12)' : 'rgba(232,160,191,0.12)')
                : 'transparent',
              color: brothersMode
                ? accentColor
                : (isLincoln ? 'rgba(255,255,255,0.5)' : 'rgba(0,0,0,0.4)'),
              fontFamily: isLincoln ? '"Press Start 2P", monospace' : '"Fredoka", cursive',
              fontSize: isLincoln ? '12px' : '14px',
              fontWeight: brothersMode ? 700 : 400,
              cursor: 'pointer',
              transition: 'all 0.2s ease',
              boxShadow: brothersMode ? `0 0 10px ${accentColor}22` : 'none',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              '&:hover': {
                borderColor: accentColor,
                background: isLincoln ? 'rgba(126,252,32,0.06)' : 'rgba(232,160,191,0.06)',
              },
              '&:active': { transform: 'scale(0.96)' },
            }}
          >
            <span style={{ fontSize: '16px' }}>👬</span>
            Brothers
          </Box>
        </Box>
      )}

      {/* ── Background Toggle ────── */}
      <Box sx={{ display: 'flex', justifyContent: 'center', mb: 1.5 }}>
        <Box
          component="button"
          onClick={onBgToggle}
          sx={{
            px: '16px',
            py: '8px',
            border: bgMode === 'room'
              ? `2px solid ${accentColor}`
              : `1.5px solid ${isLincoln ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.08)'}`,
            borderRadius: isLincoln ? '6px' : '18px',
            background: bgMode === 'room'
              ? (isLincoln ? 'rgba(126,252,32,0.12)' : 'rgba(232,160,191,0.12)')
              : 'transparent',
            color: bgMode === 'room'
              ? accentColor
              : (isLincoln ? 'rgba(255,255,255,0.5)' : 'rgba(0,0,0,0.4)'),
            fontFamily: isLincoln ? '"Press Start 2P", monospace' : '"Fredoka", cursive',
            fontSize: isLincoln ? '12px' : '14px',
            fontWeight: bgMode === 'room' ? 700 : 400,
            cursor: 'pointer',
            transition: 'all 0.2s ease',
            boxShadow: bgMode === 'room' ? `0 0 10px ${accentColor}22` : 'none',
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            '&:hover': {
              borderColor: accentColor,
              background: isLincoln ? 'rgba(126,252,32,0.06)' : 'rgba(232,160,191,0.06)',
            },
            '&:active': { transform: 'scale(0.96)' },
          }}
        >
          <span style={{ fontSize: '16px' }}>{bgMode === 'room' ? '\uD83C\uDFE0' : '\uD83C\uDF19'}</span>
          {bgMode === 'room' ? 'Room' : 'Night'}
        </Box>
      </Box>

      {/* ── 3D Character Display ─────────────────────────────── */}
      {brothersMode && childrenList.length > 1 ? (
        <Box
          sx={{
            mb: 1,
            mx: 1,
            position: 'relative',
            borderRadius: isLincoln ? '8px' : '20px',
            background: isLincoln
              ? 'radial-gradient(ellipse at 50% 60%, rgba(126,252,32,0.06) 0%, rgba(13,17,23,0) 70%)'
              : 'radial-gradient(ellipse at 50% 60%, rgba(232,160,191,0.08) 0%, rgba(250,245,239,0) 70%)',
            border: `1px solid ${isLincoln ? 'rgba(126,252,32,0.08)' : 'rgba(232,160,191,0.12)'}`,
            overflow: 'hidden',
          }}
        >
          <BrothersVoxelScene
            lincoln={(() => {
              const lincolnChild = childrenList.find((c) => c.name.toLowerCase() === 'lincoln')
              if (!lincolnChild) return null
              const isActive = lincolnChild.id === childId
              const p = isActive ? profile : siblingProfile
              if (!p) return null
              return {
                name: lincolnChild.name,
                profile: p,
                features: p.characterFeatures ?? LINCOLN_FEATURES,
                ageGroup: p.ageGroup ?? 'older',
                equippedPieces: isActive ? appliedVoxel : (p.equippedPieces ?? []),
                totalXp: p.totalXp,
              }
            })()}
            london={(() => {
              const londonChild = childrenList.find((c) => c.name.toLowerCase() === 'london')
              if (!londonChild) return null
              const isActive = londonChild.id === childId
              const p = isActive ? profile : siblingProfile
              if (!p) return null
              return {
                name: londonChild.name,
                profile: p,
                features: p.characterFeatures ?? LONDON_FEATURES,
                ageGroup: p.ageGroup ?? 'younger',
                equippedPieces: isActive ? appliedVoxel : (p.equippedPieces ?? []),
                totalXp: p.totalXp,
              }
            })()}
            activePoseId={activePoseId}
            onPoseComplete={() => onPoseChange(null)}
            background={bgMode}
          />
          <PoseButtons
            onPose={(poseId) => onPoseChange(poseId)}
            currentPose={activePoseId}
            isLincoln={isLincoln}
          />
        </Box>
      ) : (
        <Box
          ref={flashContainerRef}
          sx={{
            mb: 1,
            mx: 1,
            position: 'relative',
            borderRadius: isLincoln ? '8px' : '20px',
            background: isLincoln
              ? 'radial-gradient(ellipse at 50% 60%, rgba(126,252,32,0.06) 0%, rgba(13,17,23,0) 70%)'
              : 'radial-gradient(ellipse at 50% 60%, rgba(232,160,191,0.08) 0%, rgba(250,245,239,0) 70%)',
            border: `1px solid ${isLincoln ? 'rgba(126,252,32,0.08)' : 'rgba(232,160,191,0.12)'}`,
            overflow: 'hidden',
            '@keyframes flashFade': {
              '0%': { opacity: 1 },
              '100%': { opacity: 0 },
            },
          }}
        >
          <VoxelCharacter
            ref={voxelRef}
            features={features}
            ageGroup={ageGroup}
            equippedPieces={appliedVoxel}
            totalXp={profile.totalXp}
            animateEquipPiece={animateEquipId}
            animateUnequipPiece={animateUnequipId}
            onEquipAnimDone={onEquipAnimDone}
            onUnequipAnimDone={onUnequipAnimDone}
            photoUrl={profile.photoUrl}
            customization={profile.customization}
            background={bgMode}
            activePoseId={activePoseId}
            onPoseComplete={() => onPoseChange(null)}
            onSwipePose={(poseId) => onPoseChange(poseId)}
            accessories={profile.customization?.accessories}
            onTierUpStart={onTierUpStart}
            onTierUp={onTierUp}
            proportions={proportions}
          />
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0 }}>
            <Box sx={{ flex: 1 }}>
              <PoseButtons
                onPose={(poseId) => onPoseChange(poseId)}
                currentPose={activePoseId}
                isLincoln={isLincoln}
                poseAnimating={!!activePoseId && activePoseId !== 'idle'}
              />
            </Box>
            <Box
              component="button"
              onClick={onEditCharacter}
              sx={{
                width: 44,
                height: 44,
                borderRadius: isLincoln ? '8px' : '50%',
                border: tunerOpen
                  ? `2px solid ${accentColor}`
                  : `1.5px solid ${isLincoln ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.08)'}`,
                background: tunerOpen
                  ? (isLincoln ? 'rgba(126,252,32,0.12)' : 'rgba(232,160,191,0.12)')
                  : (isLincoln ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.02)'),
                color: tunerOpen
                  ? accentColor
                  : (isLincoln ? 'rgba(255,255,255,0.6)' : 'rgba(0,0,0,0.45)'),
                cursor: 'pointer',
                transition: 'all 0.2s ease',
                outline: 'none',
                p: 0,
                mr: 0.5,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
                '&:hover': {
                  background: isLincoln ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.04)',
                  borderColor: isLincoln ? 'rgba(255,255,255,0.2)' : 'rgba(0,0,0,0.12)',
                  transform: 'translateY(-1px)',
                },
                '&:active': { transform: 'scale(0.92)' },
              }}
              title="Edit Character"
            >
              <EditIcon sx={{ fontSize: 20 }} />
            </Box>
            <Box
              component="button"
              onClick={onCapture}
              sx={{
                width: 44,
                height: 44,
                borderRadius: isLincoln ? '8px' : '50%',
                border: `1.5px solid ${isLincoln ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.08)'}`,
                background: isLincoln ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.02)',
                color: isLincoln ? 'rgba(255,255,255,0.6)' : 'rgba(0,0,0,0.45)',
                cursor: 'pointer',
                transition: 'all 0.2s ease',
                outline: 'none',
                p: 0,
                mr: 1,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
                '&:hover': {
                  background: isLincoln ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.04)',
                  borderColor: isLincoln ? 'rgba(255,255,255,0.2)' : 'rgba(0,0,0,0.12)',
                  transform: 'translateY(-1px)',
                },
                '&:active': { transform: 'scale(0.92)' },
              }}
              title="Screenshot"
            >
              <PhotoCameraIcon sx={{ fontSize: 20 }} />
            </Box>
          </Box>
        </Box>
      )}
    </>
  )
}
