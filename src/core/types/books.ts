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
  | 'other'

export const BOOK_THEMES: { id: BookTheme; label: string; emoji: string }[] = [
  { id: 'adventure',   label: 'Adventure',   emoji: '⚔️' },
  { id: 'animals',     label: 'Animals',     emoji: '🐾' },
  { id: 'family',      label: 'Family',      emoji: '👨‍👩‍👦' },
  { id: 'fantasy',     label: 'Fantasy',     emoji: '✨' },
  { id: 'minecraft',   label: 'Minecraft',   emoji: '⛏️' },
  { id: 'science',     label: 'Science',     emoji: '🔬' },
  { id: 'sight_words', label: 'Sight Words', emoji: '📖' },
  { id: 'faith',       label: 'Faith',       emoji: '✝️' },
  { id: 'other',       label: 'Other',       emoji: '📚' },
]

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
  type: 'photo' | 'ai-generated' | 'sticker'
  /** AI prompt used to generate this image */
  prompt?: string
  /** Label for accessibility and display */
  label?: string
  /** Position and size within the page image container (percentage-based).
   *  x, y, width, height: 0–100, percentage of container dimensions.
   *  rotation: degrees (0–359). zIndex: stacking order integer. */
  position?: { x: number; y: number; width: number; height: number; rotation?: number; zIndex?: number }
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
