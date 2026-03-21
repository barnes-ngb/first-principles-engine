import { useEffect, useRef, useCallback } from 'react'
import * as THREE from 'three'
import Box from '@mui/material/Box'

import type { CharacterFeatures, VoxelArmorPieceId } from '../../core/types'
import { DEFAULT_CHARACTER_FEATURES } from '../../core/types'
import { buildCharacter } from './voxel/buildCharacter'
import { buildArmorPiece, VOXEL_ARMOR_PIECES } from './voxel/buildArmorPiece'
import { animateEquip, animateUnequip } from './voxel/equipAnimation'
import { createTouchControls, updateRotation } from './voxel/touchControls'
import type { TouchControlState } from './voxel/touchControls'

interface VoxelCharacterProps {
  features: CharacterFeatures | undefined
  ageGroup: 'older' | 'younger'
  equippedPieces: string[]
  /** Piece to animate equipping (triggers scale-in animation) */
  animateEquipPiece?: string | null
  /** Piece to animate unequipping */
  animateUnequipPiece?: string | null
  onEquipAnimDone?: () => void
  onUnequipAnimDone?: () => void
  height?: string | number
}

export default function VoxelCharacter({
  features,
  ageGroup,
  equippedPieces,
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

  const resolvedFeatures = features ?? DEFAULT_CHARACTER_FEATURES

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

    // Scene
    const scene = new THREE.Scene()
    scene.background = new THREE.Color(0x0d1117) // Dark background
    sceneRef.current = scene

    // Camera — closer + lower FOV for heroic framing
    const camera = new THREE.PerspectiveCamera(30, width / height, 0.1, 100)
    camera.position.set(0, 1.8, 6.5)
    camera.lookAt(0, 1.2, 0)
    cameraRef.current = camera

    // Lighting
    const ambient = new THREE.AmbientLight(0xffffff, 0.6)
    scene.add(ambient)

    const dirLight = new THREE.DirectionalLight(0xffffff, 0.8)
    dirLight.position.set(3, 5, 4)
    scene.add(dirLight)

    const fillLight = new THREE.DirectionalLight(0x8888ff, 0.3)
    fillLight.position.set(-3, 2, -2)
    scene.add(fillLight)

    // Build character
    const character = buildCharacter(resolvedFeatures, ageGroup)
    characterRef.current = character
    scene.add(character)

    // Build armor pieces
    armorGroupsRef.current.clear()
    for (const pieceMeta of VOXEL_ARMOR_PIECES) {
      const pieceGroup = buildArmorPiece(pieceMeta.id, ageGroup)
      armorGroupsRef.current.set(pieceMeta.id, pieceGroup)
      character.add(pieceGroup)
    }

    // Set initial visibility
    for (const [pieceId, group] of armorGroupsRef.current) {
      group.visible = equippedPieces.includes(pieceId)
      if (group.visible) {
        group.scale.set(1, 1, 1)
      }
    }
    prevEquippedRef.current = new Set(equippedPieces)

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

    function animate() {
      rafRef.current = requestAnimationFrame(animate)

      if (controlsRef.current && characterRef.current) {
        updateRotation(characterRef.current, controlsRef.current)
      }

      // Idle animation — gentle bob + subtle arm sway
      if (characterRef.current) {
        const time = clock.getElapsedTime()
        characterRef.current.position.y = baseY + Math.sin(time * 1.5) * 0.04
        const armL = characterRef.current.getObjectByName('armL')
        const armR = characterRef.current.getObjectByName('armR')
        if (armL) armL.rotation.z = Math.sin(time * 0.8) * 0.03
        if (armR) armR.rotation.z = -Math.sin(time * 0.8 + 0.5) * 0.03
      }

      renderer.render(scene, camera)
    }
    animate()
  }, [resolvedFeatures, ageGroup, equippedPieces])

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

  // ── Sync equipped pieces (without full rebuild) ─────────────────
  useEffect(() => {
    const prev = prevEquippedRef.current
    const current = new Set(equippedPieces)

    // Show newly equipped pieces (without animation — animation is handled separately)
    for (const pieceId of current) {
      if (!prev.has(pieceId)) {
        const group = armorGroupsRef.current.get(pieceId as VoxelArmorPieceId)
        if (group && !group.visible) {
          group.visible = true
          group.scale.set(1, 1, 1)
        }
      }
    }

    // Hide unequipped pieces
    for (const pieceId of prev) {
      if (!current.has(pieceId)) {
        const group = armorGroupsRef.current.get(pieceId as VoxelArmorPieceId)
        if (group) {
          group.visible = false
        }
      }
    }

    prevEquippedRef.current = current
  }, [equippedPieces])

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
        maxHeight: '55vh',
        borderRadius: '12px',
        border: '2px solid #7EFC20',
        overflow: 'hidden',
        bgcolor: '#0d1117',
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
