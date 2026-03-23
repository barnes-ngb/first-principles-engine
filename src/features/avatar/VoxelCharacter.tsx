import { useEffect, useRef, useCallback } from 'react'
import * as THREE from 'three'
import Box from '@mui/material/Box'

import type { CharacterFeatures, VoxelArmorPieceId } from '../../core/types'
import { DEFAULT_CHARACTER_FEATURES } from '../../core/types'
import { XP_THRESHOLDS } from './voxel/buildArmorPiece'
import { buildCharacter } from './voxel/buildCharacter'
import { buildArmorPiece, VOXEL_ARMOR_PIECES } from './voxel/buildArmorPiece'
import { animateEquip, animateUnequip, animateJump, animateNod, animateSwordFlourish, animateHipTurn, animateTorsoPuff } from './voxel/equipAnimation'
import { createTouchControls, updateRotation, destroyTouchControls } from './voxel/touchControls'
import type { TouchControlState } from './voxel/touchControls'
import { applyTierToArmor, calculateTier, getTierTint, TIER_MATERIALS } from './voxel/tierMaterials'
import { triggerTierUpCeremony } from './voxel/tierUpCeremony'
import { PoseAnimator, POSES, POSE_EXPRESSIONS, applyExpression, getEquipmentIdlePose } from './voxel/poseSystem'
import type { Pose } from './voxel/poseSystem'
import { applyPaintedFace } from './voxel/pixelFace'
import { buildHelmHair } from './voxel/buildHair'
import { frameCameraToCharacter } from './voxel/cameraUtils'

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
  /** Photo URL for pixel face generation */
  photoUrl?: string
  /** Triggered pose ID (from PoseButtons or swipe) */
  activePoseId?: string | null
  /** Callback when a pose completes */
  onPoseComplete?: () => void
  /** Callback when swipe cycles to a new pose */
  onSwipePose?: (poseId: string) => void
  /** Callback when tier-up ceremony completes (equipped pieces reset, new tier set) */
  onTierUp?: (oldTier: string, newTier: string) => void
}

// ── Helmet hair management ────────────────────────────────────────────

function applyHelmHairStyle(
  character: THREE.Group,
  isHelmetEquipped: boolean,
  features: CharacterFeatures,
) {
  const fullHair = character.getObjectByName('hairGroup')
  let helmHair = character.getObjectByName('helmHairGroup')
  const head = character.getObjectByName('head') as THREE.Mesh | undefined

  if (isHelmetEquipped) {
    // Hide full hair
    if (fullHair) fullHair.visible = false

    // Show helmet-compatible hair — only parts that peek from under helmet
    if (!helmHair && head) {
      const headGeo = head.geometry as THREE.BoxGeometry
      const headWidth = headGeo.parameters.width
      const U = headWidth / 8
      const hairMat = new THREE.MeshLambertMaterial({ color: features.hairColor ?? '#6B4C32' })
      helmHair = buildHelmHair(hairMat, head.position.y, U)
      character.add(helmHair)
    }
    if (helmHair) helmHair.visible = true
  } else {
    // Show full hair, hide helm hair
    if (fullHair) fullHair.visible = true
    if (helmHair) helmHair.visible = false
  }
}

// ── Equipment-based idle pose ────────────────────────────────────────

interface EquipmentPose {
  armLRotZ: number
  armRRotZ: number
  armLRotX: number
  armRRotX: number
}

const POSE_DEFAULT: EquipmentPose = { armLRotZ: 0, armRRotZ: 0, armLRotX: 0, armRRotX: 0 }

