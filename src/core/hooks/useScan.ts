import { useCallback, useState } from 'react'
import { addDoc, serverTimestamp } from 'firebase/firestore'
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage'

import { useAI, TaskType } from '../ai/useAI'
import { scansCollection } from '../firebase/firestore'
import { storage } from '../firebase/storage'
import type { ScanRecord, ScanResult } from '../types'

export interface UseScanResult {
  /** Trigger a scan: upload image, call AI, save record. */
  scan: (file: File, familyId: string, childId: string) => Promise<ScanRecord | null>
  /** Save the user's action (added/skipped) to the scan record. */
  recordAction: (
    familyId: string,
    scanRecord: ScanRecord,
    action: 'added' | 'skipped',
  ) => Promise<void>
  /** Current scan result (latest). */
  scanResult: ScanRecord | null
  /** True while scanning in progress. */
  scanning: boolean
  /** Error from the most recent scan attempt. */
  error: string | null
  /** Clear the current scan result. */
  clearScan: () => void
}

/** Convert a File to a base64-encoded string (data portion only). */
async function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const result = reader.result as string
      // Strip the data:image/...;base64, prefix
      const base64 = result.split(',')[1]
      resolve(base64)
    }
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}

/** Infer media type from a File. */
function inferMediaType(file: File): 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp' {
  if (file.type === 'image/png') return 'image/png'
  if (file.type === 'image/gif') return 'image/gif'
  if (file.type === 'image/webp') return 'image/webp'
  return 'image/jpeg'
}

export function useScan(): UseScanResult {
  const { chat } = useAI()
  const [scanning, setScanning] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [scanResult, setScanResult] = useState<ScanRecord | null>(null)

  const scan = useCallback(
    async (file: File, familyId: string, childId: string): Promise<ScanRecord | null> => {
      setScanning(true)
      setError(null)
      setScanResult(null)

      try {
        // 1. Upload to Firebase Storage (temp scans folder)
        const ts = new Date().toISOString().replace(/[:.]/g, '-')
        const ext = file.name.split('.').pop() ?? 'jpg'
        const storagePath = `families/${familyId}/scans/${ts}.${ext}`
        const storageRef = ref(storage, storagePath)
        await uploadBytes(storageRef, file)
        const imageUrl = await getDownloadURL(storageRef)

        // 2. Convert to base64 for the vision API
        const imageBase64 = await fileToBase64(file)
        const mediaType = inferMediaType(file)

        // 3. Call the scan Cloud Function
        const response = await chat({
          familyId,
          childId,
          taskType: TaskType.Scan,
          messages: [
            {
              role: 'user',
              content: JSON.stringify({ imageBase64, mediaType }),
            },
          ],
        })

        if (!response) {
          throw new Error('Scan failed — no response from AI')
        }

        // 4. Parse the AI response
        let results: ScanResult | null = null
        let parseError: string | undefined
        try {
          results = JSON.parse(response.message) as ScanResult
        } catch {
          // AI returned non-JSON — may be an error message
          parseError = response.message
        }

        // 5. Save to Firestore
        const record: ScanRecord = {
          childId,
          imageUrl,
          storagePath,
          results,
          action: 'pending',
          error: parseError,
          createdAt: new Date().toISOString(),
        }

        const docRef = await addDoc(scansCollection(familyId), {
          childId: record.childId,
          imageUrl: record.imageUrl,
          storagePath: record.storagePath,
          results: record.results ?? null,
          action: record.action,
          ...(record.error ? { error: record.error } : {}),
          createdAt: serverTimestamp(),
        } as unknown as ScanRecord)
        record.id = docRef.id

        setScanResult(record)
        return record
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        setError(msg)
        return null
      } finally {
        setScanning(false)
      }
    },
    [chat],
  )

  const recordAction = useCallback(
    async (familyId: string, record: ScanRecord, action: 'added' | 'skipped') => {
      if (!record.id) return
      // Update the scan record with the action
      const { doc, updateDoc } = await import('firebase/firestore')
      const docRef = doc(scansCollection(familyId), record.id)
      await updateDoc(docRef, { action })
      setScanResult((prev) => (prev ? { ...prev, action } : prev))
    },
    [],
  )

  const clearScan = useCallback(() => {
    setScanResult(null)
    setError(null)
  }, [])

  return { scan, recordAction, scanResult, scanning, error, clearScan }
}
