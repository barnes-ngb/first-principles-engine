import type {
  StickerCategory,
  SubjectBucket,
} from './enums'

// ── Book Builder ──────────────────────────────────────────────

export type BookTheme =
  | 'adventure'
  | 'animals'
  | 'family'
  | 'fantasy'
  | 'minecraft'
  | 'science'
  | 'sight_words'
  | 'faith'
  | 'space'
  | 'dinosaurs'
  | 'ocean'
  | 'superheroes'
  | 'cooking'
  | 'sports'
  | 'holidays'
  | 'other'
  | (string & {})  // allow custom theme IDs

// ── Theme Engine ─────────────────────────────────────────────

export interface BookThemeConfig {
  id: string
  name: string
  isPreset: boolean
  childId?: string
  /**
   * How a picture for this theme should **look** — never what should be in it
   * (FEAT-193 / UX-166).
   *
   * These were scene lists ("Exciting landscapes, treasure maps, hidden paths").
   * The server appends the page's own scene after this prefix, so a subject list
   * here is a second, competing scene and a model handed two scenes splits the
   * canvas — the failure FEAT-189 removed from three illustration styles. A
   * theme names a world for the *story*; the look of a picture is what
   * `GENERATION_STYLES` picks.
   *
   * The fifteen preset strings are byte-identical to the server's
   * `PRESET_IMAGE_PREFIXES` (`functions/src/ai/imageTasks/generateImage.ts`).
   * They are still two hand-kept tables (UX-167), not one module.
   */
  imageStylePrefix: string
  /** Maps to existing coverStyle for visual theming */
  coverStyle: string
  /** Story tone guidance for AI story generation */
  storyTone: string
  /** World description injected into story generation */
  storyWorldDescription: string
  /** Vocabulary level guidance */
  storyVocabularyLevel: string
  /** Display emoji */
  emoji: string
  /** Optional accent color for UI */
  colorAccent?: string
}

