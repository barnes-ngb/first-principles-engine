import { useEffect, useRef, useCallback, useMemo, forwardRef, useImperativeHandle } from 'react'
import * as THREE from 'three'
import Box from '@mui/material/Box'

import type { AccessoryId, AvatarBackground, AvatarProfile, CharacterFeatures, CharacterProportions, OutfitCustomization, VoxelArmorPieceId } from '../../core/types'
import { DEFAULT_CHARACTER_FEATURES } from '../../core/types'
import { buildCharacter, applyProfileOutfit } from './voxel/buildCharacter'
import { buildArmorPiece, VOXEL_ARMOR_PIECES } from './voxel/buildArmorPiece'
import { getPieceForgedTier } from './armorTierProgress'
import { animateEquip, animateUnequip, animateJump, animateNod, animateSwordFlourish, animateHipTurn, animateTorsoPuff } from './voxel/equipAnimation'
import { createTouchControls, updateRotation, destroyTouchControls } from './voxel/touchControls'
import type { TouchControlState } from './voxel/touchControls'
import { applyTierToArmor, calculateTier, getTierTint, TIER_MATERIALS } from './voxel/tierMaterials'
import { addEnchantGlow, removeEnchantGlow, animateEnchantGlow, tierHasGlow } from './voxel/enchantmentGlow'
import { buildBaseCape, animateCape, resolveCapeColor } from './voxel/buildCape'
import { triggerTierUpCeremony } from './voxel/tierUpCeremony'
import { PoseAnimator, POSES, applyExpression, getEquipmentIdlePose, getScaledExpression } from './voxel/poseSystem'
import type { Pose } from './voxel/poseSystem'
import { applyPaintedFace, applyFaceWithAIFallback } from './voxel/pixelFace'
import { buildHelmHair } from './voxel/buildHair'
import { frameCameraToCharacter } from './voxel/cameraUtils'
import { playEquipSound } from './voxel/equipSound'
import { buildShieldEmblem } from './voxel/buildShieldEmblem'
import { buildHelmetCrest } from './voxel/buildHelmetCrest'
import { buildRoom } from './voxel/buildRoom'
import { addOutlinesToGroup, removeOutlinesFromGroup } from './voxel/blockOutline'
import { buildAccessory, getAccessoryAttachPoint, animateAccessories, getHiddenAccessories } from './voxel/buildAccessory'
import { HERO_ANIMATION_TUNING, resolveHeroAnimationTuning, type HeroAnimationTuningOverride } from './voxel/heroAnimationTuning'
import type { WeaponDebugValues } from './weaponDebug'
import {
  getCurrentSeason,
  getSeasonalStarColor,
  tintPlatformColor,
  applySeasonalLighting,
  createFallingParticles,
  animateParticles,
  addChristmasStar,
  animateChristmasStar,
  addChristmasPlatformBlocks,
  addEasterEggs,
  getSeasonalTheme,
} from './voxel/seasonalTheme'
import type { FallingParticle } from './voxel/seasonalTheme'

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
  /** Custom character body proportions (from Character Tuner) */
  proportions?: Partial<CharacterProportions>
  /** Optional runtime animation tuning overrides (debug only) */
  animationTuningOverrides?: HeroAnimationTuningOverride
  /**
   * TEMPORARY: when set, overrides the shield/sword group transforms each
   * frame so we can tune position/rotation on-device. Remove once values are
   * hardcoded into the builders.
   */
  weaponDebug?: WeaponDebugValues
  /** Per-tier forge record from the profile — drives per-piece geometry/material. */
  forgedPieces?: AvatarProfile['forgedPieces']
  /**
   * When set, show ALL 6 armor pieces built at this tier (geometry + materials),
   * overriding per-piece forged tiers and ignoring the equipped list. Used by
   * the armor gallery tabs so Lincoln can preview his full Wood/Stone/Iron look
   * regardless of what he's actually forged. `null`/`undefined` = normal mode.
   */
  previewTier?: string | null
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
    pose.armRRotZ = 0.64   // Wider default for clearer mobile silhouette
    pose.armRRotX = -0.15  // Slight forward tilt
  }
  if (equipped.includes('shield')) {
    pose.armLRotZ = 0.68   // Slightly wider to keep silhouette clean on mobile
    pose.armLRotX = -0.2   // Less forward pitch keeps shield readable and intentional
  }
  return pose
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}

function shapedArc(phase: number): number {
  const s = Math.sin(phase)
  return Math.sign(s) * Math.pow(Math.abs(s), 1.35)
}

