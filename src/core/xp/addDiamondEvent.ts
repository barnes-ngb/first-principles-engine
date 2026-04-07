import type { DiamondCategory, DiamondEventType } from '../types/xp'
import { addXpEvent } from './addXpEvent'

export interface AddDiamondEventArgs {
  familyId: string
  childId: string
  /** Positive to award, negative to deduct */
  amount: number
  /** Must be a valid DIAMOND_EVENTS value */
  type: DiamondEventType
  reason: string
  dedupKey: string
  awardedBy?: 'auto' | 'parent' | 'system'
  category?: DiamondCategory
  itemId?: string
}

/**
 * Single gateway for all diamond movement (awards, deductions, spending).
 *
 * Wraps addXpEvent with currencyType='diamond' and diamond-specific metadata.
 * All diamond earning, parent awards, and spending should go through this function.
 */
export async function addDiamondEvent(args: AddDiamondEventArgs): Promise<{
  success: boolean
  newBalance: number
  error?: string
}> {
  const {
    familyId,
    childId,
    amount,
    type,
    reason,
    dedupKey,
    awardedBy = 'auto',
    category = 'earn',
    itemId,
  } = args

  if (amount === 0) {
    return { success: true, newBalance: 0 }
  }

  try {
    // addXpEvent uses 'MANUAL_AWARD' as the XP event type key for diamond entries.
    // The actual diamond event type is stored in meta.diamondType.
    const xpEventType = amount > 0 ? 'MANUAL_AWARD' : 'MANUAL_DEDUCT'

    const awarded = await addXpEvent(
      familyId,
      childId,
      xpEventType,
      amount,
      dedupKey,
      { reason, awardedBy, diamondType: type },
      { currencyType: 'diamond', category, ...(itemId ? { itemId } : {}) },
    )

    return { success: awarded !== 0 || amount === 0, newBalance: awarded }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err)
    console.error('addDiamondEvent failed:', message)
    return { success: false, newBalance: 0, error: message }
  }
}
