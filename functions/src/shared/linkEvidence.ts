// ── Which evidence is a LINK rather than a file (UX-285) ─────────────────────
//
// One definition, compiled by both projects (ARCH-47), because two consumers
// must agree or a compliance document states something false:
//
//   • `records.logic.ts`'s `emitsPortfolioLink` decides which artifacts get an
//     address written into the portfolio's **Links** section; and
//   • `compliancePack.logic.ts`'s `planPackMedia` decides which unresolvable
//     URLs are reported as *"an external link, recorded in the portfolio"*
//     rather than as *"could not be resolved to a file"*.
//
// If those drift, the archive's manifest tells an auditor the portfolio holds a
// link it does not hold. The distinction is not "did the URL parse" — it is
// **what kind of evidence this is**:
//
//   • a `Photo` or `Audio` artifact IS a file. A foreign URL on one means the
//     media cannot be archived, which is a defect and must keep reporting as
//     `unreadable-url`.
//   • a `Video` artifact — a strand session's *"the video we watched"*
//     (UX-283) — is a **reference by design**. Nothing was ever uploaded for
//     it, so "could not be resolved to a file" describes a correct record as a
//     failure.
//
// Structural input (a raw stored `type` string, which Firestore may hold in any
// case) and no imports, per `functions/src/shared/README.md`.

/** Stored `EvidenceType` values that record an address instead of a file. */
const LINK_EVIDENCE_TYPES = new Set(["video"]);

/**
 * Is an artifact of this stored type a link rather than a file?
 *
 * Case-insensitive and whitespace-tolerant because the value is read straight
 * off unvalidated Firestore documents, where `'Video'` and `'video'` both
 * occur — the portfolio's own renderers already check for both.
 */
export function isLinkEvidenceType(type: string | undefined | null): boolean {
  return LINK_EVIDENCE_TYPES.has((type ?? "").trim().toLowerCase());
}
