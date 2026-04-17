import { memo, useEffect, useRef, useState } from 'react'
import * as THREE from 'three'

import type { CharacterFeatures } from '../../core/types'
import { DEFAULT_CHARACTER_FEATURES } from '../../core/types'
import { buildCharacter } from './voxel/buildCharacter'
import { buildArmorPiece } from './voxel/buildArmorPiece'
import { frameCameraToCharacter } from './voxel/cameraUtils'
import { applyTierToArmor, calculateTier } from './voxel/tierMaterials'
import { buildPaintedFace, renderColorArrayToCanvas, applyCanvasToHead } from './voxel/pixelFace'

interface AvatarThumbnailProps {
  features?: CharacterFeatures
  ageGroup?: 'older' | 'younger'
  equippedPieces?: string[]
  totalXp?: number
  size?: number
  showArmor?: boolean
  animated?: boolean
  className?: string
  style?: React.CSSProperties
  /** Cached 64-color hex array for AI-generated pixel face */
  faceGrid?: string[]
  /** Child's name — used for CSS fallback initial when WebGL fails */
  childName?: string
}

// Track active renderers to warn about performance
let activeThumbnails = 0
const MAX_THUMBNAILS = 6

const AvatarThumbnail = memo(function AvatarThumbnail({
  features,
  ageGroup = 'older',
  equippedPieces = [],
  totalXp = 0,
  size = 48,
  showArmor = true,
  animated = false,
  className,
  style,
  faceGrid,
  childName,
}: AvatarThumbnailProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const cleanupRef = useRef<(() => void) | null>(null)
  const [webglFailed, setWebglFailed] = useState(false)

  // Only animate for sizes > 48
  const shouldAnimate = animated && size > 48

  useEffect(() => {
    activeThumbnails++
    if (activeThumbnails > MAX_THUMBNAILS) {
      console.warn('AvatarThumbnail: many active instances — consider static mode')
    }
    return () => { activeThumbnails-- }
  }, [])

  useEffect(() => {
    if (!canvasRef.current || webglFailed) return

    // Cleanup previous scene
    cleanupRef.current?.()
    cleanupRef.current = null

    const canvas = canvasRef.current
    const resolvedFeatures = features ?? DEFAULT_CHARACTER_FEATURES

    let renderer: THREE.WebGLRenderer
    try {
      renderer = new THREE.WebGLRenderer({
        canvas,
        alpha: true,
        antialias: size > 64,
      })
    } catch (err) {
      console.warn('AvatarThumbnail WebGL init failed, falling back to CSS avatar', err)
      setWebglFailed(true)
      return
    }

    // Verify the context is usable (catches lost/exhausted contexts)
    const gl = renderer.getContext()
    if (!gl || gl.isContextLost()) {
      console.warn('AvatarThumbnail WebGL context lost or null, falling back to CSS avatar')
      renderer.dispose()
      renderer.forceContextLoss()
      setWebglFailed(true)
      return
    }

    renderer.setSize(size, size)
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))

    const scene = new THREE.Scene()
    const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 100)

    // Simplified lighting
    scene.add(new THREE.AmbientLight(0xffffff, 0.6))
    const dir = new THREE.DirectionalLight(0xffffff, 0.8)
    dir.position.set(3, 5, 4)
    scene.add(dir)

    // Build character
    const character = buildCharacter(resolvedFeatures, ageGroup)

    // Track armor meshes for tier coloring
    const armorMeshes = new Map<string, THREE.Group>()

    // Add equipped armor
    if (showArmor && equippedPieces.length > 0) {
      const tierForGeometry = calculateTier(totalXp)
      for (const pieceId of equippedPieces) {
        const piece = buildArmorPiece(
          pieceId as 'belt' | 'breastplate' | 'shoes' | 'shield' | 'helmet' | 'sword',
          ageGroup,
          undefined,
          tierForGeometry,
        )
        piece.visible = true

        // Force solid materials
        piece.traverse((child) => {
          if (child instanceof THREE.Mesh) {
            const mats = Array.isArray(child.material) ? child.material : [child.material]
            for (const m of mats) {
              if (m instanceof THREE.MeshLambertMaterial) {
                m.transparent = false
                m.opacity = 1
                m.depthWrite = true
              }
            }
          }
        })

        // Attach sword/shield to arms; helmet to headGroup; breastplate arm covers to arms
        const attachTo = piece.userData.attachToArm as string | undefined
        if (attachTo === 'R') {
          const armR = character.getObjectByName('armR')
          if (armR) armR.add(piece)
          else character.add(piece)
        } else if (attachTo === 'L') {
          const armL = character.getObjectByName('armL')
          if (armL) armL.add(piece)
          else character.add(piece)
        } else if (pieceId === 'helmet') {
          // Helmet is child of headGroup — head-local coordinates
          const headGrp = character.getObjectByName('headGroup')
          if (headGrp) headGrp.add(piece)
          else character.add(piece)
        } else {
          const armChildren: THREE.Object3D[] = []
          piece.traverse((child) => {
            if (child.userData.attachToArm) armChildren.push(child)
          })
          for (const child of armChildren) {
            piece.remove(child)
            const targetArm =
              child.userData.attachToArm === 'L'
                ? character.getObjectByName('armL')
                : character.getObjectByName('armR')
            if (targetArm) targetArm.add(child)
            else character.add(child)
          }
          character.add(piece)
        }

        armorMeshes.set(pieceId, piece)
      }

      // Apply tier colors to equipped armor
      const tier = calculateTier(totalXp)
      applyTierToArmor(armorMeshes, tier, equippedPieces)
    }

    // Apply pixel face texture for sizes >= 64
    if (size >= 64) {
      try {
        let faceCanvas: HTMLCanvasElement | null = null

        // Strategy 1: cached AI face grid
        if (faceGrid && Array.isArray(faceGrid) && faceGrid.length === 64) {
          faceCanvas = renderColorArrayToCanvas(faceGrid)
        }

        // Strategy 2: painted face from features
        if (!faceCanvas && resolvedFeatures) {
          faceCanvas = buildPaintedFace(resolvedFeatures)
        }

        if (faceCanvas) {
          const headMesh = character.getObjectByName('head') as THREE.Mesh | undefined
          if (headMesh) {
            applyCanvasToHead(
              headMesh,
              faceCanvas,
              new THREE.Color(resolvedFeatures.skinTone).getHex(),
            )
          }
        }
      } catch {
        // Fallback: solid color head is fine for thumbnails
      }
    }

    scene.add(character)

    // Slight angle for visual interest
    character.rotation.y = -0.35

    // Frame camera
    frameCameraToCharacter(camera, character, 1.4)

    if (shouldAnimate) {
      let animId: number
      let time = 0
      let disposed = false
      const baseY = character.position.y

      function animate() {
        if (disposed) return
        time += 0.016
        character.rotation.y = -0.35 + Math.sin(time * 0.5) * 0.15
        character.position.y = baseY + Math.sin(time * 1.2) * 0.03
        renderer.render(scene, camera)
        animId = requestAnimationFrame(animate)
      }
      animate()

      cleanupRef.current = () => {
        disposed = true
        cancelAnimationFrame(animId)
        disposeScene(scene, renderer)
      }
    } else {
      // Static: single render
      renderer.render(scene, camera)

      cleanupRef.current = () => {
        disposeScene(scene, renderer)
      }
    }

    return () => {
      cleanupRef.current?.()
      cleanupRef.current = null
    }
  }, [features, ageGroup, equippedPieces, totalXp, size, showArmor, shouldAnimate, faceGrid, webglFailed])

  // CSS fallback when WebGL is unavailable
  if (webglFailed) {
    const initial = (childName ?? '?')[0].toUpperCase()
    return (
      <div
        className={className}
        style={{
          width: size,
          height: size,
          borderRadius: size >= 64 ? 8 : 4,
          background: 'linear-gradient(135deg, #7B5EA7 0%, #9B59B6 100%)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: '#fff',
          fontFamily: '"Press Start 2P", monospace',
          fontSize: Math.max(size * 0.4, 12),
          fontWeight: 'bold',
          ...style,
        }}
      >
        {initial}
      </div>
    )
  }

  return (
    <canvas
      ref={canvasRef}
      width={size}
      height={size}
      className={className}
      style={{
        width: size,
        height: size,
        borderRadius: size >= 64 ? 8 : 4,
        ...style,
      }}
    />
  )
})

function disposeScene(scene: THREE.Scene, renderer: THREE.WebGLRenderer) {
  scene.traverse((obj) => {
    if (obj instanceof THREE.Mesh) {
      obj.geometry.dispose()
      if (Array.isArray(obj.material)) {
        obj.material.forEach((m: THREE.Material) => m.dispose())
      } else {
        obj.material.dispose()
      }
    }
  })
  renderer.dispose()
  renderer.forceContextLoss()
}

export default AvatarThumbnail
