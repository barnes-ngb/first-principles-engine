import { getDownloadURL, ref, uploadBytes } from 'firebase/storage'
import { storage } from '../../core/firebase/storage'

/** Maximum retries for upload */
const MAX_RETRIES = 3
const BASE_DELAY_MS = 1000

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/**
 * Upload a voice recording blob to Firebase Storage.
 *
 * Path: `families/{familyId}/storyGames/{gameId}/audio/{cardId}.webm`
 */
export async function uploadVoiceRecording(
  familyId: string,
  gameId: string,
  cardId: string,
  blob: Blob,
): Promise<string> {
  const ext = blob.type.includes('mp4') ? 'mp4' : 'webm'
  const storagePath = `families/${familyId}/storyGames/${gameId}/audio/${cardId}.${ext}`
  const storageRef = ref(storage, storagePath)

  let lastError: unknown
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      await uploadBytes(storageRef, blob)
      return await getDownloadURL(storageRef)
    } catch (error) {
      lastError = error
      if (attempt < MAX_RETRIES - 1) {
        await wait(BASE_DELAY_MS * 2 ** attempt)
      }
    }
  }

  throw lastError
}
