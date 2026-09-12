// ── What KIND of thing is this Today row, and where does she add to it? ─────
//
// The owner's report was *"she added to the lessons but some of them seem to
// have failed or not saved"* (2026-09-11). `UX-351` answered half of it — an
// edit that did not save now says so. `UX-363`, the audit finding this module
// closes, is the other half: on Today, Lincoln's Language Arts can be a
// **workbook** (a photo advances `activityConfigs.currentPosition`), a
// **routine** (a checkbox and a photo, nowhere for a position), a **strand** (a
// session that increments a count) or an **app** (nowhere for either) — and
// **all four render as a title with `(20m)` and a checkbox**. So *"where do I
// add to this lesson?"* has four different answers depending on a property of
// the row a parent cannot see, and the screen never says which.
//
// This module is the one answer to both halves of that question: *what is this
// row* and *which of Today's doors belongs to it*. Pure — no React, no
// Firestore, no clock. The component renders what it returns.
//
// ── Why the row cannot simply be asked ──────────────────────────────────────
//
// `ChecklistItem.itemType` was `'routine' | 'workbook' | 'evaluation' |
// 'activity' | 'watch'` — five strings against an `ActivityType` with **seven**
// members — and `buildCurriculumDraftItem` collapsed the other four into
// `'activity'` with a hand-written ternary chain, the exact shape `UX-204` made
// unrepresentable on Progress → Curriculum. The field also arrives from an AI
// plan, where it is an assertion rather than a record, and most rows carry no
// `itemType` at all because the ordinary planner path round-trips through
// routine prose.
//
// So the kind is **resolved from the family's own curriculum rows**, and
// `itemType` is only the fallback. Where nothing resolves, the answer is
// `unknown` and the row says so — a guessed kind puts a door on a row that
// writes the wrong record, and there is no undo for a position advance.
//
// ── The resolution order, and why each step sits where it does ──────────────
//
//  1. **Watch** — `itemType: 'watch'` is authoritative and is the one kind that
//     is definitionally *not* a curriculum row (it names a `watchLibrary`
//     video). `watchDayItem` is the only writer of it.
//  2. **Workbook, resolved EXACTLY as the capture path resolves it** —
//     `item.workbookConfigId ?? findWorkbookConfigId(item, configs)`, the same
//     expression `useUnifiedCapture` evaluates before anything else. It is
//     first among the curriculum kinds for one reason: it is the only door with
//     a consequence that cannot be taken back (`currentPosition` advances), so
//     the tell must say what the photo is actually going to do. Asking a
//     different question here than the capture asks is how a row comes to read
//     *Routine* while its photo advances a workbook.
//  3. **The stamped `activityConfigId`** — written by `buildApplyChecklist`
//     when the row was planned from a named curriculum row. A **stale** stamp
//     resolves to nothing rather than falling back to the label, the rule
//     `findStrandConfigId` already follows: the row told us which row it meant,
//     and the answer is that that row is gone, not that another will do.
//  4. **Strand**, through the shared `findStrandConfigId` — the same function
//     that decides whether the *Record a session* button renders, so the tell
//     and the door cannot disagree about whether this is a strand.
//  5. **`itemType: 'evaluation'`** — the planner writes these itself
//     (`chatPlanner.logic`'s Knowledge Mine row) and they have no config.
//  6. **The row's name**, against every live config of any type, through
//     `activityMatchNames` + `nameKey` — the repo's one comparison key for a
//     human-typed name (`UX-205`), so a renamed row keeps its tell (`UX-280`).
//     **A single distinct match, or none**: two rows answering to one label is
//     the duplicate case Curriculum's own notice exists to surface, and picking
//     one would be the app deciding what her curriculum is.
//  7. **`itemType`**, the legacy five and whatever an older build stored.
//  8. **`unknown`**, which says so and offers the honest door.
//
// Steps 6 and 7 are in that order deliberately: a config is a record the family
// wrote, `itemType` is a string that may have come from a model.
//
// ── One door per row (`UX-361`, owner decision 2026-09-11) ──────────────────
//
// {@link TodayRow.addDoor} is the row's OWN add-door — the thing the finding
// says a parent cannot find — and there is exactly one per kind, as a
// `Record<TodayRowKind, TodayRowDoor>` so a new kind cannot arrive without one.
// It is deliberately NOT the set of every affordance the row has: the checkbox
// is on every row and was never the thing in doubt.

