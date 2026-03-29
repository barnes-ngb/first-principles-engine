import { useEffect, useRef, useCallback, useMemo } from 'react'
import * as THREE from 'three'
import Box from '@mui/material/Box'

import type { AccessoryId, AvatarBackground, CharacterFeatures, OutfitCustomization, VoxelArmorPieceId } from '../../core/types'
import { DEFAULT_CHARACTER_FEATURES } from '../../core/types'
import { XP_THRESHOLDS } from './voxel/buildArmorPiece'
import { buildCharacter, applyProfileOutfit } from './voxel/buildCharacter'
import { buildArmorPiece, VOXEL_ARMOR_PIECES } from './voxel/buildArmorPiece'
import { animateEquip, animateUnequip, animateJump, animateNod, animateSwordFlourish, animateHipTurn, animateTorsoPuff } from './voxel/equipAnimation'
import { createTouchControls, updateRotation, destroyTouchControls } from './voxel/touchControls'
import type { TouchControlState } from './voxel/touchControls'
import { applyTierToArmor, calculateTier, getTierTint, TIER_MATERIALS } from './voxel/tierMaterials'
import { addEnchantGlow, removeEnchantGlow, animateEnchantGlow, tierHasGlow } from './voxel/enchantmentGlow'
import { buildCape, animateCape, tierHasCape } from './voxel/buildCape'
import { triggerTierUpCeremony } from './voxel/tierUpCeremony'
import { PoseAnimator, POSES, POSE_EXPRESSIONS, applyExpression, getEquipmentIdlePose } from './voxel/poseSystem'
import type { Pose } from './voxel/poseSystem'
import { applyPaintedFace, applyFaceWithAIFallback } from './voxel/pixelFace'
import { buildHelmHair } from './voxel/buildHair'
import { frameCameraToCharacter } from './voxel/cameraUtils'
import { playEquipSound } from './voxel/equipSound'
import { buildShieldEmblem } from './voxel/buildShieldEmblem'
import { buildHelmetCrest } from './voxel/buildHelmetCrest'
import { buildRoom } from './voxel/buildRoom'
import { buildAccessory, getAccessoryAttachPoint, animateAccessories, getHiddenAccessories } from './voxel/buildAccessory'

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
  /** AI-generated Minecraft skin texture URL (cached) */
  skinTextureUrl?: string
  /** Triggered pose ID (from PoseButtons or swipe) */
  activePoseId?: string | null
  /** Callback when a pose completes */
  onPoseComplete?: () => void
  /** Callback when swipe cycles to a new pose */
  onSwipePose?: (poseId: string) => void
  /** Outfit color customization */
  customization?: OutfitCustomization
  /** Callback when tier-up ceremony starts (block UI interactions) */
  onTierUpStart?: () => void
  /** Callback when tier-up ceremony completes (equipped pieces reset, new tier set) */
  onTierUp?: (oldTier: string, newTier: string) => void
  /** Scene background mode: night sky (default) or indoor room */
  background?: AvatarBackground
  /** Equipped accessory IDs (cosmetic items) */
  accessories?: AccessoryId[]
}

// ── Helmet hair management ────────────────────────────────────────────

