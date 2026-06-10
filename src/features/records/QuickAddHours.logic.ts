import type { HoursEntry } from '../../core/types/compliance'
import { LearningLocation } from '../../core/types/enums'
import type { SubjectBucket } from '../../core/types/enums'

export type ActivityGroup = 'physical' | 'creative' | 'music' | 'lifeSkills' | 'enrichment' | 'screen'

export interface QuickActivity {
  label: string
  emoji: string
  subject: SubjectBucket
  group: ActivityGroup
}

export const QUICK_ACTIVITIES: QuickActivity[] = [
  // Physical
  { label: 'Park / Playground', emoji: '🏞️', subject: 'PE', group: 'physical' },
  { label: 'Bike Ride', emoji: '🚲', subject: 'PE', group: 'physical' },
  { label: 'Swimming', emoji: '🏊', subject: 'PE', group: 'physical' },
  { label: 'Walk / Hike', emoji: '🥾', subject: 'PE', group: 'physical' },
  { label: 'Sports / Games', emoji: '⚽', subject: 'PE', group: 'physical' },
  { label: 'Martial Arts', emoji: '🥋', subject: 'PE', group: 'physical' },
  // Creative
  { label: 'Drawing / Coloring', emoji: '🎨', subject: 'Art', group: 'creative' },
  { label: 'Crafts / Building', emoji: '✂️', subject: 'Art', group: 'creative' },
  { label: 'LEGO / Construction', emoji: '🧱', subject: 'Art', group: 'creative' },
  { label: 'Acting', emoji: '🎭', subject: 'Art', group: 'creative' },
  // Music
  { label: 'Music / Singing', emoji: '🎵', subject: 'Music', group: 'music' },
  { label: 'Worship Songs', emoji: '🙏', subject: 'Music', group: 'music' },
  // Life Skills
  { label: 'Cooking / Baking', emoji: '🍳', subject: 'PracticalArts', group: 'lifeSkills' },
  { label: 'Chores with Teaching', emoji: '🧹', subject: 'PracticalArts', group: 'lifeSkills' },
  { label: 'Grocery / Shopping', emoji: '🛒', subject: 'PracticalArts', group: 'lifeSkills' },
  { label: 'Gardening', emoji: '🌱', subject: 'PracticalArts', group: 'lifeSkills' },
  { label: 'Service / Volunteering', emoji: '🤝', subject: 'PracticalArts', group: 'lifeSkills' },
  // Enrichment
  { label: 'Library Visit', emoji: '📚', subject: 'SocialStudies', group: 'enrichment' },
  { label: 'Museum / Zoo', emoji: '🦁', subject: 'SocialStudies', group: 'enrichment' },
  { label: 'Field Trip', emoji: '🚌', subject: 'SocialStudies', group: 'enrichment' },
  { label: 'Nature Walk / Explore', emoji: '🔍', subject: 'Science', group: 'enrichment' },
  { label: 'Church / Sunday School', emoji: '⛪', subject: 'Other', group: 'enrichment' },
  // Screen-based
  { label: 'Educational Apps', emoji: '📱', subject: 'Other', group: 'screen' },
  { label: 'Minecraft (building)', emoji: '⛏️', subject: 'Other', group: 'screen' },
  { label: 'Documentary / Educational Video', emoji: '🎬', subject: 'Other', group: 'screen' },
]

export const DURATION_OPTIONS = [
  { label: '15 min', minutes: 15 },
  { label: '30 min', minutes: 30 },
  { label: '45 min', minutes: 45 },
  { label: '1 hour', minutes: 60 },
  { label: '1.5 hrs', minutes: 90 },
  { label: '2 hours', minutes: 120 },
]

// Group activities by their explicit group for display (order = display order).
export const GROUPS: Array<{ key: ActivityGroup; title: string }> = [
  { key: 'physical', title: '🏃 Physical' },
  { key: 'creative', title: '🎨 Creative' },
  { key: 'music', title: '🎵 Music' },
  { key: 'lifeSkills', title: '🏠 Life Skills' },
  { key: 'enrichment', title: '🌍 Enrichment' },
  { key: 'screen', title: '💻 Screen Learning' },
]

/** Home / Away segmented choice. Away maps to a non-Home location so it counts
 *  as away in `computeHoursSummary`'s at-home split. */
export type HomeAway = 'home' | 'away'

export const locationFor = (homeAway: HomeAway): LearningLocation =>
  homeAway === 'home' ? LearningLocation.Home : LearningLocation.Community

/** Pure builder for the normal `HoursEntry` a Quick Add logs (FEAT-24). Kept
 *  separate from the firestore write so the field mapping is unit-testable.
 *  Returns a payload with a required `childId` for the `assertAttributed` guard. */
export function buildQuickAddEntry(params: {
  childId: string
  date: string
  activity: QuickActivity
  minutes: number
  homeAway: HomeAway
}): HoursEntry & { childId: string } {
  return {
    childId: params.childId,
    date: params.date,
    minutes: params.minutes,
    subjectBucket: params.activity.subject,
    location: locationFor(params.homeAway),
    notes: params.activity.label,
    source: 'quick-add',
    quickCapture: true,
  }
}
