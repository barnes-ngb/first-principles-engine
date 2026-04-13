import { useEffect, useRef, useCallback } from 'react'
import * as THREE from 'three'
import Box from '@mui/material/Box'
import Typography from '@mui/material/Typography'

import type { AvatarBackground, AvatarProfile, CharacterFeatures, VoxelArmorPieceId } from '../../core/types'
import { buildCharacter, applyProfileOutfit } from './voxel/buildCharacter'
import { buildArmorPiece, VOXEL_ARMOR_PIECES, XP_THRESHOLDS } from './voxel/buildArmorPiece'
import { applyTierToArmor, calculateTier, getTierTint, TIER_MATERIALS } from './voxel/tierMaterials'
import { PoseAnimator, POSES, POSE_EXPRESSIONS, applyExpression, getEquipmentIdlePose } from './voxel/poseSystem'
import type { Pose } from './voxel/poseSystem'
import { applyPaintedFace, applyFaceWithAIFallback } from './voxel/pixelFace'
import { buildHelmHair } from './voxel/buildHair'
import { buildRoom } from './voxel/buildRoom'
import {
  getCurrentSeason,
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

// ── Types ────────────────────────────────────────────────────────────

interface ChildData {
  name: string
  profile: AvatarProfile
  features: CharacterFeatures
  ageGroup: 'older' | 'younger'
  equippedPieces: string[]
  totalXp: number
}

interface BrothersVoxelSceneProps {
  lincoln: ChildData | null
  london: ChildData | null
  activePoseId?: string | null
  onPoseComplete?: () => void
  background?: AvatarBackground
}

// ── Helpers ──────────────────────────────────────────────────────────

function lerpPlatformColor(a: number, b: number, t: number): number {
  const ca = new THREE.Color(a)
  const cb = new THREE.Color(b)
  ca.lerp(cb, t)
  return ca.getHex()
}

function buildPedestal(tierColor: number): THREE.Group {
  const pedestal = new THREE.Group()
  pedestal.name = 'platform'

  const stoneMat = new THREE.MeshPhongMaterial({
    color: 0x3A3A3A, specular: 0x222222, shininess: 10, flatShading: true,
  })
  const tierMat = new THREE.MeshPhongMaterial({
    color: tierColor, specular: 0x444444, shininess: 15, flatShading: true,
  })
  const topColor = lerpPlatformColor(tierColor, 0xFFFFFF, 0.15)
  const topMat = new THREE.MeshPhongMaterial({
    color: topColor, specular: 0x555555, shininess: 20, flatShading: true,
  })

  // Wide dark base
  const base = new THREE.Mesh(new THREE.BoxGeometry(3.5, 0.3, 3.5), stoneMat)
  base.position.set(0, -0.15, 0)
  pedestal.add(base)

  // Middle tier-colored step
  const mid = new THREE.Mesh(new THREE.BoxGeometry(2.8, 0.25, 2.8), tierMat)
  mid.position.set(0, 0.25, 0)
  pedestal.add(mid)

  // Light top surface
  const top = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.15, 2.2), topMat)
  top.position.set(0, 0.55, 0)
  pedestal.add(top)

  // Gold edge glow on top step
  const glowMat = new THREE.MeshBasicMaterial({ color: 0xFFD700, transparent: true, opacity: 0.25 })
  const edges: [number, number, number, number, number, number][] = [
    [0, 0.63, 1.1, 2.2, 0.02, 0.02],     // front
    [0, 0.63, -1.1, 2.2, 0.02, 0.02],     // back
    [-1.1, 0.63, 0, 0.02, 0.02, 2.2],     // left
    [1.1, 0.63, 0, 0.02, 0.02, 2.2],      // right
  ]
  for (const [x, y, z, w, h, d] of edges) {
    const edge = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), glowMat)
    edge.position.set(x, y, z)
    pedestal.add(edge)
  }

  return pedestal
}

