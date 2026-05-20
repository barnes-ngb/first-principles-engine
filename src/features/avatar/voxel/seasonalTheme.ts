import * as THREE from 'three'

// ── Season Detection ────────────────────────────────────────────────

export const Season = {
  Spring: 'spring',
  Summer: 'summer',
  Fall: 'fall',
  Winter: 'winter',
  Christmas: 'christmas',
  Easter: 'easter',
} as const
export type Season = (typeof Season)[keyof typeof Season]

export function getCurrentSeason(): Season {
  const now = new Date()
  const month = now.getMonth() // 0-11
  const day = now.getDate()

  // Special seasons (override regular)
  if ((month === 11 && day >= 15) || (month === 0 && day <= 6)) return Season.Christmas
  if ((month === 2 && day >= 25) || (month === 3 && day <= 20)) return Season.Easter

  // Regular seasons
  if (month >= 2 && month <= 4) return Season.Spring
  if (month >= 5 && month <= 7) return Season.Summer
  if (month >= 8 && month <= 10) return Season.Fall
  return Season.Winter
}

// ── Theme Configuration ─────────────────────────────────────────────

interface SeasonalTheme {
  starColors: number[]
  ambientBoost: number        // multiplier on ambient light intensity
  lightingTint: number | null // tint color for key light, null = no change
  platformTint: number | null // lerp target for platform color, null = no change
  platformTintStrength: number
  particles: ParticleConfig | null
  // Christmas-specific
  christmasStar: boolean
  christmasPlatform: boolean
  // Easter-specific
  easterEggs: boolean
}

interface ParticleConfig {
  count: number
  colors: number[]
  size: number
  opacity: number
  fallSpeed: [number, number] // [min, max] negative = falling
  drift: [number, number]     // [min, max] horizontal drift
  spreadX: number
  spreadY: [number, number]   // [min start Y, max start Y]
  resetY: number
  floorY: number
}

const THEMES: Record<Season, SeasonalTheme> = {
  spring: {
    starColors: [0xFFFFFF, 0xFFFFFF, 0xCCFFCC, 0xDDFFDD],
    ambientBoost: 1.0,
    lightingTint: null,
    platformTint: 0x2A4A1A,
    platformTintStrength: 0.15,
    particles: {
      count: 3,
      colors: [0x66CC66, 0x88DD88, 0xAAEEAA],
      size: 0.05,
      opacity: 0.6,
      fallSpeed: [-0.002, -0.004],
      drift: [-0.003, 0.003],
      spreadX: 6,
      spreadY: [2, 5],
      resetY: 5,
      floorY: -1,
    },
    christmasStar: false,
    christmasPlatform: false,
    easterEggs: false,
  },
  summer: {
    starColors: [0xFFFFDD, 0xFFFFC8, 0xFFFFE0],
    ambientBoost: 1.1,
    lightingTint: 0xFFF8E0,
    platformTint: 0x8B7355,
    platformTintStrength: 0.1,
    particles: null,
    christmasStar: false,
    christmasPlatform: false,
    easterEggs: false,
  },
  fall: {
    starColors: [0xFFCC66, 0xFFAA44, 0xDDAA55],
    ambientBoost: 1.0,
    lightingTint: 0xFFE8C8,
    platformTint: 0x5C3A1A,
    platformTintStrength: 0.15,
    particles: {
      count: 4,
      colors: [0xCC6600, 0xDD4400, 0x884422, 0xEE8833],
      size: 0.06,
      opacity: 0.7,
      fallSpeed: [-0.004, -0.008],
      drift: [0.001, 0.004],
      spreadX: 6,
      spreadY: [2, 6],
      resetY: 6,
      floorY: -1,
    },
    christmasStar: false,
    christmasPlatform: false,
    easterEggs: false,
  },
  winter: {
    starColors: [0xCCDDFF, 0xAABBEE, 0xDDEEFF],
    ambientBoost: 0.95,
    lightingTint: 0xDDE8FF,
    platformTint: 0xAABBCC,
    platformTintStrength: 0.2,
    particles: {
      count: 6,
      colors: [0xFFFFFF, 0xEEEEFF, 0xDDDDFF],
      size: 0.04,
      opacity: 0.7,
      fallSpeed: [-0.003, -0.007],
      drift: [-0.002, 0.002],
      spreadX: 6,
      spreadY: [2, 6],
      resetY: 6,
      floorY: -1,
    },
    christmasStar: false,
    christmasPlatform: false,
    easterEggs: false,
  },
  christmas: {
    starColors: [0xCCDDFF, 0xAABBEE, 0xFFEEDD, 0xDDEEFF],
    ambientBoost: 1.0,
    lightingTint: 0xEEE8FF,
    platformTint: 0xAABBCC,
    platformTintStrength: 0.15,
    particles: {
      count: 7,
      colors: [0xFFFFFF, 0xEEEEFF, 0xDDDDFF],
      size: 0.04,
      opacity: 0.7,
      fallSpeed: [-0.003, -0.007],
      drift: [-0.002, 0.002],
      spreadX: 6,
      spreadY: [2, 6],
      resetY: 6,
      floorY: -1,
    },
    christmasStar: true,
    christmasPlatform: true,
    easterEggs: false,
  },
  easter: {
    starColors: [0xFFFFFF, 0xCCFFCC, 0xFFCCFF, 0xCCCCFF],
    ambientBoost: 1.15,
    lightingTint: 0xFFF8F0,
    platformTint: 0x2A4A1A,
    platformTintStrength: 0.12,
    particles: {
      count: 3,
      colors: [0x66CC66, 0x88DD88, 0xAAEEAA],
      size: 0.05,
      opacity: 0.6,
      fallSpeed: [-0.002, -0.004],
      drift: [-0.003, 0.003],
      spreadX: 6,
      spreadY: [2, 5],
      resetY: 5,
      floorY: -1,
    },
    christmasStar: false,
    christmasPlatform: false,
    easterEggs: true,
  },
}

