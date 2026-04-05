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
  /** Injected into DALL-E image generation prompt */
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
    imageStylePrefix: 'A colorful adventure scene for a children\'s book. Exciting landscapes, treasure maps, hidden paths.',
    coverStyle: 'realistic',
    storyTone: 'adventurous and exciting with brave heroes',
    storyWorldDescription: 'a world full of hidden treasures, ancient maps, and daring quests',
    storyVocabularyLevel: 'medium complexity with action words',
  },
  {
    id: 'animals', name: 'Animals', emoji: '🐾', isPreset: true,
    imageStylePrefix: 'A warm, friendly children\'s book illustration of animals in nature. Soft colors, gentle expressions.',
    coverStyle: 'storybook',
    storyTone: 'gentle and heartwarming with animal friendships',
    storyWorldDescription: 'a forest, farm, or jungle where animals talk and help each other',
    storyVocabularyLevel: 'simple sentences with animal vocabulary',
  },
  {
    id: 'family', name: 'Family', emoji: '👨‍👩‍👦', isPreset: true,
    imageStylePrefix: 'A warm, cozy children\'s book illustration of a family together. Soft lighting, happy expressions.',
    coverStyle: 'storybook',
    storyTone: 'warm, loving, and relatable with family moments',
    storyWorldDescription: 'a loving home where a family shares everyday adventures together',
    storyVocabularyLevel: 'simple sentences about daily life and emotions',
  },
  {
    id: 'fantasy', name: 'Fantasy', emoji: '✨', isPreset: true,
    imageStylePrefix: 'A magical fantasy scene for a children\'s book. Sparkling effects, enchanted forests, mythical creatures.',
    coverStyle: 'storybook',
    storyTone: 'whimsical and magical with wonder and discovery',
    storyWorldDescription: 'an enchanted realm with dragons, fairies, magic spells, and glowing forests',
    storyVocabularyLevel: 'medium complexity with descriptive fantasy words',
  },
  {
    id: 'minecraft', name: 'Minecraft', emoji: '⛏️', isPreset: true,
    imageStylePrefix: 'A blocky pixel-art Minecraft-style scene. Cubic blocks, pixelated textures, bright colors. No character names.',
    coverStyle: 'minecraft',
    storyTone: 'adventurous with crafting and mining language',
    storyWorldDescription: 'a blocky world made of cubes where heroes mine resources, craft tools, and explore caves',
    storyVocabularyLevel: 'simple action-oriented sentences',
  },
  {
    id: 'science', name: 'Science', emoji: '🔬', isPreset: true,
    imageStylePrefix: 'A bright, educational children\'s book illustration about science. Lab equipment, nature exploration, experiments.',
    coverStyle: 'realistic',
    storyTone: 'curious and educational with discovery and experimentation',
    storyWorldDescription: 'a world where young scientists explore nature, conduct experiments, and make discoveries',
    storyVocabularyLevel: 'medium complexity with age-appropriate science vocabulary',
  },
  {
    id: 'sight_words', name: 'Sight Words', emoji: '📖', isPreset: true,
    imageStylePrefix: 'A simple, clean children\'s book illustration. Clear scenes, minimal detail, bold colors.',
    coverStyle: 'storybook',
    storyTone: 'simple and repetitive for reading practice',
    storyWorldDescription: 'everyday scenes that naturally use common sight words in context',
    storyVocabularyLevel: 'very simple with high-frequency sight words repeated throughout',
  },
  {
    id: 'faith', name: 'Faith', emoji: '✝️', isPreset: true,
    imageStylePrefix: 'A warm, reverent children\'s book illustration. Gentle light, nature scenes, peaceful atmosphere.',
    coverStyle: 'storybook',
    storyTone: 'gentle, reverent, and encouraging with faith themes',
    storyWorldDescription: 'a world that reflects God\'s creation, kindness, and the beauty of faith',
    storyVocabularyLevel: 'simple sentences with age-appropriate faith vocabulary',
  },
  {
    id: 'space', name: 'Space Explorer', emoji: '🚀', isPreset: true,
    imageStylePrefix: 'A vivid space scene for a children\'s book. Colorful planets, stars, rockets, and astronauts.',
    coverStyle: 'realistic',
    storyTone: 'exciting and wonder-filled with space exploration',
    storyWorldDescription: 'outer space where astronauts visit planets, discover aliens, and float among the stars',
    storyVocabularyLevel: 'medium complexity with space vocabulary',
  },
  {
    id: 'dinosaurs', name: 'Dinosaur World', emoji: '🦕', isPreset: true,
    imageStylePrefix: 'A prehistoric children\'s book illustration. Friendly dinosaurs, lush vegetation, volcanic landscapes.',
    coverStyle: 'realistic',
    storyTone: 'exciting and educational with dinosaur facts woven in',
    storyWorldDescription: 'a prehistoric world where friendly dinosaurs roam jungles, volcanoes, and swamps',
    storyVocabularyLevel: 'medium complexity with dinosaur names and nature words',
  },
  {
    id: 'ocean', name: 'Ocean Adventure', emoji: '🌊', isPreset: true,
    imageStylePrefix: 'An underwater children\'s book illustration. Colorful coral reefs, friendly sea creatures, sparkling water.',
    coverStyle: 'storybook',
    storyTone: 'adventurous and curious with ocean exploration',
    storyWorldDescription: 'a colorful underwater world with coral reefs, dolphins, whales, and sunken ships',
    storyVocabularyLevel: 'medium complexity with ocean and marine vocabulary',
  },
  {
    id: 'superheroes', name: 'Superheroes', emoji: '🦸', isPreset: true,
    imageStylePrefix: 'A bold, colorful superhero scene for a children\'s book. Dynamic poses, bright costumes, city skyline.',
    coverStyle: 'comic',
    storyTone: 'action-packed and inspiring with heroes saving the day',
    storyWorldDescription: 'a city where kid superheroes use their powers to help people and stop villains',
    storyVocabularyLevel: 'medium complexity with action and hero vocabulary',
  },
  {
    id: 'cooking', name: 'Kitchen Adventures', emoji: '👨‍🍳', isPreset: true,
    imageStylePrefix: 'A warm, cheerful kitchen scene for a children\'s book. Colorful ingredients, friendly chefs, tasty dishes.',
    coverStyle: 'storybook',
    storyTone: 'fun and sensory-rich with cooking and tasting',
    storyWorldDescription: 'a magical kitchen where ingredients come alive and cooking is an adventure',
    storyVocabularyLevel: 'simple sentences with food and cooking vocabulary',
  },
  {
    id: 'sports', name: 'Sports & Games', emoji: '⚽', isPreset: true,
    imageStylePrefix: 'A bright, energetic children\'s book illustration of kids playing sports. Action poses, outdoor settings.',
    coverStyle: 'realistic',
    storyTone: 'energetic and encouraging with teamwork themes',
    storyWorldDescription: 'playgrounds, fields, and courts where kids play sports and learn teamwork',
    storyVocabularyLevel: 'simple action words with sports terminology',
  },
  {
    id: 'holidays', name: 'Holiday Stories', emoji: '🎄', isPreset: true,
    imageStylePrefix: 'A festive, joyful children\'s book illustration. Holiday decorations, seasonal scenes, warm family celebrations.',
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
  /** The prompt/parameters used to generate this story */
  generationConfig?: {
    storyIdea?: string
    words: string[]
    style?: string
    /** Freeform theme/style prompt used during generation */
    theme?: string
    difficulty?: 'simple' | 'moderate'
    pageCount: number
  }
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

export interface PageImage {
  id: string
  url: string
  storagePath?: string
  type: 'photo' | 'ai-generated' | 'sticker' | 'sketch'
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
