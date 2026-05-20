// Armor debug tuning — runtime-adjustable transform overrides for helmet
// and shoes. Kept in its own module so the Fast Refresh rule
// (react-refresh/only-export-components) is happy: ArmorDebugPanel.tsx can
// export only its component, and other files import the types/defaults here.

export interface ArmorDebugPieceValues {
  posX: number
  posY: number
  posZ: number
  rotX: number
  rotY: number
  rotZ: number
  scale: number
}

export interface ArmorDebugOverrides {
  helmet: ArmorDebugPieceValues
  shoes: ArmorDebugPieceValues
}

export const ARMOR_DEBUG_DEFAULTS: ArmorDebugOverrides = {
  helmet: { posX: 0, posY: 0, posZ: 0, rotX: 0, rotY: 0, rotZ: 0, scale: 1 },
  shoes: { posX: 0, posY: 0, posZ: 0, rotX: 0, rotY: 0, rotZ: 0, scale: 1 },
}
