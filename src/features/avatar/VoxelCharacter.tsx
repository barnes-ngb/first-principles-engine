import { useEffect, useRef, useCallback } from 'react'
import * as THREE from 'three'
import Box from '@mui/material/Box'

import type { CharacterFeatures, VoxelArmorPieceId } from '../../core/types'
import { DEFAULT_CHARACTER_FEATURES } from '../../core/types'
import { XP_THRESHOLDS } from './voxel/buildArmorPiece'
import { buildCharacter } from './voxel/buildCharacter'
import { buildArmorPiece, VOXEL_ARMOR_PIECES } from './voxel/buildArmorPiece'
import { animateEquip, animateUnequip, animateJump, animateNod, animateSwordFlourish, animateHipTurn, animateTorsoPuff } from './voxel/equipAnimation'
import { createTouchControls, updateRotation } from './voxel/touchControls'
import type { TouchControlState } from './voxel/touchControls'
import { applyTierToArmor, calculateTier, animateTierUpgrade } from './voxel/tierMaterials'

interface VoxelCharacterProps {
  features: CharacterFeatures | undefined
  ageGroup: 'older' | 'younger'
  equippedPieces: string[]
  totalXp?: number
  /** Piece to animate equipping (triggers scale-in animation) */
  animateEquipPiece?: string | null
  /** Piece to animate unequipping */
  animateUnequipPiece?: string | null
  onEquipAnimDone?: () => void
  onUnequipAnimDone?: () => void
  height?: string | number
}

// ── Pose system ──────────────────────────────────────────────────────

interface CharacterPose {
  armLRotZ: number
  armRRotZ: number
  armLRotX: number
  armRRotX: number
}

const POSE_DEFAULT: CharacterPose = { armLRotZ: 0, armRRotZ: 0, armLRotX: 0, armRRotX: 0 }

function calculatePose(equipped: string[]): CharacterPose {
  const pose = { ...POSE_DEFAULT }
  if (equipped.includes('sword')) {
    pose.armRRotZ = -0.5   // Angled outward ~30°
    pose.armRRotX = -0.2   // Slightly forward
  }
  if (equipped.includes('shield')) {
    pose.armLRotZ = 0.4    // Angled outward
    pose.armLRotX = 0.3    // Forward (shield faces front)
  }
  return pose
}

// ── Enforce solid opacity on equipped armor ──────────────────────────

function enforceArmorOpacity(
  armorMeshes: Map<VoxelArmorPieceId, THREE.Group>,
  equipped: string[],
) {
  for (const pieceId of equipped) {
    const mesh = armorMeshes.get(pieceId as VoxelArmorPieceId)
    if (!mesh) continue
    mesh.visible = true
    mesh.traverse((child) => {
      if (child instanceof THREE.Mesh && child.material) {
        const mats = Array.isArray(child.material) ? child.material : [child.material]
        for (const mat of mats) {
          if (mat instanceof THREE.MeshLambertMaterial && (mat.transparent || mat.opacity < 1)) {
            mat.transparent = false
            mat.opacity = 1.0
            mat.depthWrite = true
            mat.needsUpdate = true
          }
        }
      }
    })
  }
}

/** Build a Minecraft-block-style platform at the character's feet */
function buildPlatform(ageGroup: 'older' | 'younger'): THREE.Group {
  const scale = ageGroup === 'younger' ? 0.88 : 1.0
  const U = 0.125 * scale
  const blockSize = U * 8 // One Minecraft block = 8 pixels
  const platform = new THREE.Group()
  platform.name = 'platform'

  for (let x = -1; x <= 1; x++) {
    for (let z = -1; z <= 0; z++) {
      const block = new THREE.Group()

      // Main block body (slightly darker)
      const sideColor = new THREE.Color(0x555555).multiplyScalar(0.7 + Math.random() * 0.15)
      const mainGeo = new THREE.BoxGeometry(
        blockSize * 0.98,
        blockSize * 0.98,
        blockSize * 0.98,
      )
      const mainMats: THREE.MeshLambertMaterial[] = []
      for (let i = 0; i < 6; i++) {
        const variation = 0.9 + Math.random() * 0.2
        mainMats.push(
          new THREE.MeshLambertMaterial({
            color: sideColor.clone().multiplyScalar(variation),
          }),
        )
      }
      const main = new THREE.Mesh(mainGeo, mainMats)
      block.add(main)

      // Slightly lighter top face
      const topGeo = new THREE.BoxGeometry(
        blockSize * 0.98,
        blockSize * 0.1,
        blockSize * 0.98,
      )
      const topMat = new THREE.MeshLambertMaterial({
        color: sideColor.clone().multiplyScalar(1.3),
      })
      const top = new THREE.Mesh(topGeo, topMat)
      top.position.y = blockSize * 0.45
      block.add(top)

      block.position.set(
        x * blockSize,
        -blockSize * 0.5, // Below Y=0 (character feet)
        z * blockSize + blockSize * 0.3,
      )
      platform.add(block)
    }
  }

  return platform
}

