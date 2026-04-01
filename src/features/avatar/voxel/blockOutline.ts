import * as THREE from 'three'

/**
 * Add dark edge outlines to a mesh for Minecraft Legends block definition.
 * Uses EdgesGeometry + LineSegments for crisp silhouette edges.
 */
export function addBlockOutline(
  mesh: THREE.Mesh,
  color: number = 0x000000,
  opacity: number = 0.25,
) {
  const edges = new THREE.EdgesGeometry(mesh.geometry)
  const lineMat = new THREE.LineBasicMaterial({
    color,
    transparent: true,
    opacity,
    linewidth: 1,
  })
  const wireframe = new THREE.LineSegments(edges, lineMat)
  wireframe.userData.isOutline = true
  wireframe.raycast = () => {} // outlines should not intercept clicks
  mesh.add(wireframe)
}

/** Minimum volume threshold — skip tiny detail meshes (buckles, trim, wraps) */
const MIN_OUTLINE_VOLUME = 0.01

/**
 * Traverse a character group and add outlines to all qualifying meshes.
 * Skips very small detail pieces and existing outlines.
 */
export function addOutlinesToGroup(
  group: THREE.Group,
  opacity: number = 0.25,
) {
  group.traverse((child) => {
    if (!(child instanceof THREE.Mesh)) return
    if (child.userData.isOutline) return
    // Skip if already has outline children
    if (child.children.some((c) => c.userData?.isOutline)) return

    const geo = child.geometry as THREE.BoxGeometry | undefined
    if (!geo?.parameters) return

    const { width = 0, height = 0, depth = 0 } = geo.parameters
    const vol = width * height * depth
    if (vol < MIN_OUTLINE_VOLUME) return

    addBlockOutline(child, 0x000000, opacity)
  })
}

/**
 * Remove all outline LineSegments from a group (used before rebuild or
 * when switching to ghost state).
 */
export function removeOutlinesFromGroup(group: THREE.Group) {
  const toRemove: THREE.Object3D[] = []
  group.traverse((child) => {
    if (child.userData?.isOutline) toRemove.push(child)
  })
  for (const obj of toRemove) {
    obj.parent?.remove(obj)
    if (obj instanceof THREE.LineSegments) {
      obj.geometry.dispose()
      if (obj.material instanceof THREE.Material) obj.material.dispose()
    }
  }
}
