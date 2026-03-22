/** Ref interface exposed by wizard steps that use tap-to-hear. */
export interface TapToHearRef {
  /** Auto-confirm a highlighted-but-unconfirmed tile before advancing. */
  confirmHighlighted: () => void
}
