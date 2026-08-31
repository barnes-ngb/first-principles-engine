import type { DadLabReport } from '../../core/types'
import { reportArtifactIds as sharedReportArtifactIds } from '../../../functions/src/shared/dadLabReportArtifacts'

/**
 * Every artifact id a Dad Lab report OWNS — the app-facing, `DadLabReport`-typed
 * face of the single shared rule (UX-85).
 *
 * The rule itself lives in `functions/src/shared/dadLabReportArtifacts.ts` and is
 * compiled by BOTH this project and `functions/` (ARCH-47). It used to be
 * implemented twice — here, and again as a hand-kept port on the functions side —
 * with a parity fixture repeated verbatim in both test files standing in for the
 * compiler. There is now one definition; change it and break a caller on either
 * side and the build fails.
 *
 * This wrapper exists so the app's callers keep a `DadLabReport` parameter rather
 * than the shared module's structural `RawDadLabReport`, and so `DadLabPage` and
 * `records/dataReviewExport.logic.ts` keep their import path.
 *
 * For the rule itself — which two sources, why both, de-duplication and ordering —
 * read the shared module's header.
 */
export function reportArtifactIds(report: DadLabReport): string[] {
  return sharedReportArtifactIds(report)
}