import { ActivityType } from '../../core/types/enums'
import type { ChecklistItem } from '../../core/types/planning'
import { activityMatchNames } from '../../core/utils/activityNames'
import { nameKey } from '../../core/utils/nameKey'
import { findWorkbookConfigId } from '../../core/utils/workbookMatching'
import type { WorkbookConfigLike } from '../../core/utils/workbookMatching'
import { ACTIVITY_TYPE_WORDS } from '../shelly-chat/activityTypeChoices'
import { findStrandConfigId, strandSessionCount, STRAND_UNIT_LABEL } from '../progress/strand'

/**
 * Every kind a Today row can be.
 *
 * The seven `ActivityType` members — so the vocabulary Today uses and the
 * vocabulary Progress → Curriculum uses are the same seven words — plus the two
 * that are not curriculum rows at all: a curated `watch` video, and `unknown`
 * for a row nothing in the family's curriculum answers to.
 */
export const TodayRowKind = {
  Workbook: ActivityType.Workbook,
  Routine: ActivityType.Routine,
  Formation: ActivityType.Formation,
  Activity: ActivityType.Activity,
  App: ActivityType.App,
  Evaluation: ActivityType.Evaluation,
  Strand: ActivityType.Strand,
  Watch: 'watch',
  Unknown: 'unknown',
  /**
   * The curriculum list has not settled, or failed to load (Codex round 1, P2).
   *
   * `useActivityConfigs` hands `[]` before its snapshot arrives and keeps `[]`
   * when the read throws — so resolving against it would answer **`unknown`**,
   * and `unknown` is an affirmative claim: *"not linked to a curriculum
   * activity"*, on a row that may well be. On a failed read it would stand
   * there permanently. That is the rule this repo keeps relearning — a failed
   * read is never rendered as an affirmative empty result (`UX-356`, `UX-365`,
   * and the census's own GATE verdict) — so an unsettled list gets its own
   * answer that claims nothing about the row.
   */
  Unresolved: 'unresolved',
} as const
export type TodayRowKind = (typeof TodayRowKind)[keyof typeof TodayRowKind]

/**
 * Whether the caller's curriculum list can be believed yet.
 *
 * Passed rather than inferred, because an empty list and an unread list are
 * indistinguishable from inside this function and mean opposite things: a child
 * really can have no configs, and that is an answer.
 */
export const TodayRowConfigsState = {
  Settled: 'settled',
  Loading: 'loading',
  Failed: 'failed',
} as const
export type TodayRowConfigsState =
  (typeof TodayRowConfigsState)[keyof typeof TodayRowConfigsState]

/**
 * The one place a row invites her to add to it.
 *
 * `add-page` and `add-photo` are the **same** capture pipeline — one is a
 * workbook page that advances a lesson count, the other is evidence that does
 * not — and they are two members rather than one because the difference between
 * them is the whole of `UX-363`. Naming them alike would leave the screen
 * saying the same word for two different records again.
 */
export const TodayRowDoor = {
  /** A workbook page: the photo registers and the lesson count moves. */
  AddPage: 'add-page',
  /** Evidence on this row: the photo saves and nothing else moves. */
  AddPhoto: 'add-photo',
  /** A strand session (`UX-283`): one increment, one topic, evidence required. */
  RecordSession: 'record-session',
  /** The Knowledge Mine quest this row was planned as. */
  StartMining: 'start-mining',
  /** The curated video this row points at. */
  Watch: 'watch',
} as const
export type TodayRowDoor = (typeof TodayRowDoor)[keyof typeof TodayRowDoor]

/**
 * The door each kind offers, exhaustively.
 *
 * A `Record<TodayRowKind, TodayRowDoor>`, the `UX-204` rail: a new kind fails to
 * compile until somebody decides where she adds to it. The four that are not
 * curriculum-shaped — routine, formation, activity, app — all get the plain
 * photo, because that genuinely is the only record Today can make for them, and
 * saying so beats a row that looks like it might do more.
 *
 * `unknown` gets the same photo rather than nothing at all. Its note says what
 * is missing; removing the capture would take away the one record the row *can*
 * make, and a spontaneous lesson's photo is exactly the evidence this app
 * exists to keep.
 */