function applyHelmHairStyle(
  character: THREE.Group,
  isHelmetEquipped: boolean,
  features: CharacterFeatures,
) {
  const headGroup = character.getObjectByName('headGroup') as THREE.Group | undefined
  if (!headGroup) return

  const fullHair = headGroup.getObjectByName('hairGroup')
  let helmHair = headGroup.getObjectByName('helmHairGroup')
  const headMesh = headGroup.getObjectByName('head') as THREE.Mesh | undefined

  if (isHelmetEquipped) {
    // Hide full hair
    if (fullHair) fullHair.visible = false

    // Show helmet-compatible hair — only parts that peek from under helmet
    // Hair is child of headGroup so it moves with head rotations
    if (!helmHair && headMesh) {
      const headGeo = headMesh.geometry as THREE.BoxGeometry
      const headWidth = headGeo.parameters.width
      const U = headWidth / 8
      const hairMat = new THREE.MeshLambertMaterial({ color: features.hairColor ?? '#6B4C32' })
      // headY = 0 in headGroup local space
      helmHair = buildHelmHair(hairMat, 0, U)
      headGroup.add(helmHair)
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
          if ((mat instanceof THREE.MeshLambertMaterial || mat instanceof THREE.MeshPhongMaterial) && (mat.transparent || mat.opacity < 1)) {
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

/** Lerp between two hex colors */
function lerpPlatformColor(a: number, b: number, t: number): number {
  const ca = new THREE.Color(a)
  const cb = new THREE.Color(b)
  ca.lerp(cb, t)
  return ca.getHex()
}

/** Build a 3-step Minecraft-style platform at the character's feet */
function buildPlatform(ageGroup: 'older' | 'younger', tierBaseColor?: number): THREE.Group {
  const scale = ageGroup === 'younger' ? 0.88 : 1.0
  const s = scale
  const platform = new THREE.Group()
  platform.name = 'platform'

  const mainColor = tierBaseColor ?? 0x555555
  const darkColor = lerpPlatformColor(mainColor, 0x000000, 0.2)
  const lightColor = lerpPlatformColor(mainColor, 0xFFFFFF, 0.15)

  function makeBox(w: number, h: number, d: number, color: number): THREE.Mesh {
    const geo = new THREE.BoxGeometry(w, h, d)
    const mats: THREE.MeshLambertMaterial[] = []
    const base = new THREE.Color(color)
    for (let i = 0; i < 6; i++) {
      const variation = 0.92 + Math.random() * 0.16
      mats.push(new THREE.MeshLambertMaterial({ color: base.clone().multiplyScalar(variation) }))
    }
    return new THREE.Mesh(geo, mats)
  }

  // Bottom step — widest
  const step1 = makeBox(3.6 * s, 0.25 * s, 2.4 * s, darkColor)
  step1.position.y = -0.125 * s
  platform.add(step1)

  // Middle step
  const step2 = makeBox(3.0 * s, 0.25 * s, 2.0 * s, mainColor)
  step2.position.y = 0.125 * s
  platform.add(step2)

  // Top step — where character stands
  const step3 = makeBox(2.4 * s, 0.2 * s, 1.6 * s, lightColor)
  step3.position.y = 0.35 * s
  platform.add(step3)

  // Individual blocks on top surface for Minecraft feel
  for (let x = -1; x <= 1; x++) {
    for (let z = -1; z <= 0; z++) {
      const blockColor = Math.random() > 0.5 ? mainColor : lightColor
      const block = makeBox(0.75 * s, 0.21 * s, 0.75 * s, blockColor)
      block.position.set(x * 0.8 * s, 0.35 * s, z * 0.8 * s + 0.2 * s)
      platform.add(block)
    }
  }

  // Shift the whole platform down so character feet still at Y=0
  platform.position.y = -0.35 * s

  return platform
}

/** Build Minecraft-themed background: terrain silhouette, moon, star cubes — as a Group */
function buildSkyGroup(): THREE.Group {
  const skyGroup = new THREE.Group()
  skyGroup.name = 'skyGroup'

  // Distant terrain silhouette — dark blocks along the horizon
  const terrainColor = 0x0D0D1A
  for (let i = 0; i < 12; i++) {
    const w = 1 + Math.random() * 2
    const h = 0.5 + Math.random() * 2
    const hillGeo = new THREE.BoxGeometry(w, h, 0.5)
    const hillMat = new THREE.MeshLambertMaterial({ color: terrainColor })
    const hill = new THREE.Mesh(hillGeo, hillMat)
    hill.position.set(
      (Math.random() - 0.5) * 15,
      h / 2 - 2,
      -8 - Math.random() * 4,
    )
    skyGroup.add(hill)
  }

  // Moon — octagonal (Minecraft-ish) in the corner
  const moonGeo = new THREE.CircleGeometry(0.8, 8)
  const moonMat = new THREE.MeshBasicMaterial({
    color: 0xFFFFDD,
    transparent: true,
    opacity: 0.5,
  })
  const moon = new THREE.Mesh(moonGeo, moonMat)
  moon.position.set(5, 6, -6)
  skyGroup.add(moon)

  // Stars — small white cubes scattered in the sky, with phase offsets for twinkle
  for (let i = 0; i < 20; i++) {
    const starGeo = new THREE.BoxGeometry(0.04, 0.04, 0.04)
    const starMat = new THREE.MeshBasicMaterial({
      color: 0xFFFFFF,
      transparent: true,
      opacity: 0.6 + Math.random() * 0.4,
    })
    const star = new THREE.Mesh(starGeo, starMat)
    star.name = 'twinkleStar'
    star.userData.twinklePhase = Math.random() * Math.PI * 2
    star.userData.twinkleSpeed = 0.5 + Math.random() * 1.5
    star.position.set(
      (Math.random() - 0.5) * 14,
      3 + Math.random() * 5,
      -7 - Math.random() * 3,
    )
    skyGroup.add(star)
  }

  // Also keep some particle-style stars for depth
  const particleCount = 20
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
  skyGroup.add(new THREE.Points(geo, mat))

  return skyGroup
}

export default function VoxelCharacter({
  features,
  ageGroup,
  equippedPieces: equippedPiecesRaw,
  totalXp = 0,
  animateEquipPiece,
  animateUnequipPiece,
  onEquipAnimDone,
  onUnequipAnimDone,
  activePoseId,
  onPoseComplete,
  onSwipePose,
  onTierUpStart,
  onTierUp,
  skinTextureUrl,
  customization,
  background = 'night',
  accessories = [],
}: VoxelCharacterProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null)
  const sceneRef = useRef<THREE.Scene | null>(null)
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null)
  const characterRef = useRef<THREE.Group | null>(null)
  const armorGroupsRef = useRef<Map<VoxelArmorPieceId, THREE.Group>>(new Map())
  const accessoryGroupsRef = useRef<Map<AccessoryId, THREE.Group>>(new Map())
  const controlsRef = useRef<TouchControlState | null>(null)
  const rafRef = useRef<number>(0)
  const prevEquippedRef = useRef<Set<string>>(new Set())
  const prevTierRef = useRef<string | null>(null)
  const equipPoseRef = useRef<((pieces: string[]) => void) | null>(null)
  const skyGroupRef = useRef<THREE.Group | null>(null)
  const roomGroupRef = useRef<THREE.Group | null>(null)
  const roomLightsRef = useRef<THREE.Object3D[]>([])
  const nightLightsRef = useRef<THREE.Object3D[]>([])
  const equippedRef = useRef<string[]>([])
  const poseAnimatorRef = useRef<PoseAnimator>(new PoseAnimator())
  const swipePoseIndexRef = useRef(0)
  const onSwipePoseRef = useRef(onSwipePose)
  const onPoseCompleteRef = useRef(onPoseComplete)
  const onTierUpStartRef = useRef(onTierUpStart)
  const onTierUpRef = useRef(onTierUp)
  const ceremonyActiveRef = useRef(false)
  const sceneActiveRef = useRef(false)

  const equippedPieces = useMemo(
    () => (Array.isArray(equippedPiecesRaw) ? equippedPiecesRaw : []),
    [equippedPiecesRaw],
  )
  const resolvedFeatures = features ?? DEFAULT_CHARACTER_FEATURES
  const currentTier = calculateTier(totalXp)
  const armorColors = customization?.armorColors

  // Keep refs in sync so animation loop always has current values
  equippedRef.current = equippedPieces
  onSwipePoseRef.current = onSwipePose
  onPoseCompleteRef.current = onPoseComplete
  onTierUpStartRef.current = onTierUpStart
  onTierUpRef.current = onTierUp

  // ── Initialize scene ────────────────────────────────────────────
  const initScene = useCallback(() => {
    const container = containerRef.current
    if (!container) return

    // Deactivate any running animation loop immediately
    sceneActiveRef.current = false
    cancelAnimationFrame(rafRef.current)
    rafRef.current = 0

    // Clean up old renderer
    if (rendererRef.current) {
      rendererRef.current.dispose()
      rendererRef.current = null
      const oldCanvas = container.querySelector('canvas')
      if (oldCanvas) container.removeChild(oldCanvas)
    }

    const width = container.clientWidth
    const height = container.clientHeight

    // Scene — dark with slight blue tint (night default)
    const scene = new THREE.Scene()
    scene.background = new THREE.Color(background === 'room' ? 0x2a2218 : 0x1a1a2e)
    sceneRef.current = scene

    // Build sky group (night background)
    const skyGroup = buildSkyGroup()
    skyGroup.visible = background !== 'room'
    scene.add(skyGroup)
    skyGroupRef.current = skyGroup

    // Build room group (indoor background)
    const roomGroup = buildRoom()
    roomGroup.visible = background === 'room'
    scene.add(roomGroup)
    roomGroupRef.current = roomGroup

    // Camera — auto-framed to fit character
    const camera = new THREE.PerspectiveCamera(35, width / height, 0.1, 100)
    camera.position.set(0, 2.2, 10.5)
    camera.lookAt(0, 1.8, 0)
    cameraRef.current = camera

    // Will be re-framed after character + armor are built (below)

    // ── Night mode lighting ──────────────────────────────────────
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

    nightLightsRef.current = [keyLight, fillLight, rimLight, ambient, bounceLight]

    // ── Room mode lighting (warmer, cozy) ────────────────────────
    const roomKeyLight = new THREE.DirectionalLight(0xFFF4E0, 0.8)
    roomKeyLight.position.set(3, 6, 4)
    scene.add(roomKeyLight)

    const roomFill = new THREE.DirectionalLight(0xFFE8D0, 0.25)
    roomFill.position.set(-3, 4, 2)
    scene.add(roomFill)

    const roomAmbient = new THREE.AmbientLight(0xFFFFFF, 0.35)
    scene.add(roomAmbient)

    roomLightsRef.current = [roomKeyLight, roomFill, roomAmbient]

    // Set initial lighting visibility
    for (const l of nightLightsRef.current) l.visible = background !== 'room'
    for (const l of roomLightsRef.current) l.visible = background === 'room'

    // Build character
    const character = buildCharacter(resolvedFeatures, ageGroup)
    characterRef.current = character
    scene.add(character)

    // Build armor pieces — sword/shield attach to arms, helmet to headGroup,
    // breastplate arm covers attach to arms
    armorGroupsRef.current.clear()
    const armL = character.getObjectByName('armL')
    const armR = character.getObjectByName('armR')
    const headGroup = character.getObjectByName('headGroup')

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
      } else if (pieceMeta.id === 'helmet') {
        // Helmet is child of headGroup — moves with head during poses
        // Helmet coordinates are already in head-local space
        if (headGroup) headGroup.add(pieceGroup)
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
              if (m instanceof THREE.MeshLambertMaterial || m instanceof THREE.MeshPhongMaterial) {
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
    // Apply tier-based materials to all equipped pieces (with optional dye colors)
    applyTierToArmor(armorGroupsRef.current, currentTier, equippedPieces, armorColors)
    prevEquippedRef.current = new Set(equippedPieces)
    prevTierRef.current = currentTier

    // Shield emblem — add selected emblem design to shield front face
    const shieldGroup = armorGroupsRef.current.get('shield')
    if (shieldGroup) {
      const scale = ageGroup === 'younger' ? 0.88 : 1.0
      const U = 0.125 * scale
      const emblemType = customization?.shieldEmblem ?? 'cross'
      // Get emblem color from tier accent (or dye if set)
      const tierTintKey = getTierTint(currentTier)
      const tierMatRef = TIER_MATERIALS[tierTintKey] ?? TIER_MATERIALS.wood
      const dyeHex = armorColors?.shield
      const emblemColor = dyeHex
        ? new THREE.Color(dyeHex).multiplyScalar(0.85).getHex()
        : tierMatRef.accent
      const emblem = buildShieldEmblem(emblemType, U, emblemColor)
      // Position at the shield's anchor point (stored in userData)
      emblem.position.set(
        shieldGroup.userData.emblemX as number,
        shieldGroup.userData.emblemY as number,
        shieldGroup.userData.emblemZ as number,
      )
      shieldGroup.add(emblem)
    }

    // Helmet crest — add selected crest to top of helmet
    const helmetGroup = armorGroupsRef.current.get('helmet')
    if (helmetGroup) {
      const scale = ageGroup === 'younger' ? 0.88 : 1.0
      const U = 0.125 * scale
      const crestType = customization?.helmetCrest ?? 'none'
      const tierTintKey = getTierTint(currentTier)
      const tierMatRef = TIER_MATERIALS[tierTintKey] ?? TIER_MATERIALS.wood
      const dyeHex = armorColors?.helmet
      const crestColor = dyeHex
        ? new THREE.Color(dyeHex).multiplyScalar(0.85).getHex()
        : tierMatRef.accent
      const crest = buildHelmetCrest(crestType, U, crestColor)
      if (crest) helmetGroup.add(crest)
    }

    // ── Build & attach accessories ──────────────────────────────────
    accessoryGroupsRef.current.clear()
    const hiddenAccessories = getHiddenAccessories(equippedPieces, accessories)
    for (const accId of accessories) {
      const accGroup = buildAccessory(accId as AccessoryId, ageGroup)
      accessoryGroupsRef.current.set(accId as AccessoryId, accGroup)

      const attachPoint = getAccessoryAttachPoint(accId as AccessoryId)
      if (attachPoint === 'headGroup') {
        if (headGroup) headGroup.add(accGroup)
        else character.add(accGroup)
      } else if (attachPoint === 'armL') {
        if (armL) armL.add(accGroup)
        else character.add(accGroup)
      } else {
        character.add(accGroup)
      }

      // Hide if conflicting with armor
      accGroup.visible = !hiddenAccessories.has(accId as AccessoryId)
    }

    // Enchantment glow (Iron tier+) — add glow aura to equipped armor pieces
    if (tierHasGlow(currentTier)) {
      for (const pieceId of equippedPieces) {
        const group = armorGroupsRef.current.get(pieceId as VoxelArmorPieceId)
        if (group) addEnchantGlow(group, currentTier)
      }
    }

    // Cape (Gold tier+) — attach flowing cape behind torso
    const torso = character.getObjectByName('torso')
    if (tierHasCape(currentTier) && torso) {
      const cape = buildCape(currentTier, ageGroup)
      if (cape) torso.add(cape)
    }

    // Apply saved outfit colors
    applyProfileOutfit(character, customization)

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

    // Shadow on platform surface — named for animation loop
    const scaleVal = ageGroup === 'younger' ? 0.88 : 1.0
    const shadowGeo = new THREE.CircleGeometry(0.8 * scaleVal, 16)
    const shadowMat = new THREE.MeshBasicMaterial({
      color: 0x000000,
      transparent: true,
      opacity: 0.2,
      depthWrite: false,
    })
    const shadow = new THREE.Mesh(shadowGeo, shadowMat)
    shadow.name = 'groundShadow'
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
      // Block pose changes during tier-up ceremony
      if (ceremonyActiveRef.current) return
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

    sceneActiveRef.current = true

    function animate() {
      if (!sceneActiveRef.current) return
      rafRef.current = requestAnimationFrame(animate)

      if (controlsRef.current && characterRef.current) {
        updateRotation(characterRef.current, controlsRef.current)
      }

      // Enforce solid opacity on equipped armor every frame (skip during ceremony)
      if (!ceremonyActiveRef.current) {
        enforceArmorOpacity(armorGroupsRef.current, equippedRef.current)
      }

      if (characterRef.current) {
        const dt = clock.getDelta()
        const time = clock.getElapsedTime()

        // Gentle bob (freeze during ceremony so character stays still)
        if (!ceremonyActiveRef.current) {
          characterRef.current.position.y = baseY + Math.sin(time * 1.2) * 0.03

          // Animate ground shadow scale with character bob
          const shadowMesh = scene.getObjectByName('groundShadow')
          if (shadowMesh) {
            const bobScale = 1 + Math.sin(time * 1.2) * 0.02
            shadowMesh.scale.set(bobScale, 1, bobScale)
          }
        }

        // Idle blink — every 3-6 seconds, close eyes briefly
        const blinkCycle = time % (3 + Math.sin(time * 0.37) * 1.5) // Varies between 1.5-4.5s
        const isBlinking = blinkCycle < 0.12 // 120ms blink
        const eyeNames = ['eyeWhiteL', 'eyeWhiteR', 'pupilL', 'pupilR']
        if (!poseAnimator.playing && !ceremonyActiveRef.current) {
          for (const eName of eyeNames) {
            const eyeMesh = characterRef.current.getObjectByName(eName)
            if (eyeMesh) {
              eyeMesh.scale.y = isBlinking ? 0.1 : 1
            }
          }
        }

        const armLObj = characterRef.current.getObjectByName('armL')
        const armRObj = characterRef.current.getObjectByName('armR')
        const headObj = characterRef.current.getObjectByName('headGroup')

        // Check if pose animator is actively playing (skip during ceremony)
        const poseActive = !ceremonyActiveRef.current && armLObj && armRObj && headObj && poseAnimator.update(
          armLObj, armRObj, headObj, characterRef.current, performance.now(),
        )

        if (!poseActive && !ceremonyActiveRef.current) {
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

      // Enchantment glow pulse (Iron tier+)
      animateEnchantGlow(scene, clock.getElapsedTime())

      // Cape sway (Gold tier+)
      animateCape(scene, clock.getElapsedTime())

      // Accessory animations (wing flutter, parrot bob)
      animateAccessories(scene, clock.getElapsedTime())

      // Subtle star twinkle — sine wave on each star's opacity with unique phase
      const twinkleTime = clock.getElapsedTime()
      scene.traverse((obj) => {
        if (obj.name === 'twinkleStar' && obj instanceof THREE.Mesh) {
          const mat = obj.material as THREE.MeshBasicMaterial
          const phase = obj.userData.twinklePhase as number
          const speed = obj.userData.twinkleSpeed as number
          mat.opacity = 0.3 + 0.7 * (0.5 + 0.5 * Math.sin(twinkleTime * speed + phase))
        }
        // Torch flame flicker in room mode
        if (obj.name === 'torchFlame' && obj instanceof THREE.Mesh) {
          const mat = obj.material as THREE.MeshBasicMaterial
          const flicker = 0.85 + 0.15 * Math.sin(twinkleTime * 8 + Math.sin(twinkleTime * 3) * 2)
          mat.color.setHex(0xFF8C00).multiplyScalar(flicker)
        }
        if (obj.name === 'torchLight' && obj instanceof THREE.PointLight) {
          obj.intensity = 0.4 + 0.2 * Math.sin(twinkleTime * 6 + 1.5)
        }
      })

      renderer.render(scene, camera)
    }
    animate()

    // Apply face texture — try AI skin first, then painted fallback
    const headMesh = character.getObjectByName('head') as THREE.Mesh | undefined
    if (headMesh) {
      const skinHex = new THREE.Color(resolvedFeatures.skinTone ?? '#F5D6B8').getHex()
      if (skinTextureUrl) {
        // Async: try AI skin, fall back to painted
        void applyFaceWithAIFallback(headMesh, character, resolvedFeatures, skinHex, skinTextureUrl)
      } else {
        applyPaintedFace(headMesh, character, resolvedFeatures, skinHex)
      }
    }
  }, [resolvedFeatures, ageGroup, equippedPieces, totalXp, currentTier, skinTextureUrl, customization, armorColors, accessories])

  // ── Mount / rebuild on feature or age change ────────────────────
  useEffect(() => {
    initScene()

    return () => {
      // Deactivate animation loop before any disposal
      sceneActiveRef.current = false
      cancelAnimationFrame(rafRef.current)
      rafRef.current = 0

      // Clean up touch control window event listeners
      if (controlsRef.current) {
        destroyTouchControls(controlsRef.current)
        controlsRef.current = null
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
        sceneRef.current = null
      }

      if (rendererRef.current) {
        rendererRef.current.dispose()
        rendererRef.current = null
      }
      cameraRef.current = null
      characterRef.current = null
      skyGroupRef.current = null
      roomGroupRef.current = null
      nightLightsRef.current = []
      roomLightsRef.current = []
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

  // ── Toggle background mode without full rebuild ─────────────────
  useEffect(() => {
    const scene = sceneRef.current
    if (!scene) return
    const isRoom = background === 'room'

    // Toggle scene background color
    scene.background = new THREE.Color(isRoom ? 0x2a2218 : 0x1a1a2e)

    // Toggle sky/room group visibility
    if (skyGroupRef.current) skyGroupRef.current.visible = !isRoom
    if (roomGroupRef.current) roomGroupRef.current.visible = isRoom

    // Toggle lighting sets
    for (const l of nightLightsRef.current) l.visible = !isRoom
    for (const l of roomLightsRef.current) l.visible = isRoom
  }, [background])

  // ── Apply outfit colors when customization changes ──────────────
  useEffect(() => {
    const character = characterRef.current
    if (!character) return
    applyProfileOutfit(character, customization)
  }, [customization])

  // ── Re-apply armor dye colors when armorColors change ──────────
  useEffect(() => {
    if (!armorColors || equippedPieces.length === 0) return
    applyTierToArmor(armorGroupsRef.current, currentTier, equippedPieces, armorColors)
    enforceArmorOpacity(armorGroupsRef.current, equippedPieces)
  }, [armorColors, currentTier, equippedPieces])

  // ── Update accessory visibility on armor/accessory changes ──────
  useEffect(() => {
    if (accessories.length === 0) return
    const hidden = getHiddenAccessories(equippedPieces, accessories)
    for (const [accId, group] of accessoryGroupsRef.current) {
      group.visible = accessories.includes(accId) && !hidden.has(accId)
    }
  }, [equippedPieces, accessories])

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
    prevTierRef.current = currentTier
    ceremonyActiveRef.current = true
    onTierUpStartRef.current?.()

    const cleanupCeremony = triggerTierUpCeremony({
      scene,
      armorMeshes: armorGroupsRef.current,
      equippedPieces,
      oldTier,
      newTier: currentTier,
      containerEl: container,
    })

    // After ceremony completes (~5s), notify parent and reset flag
    const timerId = setTimeout(() => {
      ceremonyActiveRef.current = false
      onTierUpRef.current?.(oldTier, currentTier)
    }, 5000)

    return () => {
      clearTimeout(timerId)
      cleanupCeremony()
    }
  }, [currentTier, equippedPieces])

  // ── Sync equipped pieces (without full rebuild) ─────────────────
  useEffect(() => {
    // Skip equipment sync during ceremony — the ceremony manages piece visibility
    if (ceremonyActiveRef.current) return

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
        applyTierToArmor(armorGroupsRef.current, currentTier, [pieceId], armorColors)

        // Add enchantment glow if tier qualifies (Iron+)
        if (tierHasGlow(currentTier) && group) {
          removeEnchantGlow(group) // clear any stale glow
          addEnchantGlow(group, currentTier)
        }

        // Play equip sound effect
        playEquipSound(pieceId)

        // Play equip ceremony + auto-pose
        if (characterRef.current) {
          const character = characterRef.current
          switch (pieceId) {
            case 'shoes':
              animateJump(character, 0.5, 400)
              break
            case 'helmet': {
              const headGrp = character.getObjectByName('headGroup')
              if (headGrp) animateNod(headGrp, 300)
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
          // Remove glow from unequipped piece
          removeEnchantGlow(group)

          const isUnlocked = totalXp >= XP_THRESHOLDS[pieceId as VoxelArmorPieceId]
          const tierTint = getTierTint(currentTier)
          const tierMat = TIER_MATERIALS[tierTint] ?? TIER_MATERIALS.wood
          group.visible = true
          if (pieceId === 'shield' && !isUnlocked) {
            group.scale.set(0.85, 0.85, 0.85)
          }
          group.traverse((child) => {
            if (child instanceof THREE.Mesh && !child.userData.isGlow) {
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
      applyTierToArmor(armorGroupsRef.current, currentTier, equippedPieces, armorColors)
      enforceArmorOpacity(armorGroupsRef.current, equippedPieces)
    }

    // Update equipment-based idle pose
    equipPoseRef.current?.(equippedPieces)

    prevEquippedRef.current = current
  }, [equippedPieces, currentTier, totalXp, onPoseComplete, resolvedFeatures, armorColors])

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
