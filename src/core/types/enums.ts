export const SubjectBucket = {
  Reading: 'Reading',
  LanguageArts: 'LanguageArts',
  Math: 'Math',
  Science: 'Science',
  SocialStudies: 'SocialStudies',
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

export const RoutineItemKey = {
  Handwriting: 'handwriting',
  Spelling: 'spelling',
  SightWords: 'sightWords',
  MinecraftReading: 'minecraft',
  ReadingEggs: 'readingEggs',
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
} as const
export type RoutineItemKey = (typeof RoutineItemKey)[keyof typeof RoutineItemKey]
