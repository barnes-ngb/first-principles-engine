import { getDownloadURL, ref, uploadBytes } from 'firebase/storage'
import { storage } from './storage'

/** Maximum number of upload attempts before giving up. */
const MAX_RETRIES = 3

/** Base delay between retries in milliseconds (doubles each attempt). */
const BASE_DELAY_MS = 1000

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

export interface UploadResult {
  downloadUrl: string
  storagePath: string
}

/**
 * Upload a file (Blob/File) to Firebase Storage with exponential-backoff retries.
 *
 * Storage path: `families/{familyId}/artifacts/{artifactId}/{filename}`
 *
 * Returns the download URL and the storage path.
 */
export async function uploadArtifactFile(
  familyId: string,
  artifactId: string,
  file: Blob | File,
  filename: string,
): Promise<UploadResult> {
  const storagePath = `families/${familyId}/artifacts/${artifactId}/${filename}`
  const storageRef = ref(storage, storagePath)

  let lastError: unknown
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      await uploadBytes(storageRef, file)
      const downloadUrl = await getDownloadURL(storageRef)
      return { downloadUrl, storagePath }
    } catch (error) {
      lastError = error
      if (attempt < MAX_RETRIES - 1) {
        await wait(BASE_DELAY_MS * 2 ** attempt)
      }
    }
  }

  throw lastError
}

/**
 * Generate a safe filename from a timestamp and extension.
 */
export function generateFilename(extension: string): string {
  const ts = new Date().toISOString().replace(/[:.]/g, '-')
  return `${ts}.${extension}`
}
