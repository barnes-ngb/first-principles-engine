import { useEffect, useState } from 'react'
import { getDownloadURL, ref } from 'firebase/storage'

import { storage } from '../../core/firebase/storage'

const cache = new Map<string, string>()

/** Resolve a Firebase Storage path to a download URL (cached). */
export function usePhotoUrl(storagePath: string | undefined): {
  url: string | undefined
  loading: boolean
  failed: boolean
} {
  const [url, setUrl] = useState<string | undefined>(() =>
    storagePath ? cache.get(storagePath) : undefined,
  )
  const [loading, setLoading] = useState(
    !!storagePath && !cache.has(storagePath),
  )
  const [failed, setFailed] = useState(false)
  const [lastPath, setLastPath] = useState(storagePath)

  // Reset state synchronously when the input path changes.
  if (lastPath !== storagePath) {
    setLastPath(storagePath)
    const cached = storagePath ? cache.get(storagePath) : undefined
    setUrl(cached)
    setLoading(!!storagePath && !cached)
    setFailed(false)
  }

  useEffect(() => {
    if (!storagePath) return
    if (cache.has(storagePath)) return

    let cancelled = false
    getDownloadURL(ref(storage, storagePath))
      .then((u) => {
        if (cancelled) return
        cache.set(storagePath, u)
        setUrl(u)
        setLoading(false)
      })
      .catch((err) => {
        if (cancelled) return
        console.warn('usePhotoUrl failed:', storagePath, err)
        setFailed(true)
        setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [storagePath])

  return { url, loading, failed }
}