export const DOOR_FOR_KIND: Record<TodayRowKind, TodayRowDoor> = {
  [TodayRowKind.Workbook]: TodayRowDoor.AddPage,
  [TodayRowKind.Routine]: TodayRowDoor.AddPhoto,
  [TodayRowKind.Formation]: TodayRowDoor.AddPhoto,
  [TodayRowKind.Activity]: TodayRowDoor.AddPhoto,
  [TodayRowKind.App]: TodayRowDoor.AddPhoto,
  [TodayRowKind.Evaluation]: TodayRowDoor.StartMining,
  [TodayRowKind.Strand]: TodayRowDoor.RecordSession,
  [TodayRowKind.Watch]: TodayRowDoor.Watch,
  [TodayRowKind.Unknown]: TodayRowDoor.AddPhoto,
  // An unsettled list cannot tell us this is a workbook, and the capture path
  // cannot either — with no configs to match, it takes the evidence branch. So
  // the honest door is the plain photo, and it is the door that will actually run.
  [TodayRowKind.Unresolved]: TodayRowDoor.AddPhoto,
}

/**
 * What a parent calls each door.
 *
 * `Add page` against `Add a photo` is the sentence this run is really adding to
 * the screen: one of them moves a lesson number and the other does not, and
 * before this they were one button reading *"Add photo(s)"*.
 */
export const TODAY_ROW_DOOR_LABEL: Record<TodayRowDoor, string> = {
  [TodayRowDoor.AddPage]: 'Add page',
  [TodayRowDoor.AddPhoto]: 'Add a photo',
  [TodayRowDoor.RecordSession]: 'Record a session',
  [TodayRowDoor.StartMining]: 'Start Mining',
  [TodayRowDoor.Watch]: 'Watch',
}

/**
 * What a parent calls each kind.
 *
 * The seven curriculum words are **read** from `ACTIVITY_TYPE_WORDS` rather than
 * restated, so Today and the chat's `addActivity` card cannot call the same row
 * two different things — the rule `sectionTitleForType` already follows for the
 * section headings. Only the two kinds that have no `ActivityType` are named
 * here.
 *
 * `unknown`'s word is a plain statement rather than a label, because it is not
 * a kind of thing — it is the absence of one.
 */
export const TODAY_ROW_KIND_WORD: Record<TodayRowKind, string> = {
  [TodayRowKind.Workbook]: ACTIVITY_TYPE_WORDS[ActivityType.Workbook].label,
  [TodayRowKind.Routine]: ACTIVITY_TYPE_WORDS[ActivityType.Routine].label,
  [TodayRowKind.Formation]: ACTIVITY_TYPE_WORDS[ActivityType.Formation].label,
  [TodayRowKind.Activity]: ACTIVITY_TYPE_WORDS[ActivityType.Activity].label,
  [TodayRowKind.App]: ACTIVITY_TYPE_WORDS[ActivityType.App].label,
  [TodayRowKind.Evaluation]: ACTIVITY_TYPE_WORDS[ActivityType.Evaluation].label,
  [TodayRowKind.Strand]: ACTIVITY_TYPE_WORDS[ActivityType.Strand].label,
  [TodayRowKind.Watch]: 'Video',
  [TodayRowKind.Unknown]: 'No curriculum row',
  // Present tense and no claim about the row: it says what the APP is doing,
  // which is the only thing true yet. The failed-read wording is below.
  [TodayRowKind.Unresolved]: 'Checking your curriculum…',
}

/**
 * What an `Unresolved` row says when the read FAILED rather than not finished.
 *
 * Two states, two sentences, kept apart on purpose: *"checking"* resolves on its
 * own and *"couldn't read"* does not, so *"try again"* is wrong advice for one of
 * them — the `dailyPlanGate` distinction (`UX-352`), on a read instead of a write.
 * The note says what still works, because the capture door is right beside it.
 */
export const CONFIG_READ_FAILED_TELL = 'Couldn’t read your curriculum list'
export const CONFIG_READ_FAILED_NOTE =
  'So this row cannot say what it is or where it stands. A photo still saves as evidence; reopening Today re-reads the list.'

/** Why a row resolved to `unknown`. `null` on every row that resolved. */
export const TodayRowUnknownReason = {
  /** No curriculum row of any type answers to this row. */
  NoMatch: 'no-match',
  /** More than one does, and picking one would be a guess. */
  Ambiguous: 'ambiguous',
  /** The row names a curriculum row that is gone or finished. */
  StaleJoin: 'stale-join',
} as const
export type TodayRowUnknownReason =
  (typeof TodayRowUnknownReason)[keyof typeof TodayRowUnknownReason]