function constrainArmPose(
  side: 'L' | 'R',
  rotX: number,
  rotZ: number,
  torsoLead: number,
  clearanceBoost = 0,
  tuning = HERO_ANIMATION_TUNING,
) {
  const sideConfig = tuning.guardrails.armBySide[side]
  const softTorso = tuning.guardrails.torsoSoftCollision
  const forwardX = clamp(rotX, tuning.armSwingClampX.min, tuning.armSwingClampX.max)
  const torsoSide = side === 'L' ? -1 : 1
  const torsoDrive = Math.max(0, torsoLead * torsoSide) * tuning.torsoAvoidanceGain
  const torsoT = clamp(
    (forwardX - softTorso.rotXStart) / (softTorso.rotXEnd - softTorso.rotXStart),
    0,
    1,
  )
  const torsoPush = torsoT * (softTorso.forearmClearance + softTorso.handClearance) + torsoDrive
  const minOutward = Math.max(
    sideConfig.rotZMin,
    tuning.torsoClearance + tuning.elbowOutBias + torsoPush + clearanceBoost,
    tuning.guardrails.elbowInwardCollapseLimit,
  )
  const outwardZ = clamp(rotZ, minOutward, Math.min(sideConfig.rotZMax, tuning.armSwingClampZ))
  return { rotX: forwardX, rotZ: outwardZ }
}

// ── Enforce solid opacity on equipped armor ──────────────────────────