export const PRESET_THEMES: BookThemeConfig[] = [
  {
    id: 'adventure', name: 'Adventure', emoji: '🗺️', isPreset: true,
    imageStylePrefix: 'A bold, sunlit children\'s picture-book look — warm and full of open space.',
    coverStyle: 'realistic',
    storyTone: 'adventurous and exciting with brave heroes',
    storyWorldDescription: 'a world full of hidden treasures, ancient maps, and daring quests',
    storyVocabularyLevel: 'medium complexity with action words',
  },
  {
    id: 'animals', name: 'Animals', emoji: '🐾', isPreset: true,
    imageStylePrefix: 'A warm, gentle children\'s picture-book look — soft edges and friendly shapes.',
    coverStyle: 'storybook',
    storyTone: 'gentle and heartwarming with animal friendships',
    storyWorldDescription: 'a forest, farm, or jungle where animals talk and help each other',
    storyVocabularyLevel: 'simple sentences with animal vocabulary',
  },
  {
    id: 'family', name: 'Family', emoji: '👨‍👩‍👦', isPreset: true,
    imageStylePrefix: 'A warm domestic picture-book look — soft light and homey, lived-in color.',
    coverStyle: 'storybook',
    storyTone: 'warm, loving, and relatable with family moments',
    storyWorldDescription: 'a loving home where a family shares everyday adventures together',
    storyVocabularyLevel: 'simple sentences about daily life and emotions',
  },
  {
    id: 'fantasy', name: 'Fantasy', emoji: '✨', isPreset: true,
    imageStylePrefix: 'A magical children\'s picture-book look — luminous color and a soft glow.',
    coverStyle: 'storybook',
    storyTone: 'whimsical and magical with wonder and discovery',
    storyWorldDescription: 'an enchanted realm with dragons, fairies, magic spells, and glowing forests',
    storyVocabularyLevel: 'medium complexity with descriptive fantasy words',
  },
  {
    id: 'minecraft', name: 'Minecraft', emoji: '⛏️', isPreset: true,
    imageStylePrefix: 'A blocky pixel-art look — hard-edged cubes and flat, bright color. No character names.',
    coverStyle: 'minecraft',
    storyTone: 'adventurous with crafting and mining language',
    storyWorldDescription: 'a blocky world made of cubes where heroes mine resources, craft tools, and explore caves',
    storyVocabularyLevel: 'simple action-oriented sentences',
  },
  {
    id: 'science', name: 'Science', emoji: '🔬', isPreset: true,
    imageStylePrefix: 'A clean, bright children\'s picture-book look — crisp lines and generous white space.',
    coverStyle: 'realistic',
    storyTone: 'curious and educational with discovery and experimentation',
    storyWorldDescription: 'a world where young scientists explore nature, conduct experiments, and make discoveries',
    storyVocabularyLevel: 'medium complexity with age-appropriate science vocabulary',
  },
  {
    id: 'sight_words', name: 'Sight Words', emoji: '📖', isPreset: true,
    imageStylePrefix: 'A simple, clean children\'s picture-book look — bold flat color and very little detail.',
    coverStyle: 'storybook',
    storyTone: 'simple and repetitive for reading practice',
    storyWorldDescription: 'everyday scenes that naturally use common sight words in context',
    storyVocabularyLevel: 'very simple with high-frequency sight words repeated throughout',
  },
  {
    id: 'faith', name: 'Faith', emoji: '✝️', isPreset: true,
    imageStylePrefix: 'A warm, reverent children\'s picture-book look — gentle golden light at low saturation.',
    coverStyle: 'storybook',
    storyTone: 'gentle, reverent, and encouraging with faith themes',
    storyWorldDescription: 'a world that reflects God\'s creation, kindness, and the beauty of faith',
    storyVocabularyLevel: 'simple sentences with age-appropriate faith vocabulary',
  },
  {
    id: 'space', name: 'Space Explorer', emoji: '🚀', isPreset: true,
    imageStylePrefix: 'A cosmic children\'s picture-book look — deep darks with bright glowing accents.',
    coverStyle: 'realistic',
    storyTone: 'exciting and wonder-filled with space exploration',
    storyWorldDescription: 'outer space where astronauts visit planets, discover aliens, and float among the stars',
    storyVocabularyLevel: 'medium complexity with space vocabulary',
  },
  {
    id: 'dinosaurs', name: 'Dinosaur World', emoji: '🦕', isPreset: true,
    imageStylePrefix: 'A playful prehistoric picture-book look — deep greens and warm volcanic earth tones.',
    coverStyle: 'realistic',
    storyTone: 'exciting and educational with dinosaur facts woven in',
    storyWorldDescription: 'a prehistoric world where friendly dinosaurs roam jungles, volcanoes, and swamps',
    storyVocabularyLevel: 'medium complexity with dinosaur names and nature words',
  },
  {
    id: 'ocean', name: 'Ocean Adventure', emoji: '🌊', isPreset: true,
    imageStylePrefix: 'An underwater children\'s picture-book look — cool blues with soft light falling from above.',
    coverStyle: 'storybook',
    storyTone: 'adventurous and curious with ocean exploration',
    storyWorldDescription: 'a colorful underwater world with coral reefs, dolphins, whales, and sunken ships',
    storyVocabularyLevel: 'medium complexity with ocean and marine vocabulary',
  },
  {
    id: 'superheroes', name: 'Superheroes', emoji: '🦸', isPreset: true,
    imageStylePrefix: 'A bold, graphic superhero look — saturated primaries and strong contrast.',
    coverStyle: 'comic',
    storyTone: 'action-packed and inspiring with heroes saving the day',
    storyWorldDescription: 'a city where kid superheroes use their powers to help people and stop villains',
    storyVocabularyLevel: 'medium complexity with action and hero vocabulary',
  },
  {
    id: 'cooking', name: 'Kitchen Adventures', emoji: '👨‍🍳', isPreset: true,
    imageStylePrefix: 'A warm kitchen picture-book look — buttery, appetizing color and soft daylight.',
    coverStyle: 'storybook',
    storyTone: 'fun and sensory-rich with cooking and tasting',
    storyWorldDescription: 'a magical kitchen where ingredients come alive and cooking is an adventure',
    storyVocabularyLevel: 'simple sentences with food and cooking vocabulary',
  },
  {
    id: 'sports', name: 'Sports & Games', emoji: '⚽', isPreset: true,
    imageStylePrefix: 'A bright, energetic children\'s picture-book look — vivid color and a sense of motion.',
    coverStyle: 'realistic',
    storyTone: 'energetic and encouraging with teamwork themes',
    storyWorldDescription: 'playgrounds, fields, and courts where kids play sports and learn teamwork',
    storyVocabularyLevel: 'simple action words with sports terminology',
  },
  {
    id: 'holidays', name: 'Holiday Stories', emoji: '🎄', isPreset: true,
    imageStylePrefix: 'A festive, cozy children\'s picture-book look — warm glow and rich seasonal color.',
    coverStyle: 'storybook',
    storyTone: 'warm, festive, and joyful with celebration themes',
    storyWorldDescription: 'a world of holiday celebrations — Christmas, Easter, Thanksgiving, birthdays, and seasonal traditions',
    storyVocabularyLevel: 'simple sentences with holiday and celebration vocabulary',
  },
]