function buildGradientSky(scene: THREE.Scene) {
  const canvas = document.createElement('canvas')
  canvas.width = 2
  canvas.height = 256
  const ctx = canvas.getContext('2d')!

  const grad = ctx.createLinearGradient(0, 0, 0, 256)
  grad.addColorStop(0, '#0B0D1A')     // deep space (top)
  grad.addColorStop(0.3, '#0F1B2E')   // dark blue
  grad.addColorStop(0.6, '#1A2A3A')   // steel blue-gray
  grad.addColorStop(0.85, '#1E2E2E')  // dark teal
  grad.addColorStop(1, '#1A2820')     // forest floor hint
  ctx.fillStyle = grad
  ctx.fillRect(0, 0, 2, 256)

  const tex = new THREE.CanvasTexture(canvas)
  const mat = new THREE.MeshBasicMaterial({ map: tex, side: THREE.DoubleSide, depthWrite: false })
  const plane = new THREE.Mesh(new THREE.PlaneGeometry(60, 40), mat)
  plane.position.set(0, 8, -25)
  plane.renderOrder = -1
  plane.name = 'gradientSky'
  scene.add(plane)
}

function buildSkyGroup(): THREE.Group {
  const skyGroup = new THREE.Group()
  skyGroup.name = 'skyGroup'

  const terrainColor = 0x0D0D1A
  for (let i = 0; i < 14; i++) {
    const w = 1 + Math.random() * 2
    const h = 0.5 + Math.random() * 2
    const hillGeo = new THREE.BoxGeometry(w, h, 0.5)
    const hillMat = new THREE.MeshLambertMaterial({ color: terrainColor })
    const hill = new THREE.Mesh(hillGeo, hillMat)
    hill.position.set((Math.random() - 0.5) * 18, h / 2 - 2, -8 - Math.random() * 4)
    skyGroup.add(hill)
  }

  const moonGeo = new THREE.CircleGeometry(0.8, 8)
  const moonMat = new THREE.MeshBasicMaterial({ color: 0xFFFFDD, transparent: true, opacity: 0.5 })
  const moon = new THREE.Mesh(moonGeo, moonMat)
  moon.position.set(6, 6, -6)
  skyGroup.add(moon)

  // Quality stars — wider spread, varied brightness
  for (let i = 0; i < 40; i++) {
    const size = 0.015 + Math.random() * 0.04
    const brightness = 0.2 + Math.random() * 0.8
    const starGeo = new THREE.BoxGeometry(size, size, size)
    const starMat = new THREE.MeshBasicMaterial({
      color: 0xFFFFFF,
      transparent: true,
      opacity: brightness,
    })
    const star = new THREE.Mesh(starGeo, starMat)
    star.position.set(
      (Math.random() - 0.5) * 30,
      2 + Math.random() * 18,
      -18 - Math.random() * 7,
    )
    star.userData.isStar = true
    star.userData.baseOpacity = brightness
    star.userData.twinkleSpeed = 0.8 + Math.random() * 2
    star.userData.twinklePhase = Math.random() * Math.PI * 2
    // Keep legacy name for seasonal compat
    star.name = 'twinkleStar'
    skyGroup.add(star)
  }

  // Christmas: add Star of Bethlehem
  const season = getCurrentSeason()
  const theme = getSeasonalTheme(season)
  if (theme.christmasStar) {
    addChristmasStar(skyGroup)
  }

  return skyGroup
}

function createGoldenParticles(scene: THREE.Scene, count: number = 12): THREE.Mesh[] {
  const particles: THREE.Mesh[] = []

  for (let i = 0; i < count; i++) {
    const size = 0.025 + Math.random() * 0.03
    const geo = new THREE.BoxGeometry(size, size, size)
    const mat = new THREE.MeshBasicMaterial({
      color: 0xFFD700,
      transparent: true,
      opacity: 0.3 + Math.random() * 0.3,
    })
    const p = new THREE.Mesh(geo, mat)

    p.position.set(
      (Math.random() - 0.5) * 5,
      -0.5 + Math.random() * 5,
      (Math.random() - 0.5) * 3,
    )

    p.userData.isGoldenParticle = true
    p.userData.drift = {
      x: (Math.random() - 0.5) * 0.003,
      y: 0.002 + Math.random() * 0.004,
      z: (Math.random() - 0.5) * 0.002,
    }
    p.userData.wobblePhase = Math.random() * Math.PI * 2

    scene.add(p)
    particles.push(p)
  }
  return particles
}