/**
 * What the capture door on an unplaced row actually does — one clause, shared.
 *
 * **Codex round 1 (P1) caught the first draft of these notes claiming *"no lesson
 * count moves"*, and it was false.** A photo on a row the app cannot place takes
 * `useUnifiedCapture`'s classification path, which fuzzy-matches the page by
 * name and may create or advance a workbook (and does say so, in its own snack).
 * Narrowing that write is a `skillSnapshots` / `activityConfigs` change and
 * therefore propose-and-confirm — filed as `UX-403`, with the proposal, rather
 * than made here. What was this run's to fix is the sentence, so the sentence now
 * says what happens.
 *
 * One clause, appended to all three reasons, so no note can drift from another
 * about the same door.
 */
export const UNPLACED_ROW_EVIDENCE_CLAUSE =
  'A photo saves as evidence here; if it reads as a workbook page, the app files it on Curriculum and says which.'

/**
 * The one line the row shows when there is nowhere on Today to add to it.
 *
 * Each names its own reason and then says what the photo will do, because the
 * capture is still offered — a sentence that only said "no" would read as a
 * refusal of a door that is right there.
 */
export const TODAY_ROW_UNKNOWN_NOTE: Record<TodayRowUnknownReason, string> = {
  [TodayRowUnknownReason.NoMatch]:
    `Not linked to a curriculum activity, so nothing on this row tracks a count. ${UNPLACED_ROW_EVIDENCE_CLAUSE}`,
  [TodayRowUnknownReason.Ambiguous]:
    `More than one curriculum activity answers to this name, so this row cannot tell which — Progress → Curriculum is where a duplicate gets sorted out. ${UNPLACED_ROW_EVIDENCE_CLAUSE}`,
  [TodayRowUnknownReason.StaleJoin]:
    `The curriculum activity this was planned from is finished or gone, so nothing on this row tracks a count. ${UNPLACED_ROW_EVIDENCE_CLAUSE}`,
}

/**
 * The shape this module needs of a curriculum row, structurally.
 *
 * Deliberately loose, mirroring `WorkbookConfigLike` and `StrandLike` — an
 * `ActivityConfig` satisfies it, and a checklist renderer is not handed a
 * document to pass along. `currentPosition` and `unitLabel` are here because the
 * tell says *where a row stands*, which is the half of the finding a type word
 * alone does not answer.
 */
export interface TodayRowConfigLike extends WorkbookConfigLike {
  completed?: boolean
  currentPosition?: number
  unitLabel?: string
}

export interface TodayRow {
  kind: TodayRowKind
  /** The curriculum row this resolved to, or `null` — never a guess. */
  configId: string | null
  /** *"Workbook · lesson 35"* — the word, and where the row stands. */
  tell: string
  /** The one place this row invites her to add to it (`UX-361`). */
  addDoor: TodayRowDoor
  /** Set only on `unknown`; `null` otherwise. */
  unknownReason: TodayRowUnknownReason | null
  /** The one line under an `unknown` row, or `null`. */
  note: string | null
}

/** The planner renders `${title} (${estimatedMinutes}m)`; reading a label back undoes it. */
const DURATION_SUFFIX = /\s*\(\d+m\)\s*$/

/** A live row: one the family still has, and has not finished. */
function isLive(config: TodayRowConfigLike): boolean {
  return config.completed !== true
}

/**
 * Every comparison key a stored label could be, most exact first.
 *
 * The whole label is tried before the stripped one, so an activity a family
 * genuinely named *"History (30m)"* still matches itself — the same rule, and
 * the same reason, as `findStrandConfigId`'s own candidates.
 */
function labelCandidates(label: string | undefined): string[] {
  const raw = (label ?? '').trim()
  if (!raw) return []
  const keys = [nameKey(raw), nameKey(raw.replace(DURATION_SUFFIX, ''))]
  return [...new Set(keys.filter(Boolean))]
}

/**
 * The single live config this row's NAME can only mean, or a reason it cannot.
 *
 * Exact through `nameKey`, over every name the config answers to including the
 * alternates a rename left behind (`UX-280`). Never fuzzy: a wrong match here
 * would put a workbook's *Add page* on a routine.
 */
