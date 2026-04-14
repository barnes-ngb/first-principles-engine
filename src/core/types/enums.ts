export const SubjectBucket = {
  Reading: 'Reading',
  LanguageArts: 'LanguageArts',
  Math: 'Math',
  Science: 'Science',
  SocialStudies: 'SocialStudies',
  Music: 'Music',
  Art: 'Art',
  PE: 'PE',
  Other: 'Other',
} as const
export type SubjectBucket = (typeof SubjectBucket)[keyof typeof SubjectBucket]

export const EngineStage = {
  Wonder: 'Wonder',
  Build: 'Build',
  Explain: 'Explain',
  Reflect: 'Reflect',
  Share: 'Share',
} as const
export type EngineStage = (typeof EngineStage)[keyof typeof EngineStage]

export const EvidenceType = {
  Photo: 'Photo',
  Audio: 'Audio',
  Note: 'Note',
  Video: 'Video',
  Worksheet: 'Worksheet',
} as const
export type EvidenceType = (typeof EvidenceType)[keyof typeof EvidenceType]

export const DayBlockType = {
  Formation: 'Formation',
  Reading: 'Reading',
  Speech: 'Speech',
  Math: 'Math',
  Together: 'Together',
  Movement: 'Movement',
  Project: 'Project',
  FieldTrip: 'FieldTrip',
  Other: 'Other',
} as const
export type DayBlockType = (typeof DayBlockType)[keyof typeof DayBlockType]

/** Human-readable label for each block type. */
export const DayBlockLabel: Record<DayBlockType, string> = {
  [DayBlockType.Formation]: 'Formation',
  [DayBlockType.Reading]: 'Reading',
  [DayBlockType.Speech]: 'Speech',
  [DayBlockType.Math]: 'Math',
  [DayBlockType.Together]: 'Together',
  [DayBlockType.Movement]: 'Movement',
  [DayBlockType.Project]: 'Project',
  [DayBlockType.FieldTrip]: 'Field Trip',
  [DayBlockType.Other]: 'Other',
}

export const TrackType = {
  Support: 'Support',
  Stretch: 'Stretch',
  Custom: 'Custom',
} as const
export type TrackType = (typeof TrackType)[keyof typeof TrackType]

export const LearningLocation = {
  Home: 'Home',
  CoOp: 'CoOp',
  FieldTrip: 'FieldTrip',
  Community: 'Community',
  Other: 'Other',
} as const
export type LearningLocation = (typeof LearningLocation)[keyof typeof LearningLocation]

export const UserProfile = {
  Lincoln: 'lincoln',
  London: 'london',
  Parents: 'parents',
} as const
export type UserProfile = (typeof UserProfile)[keyof typeof UserProfile]

export const ThemeMode = {
  Family: 'family',
  Lincoln: 'lincoln',
  London: 'london',
} as const
export type ThemeMode = (typeof ThemeMode)[keyof typeof ThemeMode]

export const SessionResult = {
  Hit: 'hit',
  Near: 'near',
  Miss: 'miss',
} as const
export type SessionResult = (typeof SessionResult)[keyof typeof SessionResult]

export const EnergyLevel = {
  Normal: 'normal',
  Low: 'low',
  Overwhelmed: 'overwhelmed',
} as const
export type EnergyLevel = (typeof EnergyLevel)[keyof typeof EnergyLevel]

/** Human-readable label for each energy level. */
export const EnergyLevelLabel: Record<EnergyLevel, string> = {
  [EnergyLevel.Normal]: 'Normal',
  [EnergyLevel.Low]: 'Low',
  [EnergyLevel.Overwhelmed]: 'Overwhelmed',
}

export const SupportTag = {
  Prompts: 'Prompts',
  FingerTracking: 'FingerTracking',
  Manipulatives: 'Manipulatives',
  SentenceFrames: 'SentenceFrames',
  VisualAid: 'VisualAid',
  Timer: 'Timer',
} as const
export type SupportTag = (typeof SupportTag)[keyof typeof SupportTag]

export const ProjectPhase = {
  Plan: 'Plan',
  Build: 'Build',
  Test: 'Test',
  Improve: 'Improve',
} as const
export type ProjectPhase = (typeof ProjectPhase)[keyof typeof ProjectPhase]

export const StreamId = {
  Reading: 'reading',
  Writing: 'writing',
  Communication: 'communication',
  Math: 'math',
  Independence: 'independence',
  DadLab: 'dadlab',
} as const
export type StreamId = (typeof StreamId)[keyof typeof StreamId]