export function getSeasonalTheme(season: Season): SeasonalTheme {
  return THEMES[season]
}

// ── Star Color Tinting ──────────────────────────────────────────────

/** Pick a random star color from the season's palette */
export function getSeasonalStarColor(season: Season): number {
  const colors = THEMES[season].starColors
  return colors[Math.floor(Math.random() * colors.length)]
}

// ── Platform Tinting ────────────────────────────────────────────────

/** Tint a platform base color toward the seasonal palette */
export function tintPlatformColor(baseColor: number, season: Season): number {
  const theme = THEMES[season]
  if (!theme.platformTint) return baseColor
  const base = new THREE.Color(baseColor)
  const target = new THREE.Color(theme.platformTint)
  base.lerp(target, theme.platformTintStrength)
  return base.getHex()
}

// ── Lighting Adjustments ────────────────────────────────────────────

/** Apply seasonal tint/boost to night-mode lights */
export function applySeasonalLighting(
  nightLights: THREE.Object3D[],
  season: Season,
): void {
  const theme = THEMES[season]

  for (const light of nightLights) {
    // Boost ambient lights
    if (light instanceof THREE.AmbientLight) {
      light.intensity *= theme.ambientBoost
    }
    // Tint key light (first directional light)
    if (light instanceof THREE.DirectionalLight && theme.lightingTint) {
      const original = new THREE.Color(light.color.getHex())
      const tint = new THREE.Color(theme.lightingTint)
      original.lerp(tint, 0.2)
      light.color.copy(original)
    }
  }
}

// ── Falling Particles ───────────────────────────────────────────────

export interface FallingParticle {
  mesh: THREE.Mesh
  velocity: THREE.Vector3
  resetY: number
  floorY: number
}

export function createFallingParticles(season: Season, scene: THREE.Scene): FallingParticle[] {
  const theme = THEMES[season]
  if (!theme.particles) return []

  const config = theme.particles
  const particles: FallingParticle[] = []

  for (let i = 0; i < config.count; i++) {
    const geo = new THREE.BoxGeometry(config.size, config.size, config.size)
    const color = config.colors[i % config.colors.length]
    const mat = new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: config.opacity,
    })
    const mesh = new THREE.Mesh(geo, mat)
    mesh.name = 'seasonalParticle'
    mesh.position.set(
      (Math.random() - 0.5) * config.spreadX,
      config.spreadY[0] + Math.random() * (config.spreadY[1] - config.spreadY[0]),
      (Math.random() - 0.5) * 2,
    )
    scene.add(mesh)

    const fallSpeed = config.fallSpeed[0] + Math.random() * (config.fallSpeed[1] - config.fallSpeed[0])
    const driftX = config.drift[0] + Math.random() * (config.drift[1] - config.drift[0])

    particles.push({
      mesh,
      velocity: new THREE.Vector3(driftX, fallSpeed, 0),
      resetY: config.resetY,
      floorY: config.floorY,
    })
  }

  return particles
}