/** Resolve a theme config by ID — checks presets first, returns null for unknown/custom IDs. */
export function getPresetTheme(themeId: string | undefined): BookThemeConfig | null {
  if (!themeId) return null
  return PRESET_THEMES.find((t) => t.id === themeId) ?? null
}

/** Resolve book creator. Absent createdBy → 'parent' (legacy books were Shelly's in kid profiles). */
export function resolveBookCreator(book: { createdBy?: 'parent' | string }): 'parent' | string {
  return book.createdBy ?? 'parent'
}

export const BOOK_THEMES: { id: BookTheme; label: string; emoji: string }[] =
  PRESET_THEMES.map((t) => ({ id: t.id as BookTheme, label: t.name, emoji: t.emoji }))
    .concat([{ id: 'other', label: 'Other', emoji: '📚' }])

export type StickerTag =
  | 'animal'
  | 'nature'
  | 'minecraft'
  | 'fantasy'
  | 'character'
  | 'object'
  | 'vehicle'
  | 'food'
  | 'faith'
  | 'other'

export const STICKER_TAG_LABELS: Record<StickerTag, string> = {
  animal: 'Animal',
  nature: 'Nature',
  minecraft: 'Minecraft',
  fantasy: 'Fantasy',
  character: 'Character',
  object: 'Object',
  vehicle: 'Vehicle',
  food: 'Food',
  faith: 'Faith',
  other: 'Other',
}

// ── Review state (Story Generation V2 — Phase 2) ─────────────

/**
 * Review state for AI-generated books. Tracks the Generate Chat (PR-A)
 * lifecycle and — once PR-B lands — the Per-Page Review.
 *
 * All fields are optional and additive; books without `reviewState` are
 * legacy or non-AI books and stay backwards compatible.
 */
export interface ReviewState {
  // Generate Chat phase (PR-A)
  generateChatState?: 'in-progress' | 'completed'
  chatHistory?: ChatTurn[]
  /** Last-set illustration style during the Generate Chat */
  illustrationStyle?: string

  // Confirm-first flow (PR-A patch — clarification phase)
  clarificationPhase?: 'clarifying' | 'ready'
  /** The idea currently displayed in the latest echo turn. */
  pendingIdea?: string
  /** When set, kid sent a follow-up during clarification awaiting Add/Change. */
  pendingRefinement?: string | null

  // Per-Page Review phase (PR-B will populate these)
  reviewedPages?: number[]
  revisedPages?: number[]
  /** ISO timestamp when fully reviewed or explicitly skipped */
  completedAt?: string
}

/** Kind of an AI message in the Generate Chat — drives how it renders. */
export type ChatMessageKind = 'echo' | 'add-or-change' | 'story-draft' | 'revision'

/** One turn in the Generate Chat. ts is ms-since-epoch for deterministic ordering. */
export interface ChatTurn {
  role: 'kid' | 'ai'
  content: string
  ts: number
  /** Only AI turns set this. Kid turns omit it. */
  kind?: ChatMessageKind
  /**
   * What a speaker may say for this turn, when that is less than what the
   * screen shows (UX-109). Set on the story-draft turn, whose `content` can
   * end with the FEAT-176 readability clause — a line written for the parent's
   * eyes that must never be read aloud to the child sitting beside the phone.
   *
   * Additive and optional: absent means "speak `content`", which is what every
   * turn before this field did and what every other kind still does.
   */
  spokenContent?: string
}