function enforceArmorOpacity(
  armorMeshes: Map<VoxelArmorPieceId, THREE.Group>,
  equipped: string[],
) {
  for (const [pieceId, mesh] of armorMeshes) {
    const isEquipped = equipped.includes(pieceId)
    mesh.visible = isEquipped
    if (isEquipped) {
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
  const topStepY = 0.35 * s
  const topBlockH = 0.21 * s
  const topSurfaceY = topStepY + topBlockH / 2
  const bootClearance = 0.02 * s

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

  // Edge glow — thin bright line on front-facing platform edges
  const edgeColor = tierBaseColor ?? 0x888888
  const edgeMat = new THREE.MeshBasicMaterial({
    color: edgeColor,
    transparent: true,
    opacity: 0.5,
  })
  // Front edge of bottom step
  const frontEdge = new THREE.Mesh(new THREE.BoxGeometry(3.0 * s, 0.02 * s, 0.02 * s), edgeMat)
  frontEdge.position.set(0, -0.125 * s + 0.125 * s, 1.0 * s)
  platform.add(frontEdge)
  // Front edge of top step
  const topEdge = new THREE.Mesh(new THREE.BoxGeometry(2.4 * s, 0.02 * s, 0.02 * s), edgeMat.clone())
  topEdge.position.set(0, 0.35 * s + 0.1 * s, 0.8 * s)
  platform.add(topEdge)

  // Shift platform so top surface sits just under foot contact.
  // This keeps boots grounded while preventing idle/emote clipping from tiny downward bob.
  platform.position.y = -(topSurfaceY + bootClearance)

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

  // Stars — varied sizes for depth, with seasonal color tinting
  const season = getCurrentSeason()
  const starSizes = [0.03, 0.04, 0.06] // tiny, small, medium
  for (let i = 0; i < 25; i++) {
    const sizeIdx = i < 3 ? 2 : (i < 8 ? 1 : 0) // 3 medium, 5 small, rest tiny
    const size = starSizes[sizeIdx]
    const isBright = i < 3 // First 3 are "bright" stars
    const starGeo = new THREE.BoxGeometry(size, size, size)
    const starMat = new THREE.MeshBasicMaterial({
      color: isBright ? 0xFFFFFF : getSeasonalStarColor(season),
      transparent: true,
      opacity: isBright ? 0.9 : (0.3 + Math.random() * 0.6),
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

  // Christmas: add Star of Bethlehem
  const seasonTheme = getSeasonalTheme(season)
  if (seasonTheme.christmasStar) {
    addChristmasStar(skyGroup)
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

export interface VoxelCharacterHandle {
  /** Capture the current scene as a PNG data URL */
  capture: () => string | null
}

const VoxelCharacter = forwardRef<VoxelCharacterHandle, VoxelCharacterProps>(function VoxelCharacter({
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
  proportions,
  animationTuningOverrides,
  forgedPieces,
  previewTier,
  weaponDebug,
}: VoxelCharacterProps, ref) {
  console.log('[VOXEL] previewTier prop:', previewTier)
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
  const particlesRef = useRef<FallingParticle[]>([])
  const backgroundRef = useRef(background)
  const equippedRef = useRef<string[]>([])
  // In preview mode, all 6 pieces should stay visible every frame. This ref
  // overrides equippedRef for visibility-only logic (enforceArmorOpacity)
  // without disturbing pose logic, which must stay keyed on real equipped.
  const visibleArmorRef = useRef<string[]>([])
  const runtimeTuning = useMemo(
    () => resolveHeroAnimationTuning(animationTuningOverrides),
    [animationTuningOverrides],
  )
  const tuningRef = useRef(runtimeTuning)
  tuningRef.current = runtimeTuning
  const poseAnimatorRef = useRef<PoseAnimator>(new PoseAnimator(() => tuningRef.current))
  const swipePoseIndexRef = useRef(0)
  const onSwipePoseRef = useRef(onSwipePose)
  const onPoseCompleteRef = useRef(onPoseComplete)
  const onTierUpStartRef = useRef(onTierUpStart)
  const onTierUpRef = useRef(onTierUp)
  const ceremonyActiveRef = useRef(false)
  const sceneActiveRef = useRef(false)
  // TEMPORARY: latest weapon debug values for the animate loop to read.
  const weaponDebugRef = useRef<WeaponDebugValues | undefined>(weaponDebug)
  weaponDebugRef.current = weaponDebug

  // Expose capture method to parent via ref
  useImperativeHandle(ref, () => ({
    capture: () => {
      const renderer = rendererRef.current
      const scene = sceneRef.current
      const camera = cameraRef.current
      if (!renderer || !scene || !camera) return null
      renderer.render(scene, camera)
      return renderer.domElement.toDataURL('image/png')
    },
  }), [])

  const equippedPieces = useMemo(
    () => (Array.isArray(equippedPiecesRaw) ? equippedPiecesRaw : []),
    [equippedPiecesRaw],
  )
  const resolvedFeatures = features ?? DEFAULT_CHARACTER_FEATURES
  // Display tier is derived from XP — the canonical source. profile.currentTier
  // holds the "active forge tier" (next tier to forge), which can run ahead of
  // XP-based achievement and must not be used for overall progression visuals.
  const currentTier = calculateTier(totalXp ?? 0)
  const armorColors = customization?.armorColors
  // Stable key so the init effect + resolver are keyed on forge-map CONTENT,
  // not the object reference (Firestore returns a fresh object each snapshot).
  const forgedPiecesKey = useMemo(() => {
    if (!forgedPieces) return ''
    const entries: string[] = []
    for (const tier of Object.keys(forgedPieces).sort()) {
      for (const pid of Object.keys(forgedPieces[tier] ?? {}).sort()) {
        entries.push(`${tier}:${pid}`)
      }
    }
    return entries.join('|')
  }, [forgedPieces])
  // Per-piece tier resolver: each equipped piece renders at the tier it was
  // forged at. Pieces with no forge record fall back to `currentTier` so legacy
  // profiles that predate the forge map keep rendering.
  const resolvePieceTier = useCallback(
    (pieceId: string): string => getPieceForgedTier(forgedPieces, pieceId, currentTier),
    // forgedPiecesKey captures the map's content; currentTier is the fallback.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [forgedPiecesKey, currentTier],
  )
  // Stable string key for proportions to avoid unnecessary scene rebuilds on same values
  const proportionsKey = useMemo(
    () => proportions ? JSON.stringify(proportions) : '',
    [proportions],
  )

  // Keep refs in sync so animation loop always has current values
  backgroundRef.current = background
  equippedRef.current = equippedPieces
  visibleArmorRef.current = previewTier
    ? VOXEL_ARMOR_PIECES.map((p) => p.id as string)
    : equippedPieces
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

    // Dispose any residual renderer.
    if (rendererRef.current) {
      rendererRef.current.dispose()
      rendererRef.current = null
    }
    // Always remove any existing canvas. The useEffect cleanup disposes the
    // renderer and nulls the ref, but the canvas DOM node stays attached
    // until we explicitly remove it. Without this, rebuilds (e.g. tier
    // preview) stack a second canvas and the stale frozen one occludes the
    // new scene inside the overflow:hidden container.
    const oldCanvas = container.querySelector('canvas')
    if (oldCanvas) container.removeChild(oldCanvas)

    const width = container.clientWidth
    const height = container.clientHeight

    // Scene — dark with slight blue tint (night default)
    const scene = new THREE.Scene()
    const bg = backgroundRef.current
    scene.background = new THREE.Color(bg === 'room' ? 0x2a2218 : 0x1a1a2e)
    sceneRef.current = scene

    // Build sky group (night background)
    const skyGroup = buildSkyGroup()
    skyGroup.visible = bg !== 'room'
    scene.add(skyGroup)
    skyGroupRef.current = skyGroup

    // Build room group (indoor background)
    const roomGroup = buildRoom()
    roomGroup.visible = bg === 'room'
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

    // Apply seasonal lighting adjustments to night lights
    const season = getCurrentSeason()
    applySeasonalLighting(nightLightsRef.current, season)

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
    for (const l of nightLightsRef.current) l.visible = bg !== 'room'
    for (const l of roomLightsRef.current) l.visible = bg === 'room'

    // Build character
    const character = buildCharacter(resolvedFeatures, ageGroup, proportions)
    characterRef.current = character
    scene.add(character)

    // Build armor pieces — sword/shield attach to arms, helmet to headGroup,
    // breastplate arm covers attach to arms
    armorGroupsRef.current.clear()
    const armL = character.getObjectByName('armL')
    const armR = character.getObjectByName('armR')
    const headGroup = character.getObjectByName('headGroup')

    // Preview mode: when a tier tab is selected in the gallery, show ALL 6
    // pieces at that tier regardless of what's forged/equipped. Normal mode:
    // show only equipped pieces at their individually forged tiers.
    const isPreview = !!previewTier
    const effectiveTier = (pieceId: string): string =>
      previewTier ?? resolvePieceTier(pieceId)
    const effectiveEquipped = isPreview
      ? VOXEL_ARMOR_PIECES.map((p) => p.id as string)
      : equippedPieces
    console.log('[VOXEL] Building armor with previewTier:', previewTier, 'isPreview:', isPreview, 'effectiveEquipped:', effectiveEquipped)

    for (const pieceMeta of VOXEL_ARMOR_PIECES) {
      // Each piece is rendered at its own forged tier, not the global XP tier —
      // this is what makes mixed loadouts (e.g. Iron belt + Stone chestplate)
      // actually show different geometry per piece.
      const pieceTier = effectiveTier(pieceMeta.id)
      console.log('[VOXEL] buildArmorPiece called:', pieceMeta.id, 'tier:', pieceTier)
      const pieceGroup = buildArmorPiece(pieceMeta.id, ageGroup, proportions, pieceTier)
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

    // Set initial visibility — effectiveEquipped is all 6 in preview mode.
    for (const [pieceId, group] of armorGroupsRef.current) {
      const isEquipped = effectiveEquipped.includes(pieceId)

      if (isEquipped) {
        group.visible = true
        group.scale.set(1, 1, 1)
      } else {
        group.visible = false
      }
    }
    // Apply tier materials via the same effective resolver.
    applyTierToArmor(armorGroupsRef.current, effectiveTier, effectiveEquipped)
    prevEquippedRef.current = new Set(equippedPieces)
    prevTierRef.current = currentTier

    // Shield emblem — add selected emblem design to shield front face
    const shieldGroup = armorGroupsRef.current.get('shield')
    if (shieldGroup) {
      const scale = ageGroup === 'younger' ? 0.88 : 1.0
      const U = 0.125 * scale
      const emblemType = customization?.shieldEmblem ?? 'cross'
      // Phase A: emblem follows tier accent only (dye re-enabled in Phase B).
      const tierTintKey = getTierTint(effectiveTier('shield'))
      const tierMatRef = TIER_MATERIALS[tierTintKey] ?? TIER_MATERIALS.wood
      const emblemColor = tierMatRef.accent
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
      // Phase A: crest follows tier accent only (dye re-enabled in Phase B).
      const tierTintKey = getTierTint(effectiveTier('helmet'))
      const tierMatRef = TIER_MATERIALS[tierTintKey] ?? TIER_MATERIALS.wood
      const crestColor = tierMatRef.accent
      const crest = buildHelmetCrest(crestType, U, crestColor)
      if (crest) helmetGroup.add(crest)
    }

    // ── Build & attach accessories ──────────────────────────────────
    accessoryGroupsRef.current.clear()
    const hiddenAccessories = getHiddenAccessories(equippedPieces, accessories)
    for (const accId of accessories) {
      const accGroup = buildAccessory(accId as AccessoryId, ageGroup, undefined, proportions)
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

    // Enchantment glow (Iron tier+) — each equipped piece glows according to
    // its own forged tier, so a Stone piece stays matte next to an Iron one.
    // Preview mode glows every piece at the preview tier.
    for (const pieceId of effectiveEquipped) {
      const pieceTier = effectiveTier(pieceId)
      if (!tierHasGlow(pieceTier)) continue
      const group = armorGroupsRef.current.get(pieceId as VoxelArmorPieceId)
      if (group) addEnchantGlow(group, pieceTier)
    }

    // Cape — always part of base outfit (Legends hero style) unless disabled via tuner
    // Tier Gold+ overrides color; otherwise uses customization or age-group default
    const showCape = proportions?.cape !== false
    const torso = character.getObjectByName('torso')
    if (torso && showCape) {
      const capeColor = resolveCapeColor(currentTier, ageGroup, customization?.capeColor)
      const cape = buildBaseCape(ageGroup, capeColor, proportions)
      torso.add(cape)
    }

    // Apply saved outfit colors
    applyProfileOutfit(character, customization)

    // ── Edge outlines — Minecraft Legends block definition ──────────
    // Body parts get standard outlines
    addOutlinesToGroup(character, 0.25)
    // Equipped armor outlines scale with each piece's own forged tier —
    // wood is soft (0.15), iron is sharp (0.25), netherite stands out (0.35).
    for (const pieceId of effectiveEquipped) {
      const pieceTier = effectiveTier(pieceId)
      const edgeOpacity =
        TIER_MATERIALS[getTierTint(pieceTier)]?.edgeOpacity ?? 0.2
      const group = armorGroupsRef.current.get(pieceId as VoxelArmorPieceId)
      if (group) addOutlinesToGroup(group, edgeOpacity)
    }
    // Cape gets very subtle outlines (should feel soft)
    const capeMesh = character.getObjectByName('cape') ?? scene.getObjectByName('cape')
    if (capeMesh instanceof THREE.Group) addOutlinesToGroup(capeMesh, 0.15)

    // Apply helmet hair if helmet is initially equipped
    if (equippedPieces.includes('helmet')) {
      applyHelmHairStyle(character, true, resolvedFeatures)
    }

    // Platform — tinted to match tier + seasonal color
    const tierTint = getTierTint(currentTier)
    const tierMat = TIER_MATERIALS[tierTint] ?? TIER_MATERIALS.wood
    const platformColor = tintPlatformColor(tierMat.primary, season)
    const platform = buildPlatform(ageGroup, platformColor)
    platform.position.y = character.position.y

    // Seasonal platform decorations
    const seasonTheme = getSeasonalTheme(season)
    const scaleForPlatform = ageGroup === 'younger' ? 0.88 : 1.0
    if (seasonTheme.christmasPlatform) {
      addChristmasPlatformBlocks(platform, scaleForPlatform)
    }
    if (seasonTheme.easterEggs) {
      addEasterEggs(platform, scaleForPlatform)
    }

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

    // Seasonal falling particles (snow, leaves, etc.)
    particlesRef.current = createFallingParticles(season, scene)

    // Renderer
    const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true })
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
          applyExpression(characterRef.current, getScaledExpression('idle', tuningRef.current))
        }
        const idlePose = getEquipmentIdlePose(equippedRef.current)
        poseAnimatorRef.current.play(idlePose, () => {
          onPoseCompleteRef.current?.()
        })
      })
      // Apply facial expression for this pose
      if (characterRef.current) {
        applyExpression(characterRef.current, getScaledExpression(pose.id, tuningRef.current))
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
    let baseFootL = 0
    let baseFootR = 0
    const baseFootYByPart = new Map<string, number>()
    let baseFootCaptured = false
    let baseArmLY = 0
    let baseArmRY = 0
    let baseHeadX = 0
    let baseHeadY = 0
    let baseShouldersCaptured = false
    let wasPoseActiveLastFrame = false
    let lastPoseEndTime = -Infinity

    sceneActiveRef.current = true

    function animate() {
      if (!sceneActiveRef.current) return
      rafRef.current = requestAnimationFrame(animate)

      if (controlsRef.current && characterRef.current) {
        updateRotation(characterRef.current, controlsRef.current)
      }

      // Enforce solid opacity on equipped armor every frame (skip during ceremony).
      // Use visibleArmorRef so preview mode keeps all 6 pieces showing.
      if (!ceremonyActiveRef.current) {
        enforceArmorOpacity(armorGroupsRef.current, visibleArmorRef.current)
      }

      if (characterRef.current) {
        const dt = clock.getDelta()
        const time = clock.getElapsedTime()

        // Gentle breathing bob (freeze during ceremony so character stays still)
        if (!ceremonyActiveRef.current) {
          const breath = Math.sin(time * 1.45) * 0.7 + Math.sin(time * 2.9 + 0.7) * 0.3
          const weightShift = shapedArc(time * 0.92 + 0.35)
          const tuning = tuningRef.current
          characterRef.current.position.y = baseY + breath * tuning.bodyBobAmplitude
          characterRef.current.position.x = weightShift * tuning.bodyLateralShift

          // Animate ground shadow scale with character bob
          const shadowMesh = scene.getObjectByName('groundShadow')
          if (shadowMesh) {
            const bobScale = 1 + breath * tuningRef.current.bodyBobAmplitude
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
        const torsoObj = characterRef.current.getObjectByName('torso')
        const legLObj = characterRef.current.getObjectByName('legL')
        const legRObj = characterRef.current.getObjectByName('legR')

        if (!baseFootCaptured && legLObj && legRObj) {
          baseFootL = legLObj.position.x
          baseFootR = legRObj.position.x
          for (const name of ['legL', 'bootL', 'bootBandL', 'legR', 'bootR', 'bootBandR'] as const) {
            const part = characterRef.current.getObjectByName(name)
            if (part) baseFootYByPart.set(name, part.position.y)
          }
          baseFootCaptured = true
        }
        if (!baseShouldersCaptured && armLObj && armRObj && headObj) {
          baseArmLY = armLObj.position.y
          baseArmRY = armRObj.position.y
          baseHeadX = headObj.position.x
          baseHeadY = headObj.position.y
          baseShouldersCaptured = true
        }

        // Check if pose animator is actively playing (skip during ceremony)
        const poseActive = !ceremonyActiveRef.current && armLObj && armRObj && headObj && poseAnimator.update(
          armLObj, armRObj, headObj, characterRef.current, performance.now(),
        )

        if (wasPoseActiveLastFrame && !poseActive) {
          lastPoseEndTime = time
        }
        wasPoseActiveLastFrame = Boolean(poseActive)

        if (!poseActive && !ceremonyActiveRef.current) {
          const tuning = tuningRef.current
          const timeSincePoseEnd = Math.max(0, time - lastPoseEndTime)
          const poseRecoveryT = clamp(
            1 - timeSincePoseEnd / tuning.postPoseClearanceDurationSec,
            0,
            1,
          )
          const postPoseArmClearanceBoost = tuning.postPoseArmClearanceBoost * poseRecoveryT
          // Lerp toward equipment-based idle pose + idle sway
          const lerpSpeed = Math.min(3.0 * dt, 1)
          currentEqPose.armLRotZ += (targetEqPose.armLRotZ - currentEqPose.armLRotZ) * lerpSpeed
          currentEqPose.armRRotZ += (targetEqPose.armRRotZ - currentEqPose.armRRotZ) * lerpSpeed
          currentEqPose.armLRotX += (targetEqPose.armLRotX - currentEqPose.armLRotX) * lerpSpeed
          currentEqPose.armRRotX += (targetEqPose.armRRotX - currentEqPose.armRRotX) * lerpSpeed

          const weightShift = shapedArc(time * 0.92 + 0.35)
          const heroCycle = time * 0.78
          const torsoLead = shapedArc(heroCycle - 0.24)

          if (torsoObj) {
            torsoObj.rotation.y = torsoLead * tuning.torsoTwist
            torsoObj.rotation.x = 0.01 + Math.sin(heroCycle * 2 + 0.4) * 0.012
            torsoObj.rotation.z = weightShift * 0.018
          }

          // Arm idle arcs — shaped wave keeps motion handcrafted and readable.
          const armSwayTime = heroCycle
          const leftArc = shapedArc(armSwayTime + tuning.armPhaseOffset * 0.5)
          const rightArc = shapedArc(armSwayTime - tuning.armPhaseOffset * 0.5)
          if (armLObj) {
            const armLRotX = currentEqPose.armLRotX
              + leftArc * tuning.armSwingX * tuning.shoulderSwing
              + Math.max(0, torsoLead) * 0.014 * tuning.shoulderSwing
            const armLRotZ = currentEqPose.armLRotZ
              + tuning.silhouetteBias.leftRotZ
              + leftArc * tuning.armSwingZ * tuning.shoulderSwing
              + Math.max(0, -weightShift) * 0.015 * tuning.shoulderSwing
            const constrained = constrainArmPose(
              'L',
              armLRotX,
              armLRotZ,
              torsoLead,
              postPoseArmClearanceBoost,
              tuning,
            )
            armLObj.rotation.z = -constrained.rotZ  // negate: +rotZ is outward convention, but left arm at -X needs negative rotation.z
            armLObj.rotation.x = constrained.rotX
            armLObj.position.y = baseArmLY + Math.max(0, -weightShift) * 0.018 * tuning.shoulderSwing
          }
          if (armRObj) {
            const armRRotX = currentEqPose.armRRotX
              - rightArc * tuning.armSwingX * tuning.shoulderSwing
              + Math.max(0, -torsoLead) * 0.014 * tuning.shoulderSwing
            const armRRotZ = currentEqPose.armRRotZ
              + tuning.silhouetteBias.rightRotZ
              - rightArc * tuning.armSwingZ * tuning.shoulderSwing
              + Math.max(0, weightShift) * 0.015 * tuning.shoulderSwing
            const constrained = constrainArmPose(
              'R',
              armRRotX,
              armRRotZ,
              torsoLead,
              postPoseArmClearanceBoost,
              tuning,
            )
            armRObj.rotation.z = constrained.rotZ
            armRObj.rotation.x = constrained.rotX
            armRObj.position.y = baseArmRY + Math.max(0, weightShift) * 0.018 * tuning.shoulderSwing
          }

          // Head and shoulders offsets — subtle asymmetry keeps idle alive.
          if (headObj) {
            headObj.rotation.y = shapedArc(heroCycle * 0.8 + 0.25) * tuning.headTurnAmount
            headObj.rotation.x = Math.sin(heroCycle * 1.7 + 1.1) * 0.02
            headObj.rotation.z = weightShift * 0.015
            headObj.position.x = baseHeadX + weightShift * 0.014
            headObj.position.y = baseHeadY + Math.sin(heroCycle * 1.7 + 0.4) * 0.006
          }
        }

        if (!ceremonyActiveRef.current) {
          const tuning = tuningRef.current
          const isEmote = poseActive && poseAnimator.currentPoseId !== 'idle'
          const footCenter = (baseFootL + baseFootR) * 0.5
          const minSeparation = tuning.footSeparation * (isEmote ? tuning.emoteFootSeparationMultiplier : 1)
          const stanceHalf = Math.max(tuning.stanceWidth * 0.5, minSeparation * 0.5 + 0.01)
          const inwardRoom = Math.max(0, stanceHalf - minSeparation * 0.5)
          const swayScale = isEmote ? 0.2 : 1
          const maxSafeSway = Math.min(tuning.footSway * swayScale, inwardRoom * 0.85)
          const leftStep = shapedArc(time * 0.92 + Math.PI * 0.1)
          const rightStep = shapedArc(time * 0.92 + Math.PI * 1.1)
          const footSpread = (leftStep - rightStep) * 0.5 * maxSafeSway
          let leftX = footCenter - stanceHalf - footSpread + Math.min(0, shapedArc(time * 0.92 + 0.35)) * 0.008
          let rightX = footCenter + stanceHalf + footSpread + Math.max(0, shapedArc(time * 0.92 + 0.35)) * 0.008
          if (rightX - leftX < minSeparation) {
            const center = (leftX + rightX) * 0.5
            leftX = center - minSeparation * 0.5
            rightX = center + minSeparation * 0.5
          }
          const centerGap = Math.max(tuning.footCenterLineGap, minSeparation * 0.42)
          leftX = Math.min(leftX, -centerGap)
          rightX = Math.max(rightX, centerGap)
          for (const [name, x] of [
            ['legL', leftX],
            ['bootL', leftX],
            ['bootBandL', leftX],
            ['legR', rightX],
            ['bootR', rightX],
            ['bootBandR', rightX],
          ] as const) {
            const part = characterRef.current.getObjectByName(name)
            if (part) {
              part.position.x = x
              const planted = name.includes('L')
                ? 1 - Math.max(0, leftStep)
                : 1 - Math.max(0, rightStep)
              const swayLift = (1 - planted) * tuning.footLift * (isEmote ? 0.25 : 1)
              const basePartY = baseFootYByPart.get(name) ?? baseFootYByPart.get(name.includes('L') ? 'legL' : 'legR') ?? 0
              part.position.y = basePartY + tuning.footPlantY + swayLift
            }
          }
        }
      }

      // TEMPORARY: apply weapon debug overrides each frame so on-device sliders
      // mutate shield/sword transforms in real time. Remove with the rest of
      // the weapon debug scaffolding once final values are baked in.
      const debug = weaponDebugRef.current
      if (debug) {
        const s = ageGroup === 'younger' ? 0.85 : 1.0
        const shieldDbg = armorGroupsRef.current.get('shield')
        if (shieldDbg) {
          shieldDbg.position.set(debug.shield.posX * s, debug.shield.posY * s, debug.shield.posZ * s)
          shieldDbg.rotation.set(debug.shield.rotX, debug.shield.rotY, debug.shield.rotZ)
        }
        const swordDbg = armorGroupsRef.current.get('sword')
        if (swordDbg) {
          swordDbg.position.set(debug.sword.posX * s, debug.sword.posY * s, debug.sword.posZ * s)
          swordDbg.rotation.set(debug.sword.rotX, debug.sword.rotY, debug.sword.rotZ)
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

      // Seasonal particle animation (snow, leaves)
      animateParticles(particlesRef.current)

      // Christmas star glow pulse
      animateChristmasStar(scene, twinkleTime)

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
  }, [resolvedFeatures, ageGroup, equippedPieces, currentTier, resolvePieceTier, skinTextureUrl, customization, accessories, proportions, previewTier])

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
      particlesRef.current = []
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resolvedFeatures.skinTone, resolvedFeatures.hairColor, resolvedFeatures.hairStyle, resolvedFeatures.hairLength, resolvedFeatures.eyeColor, ageGroup, proportionsKey, previewTier])

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
  // Phase A: dye is disabled in applyTierToArmor, but we still refresh
  // materials here so new colorJitter variations appear on customization
  // changes. Skipped while previewing a tier (full rebuild handles it).
  useEffect(() => {
    if (previewTier) return
    if (!armorColors || equippedPieces.length === 0) return
    applyTierToArmor(armorGroupsRef.current, resolvePieceTier, equippedPieces)
    enforceArmorOpacity(armorGroupsRef.current, equippedPieces)
  }, [armorColors, resolvePieceTier, equippedPieces, previewTier])

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
    // Skip while previewing a tier — all 6 pieces are shown at the preview tier
    // and the underlying equipped state should not re-hide them.
    if (previewTier) return

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
        applyTierToArmor(armorGroupsRef.current, resolvePieceTier, [pieceId])

        // Edge outlines + enchantment glow follow this piece's own forged tier.
        const pieceTier = resolvePieceTier(pieceId)
        const tierEdge =
          TIER_MATERIALS[getTierTint(pieceTier)]?.edgeOpacity ?? 0.2
        if (group) addOutlinesToGroup(group, tierEdge)

        if (tierHasGlow(pieceTier) && group) {
          removeEnchantGlow(group) // clear any stale glow
          addEnchantGlow(group, pieceTier)
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
              if (characterRef.current) applyExpression(characterRef.current, getScaledExpression(autoPose.id, tuningRef.current))
              poseAnimatorRef.current.play(autoPose, () => {
                if (characterRef.current) applyExpression(characterRef.current, getScaledExpression('idle', tuningRef.current))
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

    // Unequipped pieces -> completely hidden
    for (const pieceId of prev) {
      if (!current.has(pieceId)) {
        // If helmet was unequipped, restore full hair
        if (pieceId === 'helmet' && characterRef.current) {
          applyHelmHairStyle(characterRef.current, false, resolvedFeatures)
        }
        const group = armorGroupsRef.current.get(pieceId as VoxelArmorPieceId)
        if (group) {
          // Remove glow + outlines from unequipped piece
          removeEnchantGlow(group)
          removeOutlinesFromGroup(group)
          group.visible = false
        }
      }
    }

    // Ensure ALL currently equipped pieces have solid per-piece tier materials
    if (current.size > 0) {
      applyTierToArmor(armorGroupsRef.current, resolvePieceTier, equippedPieces)
      enforceArmorOpacity(armorGroupsRef.current, equippedPieces)
    }

    // Update equipment-based idle pose
    equipPoseRef.current?.(equippedPieces)

    prevEquippedRef.current = current
  }, [equippedPieces, resolvePieceTier, onPoseComplete, resolvedFeatures, previewTier])

  // ── Handle explicit pose trigger (from PoseButtons) ────────────
  useEffect(() => {
    if (!activePoseId || activePoseId === 'idle') return
    const pose = POSES.find((p) => p.id === activePoseId) as Pose | undefined
    if (!pose) return

    // Apply facial expression
    if (characterRef.current) {
      applyExpression(characterRef.current, getScaledExpression(pose.id, tuningRef.current))
    }

    poseAnimatorRef.current.play(pose, () => {
      if (characterRef.current) {
        applyExpression(characterRef.current, getScaledExpression('idle', tuningRef.current))
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
        // Scene fade-in on load
        animation: 'sceneFadeIn 0.4s ease-out',
        '@keyframes sceneFadeIn': {
          '0%': { opacity: 0 },
          '100%': { opacity: 1 },
        },
        // Subtle vignette — darkens corners for depth
        boxShadow: 'inset 0 0 80px rgba(0,0,0,0.4)',
      }}
    />
  )
})

export default VoxelCharacter