function applyHelmHairStyle(character: THREE.Group, isHelmetEquipped: boolean, features: CharacterFeatures) {
  const headGroup = character.getObjectByName('headGroup') as THREE.Group | undefined
  if (!headGroup) return
  const fullHair = headGroup.getObjectByName('hairGroup')
  let helmHair = headGroup.getObjectByName('helmHairGroup')
  const headMesh = headGroup.getObjectByName('head') as THREE.Mesh | undefined

  if (isHelmetEquipped) {
    if (fullHair) fullHair.visible = false
    if (!helmHair && headMesh) {
      const headGeo = headMesh.geometry as THREE.BoxGeometry
      const headWidth = headGeo.parameters.width
      const U = headWidth / 8
      const hairMat = new THREE.MeshLambertMaterial({ color: features.hairColor ?? '#6B4C32' })
      helmHair = buildHelmHair(hairMat, 0, U)
      headGroup.add(helmHair)
    }
    if (helmHair) helmHair.visible = true
  } else {
    if (fullHair) fullHair.visible = true
    if (helmHair) helmHair.visible = false
  }
}

/** Build a single character with armor attached and return the group + armor map */
function buildCharacterWithArmor(
  child: ChildData,
): { characterGroup: THREE.Group; armorMeshes: Map<VoxelArmorPieceId, THREE.Group> } {
  const character = buildCharacter(child.features, child.ageGroup)
  const armorMeshes = new Map<VoxelArmorPieceId, THREE.Group>()

  const armL = character.getObjectByName('armL')
  const armR = character.getObjectByName('armR')
  const headGroup = character.getObjectByName('headGroup')
  const currentTier = (child.profile.currentTier ?? calculateTier(child.totalXp)).toUpperCase()

  for (const pieceMeta of VOXEL_ARMOR_PIECES) {
    const pieceGroup = buildArmorPiece(pieceMeta.id, child.ageGroup)
    armorMeshes.set(pieceMeta.id, pieceGroup)

    const attachTo = pieceGroup.userData.attachToArm as string | undefined
    if (attachTo === 'R') {
      if (armR) armR.add(pieceGroup)
      else character.add(pieceGroup)
    } else if (attachTo === 'L') {
      if (armL) armL.add(pieceGroup)
      else character.add(pieceGroup)
    } else if (pieceMeta.id === 'helmet') {
      if (headGroup) headGroup.add(pieceGroup)
      else character.add(pieceGroup)
    } else {
      const armChildren: THREE.Object3D[] = []
      pieceGroup.traverse((obj) => {
        if (obj.userData.attachToArm) armChildren.push(obj)
      })
      for (const ac of armChildren) {
        pieceGroup.remove(ac)
        const targetArm = ac.userData.attachToArm === 'L' ? armL : armR
        if (targetArm) targetArm.add(ac)
        else character.add(ac)
      }
      character.add(pieceGroup)
    }
  }

  // Set visibility: equipped = solid, unlocked = translucent, locked = ghost
  for (const [pieceId, group] of armorMeshes) {
    const isEquipped = child.equippedPieces.includes(pieceId)
    const isUnlocked = child.totalXp >= XP_THRESHOLDS[pieceId]
    group.visible = true

    if (isEquipped) {
      group.scale.set(1, 1, 1)
    } else if (isUnlocked) {
      group.scale.set(1, 1, 1)
      group.traverse((obj) => {
        if (obj instanceof THREE.Mesh) {
          const mat = Array.isArray(obj.material) ? obj.material : [obj.material]
          for (const m of mat) {
            if (m instanceof THREE.MeshLambertMaterial) {
              m.transparent = true
              m.opacity = 0.15
              m.depthWrite = false
            }
          }
        }
      })
    } else {
      const tierTint = getTierTint(currentTier)
      const tierMat = TIER_MATERIALS[tierTint] ?? TIER_MATERIALS.wood
      group.scale.set(1, 1, 1)
      if (pieceId === 'shield') group.scale.set(0.85, 0.85, 0.85)
      group.traverse((obj) => {
        if (obj instanceof THREE.Mesh) {
          obj.material = new THREE.MeshLambertMaterial({
            color: tierMat.primary,
            transparent: true,
            opacity: 0.08,
            depthWrite: false,
          })
        }
      })
    }
  }

  applyTierToArmor(armorMeshes, currentTier, child.equippedPieces)
  applyProfileOutfit(character, child.profile.customization)

  if (child.equippedPieces.includes('helmet')) {
    applyHelmHairStyle(character, true, child.features)
  }

  return { characterGroup: character, armorMeshes }
}