function configByName(
  label: string | undefined,
  configs: TodayRowConfigLike[],
): { config: TodayRowConfigLike | null; ambiguous: boolean } {
  const candidates = labelCandidates(label)
  if (candidates.length === 0) return { config: null, ambiguous: false }
  const matches = new Map<string, TodayRowConfigLike>()
  for (const config of configs) {
    if (!isLive(config)) continue
    const answers = activityMatchNames(config).some((name) => {
      const key = nameKey(name)
      return key !== '' && candidates.includes(key)
    })
    if (answers) matches.set(config.id, config)
  }
  if (matches.size === 1) return { config: [...matches.values()][0], ambiguous: false }
  return { config: null, ambiguous: matches.size > 1 }
}

/**
 * Where a row stands, in its own unit — or `null` when it has no position.
 *
 * `currentPosition` is a single unvalidated Firestore field, so anything that is
 * not a non-negative finite number reads as no position at all. A strand counts
 * `session`s (`UX-282`) and everything else counts what it stored, falling back
 * to `lesson` — the rule stated on `ActivityConfig.unitLabel` itself, so this is
 * not a second vocabulary for the same number.
 *
 * (`UX-213`'s parent-only coverage rate is deliberately not named here: a source
 * guard holds every kid-surface directory, this one included, to importing
 * nothing from it, and a comment that names it trips that guard — correctly.)
 */
function positionPhrase(kind: TodayRowKind, config: TodayRowConfigLike | null): string | null {
  if (!config) return null
  if (kind === TodayRowKind.Strand) {
    const count = strandSessionCount(config)
    return count > 0 ? `${STRAND_UNIT_LABEL} ${count}` : null
  }
  const raw = config.currentPosition
  if (typeof raw !== 'number' || !Number.isFinite(raw) || raw <= 0) return null
  return `${config.unitLabel || 'lesson'} ${Math.floor(raw)}`
}

/**
 * Is this stored `itemType` a kind at all?
 *
 * Firestore holds whatever was written, including a value from a build that knew
 * a kind this one does not — and, on an AI-planned row, whatever the model
 * emitted. An unrecognised value is not a kind; it falls through to `unknown`,
 * which is the honest answer and the one that offers the right door.
 */
function kindFromItemType(itemType: string | undefined): TodayRowKind | null {
  if (!itemType) return null
  const known = Object.values(TodayRowKind) as string[]
  if (!known.includes(itemType) || itemType === TodayRowKind.Unknown) return null
  return itemType as TodayRowKind
}

function build(
  kind: TodayRowKind,
  config: TodayRowConfigLike | null,
  unknownReason: TodayRowUnknownReason | null = null,
  /**
   * The curriculum row this resolves to when the DOCUMENT is not in hand.
   *
   * A stamped `workbookConfigId` is on the row, not in the config list, so the
   * capture path uses it whether or not the list has loaded — see step 2.
   */
  configIdOverride: string | null = null,
): TodayRow {
  const where = positionPhrase(kind, config)
  const word = TODAY_ROW_KIND_WORD[kind]
  return {
    kind,
    configId: config?.id ?? configIdOverride,
    tell: where ? `${word} · ${where}` : word,
    addDoor: DOOR_FOR_KIND[kind],
    unknownReason,
    note: unknownReason ? TODAY_ROW_UNKNOWN_NOTE[unknownReason] : null,
  }
}

/** The `Unresolved` answer, which claims nothing about the row. */
function buildUnresolved(state: TodayRowConfigsState): TodayRow {
  const failed = state === TodayRowConfigsState.Failed
  return {
    kind: TodayRowKind.Unresolved,
    configId: null,
    tell: failed ? CONFIG_READ_FAILED_TELL : TODAY_ROW_KIND_WORD[TodayRowKind.Unresolved],
    addDoor: DOOR_FOR_KIND[TodayRowKind.Unresolved],
    unknownReason: null,
    note: failed ? CONFIG_READ_FAILED_NOTE : null,
  }
}

/**
 * What this Today row is, and where she adds to it.
 *
 * The resolution order and the reason for each step are in this module's header.
 * `configs` is the child's live `activityConfigs` list — the same one
 * `TodayChecklist` already holds for the strand and workbook joins.
 */
