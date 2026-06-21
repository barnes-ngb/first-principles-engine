import type { EnhanceSketchRequest } from '../../core/ai/useAI'

/**
 * Standalone "Make it fancy" style options for the drawing → sticker flow
 * (FEAT-33 slice 2). These are decoupled from book themes: each option maps to
 * the `style` / `theme` knobs the `enhanceSketch` Cloud Function already accepts,
 * but driven by a kid-facing picker rather than a book's visual identity.
 *
 * The first entry is the default "clean cartoon house style" — the app's
 * established `storybook` illustration default (see FEAT-28 house style).
 */
export interface FancyStyleOption {
  id: string
  label: string
  emoji: string
  /** Style hint passed to enhanceSketch. */
  style?: EnhanceSketchRequest['style']
  /** Theme hint passed to enhanceSketch (standalone — not a book theme). */
  theme?: string
}

export const FANCY_STYLE_OPTIONS: FancyStyleOption[] = [
  { id: 'cartoon', label: 'Cartoon', emoji: '🎨', style: 'storybook' },
  { id: 'comic', label: 'Comic', emoji: '💥', style: 'comic' },
  { id: 'fantasy', label: 'Fantasy', emoji: '🧚', theme: 'fantasy' },
  { id: 'space', label: 'Space', emoji: '🚀', theme: 'space' },
  { id: 'animals', label: 'Animals', emoji: '🐾', theme: 'animals' },
  { id: 'blocky', label: 'Blocky', emoji: '🟫', style: 'minecraft', theme: 'minecraft' },
]

/** Default style id — the clean cartoon house style. */
export const DEFAULT_FANCY_STYLE_ID = FANCY_STYLE_OPTIONS[0].id

/**
 * Resolve a picker option id to the `style` / `theme` params for an
 * `enhanceSketch` request. Always returns the transparent-sticker knobs
 * (`transparent: true`) so the enhanced result is a clean cutout. Falls back to
 * the default option for an unknown id.
 */
export function resolveFancyEnhanceParams(
  styleId: string,
): Pick<EnhanceSketchRequest, 'style' | 'theme' | 'transparent'> {
  const option =
    FANCY_STYLE_OPTIONS.find((o) => o.id === styleId) ?? FANCY_STYLE_OPTIONS[0]
  return {
    style: option.style,
    theme: option.theme,
    transparent: true,
  }
}
