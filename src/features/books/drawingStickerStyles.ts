import type { EnhanceSketchRequest } from '../../core/ai/useAI'
import { getPresetTheme } from '../../core/types/books'

/**
 * "Make it fancy" style options for the drawing → sticker flow (FEAT-33).
 *
 * These mirror the bookshelf themes (`PRESET_THEMES` in `core/types/books.ts`)
 * and map to the same theme keys the books use, so a sticker and a book in the
 * same theme look consistent. Each surfaced theme id is a `PRESET_THEME` id,
 * which mirrors the server's `THEME_IMAGE_STYLES` keys in
 * `functions/src/ai/imageTasks/enhanceSketch.ts` — deriving label + emoji from
 * the book theme constant (rather than a hand-maintained parallel list) keeps
 * the two from drifting.
 *
 * The first entry is the default "clean cartoon house style" — the app's
 * established `storybook` illustration default (see FEAT-28 house style) — which
 * is intentionally *not* a book theme.
 */
export interface FancyStyleOption {
  id: string
  label: string
  emoji: string
  /** Style hint passed to enhanceSketch. */
  style?: EnhanceSketchRequest['style']
  /** Book theme key passed to enhanceSketch (a valid `THEME_IMAGE_STYLES` key). */
  theme?: string
}

/**
 * Spec for a fancy option, resolved into a `FancyStyleOption` below. Either the
 * Cartoon house-style default (a literal, no theme) or a bookshelf theme
 * referenced by id (label/emoji derived from `PRESET_THEMES`).
 */
type FancyOptionSpec =
  | { id: string; label: string; emoji: string; style: EnhanceSketchRequest['style'] }
  | { themeId: string; label?: string; style?: EnhanceSketchRequest['style'] }

// Cartoon (default) first, then the bookshelf themes in display order. Trim or
// extend by editing this list — every `themeId` must be a real bookshelf theme.
const FANCY_OPTION_SPECS: FancyOptionSpec[] = [
  { id: 'cartoon', label: 'Cartoon', emoji: '🎨', style: 'storybook' },
  { themeId: 'fantasy' },
  { themeId: 'animals' },
  { themeId: 'adventure' },
  { themeId: 'space' },
  { themeId: 'science' },
  { themeId: 'faith' },
  { themeId: 'family' },
  // Minecraft pairs the blocky base style with the theme; relabeled kid-friendly.
  { themeId: 'minecraft', label: 'Blocky', style: 'minecraft' },
]

function resolveSpec(spec: FancyOptionSpec): FancyStyleOption {
  if ('id' in spec) {
    return { id: spec.id, label: spec.label, emoji: spec.emoji, style: spec.style }
  }
  const preset = getPresetTheme(spec.themeId)
  return {
    id: spec.themeId,
    label: spec.label ?? preset?.name ?? spec.themeId,
    emoji: preset?.emoji ?? '🎨',
    theme: spec.themeId,
    style: spec.style,
  }
}

export const FANCY_STYLE_OPTIONS: FancyStyleOption[] = FANCY_OPTION_SPECS.map(resolveSpec)

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
