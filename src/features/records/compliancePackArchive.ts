import { getFunctions, httpsCallable } from 'firebase/functions'

import type { Artifact } from '../../core/types/common'
import {
  buildCompliancePackFiles,
  isSharedArtifact,
  type CompliancePackFile,
  type CompliancePackInput,
} from './records.logic'

/**
 * Client half of the full compliance archive (FEAT-126).
 *
 * The fast, text-only pack (`buildComplianceZip`) is unchanged and still one
 * tap away — this is the *archive*: the same four files, with every artifact's
 * actual bytes embedded and the portfolio's media links rewritten to relative
 * `media/…` paths, so the zip reads offline with no network and no revocable
 * download token.
 *
 * The rendered text is built **here**, by the same builders the fast pack uses,
 * and handed to the Cloud Function already rendered. That is deliberate: it
 * keeps one renderer for hours / logs / evaluations / portfolio, guarantees the
 * archive's text is the fast pack's text, and keeps compliance and hours math
 * out of `functions/` entirely.
 */

/**
 * Long enough for a school year of media, short enough to surface as an error
 * the parent can retry rather than a spinner that never resolves. Matches the
 * callable's own 540s ceiling.
 */
export const COMPLIANCE_PACK_TIMEOUT_MS = 540_000

export type CompliancePackArchiveResult = {
  objectPath: string
  downloadName: string
  downloadUrl: string
  urlKind: 'signed' | 'token'
  expiresAt: string
  bytes: number
  mediaIncluded: number
  mediaSkipped: number
  hasGaps: boolean
}

type PackArtifactPayload = {
  id: string
  title: string
  createdAt: string
  type: string
  scope: 'child' | 'family'
  urls: string[]
}

/**
 * Every artifact in the range, with every media URL it carries.
 *
 * Sent for **all** of them, not only the ones the markdown links — a recording
 * that no section embeds is still evidence, and the manifest has to account for
 * it either way. An artifact with no media rides along so the manifest can say
 * so rather than leave a silent hole.
 */
export const buildPackArtifactPayload = (
  artifacts: Artifact[],
): PackArtifactPayload[] =>
  artifacts.map((artifact) => ({
    id: artifact.id ?? '',
    title: artifact.title,
    createdAt: artifact.createdAt,
    type: String(artifact.type),
    scope: isSharedArtifact(artifact) ? 'family' : 'child',
    urls: artifact.mediaUrls?.length
      ? artifact.mediaUrls
      : artifact.uri
        ? [artifact.uri]
        : [],
  }))

export type CompliancePackArchiveRequest = {
  familyId: string
  childId: string
  pack: CompliancePackInput
  artifacts: Artifact[]
}

/** The exact payload the callable receives. Exported for tests. */
export const buildCompliancePackRequest = ({
  familyId,
  childId,
  pack,
  artifacts,
}: CompliancePackArchiveRequest): {
  familyId: string
  childId: string
  childName: string
  startDate: string
  endDate: string
  files: CompliancePackFile[]
  artifacts: PackArtifactPayload[]
} => ({
  familyId,
  childId,
  childName: pack.childName,
  startDate: pack.startDate,
  endDate: pack.endDate,
  files: buildCompliancePackFiles(pack),
  artifacts: buildPackArtifactPayload(artifacts),
})

/**
 * True while an archive is being assembled. A phone tap that lands twice would
 * otherwise pay for the pack twice and write two objects.
 */
let inFlight = false

/**
 * Ask the Cloud Function for a full archive and return its short-lived link.
 *
 * The explicit `timeout` is what bounds this call: building a year of media can
 * legitimately take minutes, and without a ceiling a stalled call is
 * indistinguishable from a slow one.
 */
export async function requestCompliancePackArchive(
  request: CompliancePackArchiveRequest,
): Promise<CompliancePackArchiveResult> {
  if (inFlight) {
    throw new Error('A compliance archive is already being built.')
  }
  inFlight = true
  try {
    const callable = httpsCallable<
      ReturnType<typeof buildCompliancePackRequest>,
      CompliancePackArchiveResult
    >(getFunctions(), 'generateCompliancePack', {
      timeout: 540_000, // COMPLIANCE_PACK_TIMEOUT_MS
    })

    const response = await callable(buildCompliancePackRequest(request))
    return response.data
  } finally {
    inFlight = false
  }
}

/**
 * What to tell the parent once the archive lands. Says out loud when evidence
 * is flagged rather than embedded — a pack with gaps that reads as complete is
 * the failure mode this feature exists to remove.
 */
export const describeArchiveResult = (
  result: CompliancePackArchiveResult,
): string => {
  const media = `${result.mediaIncluded} file${result.mediaIncluded === 1 ? '' : 's'} of evidence`
  if (!result.hasGaps) return `Full archive ready — ${media} embedded.`
  return `Full archive ready — ${media} embedded, ${result.mediaSkipped} flagged in manifest.csv.`
}