export function animateParticles(particles: FallingParticle[]): void {
  for (const p of particles) {
    p.mesh.position.add(p.velocity)
    p.mesh.rotation.x += 0.01
    p.mesh.rotation.z += 0.005
    if (p.mesh.position.y < p.floorY) {
      p.mesh.position.y = p.resetY
      p.mesh.position.x = (Math.random() - 0.5) * 6
    }
  }
}

// ── Christmas Star (Star of Bethlehem) ──────────────────────────────

export function addChristmasStar(skyGroup: THREE.Group): void {
  const geo = new THREE.BoxGeometry(0.15, 0.15, 0.15)
  const mat = new THREE.MeshBasicMaterial({
    color: 0xFFD700,
    transparent: true,
    opacity: 0.9,
  })
  const star = new THREE.Mesh(geo, mat)
  star.name = 'christmasStar'
  star.position.set(0, 7, -6)
  skyGroup.add(star)

  // Glow halo around the star
  const haloGeo = new THREE.BoxGeometry(0.35, 0.35, 0.02)
  const haloMat = new THREE.MeshBasicMaterial({
    color: 0xFFDD44,
    transparent: true,
    opacity: 0.3,
  })
  const halo = new THREE.Mesh(haloGeo, haloMat)
  halo.name = 'christmasStarHalo'
  star.add(halo)
}

export function animateChristmasStar(scene: THREE.Scene, time: number): void {
  scene.traverse((obj) => {
    if (obj.name === 'christmasStar' && obj instanceof THREE.Mesh) {
      const mat = obj.material as THREE.MeshBasicMaterial
      mat.opacity = 0.7 + 0.3 * Math.sin(time * 1.5)
    }
    if (obj.name === 'christmasStarHalo' && obj instanceof THREE.Mesh) {
      const mat = obj.material as THREE.MeshBasicMaterial
      mat.opacity = 0.2 + 0.15 * Math.sin(time * 1.5 + 0.5)
    }
  })
}

// ── Christmas Platform Colors ───────────────────────────────────────

/** Build alternating red/green blocks on top of platform */
export function addChristmasPlatformBlocks(platform: THREE.Group, scale: number): void {
  const s = scale
  const colors = [0xCC2222, 0x228B22]
  for (let x = -1; x <= 1; x++) {
    for (let z = -1; z <= 0; z++) {
      const color = colors[(x + z + 4) % 2]
      const geo = new THREE.BoxGeometry(0.5 * s, 0.08 * s, 0.5 * s)
      const mat = new THREE.MeshLambertMaterial({ color })
      const block = new THREE.Mesh(geo, mat)
      block.name = 'christmasBlock'
      block.position.set(x * 0.8 * s, 0.42 * s, z * 0.8 * s + 0.2 * s)
      platform.add(block)
    }
  }
}

// ── Easter Eggs ─────────────────────────────────────────────────────

/** Add small pastel-colored egg shapes on platform edges */
export function addEasterEggs(platform: THREE.Group, scale: number): void {
  const s = scale
  const eggColors = [0xFFB6C1, 0xB0E0E6, 0xFFFF99]
  const positions = [
    [-1.0, 0.5, 0.6],
    [1.0, 0.5, 0.5],
    [0, 0.5, -0.7],
  ]

  for (let i = 0; i < 3; i++) {
    const eggGroup = new THREE.Group()
    eggGroup.name = 'easterEgg'

    // Egg body — slightly tall box for Minecraft-style egg
    const bodyGeo = new THREE.BoxGeometry(0.12 * s, 0.18 * s, 0.12 * s)
    const bodyMat = new THREE.MeshLambertMaterial({ color: eggColors[i] })
    const body = new THREE.Mesh(bodyGeo, bodyMat)
    eggGroup.add(body)

    // Small top cap for egg shape
    const topGeo = new THREE.BoxGeometry(0.08 * s, 0.06 * s, 0.08 * s)
    const topMat = new THREE.MeshLambertMaterial({ color: eggColors[i] })
    const top = new THREE.Mesh(topGeo, topMat)
    top.position.y = 0.11 * s
    eggGroup.add(top)

    const [px, py, pz] = positions[i]
    eggGroup.position.set(px * s, py * s, pz * s)
    platform.add(eggGroup)
  }
}
