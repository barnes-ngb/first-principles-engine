import type { MonthlyReviewStatus, SectionType } from './enums'

// ── Monthly Review Book ──────────────────────────────────────────
//
// A monthly synthesis artifact auto-generated on the 1st of each month.
// One book per child per month, with both kid and parent voices. See
// docs/DESIGN_MONTHLY_REVIEW_BOOK.md for the full design.

export interface PhotoRef {
  id: string
  storagePath: string
  source: 'scan' | 'artifact'
  sourceDocId: string
  /** ISO timestamp of when the photo was captured. */
  capturedAt: string
  /** Curation score (set by photo curation pass). */
  score?: number
  /** Optional subject tag for diversity scoring. */
  subjectTag?: string
}

export interface PageContent {
  headline?: string
  body?: string
  /** Bullet-emphasis lines. */
  highlights?: string[]
  /** photoRef.id → caption text */
  captions?: Record<string, string>
  /** Optional audio caption URL. */
  audioRef?: string
}

/**
 * Per-mode photo refs. Kid mode and parent mode render different photo
 * sets per page (workbook scans only appear in parent mode on the
 * "What He Worked Through" evidence page). Legacy reviews stored a single
 * `PhotoRef[]` here; the renderer normalizes via `getModePhotos`.
 */
export interface PageModePhotos {
  kid: PhotoRef[]
  parent: PhotoRef[]
}

export interface MonthlyReviewPage {
  id: string
  sectionType: SectionType
  order: number

  kidMode: PageContent
  parentMode: PageContent

  /**
   * Per-mode photo refs. Legacy reviews wrote a flat `PhotoRef[]`; the
   * renderer reads through `getModePhotos` to support both shapes.
   */
  photoRefs: PageModePhotos | PhotoRef[]
  stickers?: unknown[]

  /** Parent can hide a section (defaults false). */
  hidden?: boolean
}

export interface MonthStats {
  daysWithActivity: number
  totalHours: number
  hoursBySubject: Record<string, number>
  booksCompleted: number
  booksRead: number
  quests: number
  blockersResolved: number
  blockersActive: number
  teachBackCount: number
  dadLabCount: number
  /** From xpLedger. */
  totalDiamonds: number
}

export interface SourceRefs {
  weeklyReviewIds: string[]
  /** ISO timestamp of the disposition profile snapshot used. */
  dispositionProfileSnapshotAt?: string
  /** ISO timestamp of the blocker state snapshot used. */
  blockerSnapshotAt?: string
}

export interface ShellyNote {
  text?: string
  audioUrl?: string
  photoUrl?: string
  /** ISO timestamp. */
  updatedAt: string
}

export interface MonthlyReview {
  /** `{childId}_{YYYY-MM}` */
  id: string
  familyId: string
  childId: string
  /** `YYYY-MM` */
  month: string
  status: MonthlyReviewStatus

  /** ISO timestamp. */
  generatedAt: string
  /** ISO timestamp. */
  publishedAt?: string
  /** ISO timestamp. */
  lastEditedAt?: string

  /** AI-picked theme word or short phrase. */
  theme: string
  heroPhotoRef?: PhotoRef

  pages: MonthlyReviewPage[]
  /** Ranked photos (top ~30 kept). */
  curatedPhotos: PhotoRef[]
  /** Curated photos not placed in a section — "More Photos" tray. */
  unplacedPhotos: PhotoRef[]

  stats: MonthStats
  sourceRefs: SourceRefs

  shellyNote?: ShellyNote
}