function calculateEquipmentPose(equipped: string[]): EquipmentPose {
  const pose = { ...POSE_DEFAULT }
  if (equipped.includes('sword')) {
    pose.armRRotZ = -0.55  // ~32° outward — enough to clear breastplate
    pose.armRRotX = -0.15  // Slight forward tilt
  }
  if (equipped.includes('shield')) {
    pose.armLRotZ = 0.5    // ~29° outward
    pose.armLRotX = 0.35   // More forward — shield presents to front
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
function buildPlatform(ageGroup: 'older' | 'younger', tierBaseColor?: number): THREE.Group {
  const scale = ageGroup === 'younger' ? 0.88 : 1.0
  const U = 0.125 * scale
  const blockSize = U * 8 // One Minecraft block = 8 pixels
  const platform = new THREE.Group()
  platform.name = 'platform'

  for (let x = -1; x <= 1; x++) {
    for (let z = -1; z <= 0; z++) {
      const block = new THREE.Group()

      // Main block body — tinted toward tier color
      const baseHex = tierBaseColor ?? 0x555555
      const sideColor = new THREE.Color(baseHex).multiplyScalar(0.7 + Math.random() * 0.15)
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
  activePoseId,
  onPoseComplete,
  onSwipePose,
  onTierUp,
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
  const equipPoseRef = useRef<((pieces: string[]) => void) | null>(null)
  const equippedRef = useRef<string[]>([])
  const poseAnimatorRef = useRef<PoseAnimator>(new PoseAnimator())
  const swipePoseIndexRef = useRef(0)
  const onSwipePoseRef = useRef(onSwipePose)
  const onPoseCompleteRef = useRef(onPoseComplete)
  const onTierUpRef = useRef(onTierUp)
  const ceremonyActiveRef = useRef(false)

  const resolvedFeatures = features ?? DEFAULT_CHARACTER_FEATURES
  const currentTier = calculateTier(totalXp)

  // Keep refs in sync so animation loop always has current values
  equippedRef.current = equippedPieces
  onSwipePoseRef.current = onSwipePose
  onPoseCompleteRef.current = onPoseComplete
  onTierUpRef.current = onTierUp

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
    scene.background = new THREE.Color(0x1a1a2e)
    sceneRef.current = scene

    // Background particles (stars)
    addBackgroundParticles(scene)

    // Camera — auto-framed to fit character
    const camera = new THREE.PerspectiveCamera(35, width / height, 0.1, 100)
    camera.position.set(0, 2.2, 10.5)
    camera.lookAt(0, 1.8, 0)
    cameraRef.current = camera

    // Will be re-framed after character + armor are built (below)

    // ── Dramatic lighting for depth ──────────────────────────────
    const keyLight = new THREE.DirectionalLight(0xFFF5E6, 1.0)
    keyLight.position.set(5, 8, 6)
    scene.add(keyLight)

    const fillLight = new THREE.DirectionalLight(0xC8D8E8, 0.3)
    fillLight.position.set(-5, 3, 3)
    scene.add(fillLight)

    const rimLight = new THREE.DirectionalLight(0xFFFFFF, 0.5)
    rimLight.position.set(0, 3, -6)
    scene.add(rimLight)

    const ambient = new THREE.AmbientLight(0xFFFFFF, 0.25)
    scene.add(ambient)

    const bounceLight = new THREE.DirectionalLight(0xFFE8D6, 0.1)
    bounceLight.position.set(0, -4, 2)
    scene.add(bounceLight)

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
        const tierTint = getTierTint(currentTier)
        const tierMat = TIER_MATERIALS[tierTint] ?? TIER_MATERIALS.wood
        group.scale.set(1, 1, 1)
        if (pieceId === 'shield') {
          group.scale.set(0.85, 0.85, 0.85)
        }
        group.traverse((child) => {
          if (child instanceof THREE.Mesh) {
            const ghostMat = new THREE.MeshLambertMaterial({
              color: tierMat.primary,
              transparent: true,
              opacity: 0.08,
              depthWrite: false,
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

    // Apply helmet hair if helmet is initially equipped
    if (equippedPieces.includes('helmet')) {
      applyHelmHairStyle(character, true, resolvedFeatures)
    }

    // Platform — tinted to match tier
    const tierTint = getTierTint(currentTier)
    const tierMat = TIER_MATERIALS[tierTint] ?? TIER_MATERIALS.wood
    const platform = buildPlatform(ageGroup, tierMat.primary)
    platform.position.y = character.position.y
    scene.add(platform)

    // Auto-frame camera to fit the fully-built character with armor
    frameCameraToCharacter(camera, character, 1.35)

    // Shadow on platform surface
    const scale = ageGroup === 'younger' ? 0.88 : 1.0
    const shadowGeo = new THREE.PlaneGeometry(2.5 * scale, 1.5 * scale)
    const shadowMat = new THREE.MeshBasicMaterial({
      color: 0x000000,
      transparent: true,
      opacity: 0.15,
    })
    const shadow = new THREE.Mesh(shadowGeo, shadowMat)
    shadow.rotation.x = -Math.PI / 2
    shadow.position.y = 0.01
    scene.add(shadow)

    // Renderer
    const renderer = new THREE.WebGLRenderer({ antialias: true })
    renderer.setSize(width, height)
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    container.appendChild(renderer.domElement)
    rendererRef.current = renderer

    // Touch controls with swipe detection
    const controls = createTouchControls(renderer.domElement)
    controlsRef.current = controls

    // Wire up swipe-to-cycle-poses
    const actionablePoses = POSES.filter((p) => p.id !== 'idle')
    controls.onSwipe = (direction: 'left' | 'right') => {
      if (direction === 'left') {
        swipePoseIndexRef.current = (swipePoseIndexRef.current + 1) % actionablePoses.length
      } else {
        swipePoseIndexRef.current = (swipePoseIndexRef.current - 1 + actionablePoses.length) % actionablePoses.length
      }
      const pose = actionablePoses[swipePoseIndexRef.current]
      poseAnimatorRef.current.play(pose, () => {
        // Smooth return to equipment idle pose
        if (characterRef.current) {
          applyExpression(characterRef.current, POSE_EXPRESSIONS.idle ?? {})
        }
        const idlePose = getEquipmentIdlePose(equippedRef.current)
        poseAnimatorRef.current.play(idlePose, () => {
          onPoseCompleteRef.current?.()
        })
      })
      // Apply facial expression for this pose
      if (characterRef.current) {
        const expr = POSE_EXPRESSIONS[pose.id]
        if (expr) applyExpression(characterRef.current, expr)
      }
      onSwipePoseRef.current?.(pose.id)
    }

    // Animation loop
    const clock = new THREE.Clock()
    const baseY = character.position.y

    // Equipment-based idle pose state for smooth transitions
    const currentEqPose: EquipmentPose = { ...POSE_DEFAULT }
    let targetEqPose = calculateEquipmentPose(equippedPieces)

    equipPoseRef.current = (pieces: string[]) => { targetEqPose = calculateEquipmentPose(pieces) }
    equipPoseRef.current(equippedPieces)

    const poseAnimator = poseAnimatorRef.current

    function animate() {
      rafRef.current = requestAnimationFrame(animate)

      if (controlsRef.current && characterRef.current) {
        updateRotation(characterRef.current, controlsRef.current)
      }

      // Enforce solid opacity on equipped armor every frame
      enforceArmorOpacity(armorGroupsRef.current, equippedRef.current)

      if (characterRef.current) {
        const dt = clock.getDelta()
        const time = clock.getElapsedTime()

        // Gentle bob
        characterRef.current.position.y = baseY + Math.sin(time * 1.2) * 0.03

        // Idle blink — every 3-6 seconds, close eyes briefly
        const blinkCycle = time % (3 + Math.sin(time * 0.37) * 1.5) // Varies between 1.5-4.5s
        const isBlinking = blinkCycle < 0.12 // 120ms blink
        const eyeNames = ['eyeWhiteL', 'eyeWhiteR', 'pupilL', 'pupilR']
        if (!poseAnimator.playing) {
          for (const eName of eyeNames) {
            const eyeMesh = characterRef.current.getObjectByName(eName)
            if (eyeMesh) {
              eyeMesh.scale.y = isBlinking ? 0.1 : 1
            }
          }
        }

        const armLObj = characterRef.current.getObjectByName('armL')
        const armRObj = characterRef.current.getObjectByName('armR')
        const headObj = characterRef.current.getObjectByName('head')

        // Check if pose animator is actively playing
        const poseActive = armLObj && armRObj && headObj && poseAnimator.update(
          armLObj, armRObj, headObj, characterRef.current, performance.now(),
        )

        if (!poseActive) {
          // Lerp toward equipment-based idle pose + idle sway
          const lerpSpeed = Math.min(3.0 * dt, 1)
          currentEqPose.armLRotZ += (targetEqPose.armLRotZ - currentEqPose.armLRotZ) * lerpSpeed
          currentEqPose.armRRotZ += (targetEqPose.armRRotZ - currentEqPose.armRRotZ) * lerpSpeed
          currentEqPose.armLRotX += (targetEqPose.armLRotX - currentEqPose.armLRotX) * lerpSpeed
          currentEqPose.armRRotX += (targetEqPose.armRRotX - currentEqPose.armRRotX) * lerpSpeed

          const idleSway = Math.sin(time * 0.7) * 0.03

          if (armLObj) {
            armLObj.rotation.z = currentEqPose.armLRotZ + idleSway
            armLObj.rotation.x = currentEqPose.armLRotX + Math.sin(time * 0.8) * 0.05
          }
          if (armRObj) {
            armRObj.rotation.z = currentEqPose.armRRotZ - idleSway
            armRObj.rotation.x = currentEqPose.armRRotX - Math.sin(time * 0.8) * 0.05
          }
        }
      }

      // Pulse sword blade glow when sword is equipped
      const swordGroup = armorGroupsRef.current.get('sword')
      if (swordGroup?.visible) {
        const time2 = clock.getElapsedTime()
        swordGroup.traverse((child) => {
          if (child instanceof THREE.Mesh && child.userData.materialRole === 'sword_blade') {
            const mat = child.material
            if (mat instanceof THREE.MeshLambertMaterial) {
              mat.emissiveIntensity = 0.2 + Math.sin(time2 * 2.5) * 0.15
            }
          }
          if (child instanceof THREE.PointLight) {
            child.intensity = 0.5 + Math.sin(time2 * 2.5) * 0.3
          }
        })
      }

      renderer.render(scene, camera)
    }
    animate()

    // Apply painted pixel face from extracted features (clean Minecraft style)
    const headMesh = character.getObjectByName('head') as THREE.Mesh | undefined
    if (headMesh) {
      const skinHex = new THREE.Color(resolvedFeatures.skinTone ?? '#F5D6B8').getHex()
      applyPaintedFace(headMesh, character, resolvedFeatures, skinHex)
    }
  }, [resolvedFeatures, ageGroup, equippedPieces, totalXp, currentTier])

  // ── Mount / rebuild on feature or age change ────────────────────
  useEffect(() => {
    initScene()

    return () => {
      cancelAnimationFrame(rafRef.current)

      // Clean up touch control window event listeners
      if (controlsRef.current) {
        destroyTouchControls(controlsRef.current)
      }

      // Dispose all Three.js geometries and materials to prevent memory leaks
      if (sceneRef.current) {
        sceneRef.current.traverse((obj) => {
          if (obj instanceof THREE.Mesh) {
            obj.geometry.dispose()
            if (Array.isArray(obj.material)) {
              obj.material.forEach((m) => m.dispose())
            } else {
              obj.material.dispose()
            }
          }
          if (obj instanceof THREE.Points) {
            obj.geometry.dispose()
            if (obj.material instanceof THREE.PointsMaterial) {
              obj.material.dispose()
            }
          }
        })
      }

      rendererRef.current?.dispose()
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resolvedFeatures.skinTone, resolvedFeatures.hairColor, resolvedFeatures.hairStyle, resolvedFeatures.hairLength, resolvedFeatures.eyeColor, ageGroup])

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

  // ── Tier upgrade ceremony when XP changes tier ─────────────────
  useEffect(() => {
    if (!prevTierRef.current || prevTierRef.current === currentTier) {
      prevTierRef.current = currentTier
      return
    }
    if (ceremonyActiveRef.current) return

    const container = containerRef.current
    const scene = sceneRef.current
    if (!container || !scene) {
      prevTierRef.current = currentTier
      return
    }

    const oldTier = prevTierRef.current
    ceremonyActiveRef.current = true

    triggerTierUpCeremony({
      scene,
      armorMeshes: armorGroupsRef.current,
      equippedPieces,
      oldTier,
      newTier: currentTier,
      containerEl: container,
    })

    // After ceremony completes (~5s), notify parent and reset flag
    setTimeout(() => {
      ceremonyActiveRef.current = false
      onTierUpRef.current?.(oldTier, currentTier)
    }, 5000)

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
        applyTierToArmor(armorGroupsRef.current, currentTier, [pieceId])

        // Play equip ceremony + auto-pose
        if (characterRef.current) {
          const character = characterRef.current
          switch (pieceId) {
            case 'shoes':
              animateJump(character, 0.5, 400)
              break
            case 'helmet': {
              const head = character.getObjectByName('head')
              if (head) animateNod(head, 300)
              // Swap to helmet-compatible hair
              applyHelmHairStyle(character, true, resolvedFeatures)
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

          // Auto-pose: trigger the pose linked to this piece
          const autoPose = POSES.find((p) => p.requiresPiece === pieceId)
          if (autoPose) {
            setTimeout(() => {
              const expr = POSE_EXPRESSIONS[autoPose.id]
              if (expr && characterRef.current) applyExpression(characterRef.current, expr)
              poseAnimatorRef.current.play(autoPose, () => {
                if (characterRef.current) applyExpression(characterRef.current, POSE_EXPRESSIONS.idle ?? {})
                const idlePose = getEquipmentIdlePose(equippedRef.current)
                poseAnimatorRef.current.play(idlePose, () => {
                  onPoseComplete?.()
                })
              })
            }, 500) // Delay so equip ceremony plays first
          }
        }
      }
    }

    // Unequipped pieces -> show as translucent ghost
    for (const pieceId of prev) {
      if (!current.has(pieceId)) {
        // If helmet was unequipped, restore full hair
        if (pieceId === 'helmet' && characterRef.current) {
          applyHelmHairStyle(characterRef.current, false, resolvedFeatures)
        }
        const group = armorGroupsRef.current.get(pieceId as VoxelArmorPieceId)
        if (group) {
          const isUnlocked = totalXp >= XP_THRESHOLDS[pieceId as VoxelArmorPieceId]
          const tierTint = getTierTint(currentTier)
          const tierMat = TIER_MATERIALS[tierTint] ?? TIER_MATERIALS.wood
          group.visible = true
          if (pieceId === 'shield' && !isUnlocked) {
            group.scale.set(0.85, 0.85, 0.85)
          }
          group.traverse((child) => {
            if (child instanceof THREE.Mesh) {
              child.material = new THREE.MeshLambertMaterial({
                color: tierMat.primary,
                transparent: true,
                opacity: isUnlocked ? 0.3 : 0.08,
                depthWrite: false,
              })
            }
          })
        }
      }
    }

    // Ensure ALL currently equipped pieces have solid tier materials
    if (current.size > 0) {
      applyTierToArmor(armorGroupsRef.current, currentTier, equippedPieces)
      enforceArmorOpacity(armorGroupsRef.current, equippedPieces)
    }

    // Update equipment-based idle pose
    equipPoseRef.current?.(equippedPieces)

    prevEquippedRef.current = current
  }, [equippedPieces, currentTier, totalXp, onPoseComplete, resolvedFeatures])

  // ── Handle explicit pose trigger (from PoseButtons) ────────────
  useEffect(() => {
    if (!activePoseId || activePoseId === 'idle') return
    const pose = POSES.find((p) => p.id === activePoseId) as Pose | undefined
    if (!pose) return

    // Apply facial expression
    if (characterRef.current) {
      const expr = POSE_EXPRESSIONS[pose.id]
      if (expr) applyExpression(characterRef.current, expr)
    }

    poseAnimatorRef.current.play(pose, () => {
      if (characterRef.current) {
        applyExpression(characterRef.current, POSE_EXPRESSIONS.idle ?? {})
      }
      // Smooth return to equipment idle
      const idlePose = getEquipmentIdlePose(equippedRef.current)
      poseAnimatorRef.current.play(idlePose, () => {
        onPoseComplete?.()
      })
    })
  }, [activePoseId, onPoseComplete])

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
        bgcolor: '#1a1a2e',
        cursor: 'grab',
        '&:active': { cursor: 'grabbing' },
        userSelect: 'none',
        WebkitUserSelect: 'none',
        touchAction: 'none',
        position: 'relative',
      }}
    />
  )
}
