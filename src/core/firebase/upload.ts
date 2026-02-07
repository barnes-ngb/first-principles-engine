import { getDownloadURL, ref, uploadBytes } from 'firebase/storage'
import { storage } from './storage'

/** Maximum number of upload attempts before giving up. */
const MAX_RETRIES = 3

/** Base delay between retries in milliseconds (doubles each attempt). */
const BASE_DELAY_MS = 1000

/** Firebase Storage error codes that will never succeed on retry. */
const NON_RETRYABLE_CODES = new Set([
  'storage/unauthorized',
  'storage/unauthenticated',
  'storage/bucket-not-found',
  'storage/invalid-argument',
  'storage/invalid-checksum',
  'storage/canceled',
])

function isRetryable(error: unknown): boolean {
  if (typeof error === 'object' && error !== null && 'code' in error) {
    return !NON_RETRYABLE_CODES.has((error as { code: string }).code)
  }
  return true
}

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
 * Non-retryable errors (permissions, bad arguments) are thrown immediately.
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
      if (!isRetryable(error)) {
        throw error
      }
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