export interface Book {
  id?: string
  childId: string
  title: string
  coverImageUrl?: string
  coverStyle?: 'minecraft' | 'storybook' | 'comic' | 'photo' | 'realistic' | 'garden-warfare' | 'platformer'
  pages: BookPage[]
  status: 'draft' | 'complete'
  createdAt: string
  updatedAt: string
  /** Subject tags for compliance hours logging */
  subjectBuckets: SubjectBucket[]
  /** Total editing time in minutes (accumulated across sessions) */
  totalMinutes?: number
  /** When true, this is a Together Time book for both kids */
  isTogetherBook?: boolean
  /** All contributing children (used for Together Books) */
  contributorIds?: string[]
  /** Book type: 'creative' for kid-made books, 'sight-word' for reading practice, 'generated' for AI-generated stories */
  bookType?: 'creative' | 'sight-word' | 'generated'
  /** How this book was created */
  source?: 'manual' | 'ai-generated'
  /** Target sight words for this book (sight-word type only) */
  sightWords?: string[]
  /** Theme tag for this book */
  theme?: BookTheme
  /** Who created this book. 'parent' = Mom/Dad, otherwise a childId. Absent → treat as 'parent' (legacy books were made by Shelly in kid profiles). */
  createdBy?: 'parent' | string
  /** Which child this book is themed for / intended for (a childId). */
  createdFor?: string
  /** The prompt/parameters used to generate this story */
  generationConfig?: {
    storyIdea?: string
    words: string[]
    style?: string
    /** Freeform theme/style prompt used during generation */
    theme?: string
    difficulty?: 'simple' | 'moderate'
    pageCount: number
    /**
     * The per-story "one step up" the parent picked (FEAT-191): 0 = the child's
     * own assessed reading level, 1-2 = written and measured that many rungs
     * above it, for this book only. Additive — absent means 0, which is every
     * book made before this field existed.
     *
     * It is a property of the BOOK, not of the child: nothing reads it back into
     * `skillSnapshots`, and it exists here so a revise of this book stays at the
     * level it was written at (the server reads it off this record).
     */
    levelStretch?: 0 | 1 | 2
    /**
     * The parent's one-off "what should this story feel like?" note for THIS
     * book (FEAT-194). Additive — absent on every book made before it existed,
     * and absent is the whole prior behaviour. A cleared note is stored as `''`
     * rather than removed: the app runs Firestore with
     * `ignoreUndefinedProperties`, so `undefined` on a `merge` write leaves the
     * old value in place. `''` and absent mean the same thing everywhere
     * (`hasCustomStoryTheme`).
     *
     * It replaced the saved-theme library (`families/{id}/bookThemes`), which no
     * book could ever carry: it lives here because the want is per-book, not
     * reusable. A book has a preset `theme` OR this, never both — the rule is
     * the pure `books/customStoryTheme.ts`.
     *
     * **Story-side only.** It reaches `buildStoryPrompt`'s THEME GUIDANCE and is
     * never used as an image prefix: free text names subject matter, and
     * `buildImagePrompt` appends the page's own scene after its prefix, so a
     * note there would hand the model two scenes (FEAT-189's failure). Asking a
     * parent to describe a LOOK is a separate design, UX-177.
     */
    customTheme?: string
  }
  /** Review state (Generate Chat + Per-Page Review). Phase 2 V2. */
  reviewState?: ReviewState
}

export interface BookPage {
  id: string
  pageNumber: number
  /** Story text for this page */
  text?: string
  /** Voice narration audio URL (Firebase Storage) */
  audioUrl?: string
  audioStoragePath?: string
  /** Images on this page (photos, AI scenes, stickers) */
  images: PageImage[]
  /** Page layout */
  layout: 'image-top' | 'image-left' | 'full-image' | 'text-only'
  createdAt: string
  updatedAt: string
  /** Which child contributed this page (for Together Books) */
  contributorId?: string
  /** Text display size */
  textSize?: 'big' | 'medium' | 'small'
  /** Text font family */
  textFont?: 'handwriting' | 'print' | 'pixel'
  /** Which sight words appear on this page (sight-word books only) */
  sightWordsOnPage?: string[]
}

