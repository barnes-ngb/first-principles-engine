/** Nonsense word fluency data point (weekly encoding check). */
export interface NonsenseWordFluencyEntry {
  date: string
  correctWords: number
  totalWords: number
  score: number
}

/** Per-child UFLI progress tracking. */
export interface UFLIProgress {
  /** Current lesson number the child is working on. */
  currentLesson: number
  /** Lesson numbers the child has mastered. */
  masteredLessons: number[]
  /** Most recent encoding check score (0–100). */
  lastEncodingScore: number | null
  /** Date of the most recent encoding check (YYYY-MM-DD). */
  lastEncodingDate: string | null
  /** History of nonsense word fluency assessments. */
  nonsenseWordFluency: NonsenseWordFluencyEntry[]
}

/** UFLI Foundations lesson definition (scope & sequence). */
export interface UFLILesson {
  lessonNumber: number
  /** Short description of the phonics concept taught in this lesson. */
  concept: string
  /** Target graphemes or phoneme-grapheme correspondences for this lesson. */
  targetGraphemes: string[]
  /** Irregular "heart words" introduced in this lesson (may be empty). */
  heartWords: string[]
  /** Lesson numbers that should be mastered before this lesson. */
  prerequisiteLessons: number[]
  /** URL to the UFLI Toolbox slide deck for this lesson (empty until filled). */
  toolboxSlideUrl: string
  /** Reference ID for the decodable passage associated with this lesson. */
  decodablePassageRef: string
  /** Difficulty level: 1 = foundational, 2 = intermediate, 3 = advanced. */
  level: 1 | 2 | 3
}