export function resolveTodayRow(
  item: Pick<
    ChecklistItem,
    'label' | 'itemType' | 'activityConfigId' | 'workbookConfigId' | 'strandConfigId' | 'subjectBucket'
  >,
  configs: TodayRowConfigLike[],
  /**
   * Whether `configs` can be believed yet. Defaults to `settled` so every
   * existing caller and every test keeps its meaning; the Today surface passes
   * its hook's real state (Codex round 1, P2).
   */
  configsState: TodayRowConfigsState = TodayRowConfigsState.Settled,
): TodayRow {
  const settled = configsState === TodayRowConfigsState.Settled
  const byId = (id: string | undefined): TodayRowConfigLike | undefined =>
    id ? configs.find((c) => c.id === id && isLive(c)) : undefined

  // 1 · A curated video is never a curriculum row. It needs no config, so it is
  //     answerable even while the list is unread.
  if (item.itemType === TodayRowKind.Watch) return build(TodayRowKind.Watch, null)

  // 2 · The workbook question, asked exactly as `useUnifiedCapture` asks it, so
  //     the tell cannot promise something other than what the photo will do.
  //
  //     **Including the completed filter, which is to say: without one.** Neither
  //     `findWorkbookConfigId` nor the capture path skips a finished program, so
  //     skipping it here would make the row read *Routine* while its photo went
  //     to a workbook — the one disagreement this step exists to prevent. A
  //     finished program is a separate question, and it belongs on the door
  //     rather than on the label that describes it (`UX-399`).
  //
  //     **The STAMP answers even when the document is not in hand** (Codex round
  //     1, P2): `workbookConfigId` lives on the row, so the capture path resolves
  //     it with no config list at all — and a row that reads *"No curriculum
  //     row"* while its photo advances the workbook it names is the exact
  //     contradiction this step exists to prevent, arriving through an unread
  //     list. The position is simply absent until the document loads.
  const workbookConfigId = item.workbookConfigId ?? findWorkbookConfigId(item, configs)
  if (workbookConfigId) {
    const workbook = configs.find((c) => c.id === workbookConfigId) ?? null
    return build(TodayRowKind.Workbook, workbook, null, workbookConfigId)
  }

  // An unread list cannot answer any of the questions below — and answering them
  // against `[]` would claim *"not linked to a curriculum activity"* about a row
  // that may well be, permanently so on a failed read.
  if (!settled) return buildUnresolved(configsState)

  // 3 · The stamped curriculum join. A stale stamp is its own answer.
  if (item.activityConfigId) {
    const stamped = byId(item.activityConfigId)
    if (stamped) {
      const kind = kindFromItemType(stamped.type) ?? TodayRowKind.Activity
      return build(kind, stamped)
    }
    return build(TodayRowKind.Unknown, null, TodayRowUnknownReason.StaleJoin)
  }

  // 4 · The strand, through the same matcher that decides whether the row's
  //     *Record a session* button renders.
  const strand = byId(findStrandConfigId(item, configs))
  if (strand) return build(TodayRowKind.Strand, strand)

  // 5 · A Knowledge Mine row the planner wrote itself. No config exists for it.
  if (item.itemType === TodayRowKind.Evaluation) return build(TodayRowKind.Evaluation, null)

  // 6 · The row's name, against every live config. One answer, or none.
  const { config: named, ambiguous } = configByName(item.label, configs)
  if (named) {
    const kind = kindFromItemType(named.type) ?? TodayRowKind.Activity
    return build(kind, named)
  }

  // 7 · Ambiguity outranks what the row SAYS it is (Codex round 1, P2).
  //
  //     Two live configs answering to one label is a fact about the family's
  //     curriculum; `itemType` on a model-planned row is a word. Letting the word
  //     win would defeat the duplicate-safety rule of step 6 on exactly the rows
  //     it is least trustworthy for — and it would offer a *door* chosen from the
  //     word, on a name the app has just admitted it cannot resolve.
  if (ambiguous) return build(TodayRowKind.Unknown, null, TodayRowUnknownReason.Ambiguous)

  // 8 · What the row says it is — a record of an intention, not of a config.
  const stated = kindFromItemType(item.itemType)
  if (stated) return build(stated, null)

  // 9 · Nothing answers. Say so, and offer the door that is honest.
  return build(TodayRowKind.Unknown, null, TodayRowUnknownReason.NoMatch)
}

/** Does this row's door put a photo on it? The two capture doors, named once. */
export function isPhotoDoor(door: TodayRowDoor): boolean {
  return door === TodayRowDoor.AddPage || door === TodayRowDoor.AddPhoto
}