/** Apply background mode to scene objects (extracted to avoid React compiler mutation tracking). */
function applyBackground(
  scene: THREE.Scene | null,
  skyGroup: THREE.Group | null,
  roomGroup: THREE.Group | null,
  nightLights: THREE.Object3D[],
  roomLights: THREE.Object3D[],
  background: string,
) {
  if (!scene) return
  const isRoom = background === 'room'
  scene.background = isRoom ? new THREE.Color(0x2a2218) : null
  if (skyGroup) skyGroup.visible = !isRoom
  if (roomGroup) roomGroup.visible = isRoom
  // Show/hide gradient sky plane
  const gradientSky = scene.getObjectByName('gradientSky')
  if (gradientSky) gradientSky.visible = !isRoom
  for (const l of nightLights) l.visible = !isRoom
  for (const l of roomLights) l.visible = isRoom
}

// ── Component ────────────────────────────────────────────────────────

export default function BrothersVoxelScene({
  lincoln,
  london,
  activePoseId,
  onPoseComplete,
  background = 'night',
}: BrothersVoxelSceneProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null)
  const sceneRef = useRef<THREE.Scene | null>(null)
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null)
  const rafRef = useRef<number>(0)
  const sceneActiveRef = useRef(false)
  const charactersRef = useRef<THREE.Group[]>([])
  const poseAnimatorRef = useRef<PoseAnimator[]>([])
  const skyGroupRef = useRef<THREE.Group | null>(null)
  const roomGroupRef = useRef<THREE.Group | null>(null)
  const nightLightsRef = useRef<THREE.Object3D[]>([])
  const roomLightsRef = useRef<THREE.Object3D[]>([])
  const particlesRef = useRef<FallingParticle[]>([])
  const goldenParticlesRef = useRef<THREE.Mesh[]>([])
  const backgroundRef = useRef(background)
  const onPoseCompleteRef = useRef(onPoseComplete)
  useEffect(() => {
    onPoseCompleteRef.current = onPoseComplete
  }, [onPoseComplete])
  useEffect(() => {
    backgroundRef.current = background
  }, [background])

  const initScene = useCallback(() => {
    const container = containerRef.current
    if (!container || (!lincoln && !london)) return

    sceneActiveRef.current = false
    cancelAnimationFrame(rafRef.current)
    rafRef.current = 0

    if (rendererRef.current) {
      rendererRef.current.dispose()
      rendererRef.current = null
      const oldCanvas = container.querySelector('canvas')
      if (oldCanvas) container.removeChild(oldCanvas)
    }

    const width = container.clientWidth
    const height = container.clientHeight

    const scene = new THREE.Scene()
    const bg = backgroundRef.current
    // Use null background for night so gradient sky shows through; room keeps solid color
    scene.background = bg === 'room' ? new THREE.Color(0x2a2218) : null
    scene.fog = new THREE.FogExp2(0x0F1520, 0.035)
    sceneRef.current = scene

    // Gradient sky plane (night background)
    if (bg !== 'room') {
      buildGradientSky(scene)
    }

    // Sky group (stars, moon, terrain silhouette)
    const skyGroup = buildSkyGroup()
    skyGroup.visible = bg !== 'room'
    scene.add(skyGroup)
    skyGroupRef.current = skyGroup

    // Room group (indoor background)
    const roomGroup = buildRoom()
    roomGroup.visible = bg === 'room'
    scene.add(roomGroup)
    roomGroupRef.current = roomGroup

    const camera = new THREE.PerspectiveCamera(35, width / height, 0.1, 100)
    cameraRef.current = camera

    // Night mode lighting — Minecraft Legends style
    // 1. AMBIENT — low, warm tint
    const ambient = new THREE.AmbientLight(0x352A1F, 0.35)
    scene.add(ambient)

    // 2. KEY LIGHT — warm golden, upper-right-front, strong
    const keyLight = new THREE.DirectionalLight(0xFFE4B5, 1.2)
    keyLight.position.set(4, 6, 3)
    scene.add(keyLight)

    // 3. FILL — cool blue, left side, soft
    const fillLight = new THREE.DirectionalLight(0x8CA8C8, 0.3)
    fillLight.position.set(-3, 2, 2)
    scene.add(fillLight)

    // 4. RIM — gold, from behind — THE Legends signature
    const rimLight = new THREE.DirectionalLight(0xFFD700, 0.5)
    rimLight.position.set(0, 3, -5)
    scene.add(rimLight)

    // 5. BOUNCE — warm from below, very subtle
    const bounceLight = new THREE.DirectionalLight(0xDEB887, 0.15)
    bounceLight.position.set(0, -2, 2)
    scene.add(bounceLight)

    nightLightsRef.current = [keyLight, fillLight, rimLight, ambient, bounceLight]

    // Apply seasonal lighting adjustments to night lights
    const season = getCurrentSeason()
    applySeasonalLighting(nightLightsRef.current, season)

    // Room mode lighting — Legends style, warmer/cozier variant
    const roomAmbient = new THREE.AmbientLight(0x3D2E1F, 0.4)
    scene.add(roomAmbient)

    const roomKeyLight = new THREE.DirectionalLight(0xFFE4B5, 1.0)
    roomKeyLight.position.set(3, 6, 4)
    scene.add(roomKeyLight)

    const roomFill = new THREE.DirectionalLight(0x8CA8C8, 0.2)
    roomFill.position.set(-3, 4, 2)
    scene.add(roomFill)

    const roomRim = new THREE.DirectionalLight(0xFFD700, 0.4)
    roomRim.position.set(0, 3, -5)
    scene.add(roomRim)

    roomLightsRef.current = [roomAmbient, roomKeyLight, roomFill, roomRim]

    for (const l of nightLightsRef.current) l.visible = bg !== 'room'
    for (const l of roomLightsRef.current) l.visible = bg === 'room'

    // Build characters
    const characters: THREE.Group[] = []
    const animators: PoseAnimator[] = []
    const childrenData = [lincoln, london].filter(Boolean) as ChildData[]
    const spacing = childrenData.length === 2 ? 1.8 : 0
    const offsets = childrenData.length === 2 ? [-spacing, spacing] : [0]

    childrenData.forEach((child, i) => {
      const { characterGroup } = buildCharacterWithArmor(child)
      characterGroup.position.x = offsets[i]
      scene.add(characterGroup)
      characters.push(characterGroup)

      // Stone pedestal per character (with tier color + seasonal tint)
      const tierTint = getTierTint((child.profile.currentTier ?? calculateTier(child.totalXp)).toUpperCase())
      const tierMat = TIER_MATERIALS[tierTint] ?? TIER_MATERIALS.wood
      const platformColor = tintPlatformColor(tierMat.primary, season)
      const platform = buildPedestal(platformColor)
      platform.position.x = offsets[i]
      platform.position.y = characterGroup.position.y - 0.35

      // Seasonal platform decorations
      const seasonTheme = getSeasonalTheme(season)
      const scaleForPlatform = child.ageGroup === 'younger' ? 0.88 : 1.0
      if (seasonTheme.christmasPlatform) {
        addChristmasPlatformBlocks(platform, scaleForPlatform)
      }
      if (seasonTheme.easterEggs) {
        addEasterEggs(platform, scaleForPlatform)
      }

      scene.add(platform)

      // Shadow
      const scaleVal = child.ageGroup === 'younger' ? 0.88 : 1.0
      const shadowGeo = new THREE.CircleGeometry(0.8 * scaleVal, 16)
      const shadowMat = new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.2, depthWrite: false })
      const shadow = new THREE.Mesh(shadowGeo, shadowMat)
      shadow.rotation.x = -Math.PI / 2
      shadow.position.set(offsets[i], 0.01, 0)
      scene.add(shadow)

      // Pose animator per character
      animators.push(new PoseAnimator())

      // Apply face
      const resolvedFeatures = child.features
      const headMesh = characterGroup.getObjectByName('head') as THREE.Mesh | undefined
      if (headMesh) {
        const skinHex = new THREE.Color(resolvedFeatures.skinTone ?? '#F5D6B8').getHex()
        const skinUrl = child.profile.skinTextureUrl
        if (skinUrl) {
          void applyFaceWithAIFallback(headMesh, characterGroup, resolvedFeatures, skinHex, skinUrl)
        } else {
          applyPaintedFace(headMesh, characterGroup, resolvedFeatures, skinHex)
        }
      }
    })

    charactersRef.current = characters
    poseAnimatorRef.current = animators

    // Seasonal falling particles (snow, leaves, etc.)
    particlesRef.current = createFallingParticles(season, scene)

    // Golden particles — THE Legends signature
    goldenParticlesRef.current = createGoldenParticles(scene)

    // Frame camera to fit both characters
    if (characters.length > 0) {
      const box = new THREE.Box3()
      for (const ch of characters) {
        box.expandByObject(ch)
      }
      const center = box.getCenter(new THREE.Vector3())
      const size = box.getSize(new THREE.Vector3())
      const maxDim = Math.max(size.x, size.y, size.z)
      const fov = camera.fov * (Math.PI / 180)
      const distance = (maxDim / (2 * Math.tan(fov / 2))) * 1.45
      camera.position.set(center.x, center.y, center.z + distance)
      camera.lookAt(center)
      camera.updateProjectionMatrix()
    }

    // Renderer
    const renderer = new THREE.WebGLRenderer({ antialias: true })
    renderer.setSize(width, height)
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    container.appendChild(renderer.domElement)
    rendererRef.current = renderer

    // Animation loop
    const clock = new THREE.Clock()
    const baseYs = characters.map((c) => c.position.y)
    sceneActiveRef.current = true

    function animate() {
      if (!sceneActiveRef.current) return
      rafRef.current = requestAnimationFrame(animate)
      const time = clock.getElapsedTime()

      characters.forEach((character, idx) => {
        // Breathing bob — 3s period, subtle amplitude
        character.position.y = baseYs[idx] + Math.sin(time * 2.1 + idx * 0.5) * 0.02

        // Idle blink
        const blinkCycle = time % (3 + Math.sin(time * 0.37 + idx) * 1.5)
        const isBlinking = blinkCycle < 0.12
        const eyeNames = ['eyeWhiteL', 'eyeWhiteR', 'pupilL', 'pupilR']
        const animator = poseAnimatorRef.current[idx]
        if (!animator?.playing) {
          for (const eName of eyeNames) {
            const eyeMesh = character.getObjectByName(eName)
            if (eyeMesh) eyeMesh.scale.y = isBlinking ? 0.1 : 1
          }
        }

        const armLObj = character.getObjectByName('armL')
        const armRObj = character.getObjectByName('armR')
        const headObj = character.getObjectByName('headGroup')

        const poseActive = armLObj && armRObj && headObj && animator?.update(
          armLObj, armRObj, headObj, character, performance.now(),
        )

        if (!poseActive) {
          // Subtle weight shift rotation
          character.rotation.y = Math.sin(time * 0.7 + idx * 1.2) * 0.01

          // Arm sway — opposing, natural
          if (armLObj) {
            armLObj.rotation.z = Math.sin(time * (Math.PI * 2 / 4) + idx * 1.2) * 0.03
            armLObj.rotation.x = Math.sin(time * 1.1 + idx) * 0.03
          }
          if (armRObj) {
            armRObj.rotation.z = -Math.sin(time * (Math.PI * 2 / 4) + idx * 1.2) * 0.03
            armRObj.rotation.x = Math.sin(time * 1.1 + idx + Math.PI) * 0.03
          }
          // Head look-around — very slow, very subtle
          if (headObj) {
            headObj.rotation.y = Math.sin(time * 0.4 + idx * 2) * 0.06
            headObj.rotation.x = Math.sin(time * 0.3 + idx * 1.5) * 0.015
          }
        }
      })

      // Star twinkle + torch flame
      const twinkleTime = clock.getElapsedTime()
      scene.traverse((obj) => {
        if (obj.name === 'twinkleStar' && obj instanceof THREE.Mesh) {
          const mat = obj.material as THREE.MeshBasicMaterial
          const phase = obj.userData.twinklePhase as number
          const speed = obj.userData.twinkleSpeed as number
          const baseOp = (obj.userData.baseOpacity as number) ?? 0.5
          mat.opacity = baseOp * (0.5 + 0.5 * Math.sin(twinkleTime * speed + phase))
        }
        if (obj.name === 'torchFlame' && obj instanceof THREE.Mesh) {
          const mat = obj.material as THREE.MeshBasicMaterial
          const flicker = 0.85 + 0.15 * Math.sin(twinkleTime * 8 + Math.sin(twinkleTime * 3) * 2)
          mat.color.setHex(0xFF8C00).multiplyScalar(flicker)
        }
        if (obj.name === 'torchLight' && obj instanceof THREE.PointLight) {
          obj.intensity = 0.4 + 0.2 * Math.sin(twinkleTime * 6 + 1.5)
        }
      })

      // Golden particles — drift upward, fade, reset
      goldenParticlesRef.current.forEach((p) => {
        const drift = p.userData.drift as { x: number; y: number; z: number }
        p.position.x += drift.x + Math.sin(time * 0.5 + (p.userData.wobblePhase as number)) * 0.001
        p.position.y += drift.y
        p.position.z += drift.z

        // Fade as they rise
        const t = Math.max(0, Math.min(1, (p.position.y + 0.5) / 6))
        ;(p.material as THREE.MeshBasicMaterial).opacity = (1 - t) * 0.4

        // Reset when too high
        if (p.position.y > 6) {
          p.position.set((Math.random() - 0.5) * 5, -0.5, (Math.random() - 0.5) * 3)
        }

        p.rotation.x += 0.01
        p.rotation.y += 0.015
      })

      // Seasonal particle animation (snow, leaves)
      animateParticles(particlesRef.current)

      // Christmas star glow pulse
      animateChristmasStar(scene, twinkleTime)

      renderer.render(scene, camera)
    }
    animate()
  }, [lincoln, london])

  // Mount / rebuild
  useEffect(() => {
    initScene()
    return () => {
      sceneActiveRef.current = false
      cancelAnimationFrame(rafRef.current)
      rafRef.current = 0
      if (sceneRef.current) {
        sceneRef.current.traverse((obj) => {
          if (obj instanceof THREE.Mesh) {
            obj.geometry.dispose()
            if (Array.isArray(obj.material)) obj.material.forEach((m) => m.dispose())
            else obj.material.dispose()
          }
          if (obj instanceof THREE.Points) {
            obj.geometry.dispose()
            if (obj.material instanceof THREE.PointsMaterial) obj.material.dispose()
          }
        })
        sceneRef.current = null
      }
      if (rendererRef.current) {
        rendererRef.current.dispose()
        rendererRef.current = null
      }
      cameraRef.current = null
      charactersRef.current = []
      poseAnimatorRef.current = []
      skyGroupRef.current = null
      roomGroupRef.current = null
      nightLightsRef.current = []
      roomLightsRef.current = []
      particlesRef.current = []
      goldenParticlesRef.current = []
    }
  }, [initScene])

  // ── Toggle background mode without full rebuild ──────────────────
  useEffect(() => {
    applyBackground(
      sceneRef.current,
      skyGroupRef.current,
      roomGroupRef.current,
      nightLightsRef.current,
      roomLightsRef.current,
      background,
    )
  }, [background])

  // Handle resize
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

  // Handle pose triggers — both characters do the pose simultaneously
  useEffect(() => {
    if (!activePoseId || activePoseId === 'idle') return
    const pose = POSES.find((p) => p.id === activePoseId) as Pose | undefined
    if (!pose) return

    charactersRef.current.forEach((character, idx) => {
      const animator = poseAnimatorRef.current[idx]
      if (!animator) return

      if (character) {
        const expr = POSE_EXPRESSIONS[pose.id]
        if (expr) applyExpression(character, expr)
      }

      animator.play(pose, () => {
        if (character) applyExpression(character, POSE_EXPRESSIONS.idle ?? {})
        const idlePose = getEquipmentIdlePose([])
        animator.play(idlePose, () => {
          // Only fire onPoseComplete once (from first character)
          if (idx === 0) onPoseCompleteRef.current?.()
        })
      })
    })
  }, [activePoseId])

  // Build label data for overlay
  const labelData: { name: string; tier: string; xp: number; side: 'left' | 'right' | 'center' }[] = []
  if (lincoln && london) {
    labelData.push({ name: lincoln.name, tier: calculateTier(lincoln.totalXp), xp: lincoln.totalXp, side: 'left' })
    labelData.push({ name: london.name, tier: calculateTier(london.totalXp), xp: london.totalXp, side: 'right' })
  } else if (lincoln) {
    labelData.push({ name: lincoln.name, tier: calculateTier(lincoln.totalXp), xp: lincoln.totalXp, side: 'center' })
  } else if (london) {
    labelData.push({ name: london.name, tier: calculateTier(london.totalXp), xp: london.totalXp, side: 'center' })
  }

  return (
    <Box sx={{ position: 'relative' }}>
      <Box
        ref={containerRef}
        sx={{
          width: '100%',
          maxWidth: 500,
          mx: 'auto',
          aspectRatio: '4 / 3',
          maxHeight: '48vh',
          minHeight: '280px',
          borderRadius: '12px',
          border: '1px solid rgba(76, 175, 80, 0.15)',
          overflow: 'hidden',
          bgcolor: '#1a1a2e',
          userSelect: 'none',
          WebkitUserSelect: 'none',
          touchAction: 'none',
          position: 'relative',
          animation: 'sceneFadeIn 0.4s ease-out',
          '@keyframes sceneFadeIn': {
            '0%': { opacity: 0 },
            '100%': { opacity: 1 },
          },
        }}
      />
      {/* Vignette overlay */}
      <Box
        sx={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          pointerEvents: 'none',
          boxShadow: 'inset 0 0 60px rgba(0,0,0,0.5)',
          borderRadius: 'inherit',
          zIndex: 1,
        }}
      />
      {/* Name labels overlay */}
      <Box
        sx={{
          position: 'absolute',
          bottom: 8,
          left: 0,
          right: 0,
          display: 'flex',
          justifyContent: labelData.length === 2 ? 'space-around' : 'center',
          px: 2,
          pointerEvents: 'none',
        }}
      >
        {labelData.map((label) => (
          <Box key={label.name} sx={{ textAlign: 'center' }}>
            <Typography
              sx={{
                fontFamily: '"Press Start 2P", monospace',
                fontSize: '12px',
                color: '#e0e0e0',
                textShadow: '0 1px 4px rgba(0,0,0,0.8)',
                lineHeight: 1.4,
              }}
            >
              {label.name}
            </Typography>
            <Typography
              sx={{
                fontFamily: '"Press Start 2P", monospace',
                fontSize: '12px',
                color: 'rgba(255,255,255,0.55)',
                textShadow: '0 1px 3px rgba(0,0,0,0.7)',
                lineHeight: 1.4,
              }}
            >
              {label.tier} &bull; {label.xp} XP
            </Typography>
          </Box>
        ))}
      </Box>
    </Box>
  )
}
