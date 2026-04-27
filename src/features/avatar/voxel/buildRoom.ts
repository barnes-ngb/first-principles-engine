import * as THREE from 'three'

/**
 * Build a Minecraft-style indoor room scene.
 * Everything is voxel/blocky using BoxGeometry.
 * Returns a Group containing floor, walls, torch (with PointLight), crafting table, and chest.
 */
export function buildRoom(): THREE.Group {
  const room = new THREE.Group()
  room.name = 'roomGroup'

  // ── Floor: 6x6 grid of oak plank blocks ──────────────────────────
  const floorColors = [0x8B6914, 0x7A5C10, 0x9B7518]
  const floorGroup = new THREE.Group()
  floorGroup.name = 'floor'

  for (let x = -3; x < 3; x++) {
    for (let z = -2; z < 4; z++) {
      const color = floorColors[(x + z + 6) % floorColors.length]
      const geo = new THREE.BoxGeometry(1.02, 0.2, 1.02)
      const mat = new THREE.MeshLambertMaterial({ color })
      const plank = new THREE.Mesh(geo, mat)
      plank.position.set(x + 0.5, -0.6, z + 0.5)
      floorGroup.add(plank)
    }
  }
  room.add(floorGroup)

  // ── Back wall: full width stone wall behind character ─────────────
  const wallColors = [0x808080, 0x787878, 0x888888]
  const backWallGroup = new THREE.Group()
  backWallGroup.name = 'backWall'

  for (let x = -3; x < 3; x++) {
    for (let y = 0; y < 7; y++) {
      const color = wallColors[(x + y + 6) % wallColors.length]
      const geo = new THREE.BoxGeometry(1.02, 1.02, 0.5)
      const mat = new THREE.MeshLambertMaterial({ color })
      const block = new THREE.Mesh(geo, mat)
      block.position.set(x + 0.5, y - 0.1, -2.25)
      backWallGroup.add(block)
    }
  }
  room.add(backWallGroup)

  // ── Side walls (partial) ─────────────────────────────────────────
  const sideWallGroup = new THREE.Group()
  sideWallGroup.name = 'sideWalls'

  // Left wall — 2 blocks deep from back wall
  for (let z = -2; z < 0; z++) {
    for (let y = 0; y < 7; y++) {
      const color = wallColors[(z + y + 6) % wallColors.length]
      const geo = new THREE.BoxGeometry(0.5, 1.02, 1.02)
      const mat = new THREE.MeshLambertMaterial({ color })
      const block = new THREE.Mesh(geo, mat)
      block.position.set(-3.25, y - 0.1, z + 0.5)
      sideWallGroup.add(block)
    }
  }

  // Right wall — 2 blocks deep from back wall
  for (let z = -2; z < 0; z++) {
    for (let y = 0; y < 7; y++) {
      const color = wallColors[(z + y + 7) % wallColors.length]
      const geo = new THREE.BoxGeometry(0.5, 1.02, 1.02)
      const mat = new THREE.MeshLambertMaterial({ color })
      const block = new THREE.Mesh(geo, mat)
      block.position.set(3.25, y - 0.1, z + 0.5)
      sideWallGroup.add(block)
    }
  }
  room.add(sideWallGroup)

  // ── Torch on back wall ───────────────────────────────────────────
  const torchGroup = new THREE.Group()
  torchGroup.name = 'torch'

  // Stick
  const stickGeo = new THREE.BoxGeometry(0.1, 0.5, 0.1)
  const stickMat = new THREE.MeshLambertMaterial({ color: 0x6B4226 })
  const stick = new THREE.Mesh(stickGeo, stickMat)
  stick.position.set(2.0, 3.0, -1.9)
  torchGroup.add(stick)

  // Flame — self-lit
  const flameGeo = new THREE.BoxGeometry(0.15, 0.2, 0.15)
  const flameMat = new THREE.MeshBasicMaterial({ color: 0xFF8C00 })
  const flame = new THREE.Mesh(flameGeo, flameMat)
  flame.name = 'torchFlame'
  flame.position.set(2.0, 3.35, -1.9)
  torchGroup.add(flame)

  // Torch point light — warm cozy glow
  const torchLight = new THREE.PointLight(0xFFAA44, 0.5, 8)
  torchLight.name = 'torchLight'
  torchLight.position.set(2.0, 3.4, -1.8)
  torchGroup.add(torchLight)

  room.add(torchGroup)

  // ── Crafting table (right side) ──────────────────────────────────
  const craftGroup = new THREE.Group()
  craftGroup.name = 'craftingTable'

  // Body
  const craftBodyGeo = new THREE.BoxGeometry(0.6, 0.6, 0.6)
  const craftBodyMat = new THREE.MeshLambertMaterial({ color: 0x6B4226 })
  const craftBody = new THREE.Mesh(craftBodyGeo, craftBodyMat)
  craftBody.position.set(2.2, -0.2, -1.2)
  craftGroup.add(craftBody)

  // Top (lighter)
  const craftTopGeo = new THREE.BoxGeometry(0.62, 0.08, 0.62)
  const craftTopMat = new THREE.MeshLambertMaterial({ color: 0xA0784C })
  const craftTop = new THREE.Mesh(craftTopGeo, craftTopMat)
  craftTop.position.set(2.2, 0.14, -1.2)
  craftGroup.add(craftTop)

  // Grid lines on top (darker strips)
  const gridMat = new THREE.MeshLambertMaterial({ color: 0x4A3020 })
  for (let i = -1; i <= 1; i++) {
    const hLine = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.02, 0.04), gridMat)
    hLine.position.set(2.2, 0.19, -1.2 + i * 0.18)
    craftGroup.add(hLine)

    const vLine = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.02, 0.62), gridMat)
    vLine.position.set(2.2 + i * 0.18, 0.19, -1.2)
    craftGroup.add(vLine)
  }

  room.add(craftGroup)

  // ── Chest (left side) ────────────────────────────────────────────
  const chestGroup = new THREE.Group()
  chestGroup.name = 'chest'

  // Body — darker brown
  const chestBodyGeo = new THREE.BoxGeometry(0.7, 0.4, 0.5)
  const chestBodyMat = new THREE.MeshLambertMaterial({ color: 0x8B5A2B })
  const chestBody = new THREE.Mesh(chestBodyGeo, chestBodyMat)
  chestBody.position.set(-2.2, -0.3, -1.2)
  chestGroup.add(chestBody)

  // Lid — slightly lighter
  const chestLidGeo = new THREE.BoxGeometry(0.72, 0.2, 0.52)
  const chestLidMat = new THREE.MeshLambertMaterial({ color: 0xA0724C })
  const chestLid = new THREE.Mesh(chestLidGeo, chestLidMat)
  chestLid.position.set(-2.2, -0.0, -1.2)
  chestGroup.add(chestLid)

  // Latch — dark metal strip
  const latchGeo = new THREE.BoxGeometry(0.12, 0.08, 0.02)
  const latchMat = new THREE.MeshLambertMaterial({ color: 0x3A3A3A })
  const latch = new THREE.Mesh(latchGeo, latchMat)
  latch.position.set(-2.2, -0.05, -0.93)
  chestGroup.add(latch)

  room.add(chestGroup)

  return room
}
