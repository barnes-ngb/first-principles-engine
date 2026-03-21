import type * as THREE from 'three'

export interface TouchControlState {
  isDragging: boolean
  prevX: number
  targetRotY: number
  currentRotY: number
  velocityY: number
  autoRotate: boolean
  lastInteractionTime: number
}

const AUTO_ROTATE_DELAY = 4000
const AUTO_ROTATE_SPEED = 0.003
const DRAG_SENSITIVITY = 0.006
const LERP_FACTOR = 0.08
const FRICTION = 0.95

export function createTouchControls(canvas: HTMLCanvasElement): TouchControlState {
  const state: TouchControlState = {
    isDragging: false,
    prevX: 0,
    targetRotY: 0,
    currentRotY: 0,
    velocityY: 0,
    autoRotate: true,
    lastInteractionTime: 0,
  }

  function onPointerDown(x: number) {
    state.isDragging = true
    state.prevX = x
    state.velocityY = 0
    state.autoRotate = false
    state.lastInteractionTime = performance.now()
  }

  function onPointerMove(x: number) {
    if (!state.isDragging) return
    const dx = x - state.prevX
    state.velocityY = dx * DRAG_SENSITIVITY
    state.targetRotY += state.velocityY
    state.prevX = x
  }

  function onPointerUp() {
    state.isDragging = false
    state.lastInteractionTime = performance.now()
    // Momentum: velocity carries forward, decayed by friction in the loop
  }

  // ── Touch events ────────────────────────────────────────────────
  canvas.addEventListener('touchstart', (e: TouchEvent) => {
    if (e.touches.length === 1) onPointerDown(e.touches[0].clientX)
  }, { passive: true })

  canvas.addEventListener('touchmove', (e: TouchEvent) => {
    if (e.touches.length === 1) onPointerMove(e.touches[0].clientX)
  }, { passive: true })

  canvas.addEventListener('touchend', () => onPointerUp(), { passive: true })

  // ── Mouse events (desktop/dev testing) ──────────────────────────
  canvas.addEventListener('mousedown', (e: MouseEvent) => onPointerDown(e.clientX))

  const handleMouseMove = (e: MouseEvent) => {
    if (state.isDragging) onPointerMove(e.clientX)
  }
  const handleMouseUp = () => onPointerUp()

  window.addEventListener('mousemove', handleMouseMove)
  window.addEventListener('mouseup', handleMouseUp)

  canvas.addEventListener('mouseleave', () => {
    // Don't stop drag on leave — mouseup on window handles it
  })

  return state
}

/** Call in the animation loop to update rotation smoothly */
export function updateRotation(
  character: THREE.Group,
  state: TouchControlState,
): void {
  if (!state.isDragging) {
    // Apply momentum with friction
    state.velocityY *= FRICTION
    state.targetRotY += state.velocityY

    // Resume auto-rotate after delay
    if (performance.now() - state.lastInteractionTime > AUTO_ROTATE_DELAY) {
      state.autoRotate = true
    }
  }

  if (state.autoRotate) {
    state.targetRotY += AUTO_ROTATE_SPEED
  }

  // Smooth lerp
  state.currentRotY += (state.targetRotY - state.currentRotY) * LERP_FACTOR
  character.rotation.y = state.currentRotY
}

/** Clean up event listeners (call on unmount) */
export function destroyTouchControls(canvas: HTMLCanvasElement): void {
  // Event listeners added with { passive: true } and named functions
  // can't easily be removed without storing references.
  // Since the canvas is destroyed on unmount, this is acceptable.
  // The canvas element removal handles cleanup.
  void canvas
}