/** Add subtle background star particles */
function addBackgroundParticles(scene: THREE.Scene): THREE.Points {
  const particleCount = 30
  const geo = new THREE.BufferGeometry()
  const positions = new Float32Array(particleCount * 3)

  for (let i = 0; i < particleCount; i++) {
    positions[i * 3] = (Math.random() - 0.5) * 15
    positions[i * 3 + 1] = Math.random() * 8 - 1
    positions[i * 3 + 2] = -3 - Math.random() * 5
  }

  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3))
  const mat = new THREE.PointsMaterial({
    color: 0x88aaff,
    size: 0.04,
    transparent: true,
    opacity: 0.4,
  })
  const points = new THREE.Points(geo, mat)
  scene.add(points)
  return points
}

export default function VoxelCharacter({
  features,
  ageGroup,
  equippedPieces,
  totalXp = 0,
  animateEquipPiece,
  animateUnequipPiece,
  onEquipAnimDone,
  onUnequipAnimDone,
}: VoxelCharacterProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null)
  const sceneRef = useRef<THREE.Scene | null>(null)
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null)
  const characterRef = useRef<THREE.Group | null>(null)
  const armorGroupsRef = useRef<Map<VoxelArmorPieceId, THREE.Group>>(new Map())
  const controlsRef = useRef<TouchControlState | null>(null)
  const rafRef = useRef<number>(0)
  const prevEquippedRef = useRef<Set<string>>(new Set())
  const prevTierRef = useRef<string | null>(null)
  const poseRef = useRef<((pieces: string[]) => void) | null>(null)
  const equippedRef = useRef<string[]>([])

  const resolvedFeatures = features ?? DEFAULT_CHARACTER_FEATURES
  const currentTier = calculateTier(totalXp)

  // Keep ref in sync so animation loop always has current equipped list
  equippedRef.current = equippedPieces

  // ── Initialize scene ────────────────────────────────────────────
  const initScene = useCallback(() => {
    const container = containerRef.current
    if (!container) return

    // Clean up old renderer
    if (rendererRef.current) {
      rendererRef.current.dispose()
      const oldCanvas = container.querySelector('canvas')
      if (oldCanvas) container.removeChild(oldCanvas)
    }

    const width = container.clientWidth
    const height = container.clientHeight

    // Scene — dark with slight blue tint
    const scene = new THREE.Scene()
    scene.background = new THREE.Color(0x111122)
    sceneRef.current = scene

    // Background particles (stars)
    addBackgroundParticles(scene)

    // Camera — framing the taller Steve-proportioned character
    // Character is ~4U tall = 4 * 0.125 = 0.5 units at scale 1.0
    // But it's built in pixel units, total height ~32U * 0.125 = 4.0
    const camera = new THREE.PerspectiveCamera(35, width / height, 0.1, 100)
    camera.position.set(0, 2.2, 10.5)
    camera.lookAt(0, 1.8, 0)
    cameraRef.current = camera

    // ── Three-point lighting ──────────────────────────────────────
    // Key light — warm, from upper right
    const keyLight = new THREE.DirectionalLight(0xfff5e6, 0.9)
    keyLight.position.set(4, 6, 5)
    scene.add(keyLight)

    // Fill light — cool, from left (prevents harsh shadows)
    const fillLight = new THREE.DirectionalLight(0xe6f0ff, 0.4)
    fillLight.position.set(-3, 3, 2)
    scene.add(fillLight)

    // Rim light — from behind for edge definition
    const rimLight = new THREE.DirectionalLight(0x8888ff, 0.3)
    rimLight.position.set(0, 4, -4)
    scene.add(rimLight)

    // Ambient — low so directional lights create depth
    const ambient = new THREE.AmbientLight(0xffffff, 0.35)
    scene.add(ambient)

    // Build character
    const character = buildCharacter(resolvedFeatures, ageGroup)
    characterRef.current = character
    scene.add(character)

    // Build armor pieces — sword/shield attach to arms, breastplate arm covers attach to arms
    armorGroupsRef.current.clear()
    const armL = character.getObjectByName('armL')
    const armR = character.getObjectByName('armR')

    for (const pieceMeta of VOXEL_ARMOR_PIECES) {
      const pieceGroup = buildArmorPiece(pieceMeta.id, ageGroup)
      armorGroupsRef.current.set(pieceMeta.id, pieceGroup)

      const attachTo = pieceGroup.userData.attachToArm as string | undefined
      if (attachTo === 'R') {
        if (armR) armR.add(pieceGroup)
        else character.add(pieceGroup)
      } else if (attachTo === 'L') {
        if (armL) armL.add(pieceGroup)
        else character.add(pieceGroup)
      } else {
        // For breastplate, move arm-cover children to their respective arms
        const armChildren: THREE.Object3D[] = []
        pieceGroup.traverse((child) => {
          if (child.userData.attachToArm) armChildren.push(child)
        })
        for (const child of armChildren) {
          pieceGroup.remove(child)
          const targetArm = child.userData.attachToArm === 'L' ? armL : armR
          if (targetArm) targetArm.add(child)
          else character.add(child)
        }
        character.add(pieceGroup)
      }
    }

    // Set initial visibility — equipped solid, unlocked translucent, locked ghost
    for (const [pieceId, group] of armorGroupsRef.current) {
      const isEquipped = equippedPieces.includes(pieceId)
      const isUnlocked = totalXp >= XP_THRESHOLDS[pieceId]

      group.visible = true
      if (isEquipped) {
        group.scale.set(1, 1, 1)
        // Tier materials will be applied below after all pieces are processed
      } else if (isUnlocked) {
        group.scale.set(1, 1, 1)
        group.traverse((child) => {
          if (child instanceof THREE.Mesh) {
            const mat = Array.isArray(child.material) ? child.material : [child.material]
            for (const m of mat) {
              if (m instanceof THREE.MeshLambertMaterial) {
                m.transparent = true
                m.opacity = 0.3
                m.depthWrite = false
              }
            }
          }
        })
      } else {
        // Locked — ghost with blue tint + glow so kids can see what they're working toward
        group.scale.set(1, 1, 1)
        group.traverse((child) => {
          if (child instanceof THREE.Mesh) {
            const materials = Array.isArray(child.material) ? child.material : [child.material]
            const baseHex = materials[0] instanceof THREE.MeshLambertMaterial
              ? materials[0].color?.getHex() ?? 0x888888
              : 0x888888
            const base = new THREE.Color(baseHex)
            const ghost = new THREE.Color(0x8888cc)
            base.lerp(ghost, 0.5)
            const ghostMat = new THREE.MeshLambertMaterial({
              color: base,
              transparent: true,
              opacity: 0.25,
              depthWrite: false,
              emissive: new THREE.Color(0x334466),
              emissiveIntensity: 0.3,
            })
            child.material = ghostMat
          }
        })
      }
    }
    // Apply tier-based materials to all equipped pieces
    applyTierToArmor(armorGroupsRef.current, currentTier, equippedPieces)
    prevEquippedRef.current = new Set(equippedPieces)
    prevTierRef.current = currentTier

    // Platform — at character feet level (Y=0), added to scene (not character)
    const platform = buildPlatform(ageGroup)
    platform.position.y = character.position.y
    scene.add(platform)

    // Renderer
    const renderer = new THREE.WebGLRenderer({ antialias: true })
    renderer.setSize(width, height)
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    container.appendChild(renderer.domElement)
    rendererRef.current = renderer

    // Touch controls
    controlsRef.current = createTouchControls(renderer.domElement)

    // Animation loop
    const clock = new THREE.Clock()
    const baseY = character.position.y

    // Pose state for smooth transitions
    const currentPose: CharacterPose = { ...POSE_DEFAULT }
    let targetPose = calculatePose(equippedPieces)

    // Store targetPose updater on a ref so equip effects can change it
    poseRef.current = (pieces: string[]) => { targetPose = calculatePose(pieces) }
    // Initialize pose immediately
    poseRef.current(equippedPieces)

    function animate() {
      rafRef.current = requestAnimationFrame(animate)

      if (controlsRef.current && characterRef.current) {
        updateRotation(characterRef.current, controlsRef.current)
      }

      // Enforce solid opacity on equipped armor every frame (use ref for current value)
      enforceArmorOpacity(armorGroupsRef.current, equippedRef.current)

      // Idle animation — gentle bob + pose-aware arm movement
      if (characterRef.current) {
        const dt = clock.getDelta()
        const time = clock.getElapsedTime()
        // Gentle bob
        characterRef.current.position.y = baseY + Math.sin(time * 1.2) * 0.03

        // Lerp toward target pose
        const lerpSpeed = Math.min(3.0 * dt, 1)
        currentPose.armLRotZ += (targetPose.armLRotZ - currentPose.armLRotZ) * lerpSpeed
        currentPose.armRRotZ += (targetPose.armRRotZ - currentPose.armRRotZ) * lerpSpeed
        currentPose.armLRotX += (targetPose.armLRotX - currentPose.armLRotX) * lerpSpeed
        currentPose.armRRotX += (targetPose.armRRotX - currentPose.armRRotX) * lerpSpeed

        // Apply pose + idle sway to arms (sleeves are children, move automatically)
        const armL = characterRef.current.getObjectByName('armL')
        const armR = characterRef.current.getObjectByName('armR')
        const idleSway = Math.sin(time * 0.7) * 0.03

        if (armL) {
          armL.rotation.z = currentPose.armLRotZ + idleSway
          armL.rotation.x = currentPose.armLRotX + Math.sin(time * 0.8) * 0.05
        }
        if (armR) {
          armR.rotation.z = currentPose.armRRotZ - idleSway
          armR.rotation.x = currentPose.armRRotX - Math.sin(time * 0.8) * 0.05
        }
      }

      renderer.render(scene, camera)
    }
    animate()
  }, [resolvedFeatures, ageGroup, equippedPieces, totalXp, currentTier])

  // ── Mount / rebuild on feature or age change ────────────────────
  useEffect(() => {
    initScene()

    return () => {
      cancelAnimationFrame(rafRef.current)
      rendererRef.current?.dispose()
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resolvedFeatures.skinTone, resolvedFeatures.hairColor, resolvedFeatures.hairStyle, resolvedFeatures.hairLength, ageGroup])

  // ── Handle resize ───────────────────────────────────────────────
  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const handleResize = () => {
      const w = container.clientWidth
      const h = container.clientHeight
      if (cameraRef.current) {
        cameraRef.current.aspect = w / h
        cameraRef.current.updateProjectionMatrix()
      }
      rendererRef.current?.setSize(w, h)
    }

    const observer = new ResizeObserver(handleResize)
    observer.observe(container)
    return () => observer.disconnect()
  }, [])

  // ── Tier upgrade animation when XP changes tier ────────────────
  useEffect(() => {
    if (!prevTierRef.current || prevTierRef.current === currentTier) {
      prevTierRef.current = currentTier
      return
    }
    // Tier changed — animate upgrade
    animateTierUpgrade(armorGroupsRef.current, equippedPieces, currentTier)
    prevTierRef.current = currentTier
  }, [currentTier, equippedPieces])

  // ── Sync equipped pieces (without full rebuild) ─────────────────
  useEffect(() => {
    const prev = prevEquippedRef.current
    const current = new Set(equippedPieces)

    // Show newly equipped pieces as SOLID with tier materials + play equip ceremonies
    for (const pieceId of current) {
      if (!prev.has(pieceId)) {
        const group = armorGroupsRef.current.get(pieceId as VoxelArmorPieceId)
        if (group) {
          group.visible = true
          group.scale.set(1, 1, 1)
        }
        // Apply tier materials so piece becomes solid (not ghost)
        applyTierToArmor(armorGroupsRef.current, currentTier, [pieceId])

        // Play equip ceremony based on piece type
        if (characterRef.current) {
          const character = characterRef.current
          switch (pieceId) {
            case 'shoes':
              animateJump(character, 0.5, 400)
              break
            case 'helmet': {
              const head = character.getObjectByName('head')
              if (head) animateNod(head, 300)
              break
            }
            case 'breastplate': {
              const torso = character.getObjectByName('torso')
              if (torso) animateTorsoPuff(torso, 300)
              break
            }
            case 'belt':
              animateHipTurn(character, 400)
              break
            case 'sword': {
              const swordGroup = armorGroupsRef.current.get('sword')
              if (swordGroup) setTimeout(() => animateSwordFlourish(swordGroup, 500), 300)
              break
            }
            default:
              break
          }
        }
      }
    }

    // Unequipped pieces → show as translucent ghost (not hidden)
    for (const pieceId of prev) {
      if (!current.has(pieceId)) {
        const group = armorGroupsRef.current.get(pieceId as VoxelArmorPieceId)
        if (group) {
          const isUnlocked = totalXp >= XP_THRESHOLDS[pieceId as VoxelArmorPieceId]
          group.visible = true
          group.traverse((child) => {
            if (child instanceof THREE.Mesh) {
              const mats = Array.isArray(child.material) ? child.material : [child.material]
              const baseHex = mats[0] instanceof THREE.MeshLambertMaterial
                ? mats[0].color?.getHex() ?? 0x888888
                : 0x888888
              const ghostOpacity = isUnlocked ? 0.3 : 0.25
              const base = new THREE.Color(baseHex)
              if (!isUnlocked) base.lerp(new THREE.Color(0x8888cc), 0.5)
              child.material = new THREE.MeshLambertMaterial({
                color: base,
                transparent: true,
                opacity: ghostOpacity,
                depthWrite: false,
                ...(isUnlocked ? {} : { emissive: new THREE.Color(0x334466), emissiveIntensity: 0.3 }),
              })
            }
          })
        }
      }
    }

    // Also ensure ALL currently equipped pieces have solid tier materials
    // (handles page-load case where pieces load from profile)
    if (current.size > 0) {
      applyTierToArmor(armorGroupsRef.current, currentTier, equippedPieces)
      enforceArmorOpacity(armorGroupsRef.current, equippedPieces)
    }

    // Update pose for new equipped set
    poseRef.current?.(equippedPieces)

    prevEquippedRef.current = current
  }, [equippedPieces, currentTier, totalXp])

  // ── Handle equip animation trigger ──────────────────────────────
  useEffect(() => {
    if (!animateEquipPiece) return
    const group = armorGroupsRef.current.get(animateEquipPiece as VoxelArmorPieceId)
    if (group) {
      animateEquip(group, onEquipAnimDone)
    }
  }, [animateEquipPiece, onEquipAnimDone])

  // ── Handle unequip animation trigger ────────────────────────────
  useEffect(() => {
    if (!animateUnequipPiece) return
    const group = armorGroupsRef.current.get(animateUnequipPiece as VoxelArmorPieceId)
    if (group) {
      animateUnequip(group, onUnequipAnimDone)
    }
  }, [animateUnequipPiece, onUnequipAnimDone])

  return (
    <Box
      ref={containerRef}
      sx={{
        width: '100%',
        maxWidth: 400,
        mx: 'auto',
        aspectRatio: '3 / 4',
        maxHeight: '48vh',
        minHeight: '280px',
        borderRadius: '12px',
        border: '1px solid rgba(76, 175, 80, 0.15)',
        overflow: 'hidden',
        bgcolor: '#111122',
        cursor: 'grab',
        '&:active': { cursor: 'grabbing' },
        // Prevent text selection during drag
        userSelect: 'none',
        WebkitUserSelect: 'none',
        touchAction: 'none',
        position: 'relative',
      }}
    />
  )
}
