// TEMPORARY shared types/defaults for the on-device weapon tuning sliders.
// Remove this file along with WeaponDebugPanel.tsx once shield/sword
// transforms are baked into the builders.

export interface WeaponTransform {
  posX: number
  posY: number
  posZ: number
  rotX: number
  rotY: number
  rotZ: number
}

export interface WeaponDebugValues {
  shield: WeaponTransform
  sword: WeaponTransform
}

export const WEAPON_DEBUG_DEFAULTS: WeaponDebugValues = {
  shield: { posX: 0, posY: -1.8, posZ: 0.6, rotX: -0.2, rotY: Math.PI, rotZ: 0 },
  sword: { posX: 0.3, posY: -2.8, posZ: 0.3, rotX: -Math.PI / 2 + 0.15, rotY: 0, rotZ: 0.1 },
}
