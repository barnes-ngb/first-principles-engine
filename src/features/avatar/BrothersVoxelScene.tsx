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

  const step1 = makeBox(3.0 * s, 0.25 * s, 2.0 * s, darkColor)
  step1.position.y = -0.125 * s
  platform.add(step1)

  const step2 = makeBox(2.4 * s, 0.25 * s, 1.6 * s, mainColor)
  step2.position.y = 0.125 * s
  platform.add(step2)

  const step3 = makeBox(1.8 * s, 0.2 * s, 1.2 * s, lightColor)
  step3.position.y = 0.35 * s
  platform.add(step3)

  platform.position.y = -0.35 * s
  return platform
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

  for (let i = 0; i < 25; i++) {
    const starGeo = new THREE.BoxGeometry(0.04, 0.04, 0.04)
    const starMat = new THREE.MeshBasicMaterial({ color: 0xFFFFFF, transparent: true, opacity: 0.6 + Math.random() * 0.4 })
    const star = new THREE.Mesh(starGeo, starMat)
    star.name = 'twinkleStar'
    star.userData.twinklePhase = Math.random() * Math.PI * 2
    star.userData.twinkleSpeed = 0.5 + Math.random() * 1.5
    star.position.set((Math.random() - 0.5) * 18, 3 + Math.random() * 5, -7 - Math.random() * 3)
    skyGroup.add(star)
  }

  return skyGroup
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
  const currentTier = calculateTier(child.totalXp)

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
  const onPoseCompleteRef = useRef(onPoseComplete)
  useEffect(() => {
    onPoseCompleteRef.current = onPoseComplete
  }, [onPoseComplete])

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
    scene.background = new THREE.Color(background === 'room' ? 0x2a2218 : 0x1a1a2e)
    sceneRef.current = scene

    // Sky group (night background)
    const skyGroup = buildSkyGroup()
    skyGroup.visible = background !== 'room'
    scene.add(skyGroup)
    skyGroupRef.current = skyGroup

    // Room group (indoor background)
    const roomGroup = buildRoom()
    roomGroup.visible = background === 'room'
    scene.add(roomGroup)
    roomGroupRef.current = roomGroup

    const camera = new THREE.PerspectiveCamera(35, width / height, 0.1, 100)
    cameraRef.current = camera

    // Night mode lighting
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

    // Room mode lighting (warmer, cozy)
    const roomKeyLight = new THREE.DirectionalLight(0xFFF4E0, 0.8)
    roomKeyLight.position.set(3, 6, 4)
    scene.add(roomKeyLight)

    const roomFill = new THREE.DirectionalLight(0xFFE8D0, 0.25)
    roomFill.position.set(-3, 4, 2)
    scene.add(roomFill)

    const roomAmbient = new THREE.AmbientLight(0xFFFFFF, 0.35)
    scene.add(roomAmbient)

    roomLightsRef.current = [roomKeyLight, roomFill, roomAmbient]

    for (const l of nightLightsRef.current) l.visible = background !== 'room'
    for (const l of roomLightsRef.current) l.visible = background === 'room'

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

      // Platform per character
      const tierTint = getTierTint(calculateTier(child.totalXp))
      const tierMat = TIER_MATERIALS[tierTint] ?? TIER_MATERIALS.wood
      const platform = buildPlatform(child.ageGroup, tierMat.primary)
      platform.position.x = offsets[i]
      platform.position.y = characterGroup.position.y
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
        // Gentle bob with slight offset per character
        character.position.y = baseYs[idx] + Math.sin(time * 1.2 + idx * 0.5) * 0.03

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
          const idleSway = Math.sin(time * 0.7 + idx * 1.2) * 0.03
          if (armLObj) {
            armLObj.rotation.z = idleSway
            armLObj.rotation.x = Math.sin(time * 0.8 + idx) * 0.05
          }
          if (armRObj) {
            armRObj.rotation.z = -idleSway
            armRObj.rotation.x = -Math.sin(time * 0.8 + idx) * 0.05
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
          mat.opacity = 0.3 + 0.7 * (0.5 + 0.5 * Math.sin(twinkleTime * speed + phase))
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
    }
  }, [initScene])

  // ── Toggle background mode without full rebuild ──────────────────
  useEffect(() => {
    const scene = sceneRef.current
    if (!scene) return
    const isRoom = background === 'room'
    scene.background = new THREE.Color(isRoom ? 0x2a2218 : 0x1a1a2e)
    if (skyGroupRef.current) skyGroupRef.current.visible = !isRoom
    if (roomGroupRef.current) roomGroupRef.current.visible = isRoom
    for (const l of nightLightsRef.current) l.visible = !isRoom
    for (const l of roomLightsRef.current) l.visible = isRoom
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
                fontSize: '0.45rem',
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
                fontSize: '0.3rem',
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
