import { describe, expect, it } from 'vitest'

import {
  CATALOG_ORDER_STATUS_FLOW,
  CatalogOrderStatus,
  CatalogOrderStatusLabel,
  nextOrderStatus,
} from './business'

describe('order status flow (FEAT-89)', () => {
  it('advances forward through the whole flow, then stops', () => {
    expect(nextOrderStatus(CatalogOrderStatus.New)).toBe(CatalogOrderStatus.Making)
    expect(nextOrderStatus(CatalogOrderStatus.Making)).toBe(CatalogOrderStatus.Ready)
    expect(nextOrderStatus(CatalogOrderStatus.Ready)).toBe(CatalogOrderStatus.Delivered)
  })

  it('returns null at the terminal status (forward-only, no wrap-around)', () => {
    expect(nextOrderStatus(CatalogOrderStatus.Delivered)).toBeNull()
  })

  it('never regresses — every step is later in the fixed flow', () => {
    for (let i = 0; i < CATALOG_ORDER_STATUS_FLOW.length - 1; i++) {
      const current = CATALOG_ORDER_STATUS_FLOW[i]
      const next = nextOrderStatus(current)
      expect(next).not.toBeNull()
      expect(CATALOG_ORDER_STATUS_FLOW.indexOf(next!)).toBe(i + 1)
    }
  })

  it('has a label for every status in the flow', () => {
    for (const status of CATALOG_ORDER_STATUS_FLOW) {
      expect(CatalogOrderStatusLabel[status]).toBeTruthy()
    }
  })

  it('returns null for an unknown status (defensive)', () => {
    expect(nextOrderStatus('bogus' as CatalogOrderStatus)).toBeNull()
  })
})