export const SupportLevel = {
  None: 'none',
  Environment: 'environment',
  Prompts: 'prompts',
  Tools: 'tools',
  HandOverHand: 'hand-over-hand',
} as const
export type SupportLevel = (typeof SupportLevel)[keyof typeof SupportLevel]

/** Ordered list from least to most support, used for comparison. */
export const SUPPORT_LEVEL_ORDER: SupportLevel[] = [
  SupportLevel.None,
  SupportLevel.Environment,
  SupportLevel.Prompts,
  SupportLevel.Tools,
  SupportLevel.HandOverHand,
]

export const SessionSymbol = {
  Pass: '✔',
  Partial: '△',
  Miss: '✖',
} as const
export type SessionSymbol = (typeof SessionSymbol)[keyof typeof SessionSymbol]

export const StreamKey = {
  DecodeRead: 'decode_read',
  SpellWrite: 'spell_write',
  SpeakExplain: 'speak_explain',
  Other: 'other',
} as const
export type StreamKey = (typeof StreamKey)[keyof typeof StreamKey]

export const LabSessionStatus = {
  NotStarted: 'not_started',
  InProgress: 'in_progress',
  Complete: 'complete',
} as const
export type LabSessionStatus = (typeof LabSessionStatus)[keyof typeof LabSessionStatus]

export const PlannerSessionStatus = {
  Setup: 'setup',
  Uploading: 'uploading',
  Extracting: 'extracting',
  DraftReview: 'draft_review',
  Applied: 'applied',
} as const
export type PlannerSessionStatus =
  (typeof PlannerSessionStatus)[keyof typeof PlannerSessionStatus]

export const AssignmentAction = {
  Keep: 'keep',
  Modify: 'modify',
  Skip: 'skip',
} as const
export type AssignmentAction =
  (typeof AssignmentAction)[keyof typeof AssignmentAction]

export const SkillLevel = {
  Emerging: 'emerging',
  Developing: 'developing',
  Supported: 'supported',
  Practice: 'practice',
  Secure: 'secure',
} as const
export type SkillLevel = (typeof SkillLevel)[keyof typeof SkillLevel]

export const PlannerConversationStatus = {
  Draft: 'draft',
  Applied: 'applied',
} as const
export type PlannerConversationStatus =
  (typeof PlannerConversationStatus)[keyof typeof PlannerConversationStatus]

export const ChatMessageRole = {
  User: 'user',
  Assistant: 'assistant',
} as const
export type ChatMessageRole = (typeof ChatMessageRole)[keyof typeof ChatMessageRole]

export const MasteryGate = {
  NotYet: 0,
  WithHelp: 1,
  MostlyIndependent: 2,
  IndependentConsistent: 3,
} as const
export type MasteryGate = (typeof MasteryGate)[keyof typeof MasteryGate]

/** Human-readable label for each mastery gate level. */
export const MasteryGateLabel: Record<MasteryGate, string> = {
  [MasteryGate.NotYet]: 'Not yet',
  [MasteryGate.WithHelp]: 'With help',
  [MasteryGate.MostlyIndependent]: 'Mostly independent',
  [MasteryGate.IndependentConsistent]: 'Independent + consistent',
}

export const PaceStatus = {
  Explored: 'explored',
  Current: 'current',
  Upcoming: 'upcoming',
  NotStarted: 'not_started',
} as const
export type PaceStatus = (typeof PaceStatus)[keyof typeof PaceStatus]

export const PlanType = {
  Normal: 'normal',
  Mvd: 'mvd',
} as const
export type PlanType = (typeof PlanType)[keyof typeof PlanType]

/** Human-readable label for each plan type. */
export const PlanTypeLabel: Record<PlanType, string> = {
  [PlanType.Normal]: 'Normal Day',
  [PlanType.Mvd]: 'Minimum Viable Day',
}

export const DayType = {
  Normal: 'normal',
  Light: 'light',
  Appointment: 'appointment',
} as const
export type DayType = (typeof DayType)[keyof typeof DayType]

export const ReviewStatus = {
  Draft: 'draft',
  Pending: 'pending',
  Reviewed: 'reviewed',
  Applied: 'applied',
} as const
export type ReviewStatus = (typeof ReviewStatus)[keyof typeof ReviewStatus]

export const AdjustmentDecision = {
  Pending: 'pending',
  Accepted: 'accepted',
  Rejected: 'rejected',
} as const
export type AdjustmentDecision =
  (typeof AdjustmentDecision)[keyof typeof AdjustmentDecision]

