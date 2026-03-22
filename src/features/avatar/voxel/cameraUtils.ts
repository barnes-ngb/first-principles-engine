import * as THREE from 'three'

/** Frame the camera to fit the character's bounding box with padding */
export function frameCameraToCharacter(
  camera: THREE.PerspectiveCamera,
  character: THREE.Object3D,
  paddingFactor = 1.3,
): void {
  const box = new THREE.Box3().setFromObject(character)
  const center = box.getCenter(new THREE.Vector3())
  const size = box.getSize(new THREE.Vector3())
  const maxDim = Math.max(size.x, size.y, size.z)
  const fov = camera.fov * (Math.PI / 180)
  const distance = (maxDim / (2 * Math.tan(fov / 2))) * paddingFactor

  camera.position.set(center.x, center.y, center.z + distance)
  camera.lookAt(center)
  camera.updateProjectionMatrix()
}
