import type * as THREE from 'three'

export interface TouchControlState {
  isDragging: boolean
  prevX: number
  targetRotY: number
  currentRotY: number
  autoRotate: boolean
  lastTouchTime: number
}

const AUTO_ROTATE_DELAY = 3000
const ROTATION_SPEED = 0.008
const LERP_FACTOR = 0.1
const AUTO_ROTATE_SPEED = 0.003

export function createTouchControls(canvas: HTMLCanvasElement): TouchControlState {
  const state: TouchControlState = {
    isDragging: false,
    prevX: 0,
    targetRotY: 0,
    currentRotY: 0,
    autoRotate: true,
    lastTouchTime: 0,
  }

  // ── Touch events ────────────────────────────────────────────────
  canvas.addEventListener('touchstart', (e: TouchEvent) => {
    if (e.touches.length === 1) {
      state.isDragging = true
      state.prevX = e.touches[0].clientX
      state.autoRotate = false
      state.lastTouchTime = Date.now()
    }
  }, { passive: true })

  canvas.addEventListener('touchmove', (e: TouchEvent) => {
    if (state.isDragging && e.touches.length === 1) {
      const dx = e.touches[0].clientX - state.prevX
      state.targetRotY += dx * ROTATION_SPEED
      state.prevX = e.touches[0].clientX
      state.lastTouchTime = Date.now()
    }
  }, { passive: true })

  canvas.addEventListener('touchend', () => {
    state.isDragging = false
    state.lastTouchTime = Date.now()
  }, { passive: true })

  // ── Mouse events (desktop/dev testing) ──────────────────────────
  canvas.addEventListener('mousedown', (e: MouseEvent) => {
    state.isDragging = true
    state.prevX = e.clientX
    state.autoRotate = false
    state.lastTouchTime = Date.now()
  })

  canvas.addEventListener('mousemove', (e: MouseEvent) => {
    if (state.isDragging) {
      const dx = e.clientX - state.prevX
      state.targetRotY += dx * ROTATION_SPEED
      state.prevX = e.clientX
      state.lastTouchTime = Date.now()
    }
  })

  canvas.addEventListener('mouseup', () => {
    state.isDragging = false
    state.lastTouchTime = Date.now()
  })

  canvas.addEventListener('mouseleave', () => {
    state.isDragging = false
  })

  return state
}

/** Call in the animation loop to update rotation smoothly */
export function updateRotation(
  character: THREE.Group,
  state: TouchControlState,
): void {
  // Auto-rotate resume after 3s of no touch
  if (!state.autoRotate && Date.now() - state.lastTouchTime > AUTO_ROTATE_DELAY) {
    state.autoRotate = true
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
