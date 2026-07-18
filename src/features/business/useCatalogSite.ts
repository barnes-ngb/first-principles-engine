import { useCallback, useEffect, useState } from 'react'

import { useFamilyId } from '../../core/auth/useAuth'
import type { CatalogProduct } from '../../core/types/business'
import type { PublishedState } from './catalogSitePublish'
import {
  getPublishedState,
  publishCatalogSite,
  unpublishCatalogSite,
} from './catalogSitePublish'

export interface UseCatalogSiteResult {
  /** Current published state (URL + last-published time), or `null` if not live. */
  published: PublishedState | null
  /** True while an initial published-state check is in flight. */
  loading: boolean
  /** True while a publish/unpublish write is in flight. */
  busy: boolean
  error: string | null
  /** Render the `listed` products and (re)publish the public page. */
  publish: (products: CatalogProduct[]) => Promise<void>
  /** Take the public page down. */
  unpublish: () => Promise<void>
}

/**
 * State wrapper over the FEAT-84 publish I/O (`catalogSitePublish.ts`). On mount
 * it reads whether a page is already published; `publish`/`unpublish` drive the
 * Storage upload/delete and keep `published` in sync. The Catalog section gates
 * the controls behind `canEdit` (parent-only, design §6) — this hook does the
 * work, not the gating.
 */
export function useCatalogSite(): UseCatalogSiteResult {
  const familyId = useFamilyId()
  const [published, setPublished] = useState<PublishedState | null>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!familyId) return
    let active = true
    setLoading(true)
    getPublishedState(familyId)
      .then((state) => {
        if (active) setPublished(state)
      })
      .catch(() => {
        // A read failure just means "unknown" — leave published null, no error banner.
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => {
      active = false
    }
  }, [familyId])

  const publish = useCallback(
    async (products: CatalogProduct[]) => {
      if (!familyId) throw new Error('publish: no family')
      setBusy(true)
      setError(null)
      try {
        const state = await publishCatalogSite(familyId, products)
        setPublished(state)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Publish failed')
        throw err
      } finally {
        setBusy(false)
      }
    },
    [familyId],
  )

  const unpublish = useCallback(async () => {
    if (!familyId) throw new Error('unpublish: no family')
    setBusy(true)
    setError(null)
    try {
      await unpublishCatalogSite(familyId)
      setPublished(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unpublish failed')
      throw err
    } finally {
      setBusy(false)
    }
  }, [familyId])

  return { published, loading, busy, error, publish, unpublish }
}
