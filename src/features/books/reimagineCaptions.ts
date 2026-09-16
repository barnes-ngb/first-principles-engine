/**
 * Captions for the existing numeric reimagine contract (FEAT-193 / UX-161a).
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
 * The dialog now offers two named looks (UX-161b), using 50 for the existing
 * default watercolor request and 100 for comic. Legacy callers keep all three
 * caption bands, including the closer-composition request at low intensity.
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

/** The caption sent for an existing numeric intensity. */
export function reimagineCaption(intensity: number): string {
  return CAPTIONS[reimagineBand(intensity)]
}

/**
 * Existing label exports retained for callers of the former slider.
 */
export const REIMAGINE_LEFT_LABEL = 'Watercolor look'
export const REIMAGINE_RIGHT_LABEL = 'Comic-book look'

/** Each offered look reaches a distinct existing server style; 50 stays default. */
export const REIMAGINE_LOOK_CHOICES = [
  { intensity: 50, label: REIMAGINE_LEFT_LABEL },
  { intensity: 100, label: REIMAGINE_RIGHT_LABEL },
] as const
