import type { MonthlyReviewStatus, SectionType } from './enums'

// ── Monthly Review Book ──────────────────────────────────────────
//
// A monthly synthesis artifact auto-generated on the 1st of each month.
// One book per child per month, with both kid and parent voices. See
// docs/DESIGN_MONTHLY_REVIEW_BOOK.md for the full design.

export interface PhotoSourceMetadata {
  /** Origin tag for downstream curation (e.g. "dadLab"). */
  type?: string
  /** Source Dad Lab report doc id when type === "dadLab". */
  reportId?: string
  /** Source Dad Lab report title when type === "dadLab". */
  reportTitle?: string
}

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
  /**
   * Tags photos whose origin is not directly inferable from the source
   * collection — e.g. Dad Lab photos stored in `artifacts` but referenced
   * via `dadLabReports[*].childReports[name].artifacts`.
   */
  sourceMetadata?: PhotoSourceMetadata
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

/**
 * A child- or parent-recorded audio note attached to a specific page. No
 * write UI exists yet — the schema slot is reserved for a future PR that
 * adds tap-to-record on top of the gallery (Lincoln's strongest engagement
 * signal so far was talking about the photos on "More from this month",
 * which is the natural surface for voice capture).
 */
export interface VoiceNote {
  id: string
  /** Firebase Storage path. */
  audioUrl: string
  durationMs: number
  recordedBy: 'lincoln' | 'london' | 'shelly' | 'nathan'
  /** ISO timestamp. */
  recordedAt: string
  /** Populated by a future transcription pass. */
  transcription?: string
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

  /**
   * Reserved for future kid- and parent-recorded voice notes per page. No UI
   * writes to this field today; declared now so the schema is stable when
   * the tap-to-record feature lands.
   */
  voiceNotes?: {
    kid?: VoiceNote[]
    parent?: VoiceNote[]
  }
}

export interface MonthStats {
  daysWithActivity: number
  /**
   * Hours rounded to one decimal. Kept on the type for backward compatibility
   * with reviews generated before `totalMinutes` was added — readers should
   * prefer `totalMinutes ?? Math.round(totalHours * 60)`.
   */
  totalHours: number
  /** Canonical integer-minute total. Display layer converts via `formatSubjectMinutes`. */
  totalMinutes?: number
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

/** One read-aloud book that had a question answered this month. */
export interface MonthlyReviewReadingBook {
  title: string
  totalChapters: number
  /** Distinct chapters with a question answered this month. */
  chaptersAnswered: number
  /** Pool questions answered this month. */
  questionsAnswered: number
  /** Parent-skipped questions on this book (skips carry no date). */
  questionsSkipped: number
}

/** Read-aloud reading recap for the month, derived from `bookProgress`. */
export interface MonthlyReviewReading {
  books: MonthlyReviewReadingBook[]
  totalChaptersAnswered: number
  totalQuestionsAnswered: number
  totalQuestionsSkipped: number
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
  /** `null` when no qualifying photo (Firestore can't store `undefined`). */
  heroPhotoRef?: PhotoRef | null

  pages: MonthlyReviewPage[]
  /** Ranked photos (top ~30 kept). */
  curatedPhotos: PhotoRef[]
  /** Curated photos not placed in a section — "More Photos" tray. */
  unplacedPhotos: PhotoRef[]

  stats: MonthStats
  /** Read-aloud reading recap. Absent on reviews from before this field / months with no reading. */
  reading?: MonthlyReviewReading
  sourceRefs: SourceRefs

  shellyNote?: ShellyNote
}
