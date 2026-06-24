import { ref, getBlob } from 'firebase/storage'
import { storage } from '../../core/firebase/storage'

/**
 * CORS-safe image → base64 data-URI loading, shared by the book and sticker
 * PDF exporters. Extracted from `printBook.ts` so `printStickerSheet.ts` can
 * reuse the exact same Firebase-SDK-first fetch path (no duplicate image code).
 * `printBook` still imports these helpers, so its behavior is unchanged.
 */

export function blobToDataUri(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onloadend = () => resolve(reader.result as string)
    reader.onerror = reject
    reader.readAsDataURL(blob)
  })
}

/**
 * Fetch an image as a base64 data URI using the Firebase Storage SDK (no CORS
 * needed). Falls back to a browser `fetch`, then to the original URL.
 */
export async function fetchAsDataUri(url: string, storagePath?: string): Promise<string> {
  if (storagePath) {
    try {
      const storageRef = ref(storage, storagePath)
      const blob = await getBlob(storageRef)
      return await blobToDataUri(blob)
    } catch (err) {
      console.warn('Firebase SDK getBlob failed, trying fetch:', storagePath, err)
    }
  }

  try {
    const response = await fetch(url, { mode: 'cors' })
    if (response.ok) {
      const blob = await response.blob()
      return await blobToDataUri(blob)
    }
  } catch {
    console.warn('Fetch CORS failed for:', url.slice(0, 80))
  }

  return url
}