export interface ImageVersion {
  url: string
  replacedAt: string
  replacedBy: 'reimagine' | 'upload' | 'gallery' | 'generate'
}

export interface PageImage {
  id: string
  url: string
  storagePath?: string
  type: 'photo' | 'ai-generated' | 'sticker' | 'sketch'
  /**
   * Which stacking plane this image belongs to (FEAT-116). A `background` is the
   * full-page canvas (photo / scene / sketch) and always renders behind every
   * `element`; an `element` (sticker / character / placed image) stacks freely
   * above all backgrounds. Stamped at add time. Absent on legacy images →
   * resolved via `layerTypeOf` (the prior heuristic: only stickers were
   * elements), so pre-`layerType` books render identically.
   */
  layerType?: 'background' | 'element'
  /**
   * How a **background** image sits in its box (FEAT-177). `'fill'` crops the
   * overflow so the picture covers the whole area; `'fit'` shows the whole
   * picture and fills the leftover space with a blurred copy of it. Absent =
   * `'fill'`, which is exactly what every book did before this field existed,
   * so nothing already saved renders differently. **Ignored for stickers** —
   * they have always been contain-fit and stay that way. Set from the Book
   * Editor's "Change background" menu; read only through
   * `features/books/imageFit.ts`.
   */
  fit?: 'fill' | 'fit'
  /** Image style variant */
  style?: 'sketch' | 'ai-generated' | 'ai-enhanced' | 'photo'
  /** Original hand-drawn sketch URL (always saved when type is 'sketch') */
  originalSketchUrl?: string
  /** AI-enhanced version URL (if generated via "Make it fancy") */
  enhancedUrl?: string
  /** Storage path for the enhanced version */
  enhancedStoragePath?: string
  /** AI prompt used to generate this image */
  prompt?: string
  /** Label for accessibility and display */
  label?: string
  /** Position and size within the page image container (percentage-based).
   *  x, y, width, height: 0–100, percentage of container dimensions.
   *  rotation: degrees (0–359). zIndex: stacking order integer. */
  position?: { x: number; y: number; width: number; height: number; rotation?: number; zIndex?: number; flipH?: boolean; flipV?: boolean }
  /** Sticker tags (copied from sticker library when placed) */
  tags?: StickerTag[]
  /** Previous image versions — kept when image URL is replaced (max 5). */
  previousVersions?: ImageVersion[]
}

export interface Sticker {
  id?: string
  url: string
  storagePath: string
  label: string
  category: StickerCategory
  /** null = shared between kids, childId = personal */
  childId?: string | null
  prompt?: string
  createdAt: string
  /** Tag classification for filtering */
  tags?: StickerTag[]
  /** Which child this sticker is relevant for */
  childProfile?: 'lincoln' | 'london' | 'both'
  /**
   * Group key (FEAT-33 slice 3). When set, this sticker is one of several
   * versions that share a single source drawing — the cleaned original plus any
   * AI-imagined themed versions made from it. Absent → a standalone sticker
   * (e.g. text→sticker, or any legacy sticker), which renders on its own.
   */
  sourceDrawingId?: string
  /**
   * Which "Make it fancy" theme/style this version is (a `FANCY_STYLE_OPTIONS`
   * id, e.g. 'cartoon' | 'fantasy' | 'minecraft'). Absent → the cleaned
   * original (the group anchor), not a themed version.
   */
  theme?: string
  /** True for the cleaned original that anchors a source-drawing group. */
  isOriginal?: boolean
}

// ── Sight Word Progress ──────────────────────────────────────

export interface SightWordProgress {
  word: string
  /** Total times seen across all stories */
  encounters: number
  /** Times child tapped "I know this" */
  selfReportedKnown: number
  /** Times child tapped for pronunciation help */
  helpRequested: number
  /** Parent confirmed mastery */
  shellyConfirmed: boolean
  /** Computed mastery level */
  masteryLevel: 'new' | 'practicing' | 'familiar' | 'mastered'
  firstSeen: string
  lastSeen: string
  lastLevelChange: string
}

export interface SightWordList {
  id?: string
  childId: string
  name: string
  words: string[]
  source: 'manual' | 'evaluation' | 'curriculum'
  createdAt: string
}
