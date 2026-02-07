import type { PlannedSession } from '../../core/types/domain'
import { StreamId } from '../../core/types/enums'

/** Maps StreamId → the Firestore ladder doc ID prefix (child-specific). */
export const streamLadderSuffix: Record<StreamId, string> = {
  [StreamId.Reading]: 'reading',
  [StreamId.Writing]: 'writing',
  [StreamId.Communication]: 'communication',
  [StreamId.Math]: 'math',
  [StreamId.Independence]: 'independence',
  [StreamId.DadLab]: 'dadlab',
}

export const streamLabel: Record<StreamId, string> = {
  [StreamId.Reading]: 'Decode \u2192 Read',
  [StreamId.Writing]: 'Spell \u2192 Write',
  [StreamId.Communication]: 'Speak \u2192 Explain',
  [StreamId.Math]: 'Number Sense \u2192 Word Problems',
  [StreamId.Independence]: 'Start/Finish \u2192 Independence',
  [StreamId.DadLab]: 'Build / Test / Improve',
}

export const streamIcon: Record<StreamId, string> = {
  [StreamId.Reading]: '\uD83D\uDCD6',
  [StreamId.Writing]: '\u270F\uFE0F',
  [StreamId.Communication]: '\uD83D\uDDE3\uFE0F',
  [StreamId.Math]: '\uD83D\uDD22',
  [StreamId.Independence]: '\uD83C\uDFAF',
  [StreamId.DadLab]: '\uD83D\uDD27',
}

export const ladderIdForChild = (childId: string, streamId: StreamId): string =>
  `${childId}-${streamLadderSuffix[streamId]}`

/**
 * Plan A: Formation, Read, Math, Together/Project (4 blocks).
 * Plan B: Formation, short Read, short Math (3 blocks, shorter).
 */
export const buildPlanASessions = (
  childId: string,
  rungsByStream: Record<StreamId, number>,
): PlannedSession[] => [
  {
    streamId: StreamId.Reading,
    ladderId: ladderIdForChild(childId, StreamId.Reading),
    targetRungOrder: rungsByStream[StreamId.Reading] ?? 1,
    plannedMinutes: 15,
    label: 'Reading',
  },
  {
    streamId: StreamId.Writing,
    ladderId: ladderIdForChild(childId, StreamId.Writing),
    targetRungOrder: rungsByStream[StreamId.Writing] ?? 1,
    plannedMinutes: 10,
    label: 'Writing / Spelling',
  },
  {
    streamId: StreamId.Math,
    ladderId: ladderIdForChild(childId, StreamId.Math),
    targetRungOrder: rungsByStream[StreamId.Math] ?? 1,
    plannedMinutes: 15,
    label: 'Math',
  },
  {
    streamId: StreamId.DadLab,
    ladderId: ladderIdForChild(childId, StreamId.DadLab),
    targetRungOrder: rungsByStream[StreamId.DadLab] ?? 1,
    plannedMinutes: 20,
    label: 'Dad Lab / Project',
  },
]

export const buildPlanBSessions = (
  childId: string,
  rungsByStream: Record<StreamId, number>,
): PlannedSession[] => [
  {
    streamId: StreamId.Reading,
    ladderId: ladderIdForChild(childId, StreamId.Reading),
    targetRungOrder: rungsByStream[StreamId.Reading] ?? 1,
    plannedMinutes: 10,
    label: 'Short Reading',
  },
  {
    streamId: StreamId.Math,
    ladderId: ladderIdForChild(childId, StreamId.Math),
    targetRungOrder: rungsByStream[StreamId.Math] ?? 1,
    plannedMinutes: 10,
    label: 'Short Math',
  },
]

export const defaultWeeklyMetricLabels = [
  'Decodable accuracy',
  'Retell 2 details',
  'Dictation sentence',
  'Word problem + explain',
  'Independent minutes (best)',
]
