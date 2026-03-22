import { useEffect, useRef } from 'react'
import * as THREE from 'three'

import type { CharacterFeatures } from '../../core/types'
import { DEFAULT_CHARACTER_FEATURES } from '../../core/types'
import { buildCharacter } from './voxel/buildCharacter'
import { buildArmorPiece } from './voxel/buildArmorPiece'
import { frameCameraToCharacter } from './voxel/cameraUtils'

interface AvatarThumbnailProps {
  features?: CharacterFeatures
  ageGroup?: 'older' | 'younger'
  equippedPieces?: string[]
  size?: number
  showArmor?: boolean
  animate?: boolean
}

export default function AvatarThumbnail({
  features,
  ageGroup = 'older',
  equippedPieces = [],
  size = 48,
  showArmor = true,
  animate = false,
}: AvatarThumbnailProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const rafRef = useRef<number>(0)

  useEffect(() => {
    if (!canvasRef.current) return

    const canvas = canvasRef.current
    const resolvedFeatures = features ?? DEFAULT_CHARACTER_FEATURES

    // Minimal Three.js scene
    const scene = new THREE.Scene()

    const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 100)
    const renderer = new THREE.WebGLRenderer({
      canvas,
      alpha: true,
      antialias: true,
    })
    renderer.setSize(size, size)
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))

    // Build character
    const character = buildCharacter(resolvedFeatures, ageGroup)

    // Add equipped armor
    if (showArmor && equippedPieces.length > 0) {
      for (const pieceId of equippedPieces) {
        const piece = buildArmorPiece(pieceId as 'belt' | 'breastplate' | 'shoes' | 'shield' | 'helmet' | 'sword', ageGroup)
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

        // Attach sword/shield to arms; move breastplate arm covers to arms
        const attachTo = piece.userData.attachToArm as string | undefined
        if (attachTo === 'R') {
          const armR = character.getObjectByName('armR')
          if (armR) armR.add(piece)
          else character.add(piece)
        } else if (attachTo === 'L') {
          const armL = character.getObjectByName('armL')
          if (armL) armL.add(piece)
          else character.add(piece)
        } else {
          // Move arm-cover children to their respective arms
          const armChildren: THREE.Object3D[] = []
          piece.traverse((child) => {
            if (child.userData.attachToArm) armChildren.push(child)
          })
          for (const child of armChildren) {
            piece.remove(child)
            const targetArm = child.userData.attachToArm === 'L'
              ? character.getObjectByName('armL')
              : character.getObjectByName('armR')
            if (targetArm) targetArm.add(child)
            else character.add(child)
          }
          character.add(piece)
        }
      }
    }

    scene.add(character)

    // Simple lighting
    scene.add(new THREE.AmbientLight(0xffffff, 0.6))
    const dir = new THREE.DirectionalLight(0xffffff, 0.8)
    dir.position.set(3, 5, 4)
    scene.add(dir)

    // Frame camera to character
    frameCameraToCharacter(camera, character, 1.3)

    // Slight angle for visual interest
    character.rotation.y = -0.3

    if (animate) {
      let time = 0
      function loop() {
        time += 0.016
        character.rotation.y = -0.3 + Math.sin(time) * 0.1
        renderer.render(scene, camera)
        rafRef.current = requestAnimationFrame(loop)
      }
      loop()
    } else {
      renderer.render(scene, camera)
    }

    return () => {
      cancelAnimationFrame(rafRef.current)
      renderer.dispose()
    }
  }, [features, ageGroup, equippedPieces, size, showArmor, animate])

  return (
    <canvas
      ref={canvasRef}
      width={size}
      height={size}
      style={{
        width: size,
        height: size,
        borderRadius: size > 40 ? 8 : 4,
      }}
    />
  )
}
