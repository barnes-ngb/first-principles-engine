/**
 * Which bytes a scan sends, and what type it declares for them (UX-278).
 *
 * Moved out of `useScan.ts` unchanged so the before-work page check
 * (`useProspectivePageCheck`) can use the SAME resolution without importing the
 * retrospective door — that hook imports `firebase/firestore` and
 * `firebase/storage`, and the prospective check's contract is that it reaches
 * neither, which is a fact about its import graph and not only about its code.
 * Pure: no Firestore, no Storage, no React.
 */

import { compressImage } from './compressImage'
import { isScanMediaType, unsupportedFormatMessage } from './scanImageFormat'
import type { ScanMediaType } from './scanImageFormat'

/**
 * The old `inferMediaType` guessed `image/jpeg` for anything it did not
 * recognise, so an unreadable format was relabelled and sent. Now: a supported
 * type passes straight through; an unsupported one gets ONE honest conversion
 * attempt — the canvas re-encodes it to JPEG, which is how a small AVIF, or a
 * file the picker handed over with no type at all, still works — and if the
 * browser cannot decode it either (HEIC in Chrome), it is refused BY NAME
 * before any upload or paid API call.
 *
 * `compressImage` resolves with the ORIGINAL blob when the decode fails, so the
 * "still unsupported" branch is a real answer, not a swallowed error.
 */
export async function resolveScanUpload(
  file: File,
  compressed: Blob,
): Promise<{ uploadFile: File; mediaType: ScanMediaType; converted: boolean }> {
  // UX-277: `compressImage` renders to a canvas and re-encodes — the bytes that
  // come back are JPEG whatever went in. Read the type off the RETURNED blob,
  // never off the input file. (When nothing was compressed, `compressIfNeeded`
  // returns the original File, so that branch already carries the right type.)
  const asFile = (blob: Blob, type: string): File =>
    blob instanceof File && blob.type === type ? blob : new File([blob], file.name, { type })

  // `converted` means "the bytes we send are not the bytes that were picked" —
  // whichever step re-encoded them. `compressIfNeeded` returns the file ITSELF
  // when it does nothing (under the threshold, or an undecodable image), so
  // identity is the exact test. Reporting only the unsupported-format re-encode
  // here would have a diagnostic read `in=image/png converted=no
  // sent=image/jpeg` — internally inconsistent, on the one path this
  // instrumentation exists to explain (Codex round 1, P2).
  const compressedHere = (compressed as Blob) !== (file as Blob)

  const initialType = compressed.type || file.type
  if (isScanMediaType(initialType)) {
    return {
      uploadFile: asFile(compressed, initialType),
      mediaType: initialType,
      converted: compressedHere,
    }
  }

  const reencoded = await compressImage(compressed, {
    maxWidth: 2048,
    maxHeight: 2048,
    quality: 0.85,
  })
  const reencodedType = reencoded.type
  if (isScanMediaType(reencodedType)) {
    return { uploadFile: asFile(reencoded, reencodedType), mediaType: reencodedType, converted: true }
  }

  throw new Error(unsupportedFormatMessage(initialType, file.name))
}
