import { describe, it, expect } from 'vitest'
import {
  ACCESSORIES,
  ACCESSORY_SLOTS,
  ACCESSORY_XP_THRESHOLDS,
} from '../../../core/types'
import type { AccessoryId } from '../../../core/types'
import { getHiddenAccessories } from '../voxel/buildAccessory'
import { buildAccessory, getAccessoryAttachPoint } from '../voxel/buildAccessory'

describe('Accessory types and constants', () => {
  it('has 10 accessories defined', () => {
    expect(ACCESSORIES).toHaveLength(10)
  })

  it('all accessories have valid slots', () => {
    const validSlots = Object.keys(ACCESSORY_SLOTS)
    for (const acc of ACCESSORIES) {
      expect(validSlots).toContain(acc.slot)
    }
  })

  it('every accessory has an XP threshold', () => {
    for (const acc of ACCESSORIES) {
      expect(ACCESSORY_XP_THRESHOLDS[acc.id]).toBeDefined()
      expect(ACCESSORY_XP_THRESHOLDS[acc.id]).toBe(acc.xpRequired)
    }
  })

  it('at 0 XP all accessories are locked', () => {
    const unlocked = ACCESSORIES.filter((a) => 0 >= a.xpRequired)
    expect(unlocked).toHaveLength(0)
  })

  it('at 50 XP glasses and headband unlock', () => {
    const unlocked = ACCESSORIES.filter((a) => 50 >= a.xpRequired)
    const ids = unlocked.map((a) => a.id)
    expect(ids).toContain('glasses')
    expect(ids).toContain('headband')
    expect(ids).toHaveLength(2)
  })

  it('at 1000 XP all accessories unlock', () => {
    const unlocked = ACCESSORIES.filter((a) => 1000 >= a.xpRequired)
    expect(unlocked).toHaveLength(10)
  })
})

describe('Slot exclusivity', () => {
  it('glasses and sunglasses share eyes slot', () => {
    expect(ACCESSORY_SLOTS.eyes).toContain('glasses')
    expect(ACCESSORY_SLOTS.eyes).toContain('sunglasses')
  })

  it('headband, crown, and bandana share head slot', () => {
    expect(ACCESSORY_SLOTS.head).toContain('headband')
    expect(ACCESSORY_SLOTS.head).toContain('crown')
    expect(ACCESSORY_SLOTS.head).toContain('bandana')
  })

  it('backpack and wings share back slot', () => {
    expect(ACCESSORY_SLOTS.back).toContain('backpack')
    expect(ACCESSORY_SLOTS.back).toContain('wings')
  })
})

describe('getHiddenAccessories', () => {
  it('returns empty set when no conflicts', () => {
    const hidden = getHiddenAccessories(['belt', 'shoes'], ['glasses', 'backpack'])
    expect(hidden.size).toBe(0)
  })

  it('hides crown when helmet is equipped', () => {
    const hidden = getHiddenAccessories(['helmet'], ['crown', 'glasses'])
    expect(hidden.has('crown')).toBe(true)
    expect(hidden.has('glasses')).toBe(false)
  })

  it('hides book when shield is equipped', () => {
    const hidden = getHiddenAccessories(['shield'], ['book', 'parrot'])
    expect(hidden.has('book')).toBe(true)
    expect(hidden.has('parrot')).toBe(false)
  })

  it('glasses stay visible with helmet', () => {
    const hidden = getHiddenAccessories(['helmet'], ['glasses'])
    expect(hidden.has('glasses')).toBe(false)
  })

  it('sunglasses stay visible with helmet', () => {
    const hidden = getHiddenAccessories(['helmet'], ['sunglasses'])
    expect(hidden.has('sunglasses')).toBe(false)
  })
})

describe('getAccessoryAttachPoint', () => {
  it('head accessories attach to headGroup', () => {
    expect(getAccessoryAttachPoint('glasses')).toBe('headGroup')
    expect(getAccessoryAttachPoint('sunglasses')).toBe('headGroup')
    expect(getAccessoryAttachPoint('headband')).toBe('headGroup')
    expect(getAccessoryAttachPoint('crown')).toBe('headGroup')
    expect(getAccessoryAttachPoint('bandana')).toBe('headGroup')
  })

  it('book attaches to left arm', () => {
    expect(getAccessoryAttachPoint('book')).toBe('armL')
  })

  it('body accessories attach to character root', () => {
    expect(getAccessoryAttachPoint('backpack')).toBe('character')
    expect(getAccessoryAttachPoint('wings')).toBe('character')
    expect(getAccessoryAttachPoint('scarf')).toBe('character')
    expect(getAccessoryAttachPoint('parrot')).toBe('character')
  })
})

describe('buildAccessory', () => {
  const allIds: AccessoryId[] = [
    'glasses', 'sunglasses', 'headband', 'crown', 'bandana',
    'backpack', 'wings', 'book', 'scarf', 'parrot',
  ]

  it.each(allIds)('builds %s without error for older age group', (id) => {
    const group = buildAccessory(id, 'older')
    expect(group).toBeDefined()
    expect(group.userData.isAccessory).toBe(true)
    expect(group.userData.accessoryType).toBe(id)
  })

  it.each(allIds)('builds %s without error for younger age group', (id) => {
    const group = buildAccessory(id, 'younger')
    expect(group).toBeDefined()
    expect(group.userData.isAccessory).toBe(true)
    expect(group.userData.accessoryType).toBe(id)
  })

  it('book has attachToArm userData', () => {
    const group = buildAccessory('book', 'older')
    expect(group.userData.attachToArm).toBe('L')
  })

  it('multiple accessories can be built simultaneously', () => {
    const glasses = buildAccessory('glasses', 'older')
    const backpack = buildAccessory('backpack', 'older')
    const parrot = buildAccessory('parrot', 'older')
    expect(glasses.name).toContain('glasses')
    expect(backpack.name).toContain('backpack')
    expect(parrot.name).toContain('parrot')
  })
})
