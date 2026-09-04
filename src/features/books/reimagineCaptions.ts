/**
 * What each band of the "Reimagine intensity" slider asks the picture model for
 * (FEAT-193 / UX-161a).
 *
 * **Why these are here.** They were three string literals inline in
 * `BookEditorPage`, and all three described something the code does not do. The
 * left band said *"keeping their art style and line work"* while sending the
 * full house watercolor recipe under *"Follow the palette, line work, and
 * shading described above exactly"*; the right band said *"a polished cartoon
 * style"* while sending the comic recipe — heavy black ink and halftone dots.
 * The slider's own end labels made the same two claims ("Keep my style" ↔ "Full
 * reimagine").
 *
 * Each line now names the look its band actually sends, and
 * `reimagineCaptions.test.ts` holds the two in step against
 * {@link reimagineStyleFor} — the routing this text has to stay true to.
 *
 * **What is deliberately NOT fixed here.** Two of the three bands resolve to the
 * *same* style, so the middle band differs from the left only by how closely
 * this text asks the redraw to follow the original. That is a routing defect
 * (UX-161b, batch B) and papering over it in copy would hide it. These captions
 * are honest about the look; they do not pretend the middle band is a third one.
 *
 * Copy only — nothing here picks a style, spends a generation or reads state.
 */
export type ReimagineBand = 'light' | 'medium' | 'full'

/** The same thresholds `useBackgroundReimagine` labels a job with. */
export function reimagineBand(intensity: number): ReimagineBand {
  if (intensity <= 25) return 'light'
  if (intensity >= 75) return 'full'
  return 'medium'
}

const CAPTIONS: Record<ReimagineBand, string> = {
  light:
    'Redraw this child\'s drawing in the warm hand-painted watercolor picture-book look, following the original composition and where every line sits as closely as possible.',
  medium:
    'Redraw this child\'s drawing in the warm hand-painted watercolor picture-book look as a polished illustration, keeping the original composition and character design.',
  full:
    'Redraw this child\'s drawing in the bold comic-book look — heavy black ink outline, flat comic primaries and halftone dots — keeping the subject matter.',
}

/** The caption sent for a slider position. */
export function reimagineCaption(intensity: number): string {
  return CAPTIONS[reimagineBand(intensity)]
}

/**
 * The two ends of the slider, named by the look each end actually reaches —
 * which is the one real difference across it. They used to read "Keep my style"
 * ↔ "Full reimagine".
 */
export const REIMAGINE_LEFT_LABEL = 'Watercolor look'
export const REIMAGINE_RIGHT_LABEL = 'Comic-book look'