export const EvaluationDomain = {
  Reading: 'reading',
  Math: 'math',
  Speech: 'speech',
  Writing: 'writing',
} as const
export type EvaluationDomain = (typeof EvaluationDomain)[keyof typeof EvaluationDomain]

export const RoutineItemKey = {
  Handwriting: 'handwriting',
  Spelling: 'spelling',
  SightWords: 'sightWords',
  MinecraftReading: 'minecraft',
  ReadingEggs: 'readingEggs',
  ReadAloud: 'readAloud',
  Math: 'math',
  Speech: 'speech',
  // Lincoln Literacy Engine
  PhonemicAwareness: 'phonemicAwareness',
  PhonicsLesson: 'phonicsLesson',
  DecodableReading: 'decodableReading',
  SpellingDictation: 'spellingDictation',
  // Lincoln Math Engine
  NumberSenseOrFacts: 'numberSenseOrFacts',
  WordProblemsModeled: 'wordProblemsModeled',
  // Lincoln Speech Micro
  NarrationOrSoundReps: 'narrationOrSoundReps',
  // Workshop
  WorkshopGame: 'workshopGame',
} as const
export type RoutineItemKey = (typeof RoutineItemKey)[keyof typeof RoutineItemKey]

export const ActivityType = {
  Formation: 'formation',
  Workbook: 'workbook',
  Routine: 'routine',
  Activity: 'activity',
  App: 'app',
  Evaluation: 'evaluation',
} as const
export type ActivityType = (typeof ActivityType)[keyof typeof ActivityType]

export const ActivityFrequency = {
  Daily: 'daily',
  ThreePerWeek: '3x',
  TwoPerWeek: '2x',
  OnePerWeek: '1x',
  AsNeeded: 'as-needed',
} as const
export type ActivityFrequency = (typeof ActivityFrequency)[keyof typeof ActivityFrequency]

/** Human-readable label for each activity frequency. */
export const ActivityFrequencyLabel: Record<ActivityFrequency, string> = {
  [ActivityFrequency.Daily]: 'daily',
  [ActivityFrequency.ThreePerWeek]: '3x/week',
  [ActivityFrequency.TwoPerWeek]: '2x/week',
  [ActivityFrequency.OnePerWeek]: '1x/week',
  [ActivityFrequency.AsNeeded]: 'as needed',
}

export const ScheduleBlock = {
  Formation: 'formation',
  ReadAloud: 'readaloud',
  Choice: 'choice',
  CoreReading: 'core-reading',
  CoreMath: 'core-math',
  Flex: 'flex',
  Independent: 'independent',
} as const
export type ScheduleBlock = (typeof ScheduleBlock)[keyof typeof ScheduleBlock]

/** Human-readable label for each schedule block. */
export const ScheduleBlockLabel: Record<ScheduleBlock, string> = {
  [ScheduleBlock.Formation]: 'Formation',
  [ScheduleBlock.ReadAloud]: 'Read-Aloud + Handwriting',
  [ScheduleBlock.Choice]: "Lincoln's Choice",
  [ScheduleBlock.CoreReading]: 'Core Reading',
  [ScheduleBlock.CoreMath]: 'Core Math',
  [ScheduleBlock.Flex]: 'Flex',
  [ScheduleBlock.Independent]: 'Independent',
}

export const StickerCategory = {
  Animals: 'animals',
  Minecraft: 'minecraft',
  Nature: 'nature',
  People: 'people',
  Fantasy: 'fantasy',
  Vehicles: 'vehicles',
  Custom: 'custom',
} as const
export type StickerCategory = (typeof StickerCategory)[keyof typeof StickerCategory]

export const DadLabType = {
  Science: 'science',
  Engineering: 'engineering',
  Adventure: 'adventure',
  Heart: 'heart',
} as const
export type DadLabType = (typeof DadLabType)[keyof typeof DadLabType]

export const DadLabStatus = {
  Planned: 'planned',
  Active: 'active',
  Complete: 'complete',
} as const
export type DadLabStatus = (typeof DadLabStatus)[keyof typeof DadLabStatus]

export const SkipReason = {
  TooHard: 'too-hard',
  NotRelevant: 'not-relevant',
  AiRecommended: 'ai-recommended',
} as const
export type SkipReason = (typeof SkipReason)[keyof typeof SkipReason]

export const QuestionType = {
  Comprehension: 'comprehension',
  Application: 'application',
  Connection: 'connection',
  Opinion: 'opinion',
  Prediction: 'prediction',
} as const
export type QuestionType = (typeof QuestionType)[keyof typeof QuestionType]
