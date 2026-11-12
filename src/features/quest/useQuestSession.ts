import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react'
import { addDoc, collection, doc, getDoc, getDocs, limit as firestoreLimit, orderBy, query, setDoc, updateDoc, where } from 'firebase/firestore'

import { useAI, TaskType } from '../../core/ai/useAI'
import { updateSkillMapFromFindings } from '../../core/curriculum/updateSkillMapFromFindings'
import { addXpEvent } from '../../core/xp/addXpEvent'
import { addDiamondEvent } from '../../core/xp/addDiamondEvent'
import { DIAMOND_EVENTS } from '../../core/types'
import type { ChatMessage as AIChatMessage } from '../../core/ai/useAI'
import { useFamilyId } from '../../core/auth/useAuth'
import { activityConfigsCollection, daysCollection, db, evaluationSessionsCollection, hoursCollection, learnerModelsCollection, sightWordProgressCollection, skillSnapshotsCollection } from '../../core/firebase/firestore'
import { dayLogDocId } from '../today/daylog.model'
import { updateDayLogGuarded } from '../today/dayWriteGuard'
import { captureQuestTargetPlan, parseQuestTargetPlan, selectQuestTargets } from '../../core/foundations/questTargeting'
import type { QuestAskPlanRow, QuestTargetConcept } from '../../core/foundations/questTargeting'
import {
  projectQuestSourceToModel,
  projectionReachedGraph,
  type QuestProjectionOutcome,
} from './questModelSync'
import {
  abandonQuestSource,
  claimQuestSourceForResume,
  questSourceRef,
  saveFinalQuestSource,
  saveResumableQuestSource,
  type QuestAbandonOutcome,
  type QuestSourcePayload,
  type QuestSourceSaveOutcome,
} from './questSourceWrites'
import {
  finalizedQuestSourcePayload,
  isLiveRun,
  mayRecoverQuestSource,
  mayRetrySavingQuestPayload,
  nextRunStamp,
  questRecoveryScopeKey,
  questRunId as buildQuestRunId,
  questRunInstanceId,
  resumableQuestSourcePayload,
  type QuestResumeFailure,
  type QuestRun,
  type QuestStartOutcome,
} from './questRun'
import { useProfile } from '../../core/profile/useProfile'
import {
  getLibraryIdentityEpoch,
  subscribeLibraryIdentityEpoch,
} from '../avatar/stonebridge/libraryReturnFlow'
import { useActiveChild } from '../../core/hooks/useActiveChild'
import {
  questLeftItsChild,
  resolveQuestOwnerChildId,
  type QuestSessionOwner,
} from './questSessionOwner'
import type { ConceptualBlock, EvaluationFinding, EvaluationSession, PrioritySkill, SkillSnapshot, WordProgress } from '../../core/types'
import {
  mergeBlock,
  sessionEvidenceFromQuestions,
  updateBlockerLifecycle,
} from '../../core/utils/blockerLifecycle'
import { detectBlockersFromSession } from './detectBlockers'
import type { EvaluationDomain } from '../../core/types/enums'
import { MasteryGate, SkillLevel, UserProfile } from '../../core/types/enums'
import { domainToSubjectBucket } from '../../core/utils/domainMapping'
import { useSessionTimer } from '../../core/utils/sessionTimer'
import { todayKey } from '../../core/utils/dateKey'
import { calculateStreak, computeNextState, formatSkillLabel, shouldEndSession } from './questAdaptive'
import {
  XP_PER_DIAMOND,
  correctAnswerIndices,
  hasSufficientCompletion,
  perAnswerDiamondKey,
  perAnswerXpKey,
} from './questBanking'
import { checkAnswer, extractPattern, extractTargetWord, generateFallbackQuestion, shouldFlagAsError, validateQuestion } from './questHelpers'
import { hasMathCalibration, hasReadingCalibration } from './knowledgeMineAccess'
import {
  buildMineAdditionProbeQuestion,
  mineAdditionProbeAssistantTurn,
  readMineAdditionPilotTarget,
} from './mineAdditionProbe'
import { resolveMineAdditionPilot } from './mineAdditionPilot'
import type {
  MineAdditionPilotRequest,
  ResolveMineAdditionPilotInput,
} from './mineAdditionPilot'
import type {
  AnswerInputMethod,
  FluencyPassage,
  FluencySessionData,
  InteractiveSessionData,
  QuestMode,
  QuestQuestion,
  QuestState,
  QuestStreak,
  SessionQuestion,
} from './questTypes'
import {
  DEFAULT_LEVEL_CAP,
  FRUSTRATION_LIMIT,
  LEVEL_UP_STREAK,
  QUEST_MODE_LEVEL_CAP,
  QuestScreen,
  VALIDATION_RETRIES,
} from './questTypes'
import { computeStartLevel, computeWorkingLevelFromSession, computeWritingLevelFromSpellingQuestions, deriveSpellingFindings, computeSentenceLevelFromQuestions, deriveSentenceFindings, canOverwriteWorkingLevel, manualOverrideHolds, computeQuestActivityMarker, sessionHighWaterLevel } from './workingLevels'
import { writeSnapshotUpdate } from '../evaluate/skillSnapshotWrites'
import type { CurriculumLevelHint } from './workingLevels'
import { WRITING_LEVEL_CAP, SENTENCE_LEVEL_CAP } from './questTypes'
import { generateSpellWordQuestion } from './spellTheWord'
import type { SpellingSource } from './spellTheWord'
import { generateBuildSentenceQuestion } from './buildTheSentence'
import type { SentenceSource } from './buildTheSentence'
import { askedTargetSet, collectAskedTargets, recentQuestionFormats } from './questVariety'

// ── Helpers ─────────────────────────────────────────────────────

function parseQuestBlock(text: string): QuestQuestion | null {
  let jsonStr: string | null = null

  // Attempt 1: <quest>...</quest> tags
  const questMatch = /<quest>([\s\S]*?)<\/quest>/.exec(text)
  if (questMatch) {
    jsonStr = questMatch[1].trim()
  }

  // Attempt 2: ```json ... ``` fences
  if (!jsonStr) {
    const fenceMatch = /```(?:json)?\s*\n?([\s\S]*?)\n?\s*```/.exec(text)
    if (fenceMatch) {
      jsonStr = fenceMatch[1].trim()
    }
  }

  // Attempt 3: Find first { ... } in the text
  if (!jsonStr) {
    const firstBrace = text.indexOf('{')
    const lastBrace = text.lastIndexOf('}')
    if (firstBrace !== -1 && lastBrace > firstBrace) {
      jsonStr = text.slice(firstBrace, lastBrace + 1)
    }
  }

  // Attempt 4: Raw text (maybe it IS just JSON)
  if (!jsonStr) {
    jsonStr = text.trim()
  }

  try {
    // Clean up common issues
    jsonStr = jsonStr
      .replace(/,\s*}/g, '}')   // trailing commas
      .replace(/,\s*\]/g, ']')  // trailing commas in arrays

    const parsed = JSON.parse(jsonStr)

    const rawTargeted = typeof parsed.targetedBlockerId === 'string'
      ? parsed.targetedBlockerId.trim()
      : ''
    // FEAT-54 — the AI echoes a queued preferred-concept graph id here (the
    // targetedBlockerId precedent) so session-close can attribute per-concept results.
    const rawTargetConcept = typeof parsed.targetConceptId === 'string'
      ? parsed.targetConceptId.trim()
      : ''

    // ── Build-word (encoding) question ──────────────────────────
    // FEAT-04: the AI emits "type": "build-word" with a target word + a tile
    // set instead of options. There is no typed input — tiles are tapped.
    if (parsed.type === 'build-word' || (Array.isArray(parsed.tiles) && parsed.tiles.length > 0)) {
      const targetWord = String(parsed.targetWord ?? parsed.correctAnswer ?? '').trim()
      const tiles = Array.isArray(parsed.tiles)
        ? parsed.tiles.map((t: unknown) => String(t)).filter((t: string) => t.trim().length > 0)
        : []
      if (!targetWord || tiles.length === 0) {
        console.warn('[parseQuestBlock] build-word missing targetWord/tiles:', Object.keys(parsed))
        return null
      }
      return {
        id: `q_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        type: 'build-word',
        level: parsed.level ?? 2,
        skill: parsed.skill ?? '',
        prompt: parsed.prompt ?? 'Build the word you hear.',
        targetWord,
        correctAnswer: targetWord,
        tiles,
        audioCue: typeof parsed.audioCue === 'string' && parsed.audioCue.trim()
          ? parsed.audioCue.trim()
          : undefined,
        encouragement: parsed.encouragement,
        isBonusRound: parsed.bonusRound ?? undefined,
        targetedBlockerId: rawTargeted ? rawTargeted : undefined,
        targetConceptId: rawTargetConcept ? rawTargetConcept : undefined,
      }
    }

    // ── Multiple-choice question (default) ──────────────────────
    // Validate minimum required fields
    if (!parsed.prompt && !parsed.options) {
      console.warn('[parseQuestBlock] Parsed JSON but missing prompt/options:', Object.keys(parsed))
      return null
    }

    return {
      id: `q_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      type: 'multiple-choice',
      level: parsed.level ?? 2,
      skill: parsed.skill ?? '',
      prompt: parsed.prompt ?? '',
      stimulus: parsed.stimulus ?? undefined,
      phonemeDisplay: parsed.phonemeDisplay,
      options: parsed.options ?? [],
      correctAnswer: parsed.correctAnswer ?? '',
      encouragement: parsed.encouragement,
      isBonusRound: parsed.bonusRound ?? undefined,
      allowOpenResponse: parsed.allowOpenResponse ?? undefined,
      targetedBlockerId: rawTargeted ? rawTargeted : undefined,
      targetConceptId: rawTargetConcept ? rawTargetConcept : undefined,
    }
  } catch (err) {
    console.error('[parseQuestBlock] JSON parse failed:', (err as Error).message)
    console.error('[parseQuestBlock] Attempted to parse:', jsonStr?.substring(0, 300))
    return null
  }
}

function extractQuestFinding(text: string): EvaluationFinding | null {
  const regex = /<quest>([\s\S]*?)<\/quest>/
  const match = regex.exec(text)
  if (!match) return null

  try {
    const parsed = JSON.parse(match[1].trim())
    if (!parsed.finding) return null
    return {
      skill: parsed.finding.skill || '',
      status: parsed.finding.status || 'not-tested',
      evidence: parsed.finding.evidence || '',
      notes: parsed.finding.notes,
      testedAt: parsed.finding.testedAt || new Date().toISOString(),
    }
  } catch {
    return null
  }
}

interface QuestSummaryBlock {
  summary: string
  frontier?: string
  recommendations: Array<{
    priority: number
    skill: string
    action: string
    duration: string
    frequency: string
  }>
  skipList?: Array<{ skill: string; reason: string }>
}

function parseQuestSummaryBlock(text: string): QuestSummaryBlock | null {
  const regex = /<quest-summary>([\s\S]*?)<\/quest-summary>/
  const match = regex.exec(text)
  if (!match) return null
  try {
    return JSON.parse(match[1].trim()) as QuestSummaryBlock
  } catch {
    return null
  }
}

function getDateString(d: Date): string {
  return d.toISOString().slice(0, 10)
}

// ── Fluency passage parser ──────────────────────────────────────

interface ParsedFluencyPassage {
  passage: string
  targetWords?: string[]
  speechWords?: string[]
  wordCount?: number
  readingLevel?: string
}

function parseFluencyPassage(text: string): ParsedFluencyPassage | null {
  // Try <fluency-passage>...</fluency-passage> tags
  const tagMatch = /<fluency-passage>([\s\S]*?)<\/fluency-passage>/.exec(text)
  let jsonStr = tagMatch?.[1]?.trim() ?? null

  // Fallback: ```json fences
  if (!jsonStr) {
    const fenceMatch = /```(?:json)?\s*\n?([\s\S]*?)\n?\s*```/.exec(text)
    if (fenceMatch) jsonStr = fenceMatch[1].trim()
  }

  // Fallback: first { ... }
  if (!jsonStr) {
    const firstBrace = text.indexOf('{')
    const lastBrace = text.lastIndexOf('}')
    if (firstBrace !== -1 && lastBrace > firstBrace) {
      jsonStr = text.slice(firstBrace, lastBrace + 1)
    }
  }

  if (!jsonStr) return null

  try {
    jsonStr = jsonStr.replace(/,\s*}/g, '}').replace(/,\s*\]/g, ']')
    const parsed = JSON.parse(jsonStr)
    if (!parsed.passage) return null
    return {
      passage: parsed.passage,
      targetWords: parsed.targetWords || [],
      speechWords: parsed.speechWords || [],
      wordCount: parsed.wordCount || parsed.passage.split(/\s+/).length,
      readingLevel: parsed.readingLevel || '',
    }
  } catch {
    return null
  }
}

// ── Fallback recommendation generator ────────────────────────────

function generateFallbackRecommendations(
  sessionFindings: EvaluationFinding[],
  finalLevel: number,
  domain: string = 'reading',
): Array<{ priority: number; skill: string; action: string; duration: string; frequency: string }> {
  const recs: Array<{ priority: number; skill: string; action: string; duration: string; frequency: string }> = []
  let priority = 1

  const notYet = sessionFindings.filter((f) => f.status === 'not-yet')
  const emerging = sessionFindings.filter((f) => f.status === 'emerging')

  for (const f of notYet) {
    recs.push({
      priority: priority++,
      skill: f.skill,
      action: `Focus: ${formatSkillLabel(f.skill)} — needs direct instruction before practice`,
      duration: '2 weeks',
      frequency: 'Daily, 5-10 minutes',
    })
  }

  for (const f of emerging) {
    recs.push({
      priority: priority++,
      skill: f.skill,
      action: `Practice: ${formatSkillLabel(f.skill)} — emerging, needs short daily practice`,
      duration: '2 weeks',
      frequency: 'Daily, 5-10 minutes',
    })
  }

  // Level-based general recommendation
  if (domain === 'math') {
    if (finalLevel <= 2) {
      recs.push({
        priority: priority++,
        skill: 'math.addition',
        action: 'Continue addition and subtraction facts within 20',
        duration: '2 weeks',
        frequency: 'Daily, 8-10 minutes',
      })
    } else if (finalLevel <= 4) {
      recs.push({
        priority: priority++,
        skill: 'math.multiplication',
        action: 'Practice multiplication concepts — skip counting and times tables for 2, 5, 10',
        duration: '2 weeks',
        frequency: 'Daily, 8-10 minutes',
      })
    } else {
      recs.push({
        priority: priority++,
        skill: 'math.fractions',
        action: 'Introduce fractions — halves, quarters, and fraction comparison',
        duration: '2 weeks',
        frequency: 'Daily, 8-10 minutes',
      })
    }
  } else {
    if (finalLevel <= 2) {
      recs.push({
        priority: priority++,
        skill: 'phonics.basics',
        action: 'Continue phonics basics — letter sounds and simple CVC words',
        duration: '2 weeks',
        frequency: 'Daily, 8-10 minutes',
      })
    } else if (finalLevel <= 4) {
      recs.push({
        priority: priority++,
        skill: 'phonics.blends',
        action: 'Ready for blends and digraphs — introduce sh, ch, th, bl, cr patterns',
        duration: '2 weeks',
        frequency: 'Daily, 8-10 minutes',
      })
    } else if (finalLevel <= 6) {
      recs.push({
        priority: priority++,
        skill: 'phonics.cvce',
        action: 'Ready for long vowels and CVCe — focus on silent-e patterns',
        duration: '2 weeks',
        frequency: 'Daily, 8-10 minutes',
      })
    } else if (finalLevel <= 8) {
      recs.push({
        priority: priority++,
        skill: 'reading.multisyllable',
        action: 'Practice multi-syllable words, prefixes, and suffixes — un-, re-, -ing, -ed, -ly',
        duration: '2 weeks',
        frequency: 'Daily, 10-15 minutes',
      })
    } else {
      recs.push({
        priority: priority++,
        skill: 'reading.comprehension',
        action: 'Focus on reading comprehension — short passages with inference and vocabulary-in-context questions',
        duration: '2 weeks',
        frequency: 'Daily, 10-15 minutes',
      })
    }
  }

  return recs
}

// ── Hook ────────────────────────────────────────────────────────

/**
 * UX-494 — WHO is sitting in front of this retry?
 *
 * The scope string and epoch answer "is this control's render still the live
 * one?", which a FRESH render under a new identity passes by construction: a
 * sibling's profile mounts, settles, and its own buttons are current. So the
 * viewer is checked separately, against the live profile and child rather than
 * against the retained scope key.
 *
 * - The parents profile may retry a `final` payload anywhere in its authorised
 *   family: that notice lives on the BOUND summary the close happened on, which
 *   UX-339 keeps on screen across a same-family child change, and the payload
 *   keeps its own child.
 * - Every other case needs the ACTIVE child to be the payload's owner, parents
 *   included. A `partial` notice has no bound view of its own — it is offered on
 *   whichever Mine intro the exit landed on — so a parent who then switched to a
 *   sibling was being offered the previous child's failed answers on the
 *   sibling's intro, and could save them from there.
 * - A child profile may retry only the run it OWNS. A sibling is refused, which
 *   is the case the scope guard alone could not see.
 * - No profile vouches for nobody and fails closed.
 */
/**
 * What the owning view says about the SOURCE save (his answers).
 *
 * `kind` separates the two payloads that can fail to land, because they are
 * recovered from different screens: a `final` close is retried on its summary,
 * a `partial` manual exit on the Mine intro the exit lands on.
 */
export interface QuestSourceSaveNotice {
  state: 'idle' | 'saving' | 'saved' | 'failed' | 'conflict'
  kind?: 'final' | 'partial'
  /** True only while a held payload can still be retried. */
  canRetry: boolean
  /**
   * The run whose payload is held. A retry control passes this back, so a
   * control retained across a reset cannot pick up a DIFFERENT pending payload
   * than the one it was rendered for.
   */
  runInstanceId?: string
  /**
   * The view that owns this notice — see `runGenerationRef`.
   *
   * Carried by every settled notice, close and retry alike, because it is half
   * of WHO may see it: a notice whose generation has retired is not shown, so a
   * later unanswered run that returns to Intro cannot leave the retired view's
   * Retry on screen pointing at a payload no surface can land.
   */
  viewGeneration?: number
  /**
   * The child the held payload belongs to (UX-494). A `partial` notice is drawn
   * on whatever Mine intro the exit landed on, which a child change re-renders
   * under a sibling — so the surface hides the notice unless the active child is
   * this owner. A `final` notice stays on its bound summary and does not use it.
   */
  originalChildId?: string
  /** The family the held payload belongs to — never shown outside it. */
  originalFamilyId?: string
  /**
   * The retry attempt this notice reports (UX-494 promotion).
   *
   * A settled status is stored for the exact attempt rather than dropped when
   * the rendered scope moves mid-flight — a child switch during an admitted
   * Retry used to leave *Saving…* on the bound summary for ever. Visibility is
   * derived from the live identity instead, and a settlement is applied only
   * while the notice on screen is still this attempt's AND its owning
   * generation is still live, so it can never overwrite a newer run, a
   * different held payload, or a retired view's own notice.
   */
  attemptId?: string
}

/**
 * What a Mine-owned completion exit is held by, if anything (UX-496).
 *
 * `clear` is the ordinary case and means the exit proceeds exactly as it always
 * has — same destination, same reset, nothing asked. The other three are the
 * source save's own phases, kept apart because the child's next move differs:
 * `saving` is a wait, `failed` has a retry, and `conflict` has neither and
 * needs an honest way out.
 */
export type QuestExitHold = 'clear' | 'saving' | 'failed' | 'conflict'

function mayViewerRetryQuestPayload(
  viewer: { profile: UserProfile | null | undefined; liveChildId: string | null | undefined },
  run: { childId: string },
  kind: 'final' | 'partial',
): boolean {
  if (!viewer.profile) return false
  if (viewer.profile === UserProfile.Parents && kind === 'final') return true
  // Otherwise the live child — a child profile's own, or the parent's active
  // selection — must be the run's owner.
  return Boolean(viewer.liveChildId) && viewer.liveChildId === run.childId
}

export function useQuestSession() {
  const familyId = useFamilyId()
  const {
    activeChildId: liveChildId,
    activeChild: liveChild,
    children,
    childrenFamilyId,
    isLoading: childrenLoading,
    loadFailed: childrenLoadFailed,
  } = useActiveChild()
  const { chat, analyzePatterns, loading: aiLoading, error: aiError } = useAI()
  // UX-494 — the two remaining pieces of the settled identity a recovery
  // control is scoped to. Subscribed, not sampled, for the same reason the town
  // subscribes it: a same-tick A → B → A leaves family and child unchanged.
  const { profile } = useProfile()
  const identityEpoch = useSyncExternalStore(
    subscribeLibraryIdentityEpoch,
    getLibraryIdentityEpoch,
  )

  /**
   * UX-339 — BIND. A quest belongs to the child it was STARTED for.
   *
   * `endSession` writes `hours`, `skillSnapshots`, `xpLedger`,
   * `evaluationSessions`, `days` and `wordProgress`, and `bankAnswerReward`
   * writes a diamond and its XP as each correct answer arrives. All of them
   * used to read whoever was active at the moment they ran, and a running quest
   * survives a change of active child — so a session Lincoln answered could be
   * filed, credited and levelled as London's, on three propose-and-confirm
   * rails at once. See `questSessionOwner.ts` for why BIND rather than the
   * other four verdicts.
   *
   * The owner is captured once, at the start of a session (and restored from
   * the document a resume reopens), and every line below this point resolves
   * through it. Binding at the TOP rather than at each of the thirty write
   * sites is deliberate: a fix that has to be remembered at each site is a fix
   * with a hole in it the next time one is added. With no session running the
   * ref is null and this resolves to the live child, byte-for-byte the previous
   * behaviour — so the intro screen, the resume card and the eligibility reads
   * are untouched.
   */
  const sessionOwnerRef = useRef<QuestSessionOwner | null>(null)
  const activeChildId = resolveQuestOwnerChildId(sessionOwnerRef.current, liveChildId)
  const activeChild = sessionOwnerRef.current
    ? children.find((c) => c.id === sessionOwnerRef.current!.childId) ?? liveChild
    : liveChild

  const [screen, setScreen] = useState<QuestScreen>(QuestScreen.Intro)
  const [questState, setQuestState] = useState<QuestState | null>(null)
  const [currentQuestion, setCurrentQuestion] = useState<QuestQuestion | null>(null)
  const [answeredQuestions, setAnsweredQuestions] = useState<SessionQuestion[]>([])
  const [findings, setFindings] = useState<EvaluationFinding[]>([])
  const [streak, setStreak] = useState<QuestStreak>({ currentStreak: 0, lastQuestDate: null })
  const [lastAnswer, setLastAnswer] = useState<{ correct: boolean; correctAnswer: string; encouragement?: string } | null>(null)
  const [sessionSaved, setSessionSaved] = useState(false)
  const [summarizing, setSummarizing] = useState(false)
  const [startQuestError, setStartQuestError] = useState<string | null>(null)
  const [hitLevelCap, setHitLevelCap] = useState(false)
  const [previousSessions, setPreviousSessions] = useState<Array<{ evaluatedAt: string }>>([])
  const activeDomainRef = useRef<EvaluationDomain>('reading')
  const activeQuestModeRef = useRef<QuestMode | undefined>(undefined)

  /**
   * UX-494 — THE RUN. Family, child, run id, domain, mode and selected plan, in
   * one object, decided at start (or restored by Resume) and never mutated.
   *
   * The refs above still drive question GENERATION, which is what they are for.
   * Nothing that finalizes a session reads them: `endSession` freezes this run
   * before its first await and every write it makes resolves through the frozen
   * copy, so a close that resumes after a newer session has started cannot take
   * that session's id, mode, domain, child, targets, timer or reward keys.
   */
  const runRef = useRef<QuestRun | null>(null)
  /**
   * Runs whose close has been ADMITTED. Close happens at most once per run,
   * whichever path reaches it — the adaptive end condition, a null provider
   * response, a thrown AI call, or a time-out — and a run in this set also
   * refuses `resetToIntro`'s partial save, because its answers are already on
   * their way to a finalized record.
   */
  const closedRunsRef = useRef<Set<string>>(new Set())
  /** Runs that have logged their instructional minutes. Per run, not per hook. */
  const hoursLoggedRunsRef = useRef<Set<string>>(new Set())
  /**
   * A start/resume generation — and, equally, **the generation of the view**.
   *
   * A `startQuest` does several awaited reads before it can establish the run;
   * without this, a second Start (or a Resume) landing in that window let the
   * first one finish and overwrite the newer run's identity. It is bumped by
   * Start, by Resume and by every reset, so it also answers the question scope
   * alone cannot: *is this still the screen that asked?* Two consecutive
   * summaries for the SAME child share a scope and differ here, which is what
   * stops an old summary's settled retry relabelling the new one.
   */
  const runGenerationRef = useRef(0)
  /**
   * The start claim, held synchronously from the first refusal check until the
   * run is established or the attempt has failed.
   *
   * `runGenerationRef` alone could not refuse a duplicate Start: bumping it is
   * what a second tap did, and that is precisely how a second tap replaced an
   * established run. The claim is checked BEFORE anything is read, mutated or
   * sent to a provider, so a stale or duplicate Start costs nothing.
   *
   * ONE lane, shared by every intro action that can decide what the screen
   * becomes: Start, Resume and *Start fresh instead* (UX-494). Resume awaits a
   * transaction, and bumping the generation without holding this claim was not
   * enough — a Start in that window established a new run, and Resume then
   * discarded its own restore after its `resumed` stamp had landed, leaving the
   * only discoverable partial filtered out of the card. Each holder releases
   * only its own claim, and anything reentrant is refused while it is held.
   */
  const startClaimRef = useRef<{
    generation: number
    scope: string
    kind: 'start' | 'resume' | 'discard'
  } | null>(null)
  /** Keeps two runs started in the same millisecond from sharing an id. */
  const lastRunStampRef = useRef(0)
  /**
   * A monotonic sequence behind `QuestRun.instanceId`. Resume reuses a saved
   * `runId`, so the id alone cannot tell two mounts of one saved source apart —
   * and the first mount's awaited question, skip, summary or retry would then
   * pass the live-run guard on the second.
   */
  const runInstanceSeqRef = useRef(0)
  /** One in-flight attempt per recovery lane. A second tap is not a second write. */
  const sourceRetryInFlightRef = useRef(false)
  const graphRetryInFlightRef = useRef(false)

  /**
   * The final payload whose save has not been acknowledged, held in memory for
   * the retry its own summary offers. Sufficient before the first ack, and
   * deliberately NOT a new persistence store — an unsaved payload that outlives
   * the tab is out of scope for this repair.
   */
  const pendingSourceRef = useRef<{
    run: QuestRun
    payload: QuestSourcePayload
    kind: 'final' | 'partial'
    /**
     * The view that holds it — the summary that closed, or the intro it exited
     * to. This and the run's `instanceId` are the whole of what SELECTS the
     * payload. The scope the close happened in is deliberately not kept: a
     * summary outlives a same-family child change still bound to its owner, so
     * the retry is authorised against the scope its button was RENDERED under.
     */
    viewGeneration: number
  } | null>(null)

  /** What the owning view says about the SOURCE save — see the type. */
  const [sourceSave, setSourceSave] = useState<QuestSourceSaveNotice>({
    state: 'idle',
    canRetry: false,
  })
  /**
   * The attempt sequence behind `QuestSourceSaveNotice.attemptId`. One retry is
   * one attempt, so a settlement can prove the notice on screen is still its
   * own before replacing it.
   */
  const sourceAttemptSeqRef = useRef(0)
  /**
   * The attempt id on the notice CURRENTLY published, readable synchronously.
   *
   * State cannot answer "is the notice on screen still mine?" from inside an
   * awaited continuation — the closure's copy is the render it was created in.
   * Every publisher goes through `publishSourceSave`, so this ref is the one
   * place a settlement asks that question, and it answers before the write
   * rather than inside a state updater.
   */
  const sourceNoticeAttemptRef = useRef<string | undefined>(undefined)
  /**
   * The whole notice CURRENTLY published, readable synchronously (UX-496).
   *
   * The exit guard asks its question inside a tap handler, and `sourceSave`
   * state is this render's copy: the initial close publishes `saving` from
   * `endSession` before the summary's first paint and a tap can arrive before
   * the render that would have told the handler about it. This mirror is the
   * same object the surfaces draw from, one tick earlier, and it exists before
   * any held-payload ref does — a save that is merely in flight has no
   * `pendingSourceRef` entry at all.
   */
  const sourceNoticeRef = useRef<QuestSourceSaveNotice>({ state: 'idle', canRetry: false })
  /** Publish a notice and keep the attempt mirror with it. */
  const publishSourceSave = useCallback((next: QuestSourceSaveNotice) => {
    sourceNoticeAttemptRef.current = next.attemptId
    sourceNoticeRef.current = next
    setSourceSave(next)
  }, [])

  /**
   * Bumped when a partial has just LANDED, so the intro re-reads its resume
   * card.
   *
   * The page's resume query starts as the intro mounts and can finish before
   * the exit's own write does, in which case the card it drew knew nothing
   * about the partial the child had just made. One more read, only after a
   * confirmed save, is the whole mechanism.
   */
  const [resumeReloadNonce, setResumeReloadNonce] = useState(0)

  /** What the summary says about the GRAPH projection — a separate success. */
  const [graphSync, setGraphSync] = useState<{
    state: 'idle' | 'pending' | 'running' | 'reached' | 'skipped' | 'failed'
    outcome?: QuestProjectionOutcome
    /** The saved source a retry would act on. */
    sessionId?: string
    childId?: string
  }>({ state: 'idle' })

  // Fluency-specific state
  const [fluencyPassages, setFluencyPassages] = useState<FluencyPassage[]>([])
  const [currentPassageText, setCurrentPassageText] = useState<string>('')
  const [currentPassageTargetWords, setCurrentPassageTargetWords] = useState<string[]>([])
  const [currentPassageSpeechWords, setCurrentPassageSpeechWords] = useState<string[]>([])
  const [currentPassageWordCount, setCurrentPassageWordCount] = useState(0)
  const [currentPassageReadingLevel, setCurrentPassageReadingLevel] = useState('')
  const [fluencyDiamonds, setFluencyDiamonds] = useState(0)

  const conversationRef = useRef<AIChatMessage[]>([])
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const questionStartRef = useRef<number>(0)
  const bonusRoundUsedRef = useRef(false)
  const sessionIdRef = useRef<string | null>(null)
  // Synchronous mirror of sessionSaved — set at the start of endSession so a fast
  // Done tap (e.g. on PHONICS MASTER before AI summary returns) can't slip past
  // the !sessionSaved guard in resetToIntro and write a ghost in-progress doc.
  const sessionSavedRef = useRef(false)
  const sessionTimer = useSessionTimer()
  const hoursLoggedRef = useRef(false)
  // ── Spell-the-word (FEAT-11 Phase 1) ──────────────────────────────
  // Blended word source (sight-word bank + phonics frontier) loaded at start,
  // plus per-session injection bookkeeping so spell-word fires like build-word:
  // 1–2 per session, never first, never two in a row.
  const spellWordSourceRef = useRef<SpellingSource>({ sightWords: [] })
  const spellWordCountRef = useRef(0)
  const lastWasSpellWordRef = useRef(false)
  const SPELL_WORD_PER_SESSION_MAX = 2
  // ── Build-the-sentence (FEAT-11 Phase 2) ──────────────────────────
  // The bridge after encoding: tap word-tiles into order to form a sentence.
  // Rotated into the reading/phonics quest like spell-word but gentler — at most
  // one per session, never first, never two in a row (it's the heavier task).
  // Source is the same sight-word bank (his words) blended with a function-word
  // scaffold inside `buildTheSentence.ts`.
  const sentenceSourceRef = useRef<SentenceSource>({ bankWords: [] })
  const buildSentenceCountRef = useRef(0)
  const lastWasBuildSentenceRef = useRef(false)
  const BUILD_SENTENCE_PER_SESSION_MAX = 1

  // ── Load previous sessions + streak ───────────────────────────

  useEffect(() => {
    if (!activeChildId || !familyId) return

    let cancelled = false

    async function load() {
      try {
        const q = query(
          evaluationSessionsCollection(familyId),
          where('childId', '==', activeChildId),
          where('domain', '==', 'reading'),
          orderBy('evaluatedAt', 'desc'),
        )
        const snap = await getDocs(q)
        if (cancelled) return

        const sessions = snap.docs
          .map((d) => d.data())
          .filter((s) => (s as EvaluationSession & { sessionType?: string }).sessionType === 'interactive')
          .map((s) => ({ evaluatedAt: (s as EvaluationSession).evaluatedAt }))

        setPreviousSessions(sessions)
        setStreak(calculateStreak(sessions))
      } catch (err) {
        console.error('Failed to load quest sessions', err)
      }
    }

    void load()
    return () => { cancelled = true }
  }, [activeChildId, familyId])

  // ── Timer cleanup ──────────────────────────────────────────────

  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current)
    }
  }, [])

  // ── The settled identity every door is bound to ───────────────
  //
  // Declared ABOVE the doors, because each of them names it in a dependency
  // array and that array is evaluated during render.

  /**
   * The scope a Start, a Resume or a recovery write is allowed to act in — the
   * settled identity, as one comparable string.
   */
  const recoveryScopeSettled =
    !childrenLoading &&
    !childrenLoadFailed &&
    Boolean(familyId) &&
    childrenFamilyId === familyId &&
    Boolean(liveChildId) &&
    liveChild?.id === liveChildId
  const recoveryScope = recoveryScopeSettled
    ? questRecoveryScopeKey({ familyId, childId: liveChildId, profile, identityEpoch })
    : 'unsettled'
  /**
   * The scope and epoch this hook most recently COMMITTED.
   *
   * Written in a layout effect, not during render: a render React abandons must
   * not be able to authorise a start or a write, and `MineTripSuggestion` is
   * the same shape for the same reason. A control retained from an older render
   * compares the scope it was drawn under against this.
   */
  const committedScopeRef = useRef<{ scope: string; epoch: number }>({
    scope: recoveryScope,
    epoch: identityEpoch,
  })
  useLayoutEffect(() => {
    committedScopeRef.current = { scope: recoveryScope, epoch: identityEpoch }
  }, [recoveryScope, identityEpoch])
  /**
   * Is the scope a control was RENDERED under still the live one?
   *
   * Two checks, because one is not enough. The committed scope catches an
   * ordinary switch; the raw epoch, read from the STORE rather than from this
   * render's snapshot, catches a same-tick `A → B → A`, which leaves family,
   * child and profile exactly as they were and so leaves the scope string equal
   * to itself. An unsettled scope vouches for nobody and fails both.
   */
  const scopeStillLive = useCallback((renderedScope: string, renderedEpoch: number) => {
    if (renderedScope === 'unsettled') return false
    const committed = committedScopeRef.current
    if (committed.scope !== renderedScope) return false
    if (committed.epoch !== renderedEpoch) return false
    return renderedEpoch === getLibraryIdentityEpoch()
  }, [])

  /**
   * WHO may see the source-save notice, derived at render (UX-494 promotion).
   *
   * The settled status is stored for the attempt that produced it, so a scope
   * that moved mid-flight no longer loses it. Visibility is a separate
   * question, answered against the CURRENT committed family and the authorised
   * viewer — never against the retained scope the attempt was admitted under,
   * which is exactly what a same-family child change (A → B → A) invalidates
   * while the bound summary stays on screen.
   *
   * A notice with no owner is the live view's own in-flight close, already
   * guarded by that close's `live()`; everything else is checked. An
   * unsettled, wrong-family or unauthorised render is told nothing at all.
   *
   * The owning GENERATION is the other half of the question (promotion). A
   * retired view's notice is not the live screen's: a later unanswered run that
   * returns to Intro does not replace the old notice, and showing it there
   * offered a dead partial Retry from the intro that had already been retired.
   * Hiding is all that happens — the settled status and the held payload are
   * left exactly as found, so neither a newer notice nor a different payload is
   * disturbed, and a notice that carries no generation is unaffected.
   */
  const noticeOwner = sourceSave.originalChildId
  const noticeFamily = sourceSave.originalFamilyId
  const noticeGeneration = sourceSave.viewGeneration
  const noticeIsVisible =
    sourceSave.state === 'idle' ||
    // No owner: the live view's own in-flight close, guarded by that close.
    !noticeOwner ||
    ((noticeGeneration === undefined || noticeGeneration === runGenerationRef.current) &&
      recoveryScopeSettled &&
      (!noticeFamily || noticeFamily === familyId) &&
      mayViewerRetryQuestPayload(
        { profile, liveChildId },
        { childId: noticeOwner },
        sourceSave.kind ?? 'partial',
      ))
  const visibleSourceSave: QuestSourceSaveNotice = noticeIsVisible
    ? sourceSave
    : { state: 'idle', canRetry: false }

  /**
   * Does THIS view's source save still owe the child something? (UX-496)
   *
   * The one question a completion exit has to ask, answered synchronously from
   * the published notice rather than from a render's copy of it. Three things
   * make the answer this view's own:
   *
   *   • `kind`. A `partial` notice belongs to a Mine *intro* an earlier exit
   *     landed on, not to the summary asking; it is never this exit's hold.
   *   • `runInstanceId`. A control retained from an older render names the run
   *     it was drawn for, so it cannot be held by a different payload.
   *   • `viewGeneration`. A notice whose view has retired holds nothing — the
   *     same test `visibleSourceSave` uses to decide who may see it.
   *
   * `graphSync` is deliberately absent. A pending or failed MAP update is not
   * an unsaved quest: the answers committed, the projection is recoverable from
   * them after a village return and re-entry, and holding the door for it would
   * be the two successes confused again — the exact defect UX-494 repaired.
   */
  const sourceSaveExitHold = useCallback(
    (expect?: { runInstanceId?: string }): QuestExitHold => {
      const notice = sourceNoticeRef.current
      if (notice.kind === 'partial') return 'clear'
      if (
        expect?.runInstanceId &&
        notice.runInstanceId &&
        expect.runInstanceId !== notice.runInstanceId
      ) {
        return 'clear'
      }
      if (notice.viewGeneration !== undefined && notice.viewGeneration !== runGenerationRef.current) {
        return 'clear'
      }
      switch (notice.state) {
        case 'saving':
          return 'saving'
        case 'failed':
          return 'failed'
        case 'conflict':
          return 'conflict'
        default:
          return 'clear'
      }
    },
    [],
  )

  /**
   * Retire a run that failed before it had a single COUNTED answer (UX-494).
   *
   * `handleSkip`'s friendly no-counted-answers return put the intro back on
   * screen but left the run established — its id, owner, live state and the
   * timer all still in place. Every later Start was then refused as
   * `already-running`, so the intro's own *Try Again* and every mode card went
   * dead until the page was reloaded.
   *
   * It does exactly what an ordinary reset's cleanup does and nothing else: a
   * skipped-only failed start has no counted answers, so there is no partial to
   * save, no minutes to credit and no reward to bank. The caller's friendly
   * error and the intro screen are deliberately left alone.
   *
   * Only the NAMED run is retired, so a late response from a superseded run
   * cannot tear down the session that replaced it. Declared ABOVE the doors
   * because `startQuest` now shares it: a held first question whose scope
   * retires needs the same cleanup, not just its owner refs cleared.
   */
  const retireUnansweredRun = useCallback(
    (run: QuestRun | null) => {
      if (!run || !isLiveRun(runRef.current, run)) return
      // The same bump a reset makes: every callback this run still has in
      // flight stops being allowed to touch this hook's state.
      runGenerationRef.current += 1
      startClaimRef.current = null
      if (timerRef.current) {
        clearInterval(timerRef.current)
        timerRef.current = null
      }
      sessionTimer.stop()
      setQuestState(null)
      setCurrentQuestion(null)
      setAnsweredQuestions([])
      setFindings([])
      setLastAnswer(null)
      setSessionSaved(false)
      sessionSavedRef.current = false
      setSummarizing(false)
      setHitLevelCap(false)
      setFluencyPassages([])
      setFluencyDiamonds(0)
      setCurrentPassageText('')
      conversationRef.current = []
      bonusRoundUsedRef.current = false
      activeQuestModeRef.current = undefined
      sessionIdRef.current = null
      runRef.current = null
      sessionOwnerRef.current = null
    },
    [sessionTimer],
  )

  // ── Start quest ───────────────────────────────────────────────

  const startQuest = useCallback(
    async (
      domain: EvaluationDomain,
      questMode?: QuestMode,
      /**
       * UX-495 — the Mine addition pilot request a SUGGESTED Start carries, or
       * nothing at all.
       *
       * Every ordinary door — a mode card, *Try Again*, the error retry, a
       * parent's start — passes nothing and is byte-for-byte the Start it has
       * always been. A request is not an authorisation: it is revalidated
       * below, after this Start's own reads, by `resolveMineAdditionPilot`.
       */
      pilotRequest?: MineAdditionPilotRequest | null,
    ): Promise<QuestStartOutcome> => {
      /**
       * UX-494 — everything this Start is allowed to trust is captured AT
       * RENDER, in this callback's own closure, and checked against the live
       * identity before anything happens.
       *
       * The child, the child's name and the family came from the retained
       * closure while the scope came from the live ref, so a Start tapped on a
       * card rendered for one boy could pass the scope check and then run for
       * him after the header had moved to his brother. They are one decision:
       * the scope string CONTAINS this render's family and child, so an equal
       * scope is what makes the closure's own identity provably current.
       */
      const renderedScope = recoveryScope
      const renderedEpoch = identityEpoch
      const startingChildId = activeChildId
      const startingChildName = activeChild?.name
      const startingFamilyId = familyId

      // ── Refused BEFORE any read, ref mutation or provider call ──
      if (!startingChildId || !startingChildName || !startingFamilyId) return 'unsettled-scope'
      // A Start must stand on a settled identity; an unsettled one vouches for
      // nobody, and this is the door that spends money.
      if (!scopeStillLive(renderedScope, renderedEpoch)) return 'stale-scope'
      // A Start already in flight owns the claim until it establishes or fails.
      if (startClaimRef.current) return 'busy'
      // And a run already established is not replaced by a second tap. The
      // first-question failure path RELEASES the run below, so the intro's own
      // *Try Again* — a newly rendered control — is still a first-class Start.
      if (runRef.current) return 'already-running'

      const generation = (runGenerationRef.current += 1)
      startClaimRef.current = { generation, scope: renderedScope, kind: 'start' }
      /** Still this Start's claim, and still its scope? */
      const claimHolds = () =>
        startClaimRef.current?.generation === generation &&
        runGenerationRef.current === generation &&
        scopeStillLive(renderedScope, renderedEpoch)
      /** Set once this Start establishes its run, so a failure can release it. */
      let startedInstanceId: string | null = null
      /**
       * Give the claim up. `clearRun` is for a failure AFTER establishment —
       * no question was ever asked and nothing was answered, so there is no run
       * to continue and leaving one behind is what blocked the retry.
       *
       * It RETIRES that attempt rather than clearing three refs (UX-494
       * promotion). Clearing the owner refs left this Start's own view sitting
       * on Loading with its one-second interval still ticking, which is what a
       * first question (or a Fluency passage) held across a retiring scope
       * does — nobody was coming back to clear it. The retirement is the same
       * cleanup an ordinary reset does: timers stopped, live state cleared, the
       * intro back. The caller's error message is left alone.
       *
       * Only an attempt whose exact instance AND generation still own the view
       * is retired, so a held old response cannot tear down the newer run,
       * timer or screen that replaced it.
       */
      const releaseClaim = (clearRun: boolean) => {
        if (startClaimRef.current?.generation === generation) startClaimRef.current = null
        if (!clearRun || !startedInstanceId) return
        const established = runRef.current
        if (established?.instanceId !== startedInstanceId) return
        if (runGenerationRef.current !== generation) return
        retireUnansweredRun(established)
        setScreen(QuestScreen.Intro)
      }

      activeQuestModeRef.current = questMode

      // Determine starting level via workingLevels fallback chain
      let curriculumHint: CurriculumLevelHint | null = null
      let snapshot: Partial<SkillSnapshot> | null = null

      try {
        // Load skill snapshot for workingLevels
        const snapshotRef = doc(skillSnapshotsCollection(startingFamilyId), startingChildId)
        const snapshotSnap = await getDoc(snapshotRef)
        if (snapshotSnap.exists()) {
          snapshot = snapshotSnap.data()
        }
      } catch (err) {
        console.warn('[startQuest] Failed to load skill snapshot for starting level', err)
      }

      // FEAT-54 — pull any concepts the Foundations Review Chat queued for testing
      // (learner-model openQuestions, domain-scoped) as PREFERRED concepts. A
      // seasoning, not the meal: capped, woven at the child's level, never forced.
      // Read-only + best-effort — a missing/failed model just yields zero targets,
      // so the session generates exactly as it does today.
      let targetConcepts: QuestTargetConcept[] = []
      // UX-494 — the exact queued ROWS those targets came from, captured in the
      // same read. Carried on the session document so close can resolve the
      // request it actually selected and nothing appended since.
      let targetPlan: QuestAskPlanRow[] = []
      /**
       * UX-495 — the owner model this Start actually read, kept for the pilot's
       * own revalidation.
       *
       * The same read, not a second one: the pilot decision must be made
       * against the model this run was established from, including the queue
       * that read saw. A missing or failed read leaves this null, which refuses
       * the pilot and changes nothing else.
       */
      let startModel: ResolveMineAdditionPilotInput['model'] = null
      try {
        const modelSnap = await getDoc(
          doc(learnerModelsCollection(startingFamilyId), startingChildId),
        )
        if (modelSnap.exists()) {
          const model = modelSnap.data()
          startModel = model
          targetConcepts = selectQuestTargets(model, { domain })
          targetPlan = captureQuestTargetPlan(
            model,
            targetConcepts.map((t) => t.conceptId),
          )
        }
      } catch (err) {
        console.warn('[startQuest] Failed to load learner model for quest targets', err)
      }

      // Build curriculum hint from activity configs (reading domain only)
      if (domain === 'reading') {
        try {
          let currLevel = 2
          const activityQuery = query(
            activityConfigsCollection(startingFamilyId),
            where('childId', 'in', [startingChildId, 'both']),
            where('type', '==', 'workbook'),
          )
          const activitySnap = await getDocs(activityQuery)
          for (const configDoc of activitySnap.docs) {
            const config = configDoc.data()
            if (config.subjectBucket !== 'Reading' && config.subjectBucket !== 'LanguageArts') continue
            const curriculumMeta = config.curriculumMeta
            if (config.completed || curriculumMeta?.completed) {
              currLevel = Math.max(currLevel, 5)
            }
            const masteredLower = (curriculumMeta?.masteredSkills ?? []).map((s) =>
              s.toLowerCase(),
            )
            const hasVowelTeams = masteredLower.some(
              (s) =>
                s.includes('vowel-team') ||
                s.includes('vowel-digraph') ||
                s.includes('vowel_team') ||
                s === 'vowel-teams-ea-ai-oa-ee-oo',
            )
            const hasDiphthongs = masteredLower.some(
              (s) =>
                s.includes('diphthong') ||
                s.includes('ear') ||
                s.includes('ue') ||
                s === 'diphthongs-ear-ue',
            )
            const hasLeEndings = masteredLower.some(
              (s) =>
                s.includes('final-stable') ||
                s.includes('le-ending') ||
                s.includes('le_ending') ||
                s === 'le-endings',
            )
            const hasRControlled = masteredLower.some(
              (s) => s.includes('r-controlled') || s.includes('r_controlled'),
            )
            const hasMultiSyllable = masteredLower.some(
              (s) => s.includes('multisyllab') || s.includes('multi-syllab'),
            )
            if (hasVowelTeams) currLevel = Math.max(currLevel, 6)
            if (hasDiphthongs || hasLeEndings) currLevel = Math.max(currLevel, 7)
            if (hasRControlled && hasMultiSyllable) currLevel = Math.max(currLevel, 8)
          }
          if (currLevel > 2) {
            curriculumHint = { level: currLevel }
          }
        } catch (err) {
          console.warn('[startQuest] Failed to load curriculum data for starting level', err)
        }
      }

      // The claim, re-checked after every awaited read above. A Start that lost
      // the race — or whose reads straddled a child switch — stops here having
      // written nothing and established nothing, and gives the claim back so the
      // newly rendered card can start properly.
      if (!claimHolds()) {
        releaseClaim(false)
        return 'stale-scope'
      }

      const startLevel = computeStartLevel(snapshot, questMode, curriculumHint)

      /**
       * UX-495 — may this Start carry the one checked addition probe?
       *
       * Decided HERE, synchronously, between the last awaited read and the
       * frozen run, from: the request the suggested Start carried, the scope
       * this Start froze, the level it just computed, the owner model it read,
       * and the existing calibration predicates applied to the owner snapshot
       * it read. The trip is re-read from the store by the host's own verifier.
       *
       * The item is then built and CHECKED. A target with no checked item is
       * dropped entirely — the run is an ordinary calibrated Math run, with no
       * pilot target on its records — which is also what happens for every
       * ordinary door, an uncalibrated or stale child, another mode, another
       * level, a changed synthesis and a queue that arrived while this Start
       * was reading.
       */
      const pilotTarget = resolveMineAdditionPilot({
        request: pilotRequest,
        familyId: startingFamilyId,
        childId: startingChildId,
        domain,
        questMode,
        startLevel,
        model: startModel,
        // The owner snapshot's own stamp, when it carries one: a read that
        // answered for another child cannot calibrate this child's probe.
        snapshotChildId: typeof snapshot?.childId === 'string' ? snapshot.childId : undefined,
        readingCalibrated: hasReadingCalibration(snapshot as SkillSnapshot | null),
        mathCalibrated: hasMathCalibration(snapshot as SkillSnapshot | null),
      })
      const probeQuestion = pilotTarget ? buildMineAdditionProbeQuestion(pilotTarget) : null
      const acceptedPilot = probeQuestion ? pilotTarget : null

      const now = new Date().toISOString()
      const initialState: QuestState = {
        currentLevel: startLevel,
        consecutiveCorrect: 0,
        consecutiveWrong: 0,
        levelDownsInARow: 0,
        wrongAtFloor: 0,
        totalQuestions: 0,
        totalCorrect: 0,
        questionsThisLevel: 0,
        startedAt: now,
        elapsedSeconds: 0,
      }

      activeDomainRef.current = domain
      setStartQuestError(null)
      setHitLevelCap(false)
      setQuestState(initialState)
      setAnsweredQuestions([])
      setFindings([])
      setCurrentQuestion(null)
      setLastAnswer(null)
      setSessionSaved(false)
      sessionSavedRef.current = false
      setFluencyPassages([])
      setFluencyDiamonds(0)
      setCurrentPassageText('')
      conversationRef.current = []
      bonusRoundUsedRef.current = false
      // A new run clears the last one's save notice — unless a payload is still
      // held unsaved, whose retry is the only thing that can still land it.
      if (!pendingSourceRef.current) publishSourceSave({ state: 'idle', canRetry: false })
      setGraphSync({ state: 'idle' })
      // UX-339 — capture the owner in the same breath as the session identity.
      // From here every write in this session resolves through it, including
      // the per-answer diamonds banked while the quest is still running.
      sessionOwnerRef.current = { childId: startingChildId, childName: startingChildName }
      // Establish the session identity up front so per-answer reward banking has a
      // stable doc id to dedup against (endSession / resetToIntro reuse it).
      const runStamp = nextRunStamp(lastRunStampRef.current, Date.now())
      lastRunStampRef.current = runStamp
      const newRunId = buildQuestRunId(startingChildId, runStamp)
      sessionIdRef.current = newRunId
      // UX-494 — and the frozen run, in the same breath. Every finalizing write
      // resolves through this and never through the refs beside it.
      startedInstanceId = questRunInstanceId(newRunId, (runInstanceSeqRef.current += 1))
      runRef.current = {
        runId: newRunId,
        instanceId: startedInstanceId,
        familyId: startingFamilyId,
        childId: startingChildId,
        childName: startingChildName,
        domain,
        questMode,
        targetPlan,
        // UX-495 — frozen with the rest of the run, or absent. `undefined`
        // rather than `null` so the payload scrubber drops the field entirely
        // for every ordinary run.
        pilotProbe: acceptedPilot ?? undefined,
        startedAt: now,
      }
      // The FLUENCY close's own once-per-session hours flag. The interactive
      // close keys its own on the run id and never touches this one.
      hoursLoggedRef.current = false
      // ── Spell-the-word: reset per-session bookkeeping + load the word bank ──
      // Only the reading/phonics surface mixes in spell-word (encoding lives in
      // reading); other domains leave the source empty so injection never fires.
      spellWordCountRef.current = 0
      lastWasSpellWordRef.current = false
      spellWordSourceRef.current = { sightWords: [] }
      // Build-the-sentence shares the reading/phonics surface + the same bank.
      buildSentenceCountRef.current = 0
      lastWasBuildSentenceRef.current = false
      sentenceSourceRef.current = { bankWords: [] }
      if (domain === 'reading' && questMode === 'phonics') {
        // Fire-and-forget: the bank is needed mid-session, not at the first
        // question, so this never blocks the start. Both spell-word and
        // build-sentence have built-in fallbacks (phonics frontier / a curated
        // function-word scaffold), so an empty/failed bank still yields questions.
        void (async () => {
          try {
            const snap = await getDocs(query(sightWordProgressCollection(startingFamilyId)))
            const sightWords: string[] = []
            for (const d of snap.docs) {
              if (!d.id.startsWith(`${startingChildId}_`)) continue
              const data = d.data() as { word?: string; masteryLevel?: string }
              // Words he can already READ — the read/spell asymmetry we're closing.
              if (data.masteryLevel === 'familiar' || data.masteryLevel === 'mastered') {
                if (data.word) sightWords.push(String(data.word).toLowerCase())
              }
            }
            spellWordSourceRef.current = { sightWords }
            // Sentence-building blends the same words he's met into content slots.
            sentenceSourceRef.current = { bankWords: sightWords }
          } catch (err) {
            console.warn('[Quest] Failed to load sight-word bank for writing practice', err)
          }
        })()
      }
      sessionTimer.startTimer()

      // Fluency mode has a different flow
      if (questMode === 'fluency') {
        setScreen(QuestScreen.Loading)
        try {
          const fluencyMessage: AIChatMessage = {
            role: 'user',
            content: JSON.stringify({
              action: 'fluency_passage',
              domain,
              questMode: 'fluency',
              childName: startingChildName,
            }),
          }
          conversationRef.current = [fluencyMessage]

          const response = await chat({
            familyId: startingFamilyId,
            childId: startingChildId,
            taskType: TaskType.Quest,
            messages: [fluencyMessage],
            domain,
          })

          // A passage that arrives after another run has taken over — or after
          // the scope moved — belongs to nobody: it must not become the live
          // question or clear the new run's loading screen.
          if (!claimHolds()) {
            releaseClaim(true)
            return 'stale-scope'
          }

          if (!response) {
            setStartQuestError('Failed to generate passage. Tap to try again!')
            setScreen(QuestScreen.Intro)
            releaseClaim(true)
            return 'failed'
          }

          conversationRef.current.push({ role: 'assistant', content: response.message })
          const parsed = parseFluencyPassage(response.message)
          if (!parsed) {
            setStartQuestError('Passage was unreadable. Tap to try again!')
            setScreen(QuestScreen.Intro)
            releaseClaim(true)
            return 'failed'
          }

          setCurrentPassageText(parsed.passage)
          setCurrentPassageTargetWords(parsed.targetWords || [])
          setCurrentPassageSpeechWords(parsed.speechWords || [])
          setCurrentPassageWordCount(parsed.wordCount || 0)
          setCurrentPassageReadingLevel(parsed.readingLevel || '')

          // Start timer
          if (timerRef.current) clearInterval(timerRef.current)
          const startTime = Date.now()
          timerRef.current = setInterval(() => {
            setQuestState((prev) => {
              if (!prev) return prev
              return { ...prev, elapsedSeconds: Math.floor((Date.now() - startTime) / 1000) }
            })
          }, 1000)

          setScreen(QuestScreen.FluencyPassage)
          // Established and running: the claim's work is done.
          startClaimRef.current = null
          return 'started'
        } catch (err) {
          const errMsg = err instanceof Error ? err.message : String(err)
          if (!claimHolds()) {
            releaseClaim(true)
            return 'stale-scope'
          }
          setStartQuestError(`Fluency failed: ${errMsg}`)
          setScreen(QuestScreen.Intro)
          releaseClaim(true)
          return 'failed'
        }
      }

      setScreen(QuestScreen.Loading)

      // Start timer
      if (timerRef.current) clearInterval(timerRef.current)
      const startTime = Date.now()
      timerRef.current = setInterval(() => {
        setQuestState((prev) => {
          if (!prev) return prev
          return { ...prev, elapsedSeconds: Math.floor((Date.now() - startTime) / 1000) }
        })
      }, 1000)

      // Build first message
      const userMessage: AIChatMessage = {
        role: 'user',
        content: JSON.stringify({
          action: 'start_quest',
          domain,
          questMode: questMode || (domain === 'reading' ? 'phonics' : domain),
          childName: startingChildName,
          currentLevel: initialState.currentLevel,
          consecutiveCorrect: 0,
          consecutiveWrong: 0,
          totalQuestions: 0,
          totalCorrect: 0,
          // FEAT-54 — preferred concepts (queued by the Review Chat) for the CF to
          // weave in at the child's level. Omitted from the payload when empty.
          ...(targetConcepts.length > 0 ? { targetConcepts } : {}),
        }),
      }
      conversationRef.current = [userMessage]

      /**
       * UX-495 — the pilot's one checked item takes the opening slot.
       *
       * No provider call is made for it, exactly as the existing client-side
       * spell-word and build-sentence injections make none for theirs. The
       * conversation keeps this session's opening request and records the item
       * that was actually asked as the assistant turn, so the next question's
       * provider call has accurate context and alternating roles.
       *
       * Everything after this is the ordinary session: the normal question
       * input and feedback, the normal scoring and adaptation, the normal
       * timer, and the normal save and close.
       */
      if (probeQuestion) {
        conversationRef.current = [
          userMessage,
          { role: 'assistant', content: mineAdditionProbeAssistantTurn(probeQuestion) },
        ]
        setCurrentQuestion(probeQuestion)
        questionStartRef.current = Date.now()
        setScreen(QuestScreen.Question)
        // Established and running.
        startClaimRef.current = null
        return 'started'
      }

      // Timeout: if AI takes >30s, bail out with a message
      let timedOut = false
      const timeoutId = setTimeout(() => {
        timedOut = true
      }, 30_000)

      let response: Awaited<ReturnType<typeof chat>>
      try {
        response = await chat({
          familyId: startingFamilyId,
          childId: startingChildId,
          taskType: TaskType.Quest,
          messages: [userMessage],
          domain,
        })
      } catch (err) {
        clearTimeout(timeoutId)
        const errMsg = err instanceof Error ? err.message : String(err)
        console.error('[startQuest] AI call threw:', err)
        if (!claimHolds()) {
          releaseClaim(true)
          return 'stale-scope'
        }
        setStartQuestError(`Quest failed: ${errMsg}`)
        setScreen(QuestScreen.Intro)
        if (timerRef.current) clearInterval(timerRef.current)
        releaseClaim(true)
        return 'failed'
      }

      clearTimeout(timeoutId)

      // The first question of a run nobody is on any more goes nowhere — and
      // neither does the pending initialization behind it.
      if (!claimHolds()) {
        releaseClaim(true)
        return 'stale-scope'
      }

      if (!response || timedOut) {
        // aiError from useAI contains the real Cloud Function error
        const realError = aiError?.message || (timedOut ? 'Request timed out' : 'No response from AI service')
        console.error('[startQuest] AI call returned null or timed out. aiError:', aiError)
        setStartQuestError(`Quest failed: ${realError}`)
        setScreen(QuestScreen.Intro)
        if (timerRef.current) clearInterval(timerRef.current)
        releaseClaim(true)
        return 'failed'
      }

      console.log('[startQuest] AI response received:', response.message.substring(0, 300))

      conversationRef.current.push({ role: 'assistant', content: response.message })

      let question = parseQuestBlock(response.message)
      if (question) {
        question = validateQuestion(question)
      }
      if (!question) {
        console.error('[startQuest] parseQuestBlock returned null or validation failed. Response:', response.message.substring(0, 500))
        setStartQuestError('Quest response was unreadable. Tap to try again!')
        setScreen(QuestScreen.Intro)
        if (timerRef.current) clearInterval(timerRef.current)
        releaseClaim(true)
        return 'failed'
      }

      const finding = extractQuestFinding(response.message)
      if (finding) {
        setFindings((prev) => [...prev, finding])
      }

      setCurrentQuestion(question)
      questionStartRef.current = Date.now()
      setScreen(QuestScreen.Question)
      // Established and running.
      startClaimRef.current = null
      return 'started'
    },
    [
      activeChildId,
      activeChild,
      familyId,
      chat,
      aiError,
      sessionTimer,
      recoveryScope,
      identityEpoch,
      scopeStillLive,
      retireUnansweredRun,
      publishSourceSave,
    ],
  )

  // ── Per-answer reward banking ─────────────────────────────────
  // Bank one correct answer's reward (1 diamond + XP) immediately, deduped
  // through the xpLedger by a per-answer key. Called live from submitAnswer so
  // mid-session progress is durable (partials count by construction), and again
  // as an idempotent backfill at endSession — the matching key guarantees a
  // diamond is never awarded twice across the two paths.
  // UX-494 — it takes the RUN, not a loose id + domain, so the reward keys, the
  // child and the domain cannot come from three different sessions. The amounts,
  // the key shape and the per-correct rate are untouched.
  const bankAnswerReward = useCallback(
    (run: QuestRun, index: number) => {
      if (!run.familyId || !run.childId) return
      // 1 diamond (spendable) — this is what fills the bag as it's mined.
      void addDiamondEvent({
        familyId: run.familyId,
        childId: run.childId,
        amount: 1,
        type: DIAMOND_EVENTS.QUEST_COMPLETE,
        reason: `Quest: ${run.domain} (correct answer)`,
        dedupKey: perAnswerDiamondKey(run.runId, index),
      }).catch((err) => console.warn('Failed to bank quest diamond', err))
      // XP toward armor progression (kept identical per-correct rate).
      void addXpEvent(
        run.familyId,
        run.childId,
        'QUEST_DIAMOND',
        XP_PER_DIAMOND,
        perAnswerXpKey(run.runId, index),
        { domain: run.domain },
      ).catch((err) => console.warn('Failed to bank quest diamond XP', err))
    },
    [],
  )

  // ── Graph projection (and its retry) ──────────────────────────
  //
  // One lane for both doors: the close that follows an acknowledged save, and
  // the scoped retry the Mine offers for a source still stamped `pending`. Both
  // read the SAVED source, so the retry needs nothing from memory.
  //
  // `claim` is what keeps a delayed run out of a newer run's UI: the write is
  // the delayed run's business and happens either way, the screen is not.

  const projectGraph = useCallback(
    async (
      target: {
        familyId: string
        childId: string
        sessionId: string
        expectedDomain?: string
        expectedQuestMode?: string
      },
      /** May this attempt touch the screen? Checked again after the await. */
      claim: () => boolean = () => true,
    ): Promise<QuestProjectionOutcome | 'failed'> => {
      if (claim()) {
        setGraphSync({ state: 'running', sessionId: target.sessionId, childId: target.childId })
      }
      try {
        const outcome = await projectQuestSourceToModel({
          ...target,
          nowIso: new Date().toISOString(),
        })
        if (claim()) {
          setGraphSync({
            state: projectionReachedGraph(outcome) ? 'reached' : 'skipped',
            outcome,
            sessionId: target.sessionId,
            childId: target.childId,
          })
        }
        return outcome
      } catch (err) {
        // The transaction rolled back, so nothing half-landed and the source is
        // still `pending` — which IS the recoverable state the Mine's pending
        // query reads. There is no separate failure stamp to write, and no raw
        // provider error to persist onto a child's record.
        console.warn('[quest] Failed to project quest source onto learner model', err)
        if (claim()) {
          setGraphSync({ state: 'failed', sessionId: target.sessionId, childId: target.childId })
        }
        return 'failed'
      }
    },
    [],
  )

  /**
   * The scoped graph retry, for the summary and for the Mine's recovery card.
   *
   * Bound to the scope it was TAPPED in: the caller passes the scope key its
   * control was rendered under, the write is refused unless that is still the
   * settled scope, and the UI is updated only if it still is after the await. So
   * a control retained across a child switch (or an A → B → A) cannot write for
   * the wrong child or report into the wrong view. It repeats no completion side
   * effect — the only thing it does is the projection.
   */
  const retryGraphProjection = useCallback(
    async (
      sessionId: string,
      childId: string,
      expect?: {
        domain?: string
        questMode?: string
        /** The scope the control was RENDERED under. */
        scopeKey?: string
        /** The epoch it was rendered under — the same-tick `A → B → A` catch. */
        epoch?: number
        /**
         * The view it was RENDERED in. Scope alone cannot answer this: two
         * consecutive summaries for the SAME child share a scope, and an old
         * summary's settled retry used to relabel the new one's map status.
         * Captured at render, not at the tap, because at the tap the live value
         * is already the newer view's.
         */
        viewGeneration?: number
      },
    ): Promise<QuestProjectionOutcome | 'failed' | 'identity-mismatch' | 'busy'> => {
      const renderedScope = expect?.scopeKey ?? recoveryScope
      const renderedEpoch = expect?.epoch ?? identityEpoch
      const viewGeneration = expect?.viewGeneration ?? runGenerationRef.current
      if (!scopeStillLive(renderedScope, renderedEpoch)) return 'identity-mismatch'
      if (runGenerationRef.current !== viewGeneration) return 'identity-mismatch'
      if (!mayRecoverQuestSource({ familyId, childId: liveChildId }, { familyId, childId })) {
        return 'identity-mismatch'
      }
      if (graphRetryInFlightRef.current) return 'busy'
      graphRetryInFlightRef.current = true
      try {
        return await projectGraph(
          {
            familyId,
            childId,
            sessionId,
            expectedDomain: expect?.domain,
            expectedQuestMode: expect?.questMode,
          },
          () =>
            runGenerationRef.current === viewGeneration &&
            scopeStillLive(renderedScope, renderedEpoch),
        )
      } finally {
        graphRetryInFlightRef.current = false
      }
    },
    [familyId, liveChildId, projectGraph, recoveryScope, identityEpoch, scopeStillLive],
  )

  /**
   * Retry the held payload — the source retry its owning view offers.
   *
   * In memory, and deliberately so: before the first acknowledgement there is no
   * saved document to recover from, and a new local store for unsaved answers is
   * outside this repair. It writes the SAME payload under the SAME id, so a
   * first attempt that actually committed and lost its acknowledgement is
   * recognised rather than written twice; it runs the graph projection
   * afterwards only when the saved source is eligible, and nothing else, so no
   * AI summary, reward, hours or snapshot side effect is repeated.
   *
   * Two separate questions, deliberately. WHICH payload is selected by the
   * original run instance and view generation the control was rendered for, so
   * a retained control cannot pick up a different one. WHETHER it may write is
   * the current committed family, a settled view, and the scope and epoch THIS
   * button was rendered under — never the close's, which a same-family child
   * change moves while the summary stays bound to its owner (UX-339). The
   * captured run is used only for the write itself and the one graph projection
   * that may follow it.
   */
  const retrySourceSave = useCallback(
    async (expect?: {
      runInstanceId?: string
      viewGeneration?: number
      /** The scope the control was RENDERED under — this render's, not the close's. */
      scopeKey?: string
      epoch?: number
    }) => {
      const pending = pendingSourceRef.current
      if (!pending) return 'nothing-pending' as const
      const { run, payload, kind, viewGeneration } = pending

      // ── The control that tapped has to be THIS payload's own ──
      // A retained control cannot pick up a different held payload, and a
      // control drawn for an older view cannot act for the current one. The
      // ORIGINAL run instance and view generation are what SELECT the payload —
      // never the child, which is the payload's own (UX-339).
      if (expect?.runInstanceId && expect.runInstanceId !== run.instanceId) {
        return 'identity-mismatch' as const
      }
      if (expect?.viewGeneration !== undefined && expect.viewGeneration !== viewGeneration) {
        return 'identity-mismatch' as const
      }
      if (runGenerationRef.current !== viewGeneration) return 'identity-mismatch' as const
      /**
       * And the BUTTON has to be a current one.
       *
       * Checked against the scope and epoch this control was rendered under,
       * not against the scope the close happened in. A summary stays bound to
       * its owner across a same-family child change (UX-339) — the parent can
       * be looking at his brother's chip while these answers are still on
       * screen — so pinning authorisation to the old close's child and epoch
       * made the Retry on that retained summary dead, including after a switch
       * back. A retained PRIOR button still fails closed: it carries the scope
       * and epoch of the render it was drawn in, and neither is the live one.
       */
      const renderedScope = expect?.scopeKey ?? recoveryScope
      const renderedEpoch = expect?.epoch ?? identityEpoch
      if (!scopeStillLive(renderedScope, renderedEpoch)) {
        return 'identity-mismatch' as const
      }
      // The authorised owner: a payload is never written into a family nobody
      // is authorised for. The child is the payload's own (UX-339).
      if (!mayRetrySavingQuestPayload({ familyId }, run)) {
        return 'identity-mismatch' as const
      }
      /**
       * And the VIEWER has to be authorised for this run.
       *
       * The two checks above are about the retained render; this one is about
       * who is actually looking. A freshly mounted sibling child profile has a
       * current scope and a current epoch of its own, so it passes both — and
       * must still not be able to save the original owner's held answers.
       */
      // For a `partial` this also refuses a parent sitting on a sibling's
      // intro: that notice is not bound to a view of its own.
      if (!mayViewerRetryQuestPayload({ profile, liveChildId }, run, kind)) {
        return 'identity-mismatch' as const
      }
      if (sourceRetryInFlightRef.current) return 'busy' as const
      sourceRetryInFlightRef.current = true

      /**
       * May this attempt report? Decided BEFORE the held payload is cleared,
       * and re-asked for every status and graph change: an accepted write
       * settles for its ORIGINAL source whatever the screen is doing now, but a
       * newer same-child summary's labels, refs and controls are not its to
       * move. The view is identified by its generation; the identity is the one
       * the tap was authorised under, so a scope that moves mid-await reports
       * nowhere.
       */
      const ownsView = () =>
        runGenerationRef.current === viewGeneration &&
        // `scopeStillLive`, not a bare `committedScopeRef` comparison: a raw
        // epoch move the committed ref has not caught up with yet must not let
        // this attempt report into a view that is already retired.
        scopeStillLive(renderedScope, renderedEpoch)

      /**
       * This attempt's own status (UX-494 promotion).
       *
       * The settlement is NOT gated on the rendered scope. A parent who
       * switches child while an admitted Retry is in flight retires that
       * render, and dropping the result left the bound summary — which UX-339
       * keeps on screen — saying *Saving…* with no way back. The status is
       * stored for this exact attempt instead, and WHO may see it is derived
       * from the live identity in `visibleSourceSave`.
       *
       * It still cannot overwrite a newer run or a different held payload: the
       * notice on screen has to carry this attempt's own id, which a newer
       * close, reset, Resume or second Retry has already replaced.
       */
      const attemptId = `${run.instanceId}#${(sourceAttemptSeqRef.current += 1)}`
      /**
       * Settle this attempt, and say whether it actually did.
       *
       * BOTH halves of the owning identity are required: the exact attempt id,
       * and the generation of the view that owns it. The attempt id alone said
       * yes for a generation that had already retired — a later unanswered run
       * going back to Intro leaves the old notice in place — and reporting into
       * it put a dead partial Retry on the retired intro. A refused settlement
       * changes nothing: the notice on screen, whatever it is, and the held
       * payload are both left as found.
       */
      const settle = (next: Omit<QuestSourceSaveNotice, 'attemptId' | 'viewGeneration'>) => {
        if (sourceNoticeAttemptRef.current !== attemptId) return false
        if (runGenerationRef.current !== viewGeneration) return false
        publishSourceSave({ ...next, viewGeneration, attemptId })
        return true
      }
      // Admitted: the checks above are exactly `ownsView`, so this attempt owns
      // the notice from here until something newer takes it.
      publishSourceSave({
        state: 'saving',
        kind,
        canRetry: false,
        runInstanceId: run.instanceId,
        viewGeneration,
        originalChildId: run.childId,
        originalFamilyId: run.familyId,
        attemptId,
      })

      try {
        let outcome: QuestSourceSaveOutcome | 'failed'
        try {
          outcome =
            kind === 'final'
              ? await saveFinalQuestSource(questSourceRef(run.familyId, run.runId), payload)
              : (await saveResumableQuestSource(
                    questSourceRef(run.familyId, run.runId),
                    payload,
                  )) === 'saved'
                ? 'saved'
                : 'conflict'
        } catch (err) {
          console.error('Failed to save quest session on retry', err)
          outcome = 'failed'
        }

        // `mayReport` is still the LIVE view's own business — the screen's
        // saved flag and the intro's re-read belong to whoever is on it now.
        // The attempt's own status settles either way, just above.
        const mayReport = ownsView()
        const owner = { originalChildId: run.childId, originalFamilyId: run.familyId }
        if (outcome === 'saved' || outcome === 'already-committed' || outcome === 'conflict') {
          if (pendingSourceRef.current?.run.instanceId === run.instanceId) {
            pendingSourceRef.current = null
          }
        }

        if (outcome === 'failed') {
          // The payload is still held, so a freshly rendered Retry on the
          // owning view is actionable again — including after a switch away
          // and back.
          settle({
            state: 'failed',
            kind,
            canRetry: true,
            runInstanceId: run.instanceId,
            ...owner,
          })
          return outcome
        }
        if (outcome === 'conflict') {
          settle({ state: 'conflict', kind, canRetry: false, ...owner })
          return outcome
        }

        // It landed: this payload's own view says Saved, whatever the header
        // did while it was in flight.
        const settled = settle({ state: 'saved', kind, canRetry: false, ...owner })
        // The screen's saved flag and the graph UI stay with whoever is on the
        // authorised original view.
        if (mayReport) setSessionSaved(true)
        /**
         * The intro's one-more-read is asked for on the OWNING GENERATION
         * (promotion), not on `mayReport`.
         *
         * An `A → B → A` after the exit retires the epoch `ownsView` checks,
         * while the intro that owns this partial is still the same generation —
         * and its Resume query had already read before this write landed, so
         * dropping the read left the acknowledged partial unresumable without a
         * navigation. `settled` is exactly that test: this attempt's own notice
         * is still published and its generation still live, so a newer
         * generation is never refreshed. The page's own scoped query still
         * decides which records it may read and render.
         */
        if (kind === 'partial' && settled) setResumeReloadNonce((n) => n + 1)
        // Only a final, eligible source reaches the graph. A partial, and a
        // complete source with no selected request, make no attempt at all.
        if (kind === 'final' && payload.modelProjection === 'pending') {
          await projectGraph(
            {
              familyId: run.familyId,
              childId: run.childId,
              sessionId: run.runId,
              expectedDomain: run.domain,
              expectedQuestMode: run.questMode,
            },
            ownsView,
          )
        } else if (ownsView()) {
          setGraphSync({ state: 'skipped', sessionId: run.runId, childId: run.childId })
        }
        return outcome
      } finally {
        sourceRetryInFlightRef.current = false
      }
    },
    [
      familyId,
      liveChildId,
      profile,
      projectGraph,
      publishSourceSave,
      recoveryScope,
      identityEpoch,
      scopeStillLive,
    ],
  )

  // ── End session ───────────────────────────────────────────────

  const endSession = useCallback(
    async (
      questions: SessionQuestion[],
      finalState: QuestState,
      timedOut: boolean,
    ) => {
      // ── UX-494: freeze the run, and admit the close once ────
      //
      // Everything this function writes is decided HERE, before the first
      // await, from one object. After the AI summary returns, the refs beside
      // `runRef` may belong to a newer session (the owner's own reproduction:
      // hold a Math summary, tap *Try another quest*, Start Phonics) — and this
      // close must still finish Math's record under Math's own id and mode.
      const run = runRef.current
      if (!run) return
      if (closedRunsRef.current.has(run.runId)) return
      closedRunsRef.current.add(run.runId)
      /** Is this still the session on screen? Guards UI, never the writes. */
      const live = () => isLiveRun(runRef.current, run)
      /** The view this close owns. */
      const closeViewGeneration = runGenerationRef.current
      const docId = run.runId
      /**
       * This run's own active minutes, read WITHOUT stopping the shared timer.
       * `useSessionTimer.startTimer` replaces its timer instance, so a newer
       * session owns the live one: a delayed close calling `stop()` would read
       * the newer run's seconds and kill its timer. The ordinary close is still
       * the ordinary `stop()` below — byte-identical arithmetic — and only a
       * superseded close falls back to this reading.
       */
      const frozenActiveSeconds = sessionTimer.getCurrentSeconds()

      // Lock out resetToIntro's partial-save path immediately — the Done button
      // is visible as soon as Summary renders, but setSessionSaved(true) doesn't
      // fire until after the AI summary awaits complete.
      sessionSavedRef.current = true

      // Stop timer
      if (timerRef.current) {
        clearInterval(timerRef.current)
        timerRef.current = null
      }

      setScreen(QuestScreen.Summary)
      setSummarizing(true)
      /**
       * This close's own identity rides on every notice it publishes
       * (promotion): the original child and family, and the generation of the
       * view it closed. One derived visibility rule then applies to Saving,
       * Saved, Conflict and Failed alike, instead of only to the Failed notice
       * that happened to carry an owner.
       */
      const closeNoticeOwner = {
        runInstanceId: run.instanceId,
        viewGeneration: closeViewGeneration,
        originalChildId: run.childId,
        originalFamilyId: run.familyId,
      }
      publishSourceSave({ state: 'saving', kind: 'final', canRetry: false, ...closeNoticeOwner })
      setGraphSync({ state: 'pending', sessionId: docId, childId: run.childId })

      // Calculate streak (including this session)
      const todayStr = getDateString(new Date())
      const sessionsIncludingToday = [
        { evaluatedAt: todayStr },
        ...previousSessions,
      ]
      const newStreak = calculateStreak(sessionsIncludingToday)
      setStreak(newStreak)

      // FEAT-11: writing seeding findings from the spell-the-word (spelling) and
      // build-the-sentence (sentence) questions this session. Emerging/not-yet
      // only — mastery is NEVER asserted inline here; the conservative
      // masteryRollup decides it later through the central writer. Spelling and
      // sentence carry distinct tags so they stay separable signals.
      const spellingFindings = deriveSpellingFindings(questions)
      const sentenceFindings = deriveSentenceFindings(questions)
      const writingFindings = [...spellingFindings, ...sentenceFindings]

      // Request AI-generated summary
      const domain = run.domain
      let summaryText = `Interactive ${domain} quest: ${finalState.totalCorrect}/${finalState.totalQuestions} correct, reached level ${finalState.currentLevel}`
      let sessionRecommendations: EvaluationSession['recommendations'] = []

      try {
        const summaryMessage: AIChatMessage = {
          role: 'user',
          content: JSON.stringify({
            action: 'summarize_session',
            questions,
            findings,
            finalLevel: finalState.currentLevel,
            totalCorrect: finalState.totalCorrect,
            totalQuestions: finalState.totalQuestions,
            domain,
          }),
        }

        const summaryResponse = await chat({
          familyId: run.familyId,
          childId: run.childId,
          taskType: TaskType.Quest,
          messages: [...conversationRef.current, summaryMessage],
          domain,
        })

        if (summaryResponse) {
          const parsed = parseQuestSummaryBlock(summaryResponse.message)
          if (parsed) {
            summaryText = parsed.summary
            if (parsed.frontier) {
              summaryText += ` Frontier: ${parsed.frontier}`
            }
            sessionRecommendations = (parsed.recommendations || []).map((r, i) => ({
              priority: r.priority ?? i + 1,
              skill: r.skill || '',
              action: r.action || '',
              duration: r.duration || '',
              frequency: r.frequency || '',
            }))
          }
        }
      } catch (err) {
        console.warn('Failed to generate AI quest summary, using fallback', err)
      } finally {
        // A summary that lands after a newer session started must not clear that
        // session's own spinner.
        if (live()) setSummarizing(false)
      }

      // Fallback: generate client-side recommendations if AI didn't produce any
      if (sessionRecommendations.length === 0 && findings.length > 0) {
        sessionRecommendations = generateFallbackRecommendations(findings, finalState.currentLevel, domain)
      }

      // Fallback: generate level-based recommendation even with no findings
      if (sessionRecommendations.length === 0) {
        sessionRecommendations = generateFallbackRecommendations([], finalState.currentLevel, domain)
      }

      // Conservative completion gate: only a session with enough answered signal
      // moves working levels / the snapshot and earns the completion bonus. A
      // short bail still persists (marked 'partial'), banks its diamonds, and
      // counts toward hours — it just never moves his level or the foundation map.
      const sufficient = hasSufficientCompletion(questions)
      const questMode = run.questMode

      // ── The one immutable final payload (UX-494) ──────────
      const payload = finalizedQuestSourcePayload({
        run,
        questions,
        finalState,
        timedOut,
        findings: [...findings, ...writingFindings],
        recommendations: sessionRecommendations,
        summary: summaryText,
        streakDays: newStreak.currentStreak,
        sufficient,
        nowIso: new Date().toISOString(),
      })

      // Conditional, under the run's ORIGINAL id. It recognises its own already
      // committed payload (an acknowledgement lost in flight is a success that
      // writes nothing) and preserves a conflicting finalized source rather than
      // overwriting it.
      let saveOutcome: QuestSourceSaveOutcome | 'failed'
      try {
        saveOutcome = await saveFinalQuestSource(questSourceRef(run.familyId, docId), payload)
      } catch (err) {
        console.error('Failed to save quest session', err)
        saveOutcome = 'failed'
      }

      // The held payload belongs to ONE run — the one whose summary is on screen
      // — so a delayed close neither clears another run's pending retry nor
      // installs a payload no surface can offer.
      const clearPendingIfMine = () => {
        if (pendingSourceRef.current?.run.instanceId === run.instanceId) {
          pendingSourceRef.current = null
        }
      }
      const sourceCommitted = saveOutcome === 'saved' || saveOutcome === 'already-committed'
      if (sourceCommitted) {
        clearPendingIfMine()
        if (live()) {
          setSessionSaved(true)
          publishSourceSave({
            state: 'saved',
            kind: 'final',
            canRetry: false,
            ...closeNoticeOwner,
          })
        }
      } else if (saveOutcome === 'conflict') {
        clearPendingIfMine()
        if (live()) {
          publishSourceSave({
            state: 'conflict',
            kind: 'final',
            canRetry: false,
            ...closeNoticeOwner,
          })
        }
      } else if (live()) {
        // Held in memory so this summary can offer a real retry of THIS payload.
        pendingSourceRef.current = {
          run,
          payload,
          kind: 'final',
          viewGeneration: closeViewGeneration,
        }
        publishSourceSave({
          state: 'failed',
          kind: 'final',
          canRetry: true,
          ...closeNoticeOwner,
        })
      }

      // FEAT-54 / UX-494 — fold the queued preferred-concept results back into
      // the learner model, FROM THE SAVED SOURCE and only once it is an
      // acknowledged, sufficient, complete record with a selected request. A
      // denied save produces zero graph changes; an insufficient close stays a
      // preserved partial with its request still waiting; and an ordinary
      // untagged quest makes no attempt at all, so nothing ever offers it a
      // retry. Never blocks close; the snapshot / findings pipeline is untouched.
      if (sourceCommitted && payload.modelProjection === 'pending') {
        void projectGraph(
          {
            familyId: run.familyId,
            childId: run.childId,
            sessionId: docId,
            expectedDomain: run.domain,
            expectedQuestMode: run.questMode,
          },
          live,
        )
      } else if (live()) {
        setGraphSync({
          state: 'skipped',
          sessionId: docId,
          childId: run.childId,
        })
      }

      // Log instructional hours (idle-aware timer). Per RUN, so a delayed close
      // still logs its own minutes and cannot be credited twice. It deliberately
      // does NOT set the shared `hoursLoggedRef`, which belongs to the fluency
      // close: a superseded interactive close used to set it and silently
      // suppress the fluency session's own hours row.
      if (!hoursLoggedRunsRef.current.has(run.runId)) {
        hoursLoggedRunsRef.current.add(run.runId)
        const activeSeconds = live() ? sessionTimer.stop() : frozenActiveSeconds
        const minutes = Math.ceil(activeSeconds / 60 / 5) * 5
        if (minutes >= 5) {
          addDoc(hoursCollection(run.familyId), {
            childId: run.childId,
            date: todayKey(),
            minutes,
            subjectBucket: domainToSubjectBucket(domain),
            quickCapture: true,
            notes: `${questMode || domain} quest session`,
            source: 'knowledge-mine',
          }).catch((err) => console.error('[SessionTimer] Failed to log quest hours:', err))
        }
      }

      // Award XP/diamonds via addXpEvent/addDiamondEvent (deduped, avatar-profile
      // update + armor unlocks handled inside).
      // 1) Per-answer reward backfill — each correct answer was already banked
      //    live in submitAnswer (1 diamond + XP, deduped by the same per-answer
      //    keys). Re-bank idempotently here so a dropped live write, or a session
      //    resumed under this doc id, still lands every diamond exactly once.
      //    Never double-awards: the keys match the live path.
      for (const idx of correctAnswerIndices(questions)) {
        bankAnswerReward(run, idx)
      }

      // 2) Quest completion bonus (flat 15 XP) — a real, sufficiently-complete
      //    session only. A short partial banks its diamonds but earns no
      //    completion bonus (it didn't complete a quest).
      if (sufficient) {
        addXpEvent(
          run.familyId,
          run.childId,
          'QUEST_COMPLETE',
          15,
          `quest-complete_${docId}`,
          { domain },
        ).catch((err) => console.warn('Failed to award quest completion XP', err))
      }

      // Auto-apply findings to skill snapshot + update working level — the
      // mastery loop. GATED on sufficient completion: a short partial banked its
      // diamonds/history/hours above, but it must NEVER move his working level or
      // the foundation map. (computeWorkingLevelFromSession already self-guards at
      // the same MIN_QUESTIONS floor; this gate extends that protection to
      // findings → priority skills, conceptual blocks, and the learning-map
      // coverage update, so a 2-question bail leaves the snapshot untouched.)
      if (sufficient) {
        try {
          const snapshotRef = doc(skillSnapshotsCollection(run.familyId), run.childId)
          const snapshotSnap = await getDoc(snapshotRef)
          const existing: Partial<SkillSnapshot> = snapshotSnap.exists()
            ? snapshotSnap.data()
            : {}

          // Findings = AI quest findings + writing seeding findings (FEAT-11):
          // spelling (`writing.spelling.*`) + sentence (`writing.composition.sentence`).
          // Both are emerging-only, so they seed a priority skill (a "teach this
          // next" marker) for the central mastery loop to advance later — they never
          // mark spelling or sentence mastered inline.
          const combinedFindings = [...findings, ...writingFindings]

          // Build priority skills from findings (if any)
          const newPrioritySkills: PrioritySkill[] = combinedFindings
            .filter((f) => f.status === 'emerging' || f.status === 'not-yet')
            .map((f) => ({
              tag: f.skill,
              label: formatSkillLabel(f.skill),
              level: SkillLevel.Emerging,
              masteryGate: MasteryGate.NotYet,
              notes: `${f.evidence} (Quest ${new Date().toLocaleDateString()})`,
            }))

          // Update mastered skills
          for (const f of combinedFindings) {
            if (f.status === 'mastered') {
              const idx = newPrioritySkills.findIndex((s) => s.tag === f.skill)
              if (idx < 0) {
                newPrioritySkills.push({
                  tag: f.skill,
                  label: formatSkillLabel(f.skill),
                  level: SkillLevel.Secure,
                  masteryGate: MasteryGate.IndependentConsistent,
                  notes: `${f.evidence} (Quest ${new Date().toLocaleDateString()})`,
                })
              }
            }
          }

          // Merge: keep existing skills not covered by quest findings
          const existingSkills = (existing.prioritySkills || []).filter(
            (s) => !newPrioritySkills.some((n) => n.tag === s.tag),
          )

          // Compute new working level from this session
          const newWorkingLevel = computeWorkingLevelFromSession(
            questions, finalState.currentLevel, questMode,
          )

          // Merge working levels, respecting manual override protection
          let mergedWorkingLevels = existing.workingLevels ?? {}
          if (newWorkingLevel && questMode && questMode !== 'fluency') {
            const modeKey = questMode as 'phonics' | 'comprehension' | 'math'
            const currentLevel = mergedWorkingLevels[modeKey]
            if (canOverwriteWorkingLevel(currentLevel, newWorkingLevel)) {
              mergedWorkingLevels = { ...mergedWorkingLevels, [modeKey]: newWorkingLevel }
            }
          }

          // FEAT-11: derive the SPELLING working level from the spell-word subset
          // only — a separate signal from phonics so spelling routes by its own gap
          // and is never folded into the phonics number (and leaves room for a
          // future, distinct composition level).
          const writingLevel = computeWritingLevelFromSpellingQuestions(questions)
          if (writingLevel && canOverwriteWorkingLevel(mergedWorkingLevels.writing, writingLevel)) {
            mergedWorkingLevels = { ...mergedWorkingLevels, writing: writingLevel }
          }

          // FEAT-11 Phase 2: derive the SENTENCE working level from the
          // build-sentence subset only — a separate signal from both phonics and
          // spelling, so sentence-building routes by its own gap and is never folded
          // into the spelling number (and leaves room for a future composition level).
          const sentenceLevel = computeSentenceLevelFromQuestions(questions)
          if (sentenceLevel && canOverwriteWorkingLevel(mergedWorkingLevels.sentence, sentenceLevel)) {
            mergedWorkingLevels = { ...mergedWorkingLevels, sentence: sentenceLevel }
          }

          const updated = {
            childId: run.childId,
            prioritySkills: combinedFindings.length > 0
              ? [...existingSkills, ...newPrioritySkills]
              : existing.prioritySkills || [],
            supports: existing.supports || [],
            stopRules: existing.stopRules || [],
            evidenceDefinitions: existing.evidenceDefinitions || [],
            workingLevels: mergedWorkingLevels,
            updatedAt: new Date().toISOString(),
          }

          await setDoc(snapshotRef, JSON.parse(JSON.stringify(updated)), { merge: true })

          // ── Phase 1: detect + merge blockers, then advance lifecycle on all blocks ──
          try {
            const detected = detectBlockersFromSession(questions, questMode, { sessionId: docId })
            let merged: ConceptualBlock[] = existing.conceptualBlocks ?? []
            for (const b of detected) {
              if (!b.id) continue
              merged = mergeBlock(merged, b as Parameters<typeof mergeBlock>[1])
            }

            // Advance lifecycle using this session's correct/total counts per skill.
            const evidence = sessionEvidenceFromQuestions(questions)
            const next = updateBlockerLifecycle(merged, evidence)
            const changed =
              detected.length > 0 ||
              next.length !== (existing.conceptualBlocks ?? []).length ||
              next.some((b, i) => b.status !== (existing.conceptualBlocks ?? [])[i]?.status)

            if (changed) {
              await updateDoc(snapshotRef, {
                conceptualBlocks: JSON.parse(JSON.stringify(next)),
                blocksUpdatedAt: new Date().toISOString(),
              })
            }
          } catch (err) {
            console.warn('Failed to merge quest blockers into skill snapshot', err)
          }

          // ── "Last mined" activity marker (visibility-only) ──────────────
          // A sufficient quest that HOLDS the conservative level leaves the
          // WorkingLevel (and its `updatedAt` = last level change) untouched, so
          // the counted run looks invisible. Record a *separate* per-domain
          // marker — last quest time + held/rose outcome + the session
          // high-water mark — through the central writer. This never reads or
          // mutates the level value, never-downgrade, or manual logic. If a
          // manual pin is still active (<48 hr) the level write was skipped, so
          // we skip the activity write too (rare; deferred edge).
          if (
            (questMode === 'phonics' || questMode === 'comprehension' || questMode === 'math') &&
            !manualOverrideHolds(existing.workingLevels?.[questMode])
          ) {
            const marker = computeQuestActivityMarker({
              priorLevel: existing.workingLevels?.[questMode]?.level,
              newLevel: newWorkingLevel?.level,
              sessionHighWater: sessionHighWaterLevel(questions, finalState.currentLevel),
            })
            await writeSnapshotUpdate(run.familyId, run.childId, {
              masteredSkills: [],
              recordQuestActivity: { domain: questMode, marker },
            }).catch((err) => console.warn('Failed to record quest activity marker', err))
          }
        } catch (err) {
          // Don't block session save if snapshot update fails
          console.warn('Failed to auto-apply quest findings/working level to skill snapshot', err)
        }

        // Update Learning Map from findings (fire-and-forget)
        if (findings.length > 0) {
          updateSkillMapFromFindings(run.familyId, run.childId, findings)
            .catch((err) => console.warn('[LearningMap] Failed to update from quest findings', err))
        }
      }

      // Track per-word progress (fire-and-forget)
      const sessionDocId = docId
      void (async () => {
        for (const q of questions) {
          if (q.flaggedAsError) continue

          const word = extractTargetWord(q)
          if (!word) continue

          const wordDocId = word.toLowerCase().replace(/[^a-z]/g, '')
          if (!wordDocId) continue

          try {
            const wordRef = doc(
              collection(db, `families/${run.familyId}/children/${run.childId}/wordProgress`),
              wordDocId,
            )
            const existingSnap = await getDoc(wordRef)
            const prev = existingSnap.exists() ? (existingSnap.data() as WordProgress) : null

            const isWrong = !q.correct && !q.skipped
            const updated: WordProgress = {
              word: word.toLowerCase(),
              pattern: extractPattern(q),
              skill: q.skill || 'unknown',
              wrongCount: (prev?.wrongCount || 0) + (isWrong ? 1 : 0),
              skippedCount: (prev?.skippedCount || 0) + (q.skipped ? 1 : 0),
              correctCount: (prev?.correctCount || 0) + (q.correct ? 1 : 0),
              lastSeen: new Date().toISOString(),
              firstSeen: prev?.firstSeen || new Date().toISOString(),
              masteryLevel: 'not-yet',
              questSessions: [...new Set([...(prev?.questSessions || []), sessionDocId])],
            }

            // Calculate mastery
            const total = updated.correctCount + updated.wrongCount + updated.skippedCount
            const correctRate = total > 0 ? updated.correctCount / total : 0

            if (correctRate >= 0.8 && updated.correctCount >= 3) {
              updated.masteryLevel = 'known'
            } else if (correctRate >= 0.5 && total >= 2) {
              updated.masteryLevel = 'emerging'
            } else if (total >= 2) {
              updated.masteryLevel = 'struggling'
            }

            await setDoc(wordRef, JSON.parse(JSON.stringify(updated)))
          } catch (err) {
            console.warn(`Failed to update word progress for "${word}":`, err)
          }
        }
      })()

      // Trigger pattern detection if 3+ evaluation sessions exist (fire-and-forget)
      try {
        const sessionsQuery = query(
          evaluationSessionsCollection(run.familyId),
          where('childId', '==', run.childId),
          orderBy('evaluatedAt', 'desc'),
          firestoreLimit(10),
        )
        const sessionsSnap = await getDocs(sessionsQuery)

        if (sessionsSnap.size >= 3) {
          analyzePatterns({
            familyId: run.familyId,
            childId: run.childId,
            evaluationSessionId: docId,
            currentFindings: findings.map((f) => ({
              skill: f.skill,
              status: f.status,
              evidence: f.evidence,
              notes: f.notes,
            })),
          }).catch((err) => console.warn('Pattern detection failed (non-blocking):', err))
        }
      } catch (err) {
        console.warn('Pattern detection trigger check failed:', err)
      }

      // Auto-complete matching evaluation item on today's checklist
      try {
        const today = new Date().toISOString().split('T')[0]
        // Canonical `{date}_{childId}` id (FEAT-114) — the previous legacy
        // `{childId}_{date}` id never matched today's doc, so quest completions
        // (and their minutes) silently never reached Today.
        const dayRef = doc(daysCollection(run.familyId), dayLogDocId(today, run.childId))
        const daySnap = await getDoc(dayRef)

        if (daySnap.exists()) {
          const dayData = daySnap.data()
          const items = dayData.checklist || []

          const matchIdx = items.findIndex((item) =>
            item.itemType === 'evaluation' &&
            !item.completed &&
            (
              (questMode === 'comprehension' && item.evaluationMode === 'comprehension') ||
              (questMode === 'phonics' && item.evaluationMode === 'phonics') ||
              (questMode === 'fluency' && item.evaluationMode === 'fluency') ||
              (domain === 'math' && item.evaluationMode === 'math')
            ),
          )

          if (matchIdx >= 0) {
            const updatedItems = items.map((item, i) =>
              i === matchIdx
                ? {
                    ...item,
                    completed: true,
                    completedAt: new Date().toISOString(),
                    actualMinutes: Math.round((finalState.totalQuestions * 30 + (questState?.elapsedSeconds || 0)) / 60) || finalState.totalQuestions,
                  }
                : item,
            )
            await updateDayLogGuarded(dayRef, { checklist: updatedItems }, 'quest-autocomplete')
            console.log('[Quest] Auto-completed evaluation item:', items[matchIdx].label)
          }
        }
      } catch (err) {
        console.warn('[Quest] Failed to auto-complete evaluation item (non-blocking):', err)
      }
    },
    // UX-494 — no `activeChildId` / `familyId` here any more: a close resolves
    // every one of its writes through the frozen run, so the hook's live
    // identity is not an input to it.
    [findings, previousSessions, chat, analyzePatterns, questState?.elapsedSeconds, sessionTimer, bankAnswerReward, projectGraph, publishSourceSave],
  )

  // ── Submit answer ─────────────────────────────────────────────

  const submitAnswer = useCallback(
    async (childAnswer: string, inputMethod?: AnswerInputMethod) => {
      if (!currentQuestion || !questState || !activeChildId) return

      // UX-494 — the run this answer belongs to. Re-checked after every await
      // below, so a next question (or a close) that lands once another session
      // has taken over does not mutate that session or take its refs.
      const run = runRef.current
      const stillMine = () => !run || isLiveRun(runRef.current, run)

      const responseTimeMs = Date.now() - questionStartRef.current
      const correct = checkAnswer(childAnswer, currentQuestion)

      const sessionQ: SessionQuestion = {
        id: currentQuestion.id,
        type: currentQuestion.type,
        level: currentQuestion.level,
        skill: currentQuestion.skill,
        prompt: currentQuestion.prompt,
        stimulus: currentQuestion.stimulus,
        // Tile-assembly questions (build-word / spell-word / build-sentence)
        // record their tile set in `options` so analytics/persistence read one
        // field regardless of type.
        options: currentQuestion.type === 'build-word' || currentQuestion.type === 'spell-word' || currentQuestion.type === 'build-sentence'
          ? currentQuestion.tiles
          : currentQuestion.options,
        correctAnswer: currentQuestion.correctAnswer,
        childAnswer,
        correct,
        responseTimeMs,
        timestamp: new Date().toISOString(),
        inputMethod: inputMethod || (currentQuestion.type === 'build-word' || currentQuestion.type === 'spell-word' || currentQuestion.type === 'build-sentence' ? 'tile' : 'multiple-choice'),
        targetedBlockerId: currentQuestion.targetedBlockerId,
        targetConceptId: currentQuestion.targetConceptId,
        // UX-495 — the item's own provenance travels with the answered row, so
        // the saved source can say exactly which checked item produced it.
        localProbe: currentQuestion.localProbe,
      }

      const updatedQuestions = [...answeredQuestions, sessionQ]
      setAnsweredQuestions(updatedQuestions)

      // Bank this answer's diamond + XP the instant it's earned (deduped by the
      // question's index in the session). This is what makes a partial count: the
      // reward is durable even if the child stops before the session ends. The
      // end-of-session backfill re-banks idempotently, so no double-award.
      // UX-494 — keyed on the RUN, so the per-answer dedup key, the child and the
      // domain are one session's. The key shape and the amount are unchanged.
      if (correct && run) {
        bankAnswerReward(run, updatedQuestions.length - 1)
      }

      // Show feedback
      setLastAnswer({
        correct,
        correctAnswer: currentQuestion.correctAnswer,
        encouragement: currentQuestion.encouragement,
      })
      setScreen(QuestScreen.Feedback)

      // Compute new adaptive state (respecting per-mode level cap)
      const modeCap = activeQuestModeRef.current
        ? (QUEST_MODE_LEVEL_CAP[activeQuestModeRef.current] ?? DEFAULT_LEVEL_CAP)
        : DEFAULT_LEVEL_CAP
      const newState = computeNextState(questState, correct, modeCap)
      setQuestState(newState)

      // Detect if the child hit the level cap (at cap with enough correct to have promoted)
      if (correct && newState.currentLevel >= modeCap && newState.consecutiveCorrect >= LEVEL_UP_STREAK) {
        setHitLevelCap(true)
      }

      // Feedback pause
      const feedbackDuration = correct ? 1200 : 2000
      await new Promise((resolve) => setTimeout(resolve, feedbackDuration))

      // A feedback pause the child walked out of (Back to mine, then a new
      // quest) must not go on to close or to request a question for the run
      // that replaced it.
      if (!stillMine()) return

      // Check end conditions
      const { end: shouldEnd, timedOut } = shouldEndSession(newState)

      // End-on-a-win: if session would end and last answer was wrong, add bonus round
      const needsBonusRound =
        shouldEnd &&
        !timedOut &&
        !correct &&
        !bonusRoundUsedRef.current &&
        newState.levelDownsInARow < FRUSTRATION_LIMIT // don't force bonus if frustrated

      if (shouldEnd && !needsBonusRound) {
        await endSession(updatedQuestions, newState, timedOut)
        return
      }

      // Request next question (or bonus round)
      setScreen(QuestScreen.Loading)

      if (needsBonusRound) {
        bonusRoundUsedRef.current = true
      }

      // Session avoid-set of already-asked target words/sentences — keeps the
      // client template injections (and, below, the AI request) from re-testing a
      // word already seen this session.
      const askedTargets = askedTargetSet(updatedQuestions)

      // ── Spell-the-word injection (FEAT-11 Phase 1) ──────────────────
      // On the reading/phonics surface, rotate in a client-generated
      // spell-the-word question instead of the next AI question: 1–2 per session,
      // never as a bonus round, never two in a row, and not before Q3 (so it's
      // never the first thing he sees). Targets come from the blended sight-word
      // bank + phonics frontier. Tap-only tiles, target spoken not shown.
      const eligibleForSpellWord =
        !needsBonusRound &&
        activeDomainRef.current === 'reading' &&
        activeQuestModeRef.current === 'phonics' &&
        spellWordCountRef.current < SPELL_WORD_PER_SESSION_MAX &&
        !lastWasSpellWordRef.current &&
        newState.totalQuestions >= 2
      const fireSpellWord =
        eligibleForSpellWord &&
        (spellWordCountRef.current === 0
          ? newState.totalQuestions >= 3 // guarantee the first one appears
          : Math.random() < 0.3) // a possible second, spaced out
      if (fireSpellWord) {
        const spellLevel = Math.min(newState.currentLevel, WRITING_LEVEL_CAP)
        const spellQ = generateSpellWordQuestion(spellWordSourceRef.current, spellLevel, Math.random, askedTargets)
        if (spellQ) {
          spellWordCountRef.current += 1
          lastWasSpellWordRef.current = true
          lastWasBuildSentenceRef.current = false
          setCurrentQuestion(spellQ)
          questionStartRef.current = Date.now()
          setScreen(QuestScreen.Question)
          return
        }
      }

      // ── Build-the-sentence injection (FEAT-11 Phase 2) ──────────────
      // On the reading/phonics surface, rotate in a client-generated
      // build-the-sentence question (the bridge after encoding): at most one per
      // session, never as a bonus round, never right after another injected
      // question, never first, and only once basic encoding is underway
      // (Level ≥ 2, and not before Q4 so spelling has had a turn). Tap-only word
      // tiles + a capital/period tile; the sentence is spoken, never shown.
      const eligibleForSentence =
        !needsBonusRound &&
        activeDomainRef.current === 'reading' &&
        activeQuestModeRef.current === 'phonics' &&
        buildSentenceCountRef.current < BUILD_SENTENCE_PER_SESSION_MAX &&
        !lastWasBuildSentenceRef.current &&
        !lastWasSpellWordRef.current &&
        newState.currentLevel >= 2 &&
        newState.totalQuestions >= 4
      const fireSentence = eligibleForSentence && Math.random() < 0.5
      if (fireSentence) {
        const sentenceLevel = Math.min(newState.currentLevel, SENTENCE_LEVEL_CAP)
        const sentenceQ = generateBuildSentenceQuestion(sentenceSourceRef.current, sentenceLevel, Math.random, askedTargets)
        if (sentenceQ) {
          buildSentenceCountRef.current += 1
          lastWasBuildSentenceRef.current = true
          lastWasSpellWordRef.current = false
          setCurrentQuestion(sentenceQ)
          questionStartRef.current = Date.now()
          setScreen(QuestScreen.Question)
          return
        }
      }

      // Anti-repetition: tell the AI which formats it just used (vary the format)
      // and which target words/sentences it has already asked (never reuse them).
      const recentQuestionTypes = recentQuestionFormats(updatedQuestions)
      const askedTargetList = collectAskedTargets(updatedQuestions)

      const bonusLevel = Math.max(1, newState.currentLevel - 2)
      const userMessage: AIChatMessage = {
        role: 'user',
        content: JSON.stringify({
          action: 'answer',
          childAnswer,
          correct,
          currentLevel: needsBonusRound ? bonusLevel : newState.currentLevel,
          consecutiveCorrect: newState.consecutiveCorrect,
          consecutiveWrong: newState.consecutiveWrong,
          totalQuestions: newState.totalQuestions,
          totalCorrect: newState.totalCorrect,
          questionsThisLevel: newState.questionsThisLevel,
          levelDownsInARow: newState.levelDownsInARow,
          recentQuestionTypes,
          askedTargets: askedTargetList,
          ...(needsBonusRound ? { bonusRound: true } : {}),
        }),
      }

      conversationRef.current.push(userMessage)

      try {
        const response = await chat({
          familyId,
          childId: activeChildId,
          taskType: TaskType.Quest,
          messages: [...conversationRef.current],
          domain: activeDomainRef.current,
        })

        if (!stillMine()) return

        if (!response) {
          // AI failed — end session gracefully
          await endSession(updatedQuestions, newState, false)
          return
        }

        conversationRef.current.push({ role: 'assistant', content: response.message })

        const finding = extractQuestFinding(response.message)
        if (finding) {
          setFindings((prev) => [...prev, finding])
        }

        let question = parseQuestBlock(response.message)
        if (question) {
          question = validateQuestion(question)
        }

        // Retry if validation failed — request a new question from AI
        if (!question) {
          for (let retry = 0; retry < VALIDATION_RETRIES; retry++) {
            console.warn(`[submitAnswer] Question validation failed, retry ${retry + 1}/${VALIDATION_RETRIES}`)
            const retryMessage: AIChatMessage = {
              role: 'user',
              content: JSON.stringify({
                action: 'answer',
                instruction: 'The previous question had a formatting error. Please generate a NEW, DIFFERENT question. Ensure correctAnswer exactly matches one option and blank counts match answer length.',
                currentLevel: needsBonusRound ? bonusLevel : newState.currentLevel,
                consecutiveCorrect: newState.consecutiveCorrect,
                consecutiveWrong: newState.consecutiveWrong,
                totalQuestions: newState.totalQuestions,
                totalCorrect: newState.totalCorrect,
                questionsThisLevel: newState.questionsThisLevel,
                levelDownsInARow: newState.levelDownsInARow,
              }),
            }
            conversationRef.current.push(retryMessage)

            const retryResponse = await chat({
              familyId,
              childId: activeChildId,
              taskType: TaskType.Quest,
              messages: [...conversationRef.current],
              domain: activeDomainRef.current,
            })

            if (!stillMine()) return

            if (retryResponse) {
              conversationRef.current.push({ role: 'assistant', content: retryResponse.message })
              const retryFinding = extractQuestFinding(retryResponse.message)
              if (retryFinding) {
                setFindings((prev) => [...prev, retryFinding])
              }
              question = parseQuestBlock(retryResponse.message)
              if (question) {
                question = validateQuestion(question)
              }
              if (question) break
            }
          }
        }

        // All retries failed — use a client-side fallback question
        if (!question) {
          console.warn('[submitAnswer] All validation retries failed, using fallback question')
          question = generateFallbackQuestion(newState.currentLevel, activeDomainRef.current)
        }

        setCurrentQuestion(question)
        questionStartRef.current = Date.now()
        lastWasSpellWordRef.current = false
        lastWasBuildSentenceRef.current = false
        setScreen(QuestScreen.Question)
      } catch (err) {
        console.error('[submitAnswer] AI call threw — ending session gracefully', {
          error: err,
          currentLevel: newState.currentLevel,
          questMode: activeQuestModeRef.current,
          childId: activeChildId,
          totalQuestions: newState.totalQuestions,
        })

        if (!stillMine()) return

        // If no questions answered yet, return to intro with a friendly message
        if (updatedQuestions.filter((q) => !q.skipped).length === 0) {
          setStartQuestError('Hmm, the mine is being tricky. Try again in a minute.')
          setScreen(QuestScreen.Intro)
          return
        }

        // Otherwise show summary with whatever diamonds were earned
        await endSession(updatedQuestions, newState, false)
      }
    },
    [currentQuestion, questState, activeChildId, answeredQuestions, familyId, chat, endSession, bankAnswerReward],
  )

  // ── Skip question ───────────────────────────────────────────

  const handleSkip = useCallback(
    async () => {
      if (!currentQuestion || !questState || !activeChildId) return

      // UX-494 — same run guard as `submitAnswer`: a replacement question that
      // lands after another session started goes nowhere.
      const run = runRef.current
      const stillMine = () => !run || isLiveRun(runRef.current, run)

      const responseTimeMs = Date.now() - questionStartRef.current

      // Record skipped question — does NOT count toward adaptive state
      const flagged = shouldFlagAsError(currentQuestion)
      const sessionQ: SessionQuestion = {
        id: currentQuestion.id,
        type: currentQuestion.type,
        level: currentQuestion.level,
        skill: currentQuestion.skill,
        prompt: currentQuestion.prompt,
        stimulus: currentQuestion.stimulus,
        options: currentQuestion.type === 'build-word' || currentQuestion.type === 'spell-word' || currentQuestion.type === 'build-sentence'
          ? currentQuestion.tiles
          : currentQuestion.options,
        correctAnswer: currentQuestion.correctAnswer,
        childAnswer: '',
        correct: false,
        skipped: true,
        flaggedAsError: flagged || undefined,
        responseTimeMs,
        timestamp: new Date().toISOString(),
        targetedBlockerId: currentQuestion.targetedBlockerId,
        targetConceptId: currentQuestion.targetConceptId,
        // UX-495 — a SKIPPED probe is recorded with its provenance like any
        // other row. It adds no probe evidence (the projection excludes skips,
        // as it always has), and it does not reappear: the item is generated
        // once, in the opening slot of the Start that accepted the pilot.
        localProbe: currentQuestion.localProbe,
      }

      const updatedQuestions = [...answeredQuestions, sessionQ]
      setAnsweredQuestions(updatedQuestions)

      // DO NOT call computeNextState — skip doesn't affect adaptive state
      // DO NOT increment totalQuestions — question counter stays the same

      // Request replacement question at same level
      setScreen(QuestScreen.Loading)

      const recentQuestionTypes = recentQuestionFormats(updatedQuestions)
      const askedTargetList = collectAskedTargets(updatedQuestions)

      const userMessage: AIChatMessage = {
        role: 'user',
        content: JSON.stringify({
          action: 'answer',
          childAnswer: null,
          correct: false,
          skippedQuestion: {
            text: currentQuestion.prompt,
            type: currentQuestion.type,
            skill: currentQuestion.skill,
          },
          instruction: 'The child skipped the previous question. Generate a DIFFERENT question at the same level testing a DIFFERENT skill or word. Do not repeat the skipped question.',
          currentLevel: questState.currentLevel,
          consecutiveCorrect: questState.consecutiveCorrect,
          consecutiveWrong: questState.consecutiveWrong,
          totalQuestions: questState.totalQuestions,
          totalCorrect: questState.totalCorrect,
          questionsThisLevel: questState.questionsThisLevel,
          levelDownsInARow: questState.levelDownsInARow,
          recentQuestionTypes,
          askedTargets: askedTargetList,
        }),
      }

      conversationRef.current.push(userMessage)

      try {
        const response = await chat({
          familyId,
          childId: activeChildId,
          taskType: TaskType.Quest,
          messages: [...conversationRef.current],
          domain: activeDomainRef.current,
        })

        if (!stillMine()) return

        if (!response) {
          // AI failed — end session gracefully
          await endSession(updatedQuestions, questState, false)
          return
        }

        conversationRef.current.push({ role: 'assistant', content: response.message })

        const finding = extractQuestFinding(response.message)
        if (finding) {
          setFindings((prev) => [...prev, finding])
        }

        let question = parseQuestBlock(response.message)
        if (question) {
          question = validateQuestion(question)
        }

        // Retry if validation failed — request a new question from AI
        if (!question) {
          for (let retry = 0; retry < VALIDATION_RETRIES; retry++) {
            console.warn(`[handleSkip] Question validation failed, retry ${retry + 1}/${VALIDATION_RETRIES}`)
            const retryMessage: AIChatMessage = {
              role: 'user',
              content: JSON.stringify({
                action: 'answer',
                instruction: 'The previous question had a formatting error. Please generate a NEW, DIFFERENT question. Ensure correctAnswer exactly matches one option and blank counts match answer length.',
                currentLevel: questState.currentLevel,
                consecutiveCorrect: questState.consecutiveCorrect,
                consecutiveWrong: questState.consecutiveWrong,
                totalQuestions: questState.totalQuestions,
                totalCorrect: questState.totalCorrect,
                questionsThisLevel: questState.questionsThisLevel,
                levelDownsInARow: questState.levelDownsInARow,
              }),
            }
            conversationRef.current.push(retryMessage)

            const retryResponse = await chat({
              familyId,
              childId: activeChildId,
              taskType: TaskType.Quest,
              messages: [...conversationRef.current],
              domain: activeDomainRef.current,
            })

            if (!stillMine()) return

            if (retryResponse) {
              conversationRef.current.push({ role: 'assistant', content: retryResponse.message })
              const retryFinding = extractQuestFinding(retryResponse.message)
              if (retryFinding) {
                setFindings((prev) => [...prev, retryFinding])
              }
              question = parseQuestBlock(retryResponse.message)
              if (question) {
                question = validateQuestion(question)
              }
              if (question) break
            }
          }
        }

        // All retries failed — use a client-side fallback question
        if (!question) {
          console.warn('[handleSkip] All validation retries failed, using fallback question')
          question = generateFallbackQuestion(questState.currentLevel, activeDomainRef.current)
        }

        setCurrentQuestion(question)
        questionStartRef.current = Date.now()
        lastWasSpellWordRef.current = false
        lastWasBuildSentenceRef.current = false
        setScreen(QuestScreen.Question)
      } catch (err) {
        console.error('[handleSkip] AI call threw — ending session gracefully', {
          error: err,
          currentLevel: questState.currentLevel,
          questMode: activeQuestModeRef.current,
          childId: activeChildId,
          totalQuestions: questState.totalQuestions,
        })

        if (!stillMine()) return

        if (updatedQuestions.filter((q) => !q.skipped).length === 0) {
          setStartQuestError('Hmm, the mine is being tricky. Try again in a minute.')
          setScreen(QuestScreen.Intro)
          // The intro is back, so this run ends with it (UX-494). Leaving it
          // established is what made every later Start `already-running`.
          retireUnansweredRun(run)
          return
        }

        await endSession(updatedQuestions, questState, false)
      }
    },
    [
      currentQuestion,
      questState,
      activeChildId,
      answeredQuestions,
      familyId,
      chat,
      endSession,
      retireUnansweredRun,
    ],
  )

  // ── Fluency: record attempt and advance ───────────────────────

  const recordFluencyAttempt = useCallback(
    (selfRating: 'easy' | 'medium' | 'hard', recordingUrl: string | null, durationSeconds: number) => {
      const attempt = {
        recordingUrl,
        selfRating,
        durationSeconds,
        timestamp: new Date().toISOString(),
      }

      const existing = fluencyPassages.find((p) => p.text === currentPassageText)
      if (existing) {
        existing.attempts.push(attempt)
        setFluencyPassages([...fluencyPassages])
        if (fluencyDiamonds < 5) setFluencyDiamonds((d) => Math.min(d + 1, 5))
      } else {
        const passage: FluencyPassage = {
          text: currentPassageText,
          targetWords: currentPassageTargetWords,
          speechWords: currentPassageSpeechWords,
          wordCount: currentPassageWordCount,
          readingLevel: currentPassageReadingLevel,
          attempts: [attempt],
        }
        setFluencyPassages((prev) => [...prev, passage])
        if (fluencyDiamonds < 5) setFluencyDiamonds((d) => Math.min(d + 1, 5))
      }
    },
    [currentPassageText, currentPassageTargetWords, currentPassageSpeechWords, currentPassageWordCount, currentPassageReadingLevel, fluencyPassages, fluencyDiamonds],
  )

  const requestNewFluencyPassage = useCallback(
    async () => {
      if (!activeChildId || !activeChild) return
      setScreen(QuestScreen.Loading)

      try {
        const msg: AIChatMessage = {
          role: 'user',
          content: JSON.stringify({
            action: 'fluency_passage',
            domain: 'reading',
            questMode: 'fluency',
            childName: activeChild.name,
            instruction: 'Generate a NEW, DIFFERENT passage. Different topic and vocabulary from the previous one.',
          }),
        }
        conversationRef.current.push(msg)

        const response = await chat({
          familyId,
          childId: activeChildId,
          taskType: TaskType.Quest,
          messages: [...conversationRef.current],
          domain: 'reading',
        })

        if (!response) {
          setScreen(QuestScreen.FluencyPassage)
          return
        }

        conversationRef.current.push({ role: 'assistant', content: response.message })
        const parsed = parseFluencyPassage(response.message)
        if (!parsed) {
          setScreen(QuestScreen.FluencyPassage)
          return
        }

        setCurrentPassageText(parsed.passage)
        setCurrentPassageTargetWords(parsed.targetWords || [])
        setCurrentPassageSpeechWords(parsed.speechWords || [])
        setCurrentPassageWordCount(parsed.wordCount || 0)
        setCurrentPassageReadingLevel(parsed.readingLevel || '')
        setScreen(QuestScreen.FluencyPassage)
      } catch {
        setScreen(QuestScreen.FluencyPassage)
      }
    },
    [activeChildId, activeChild, familyId, chat],
  )

  const endFluencySession = useCallback(
    async () => {
      if (!activeChildId) return

      if (timerRef.current) {
        clearInterval(timerRef.current)
        timerRef.current = null
      }

      const totalTime = questState?.elapsedSeconds || 0
      const diamonds = fluencyDiamonds
      const docId = `fluency_${activeChildId}_${Date.now()}`

      const session: EvaluationSession & FluencySessionData = {
        childId: activeChildId,
        domain: 'reading',
        status: 'complete',
        messages: [],
        findings: [],
        recommendations: [],
        summary: `Fluency practice: ${fluencyPassages.length} passages read`,
        evaluatedAt: new Date().toISOString(),
        sessionType: 'fluency',
        questMode: 'fluency',
        passages: fluencyPassages,
        totalReadingTimeSeconds: totalTime,
        diamondsEarned: diamonds,
      }

      try {
        const ref = doc(evaluationSessionsCollection(familyId), docId)
        await setDoc(ref, JSON.parse(JSON.stringify(session)))
      } catch (err) {
        console.error('Failed to save fluency session', err)
      }

      // Log instructional hours (idle-aware timer)
      if (!hoursLoggedRef.current) {
        hoursLoggedRef.current = true
        const activeSeconds = sessionTimer.stop()
        const minutes = Math.ceil(activeSeconds / 60 / 5) * 5
        if (minutes >= 5) {
          addDoc(hoursCollection(familyId), {
            childId: activeChildId,
            date: todayKey(),
            minutes,
            subjectBucket: domainToSubjectBucket('reading'),
            quickCapture: true,
            notes: 'fluency quest session',
            source: 'knowledge-mine',
          }).catch((err) => console.error('[SessionTimer] Failed to log fluency hours:', err))
        }
      }

      if (diamonds > 0) {
        const XP_PER_DIAMOND = 2
        addXpEvent(
          familyId,
          activeChildId,
          'QUEST_DIAMOND',
          diamonds * XP_PER_DIAMOND,
          `fluency_${docId}`,
          { domain: 'reading', source: 'fluency' },
        ).catch((err) => console.warn('Failed to award fluency XP', err))

        addDiamondEvent({
          familyId,
          childId: activeChildId,
          amount: diamonds,
          type: DIAMOND_EVENTS.FLUENCY_BONUS,
          reason: `Fluency bonus: ${diamonds} diamonds`,
          dedupKey: `fluency_${docId}-diamond`,
        }).catch((err) => console.warn('Failed to award fluency diamonds', err))
      }

      // Auto-complete matching fluency evaluation item on today's checklist
      try {
        const today = new Date().toISOString().split('T')[0]
        // Canonical `{date}_{childId}` id (FEAT-114) — see endSession above.
        const dayRef = doc(daysCollection(familyId), dayLogDocId(today, activeChildId))
        const daySnap = await getDoc(dayRef)

        if (daySnap.exists()) {
          const dayData = daySnap.data()
          const items = dayData.checklist || []

          const matchIdx = items.findIndex((item) =>
            item.itemType === 'evaluation' &&
            !item.completed &&
            item.evaluationMode === 'fluency',
          )

          if (matchIdx >= 0) {
            const updatedItems = items.map((item, i) =>
              i === matchIdx
                ? {
                    ...item,
                    completed: true,
                    completedAt: new Date().toISOString(),
                    actualMinutes: Math.round(totalTime / 60) || 1,
                  }
                : item,
            )
            await updateDayLogGuarded(dayRef, { checklist: updatedItems }, 'fluency-autocomplete')
            console.log('[Fluency] Auto-completed evaluation item:', items[matchIdx].label)
          }
        }
      } catch (err) {
        console.warn('[Fluency] Failed to auto-complete evaluation item (non-blocking):', err)
      }

      setScreen(QuestScreen.FluencySummary)
    },
    [activeChildId, familyId, questState, fluencyPassages, fluencyDiamonds, sessionTimer],
  )

  // ── Resume session from partial save ──────────────────────────

  const resumeSession = useCallback(
    async (
      partialDoc: EvaluationSession & Partial<InteractiveSessionData> & { id?: string },
    ): Promise<true | QuestResumeFailure> => {
      if (!familyId) return 'missing'

      // Restore session identity so endSession updates this doc, not creates a new one
      const docId = partialDoc.id
      if (!docId) {
        console.warn('[resumeSession] Partial session missing doc id — cannot resume')
        return 'missing'
      }

      // UX-339 — a resumed session belongs to the child on the DOCUMENT, never
      // to whoever the header happens to be on, so this child is what the
      // eligibility check is made against.
      const resumedChildId = partialDoc.childId || liveChildId
      const resumedChildName = children.find((c) => c.id === resumedChildId)?.name ?? ''

      /**
       * UX-494 — a retained Resume is refused BEFORE Firestore is called.
       *
       * The card's handler is captured at render; a stale one must not spend a
       * read, let alone claim a document, for an identity that has moved on.
       */
      const renderedScope = recoveryScope
      const renderedEpoch = identityEpoch
      if (!scopeStillLive(renderedScope, renderedEpoch)) return 'stale-scope'
      // The partial has to be THIS child's — the card is drawn for the active
      // child, and a retained one must not reopen a sibling's answers.
      if (!resumedChildId || resumedChildId !== liveChildId) return 'wrong-child'
      // A run already established is not replaced by a retained Resume: that
      // would abandon a live quest's answers to reopen an old one.
      if (runRef.current) return 'stale-scope'
      // A Start mid-read, another Resume, or a discard owns the intro lane.
      if (startClaimRef.current) return 'stale-scope'

      /**
       * Claim the lane SYNCHRONOUSLY, for the whole transition (UX-494).
       *
       * Bumping the generation alone only invalidated this Resume's own result:
       * a Start tapped while the claim transaction was in flight established a
       * new run, and Resume — having already stamped the document `resumed` —
       * threw its restore away, so the partial was neither open nor offered
       * again. Holding the same claim Start holds makes that Start a refused
       * `busy` instead, and the claim is released only by this Resume, only
       * once its transition has resolved either way.
       */
      const generation = (runGenerationRef.current += 1)
      startClaimRef.current = { generation, scope: renderedScope, kind: 'resume' }
      const releaseResumeClaim = () => {
        if (startClaimRef.current?.generation === generation) startClaimRef.current = null
      }

      /**
       * Re-read, judge and claim — in ONE transaction, which returns the EXACT
       * stored partial it accepted.
       *
       * It used to read, restore the whole screen, and then fire a detached
       * status write: two taps could both pass the check and both restore, and a
       * delayed close finalizing the record in that window was stamped `resumed`
       * anyway. Nothing is restored now until the claim is acknowledged, and a
       * refusal is REPORTED — the old fallback started an unrelated fresh paid
       * quest in whatever mode the card happened to name.
       */
      let claim: Awaited<ReturnType<typeof claimQuestSourceForResume>>
      try {
        claim = await claimQuestSourceForResume(questSourceRef(familyId, docId), {
          childId: resumedChildId,
        })
      } catch (err) {
        console.warn('[resumeSession] Could not claim the saved session — not resuming', err)
        releaseResumeClaim()
        // The transport rejected the claim; the document was never judged, so
        // the saved point is intact and this is a retry, not a loss.
        return 'claim-failed'
      }
      if (!claim.ok) {
        console.warn('[resumeSession] Refusing to resume this session:', claim.refusal)
        releaseResumeClaim()
        return claim.refusal
      }
      // Accepted — and, because the lane was claimed before the transaction, no
      // Start or second Resume can have established anything in that window: a
      // generation that has moved means a RESET, whose own claim this is not.
      if (runGenerationRef.current !== generation) {
        releaseResumeClaim()
        return 'stale-scope'
      }
      if (!scopeStillLive(renderedScope, renderedEpoch)) {
        releaseResumeClaim()
        return 'stale-scope'
      }

      // Everything played from here is the STORED document's, which is the only
      // copy whose eligibility was checked.
      const source = claim.source
      const saved = source.savedQuestState!
      const savedQuestion = source.savedCurrentQuestion ?? null
      sessionIdRef.current = docId
      sessionOwnerRef.current = { childId: resumedChildId, childName: resumedChildName }

      /**
       * UX-494 — the target plan comes off THIS partial, and only off it.
       *
       * The ref was never touched here, so cold and warm Resume disagreed: a
       * freshly mounted hook resumed with no targets, and a hook that had
       * already run a session resumed holding the PREVIOUS run's targets, which
       * its close then attributed evidence to. A legacy partial carries no plan
       * field and `parseQuestTargetPlan` answers `[]` for it either way.
       */
      const resumedPlan = parseQuestTargetPlan(source.targetPlan)
      /**
       * UX-495 — and so does the accepted pilot target, read back through the
       * same validation the projection uses.
       *
       * Off THIS partial and only off it, for the same reason the plan is: a
       * warm hook must not lend a previous run's pilot to this one, and a
       * malformed or legacy stored value resumes as no pilot at all. Nothing
       * generates a new probe on a Resume — the exact pending item comes back
       * from `savedCurrentQuestion`, provenance intact.
       */
      const resumedPilot = readMineAdditionPilotTarget(source.pilotProbe)
      runRef.current = {
        runId: docId,
        // Resume reuses the saved id, so the LIVE identity must not: without a
        // fresh one, the previous mount's awaited question, skip or close would
        // pass the live-run guard on this one.
        instanceId: questRunInstanceId(docId, (runInstanceSeqRef.current += 1)),
        familyId,
        childId: resumedChildId,
        childName: resumedChildName,
        domain: source.domain as EvaluationDomain,
        questMode: source.questMode,
        targetPlan: resumedPlan,
        pilotProbe: resumedPilot ?? undefined,
        startedAt: source.evaluatedAt,
      }
      // A reopened run has not been closed, however many times it was resumed.
      closedRunsRef.current.delete(docId)
      hoursLoggedRunsRef.current.delete(docId)
      publishSourceSave({ state: 'idle', canRetry: false })
      setGraphSync({ state: 'idle' })

      // Restore adaptive state
      setQuestState(saved)
      setAnsweredQuestions(source.questions ?? [])
      setFindings(source.findings ?? [])

      // Check if the saved currentQuestion was already answered (edge case: save race)
      const alreadyAnswered = (source.questions ?? []).some((q) => q.id === savedQuestion?.id)

      // Restore the exact question, or null when we need a fresh one. The
      // eligibility check already refused a partial with no saved question, so
      // `savedQuestion` is narrowed rather than asserted.
      if (alreadyAnswered) {
        // Question was answered before save completed — we'll need a fresh one.
        // The normal submitAnswer→fetchNextQuestion flow doesn't apply here.
        setCurrentQuestion(null)
      } else {
        setCurrentQuestion(savedQuestion)
      }

      // Restore refs
      bonusRoundUsedRef.current = source.bonusRoundUsed ?? false
      activeDomainRef.current = source.domain as EvaluationDomain
      activeQuestModeRef.current = source.questMode
      conversationRef.current = []

      // Reset other state
      setLastAnswer(null)
      setSessionSaved(false)
      sessionSavedRef.current = false
      setSummarizing(false)
      setStartQuestError(null)
      setFluencyPassages([])
      setFluencyDiamonds(0)
      setCurrentPassageText('')

      // Start the elapsed-time timer from where we left off
      if (timerRef.current) clearInterval(timerRef.current)
      timerRef.current = setInterval(() => {
        setQuestState((prev) =>
          prev ? { ...prev, elapsedSeconds: prev.elapsedSeconds + 1 } : prev,
        )
      }, 1000)

      // Start idle-aware timer for hours logging
      hoursLoggedRef.current = false
      sessionTimer.startTimer()

      // Show the question screen (or loading if we need a new question)
      if (alreadyAnswered) {
        setScreen(QuestScreen.Loading)
        // TODO: fetch new question — for now this is an extreme edge case
      } else {
        setScreen(QuestScreen.Question)
      }

      // The `status: 'resumed'` stamp already landed, inside the claim above —
      // there is no second, detached write for it to disagree with. The run is
      // established and on screen, so the intro lane is free again.
      releaseResumeClaim()
      return true
    },
    [
      familyId,
      liveChildId,
      children,
      sessionTimer,
      recoveryScope,
      identityEpoch,
      scopeStillLive,
      publishSourceSave,
    ],
  )

  // ── Start fresh instead: close a partial out ──────────────────

  /**
   * The *Start fresh instead* write, in the SAME intro lane as Start and Resume
   * (UX-494).
   *
   * The page called the guarded transition directly, so a discard tapped while
   * a Resume's claim transaction was in flight could land its `abandoned` stamp
   * and let that Resume then open the answers of a record now closed out — the
   * one case where the card's two buttons could still disagree. Sharing the
   * claim refuses the second action instead of racing it; the refusal is
   * reported, so the card says so rather than pretending.
   */
  const discardPartial = useCallback(
    async (
      partialDoc: { id?: string; childId?: string },
      expect?: { scopeKey?: string; epoch?: number },
    ): Promise<QuestAbandonOutcome | 'failed' | 'stale-scope'> => {
      const docId = partialDoc.id
      const owner = partialDoc.childId
      if (!familyId || !docId || !owner) return 'missing'

      const renderedScope = expect?.scopeKey ?? recoveryScope
      const renderedEpoch = expect?.epoch ?? identityEpoch
      if (!scopeStillLive(renderedScope, renderedEpoch)) return 'stale-scope'
      // The row is the active child's, and no other intro action — a Resume
      // above all — may be mid-transition.
      if (owner !== liveChildId) return 'refused'
      if (startClaimRef.current) return 'stale-scope'
      if (runRef.current) return 'stale-scope'

      const generation = runGenerationRef.current
      startClaimRef.current = { generation, scope: renderedScope, kind: 'discard' }
      try {
        return await abandonQuestSource(questSourceRef(familyId, docId), { childId: owner })
      } catch (err) {
        console.error('Failed to mark session as abandoned', err)
        return 'failed'
      } finally {
        // Only its own claim, and only if no reset has taken the lane since.
        if (startClaimRef.current?.kind === 'discard' && startClaimRef.current.generation === generation) {
          startClaimRef.current = null
        }
      }
    },
    [familyId, liveChildId, recoveryScope, identityEpoch, scopeStillLive],
  )

  // ── Reset to intro ────────────────────────────────────────────

  const resetToIntro = useCallback(() => {
    // Auto-save partial session if quest is in progress with answered questions.
    // Skip if session was saved or is currently being saved as complete — the
    // run is admitted to `closedRunsRef` synchronously at endSession start, so
    // this blocks ghost docs even if Done is tapped before setSessionSaved(true)
    // propagates, and does so PER RUN rather than per hook (UX-494).
    const exitingRun = runRef.current
    /**
     * UX-494 — the generation of the INTRO this exit lands on, claimed here at
     * the top rather than at the bottom.
     *
     * The bump does two jobs at once: it invalidates every delayed callback the
     * exiting run still has in flight (what the old bottom-of-function bump
     * did), and it names the view that will own the partial's own then/catch —
     * which the bottom version could not, because the promise was already
     * running by the time it happened.
     */
    const introGeneration = (runGenerationRef.current += 1)
    // A Start mid-read no longer owns anything after a reset.
    startClaimRef.current = null
    if (
      questState &&
      questState.totalQuestions > 0 &&
      exitingRun &&
      !closedRunsRef.current.has(exitingRun.runId) &&
      !sessionSavedRef.current
    ) {
      const docId = exitingRun.runId
      const domain = exitingRun.domain
      const partialSession = resumableQuestSourcePayload({
        run: exitingRun,
        questions: answeredQuestions,
        questState,
        currentQuestion,
        findings,
        bonusRoundUsed: bonusRoundUsedRef.current,
        streakDays: streak.currentStreak,
        nowIso: new Date().toISOString(),
      })

      // CONDITIONAL (UX-494): a partial may never land on top of a finalized
      // record — a late exit tap used to turn a completed session back into a
      // resumable one, resume point and all. It is a transaction, so it can also
      // be REJECTED offline; the payload is then held for the same scoped retry
      // the summary's failed close uses, offered on the intro this exit lands on.
      // The minutes below are recorded either way: they happened.
      /**
       * Still the exact intro this exit landed on? (promotion)
       *
       * The GENERATION alone, deliberately: this attempt belongs to the intro
       * it was started from, not to whoever is selected when the write lands.
       * A parent switching the active child mid-write leaves that intro live,
       * and the scope check used to make the outcome vanish — the payload was
       * dropped and Saving was never replaced, so returning to the owner found
       * a stuck notice and no Retry. Who may SEE the notice is a separate
       * question, already answered at render against the current family and
       * authorised viewer via the notice's original child/family metadata.
       */
      const ownsIntro = () => runGenerationRef.current === introGeneration
      /**
       * The exit intro's own identity rides on every partial notice it
       * publishes (promotion) — the payload's child and family, and the
       * generation of the intro the exit landed on. The same derived visibility
       * rule then applies to Saving, Saved, Conflict and Failed alike, so a
       * notice belonging to a retired intro is never offered on a later one.
       */
      const partialNoticeOwner = {
        runInstanceId: exitingRun.instanceId,
        viewGeneration: introGeneration,
        originalChildId: exitingRun.childId,
        originalFamilyId: exitingRun.familyId,
      }
      publishSourceSave({
        state: 'saving',
        kind: 'partial',
        canRetry: false,
        ...partialNoticeOwner,
      })
      saveResumableQuestSource(questSourceRef(exitingRun.familyId, docId), partialSession)
        .then((outcome) => {
          if (!ownsIntro()) return
          if (outcome === 'saved') {
            publishSourceSave({
              state: 'saved',
              kind: 'partial',
              canRetry: false,
              ...partialNoticeOwner,
            })
            // The intro's resume query can finish BEFORE this write lands, so
            // the card it drew would not have known about this partial. Ask the
            // page to read it again now that the record exists.
            setResumeReloadNonce((n) => n + 1)
            return
          }
          console.warn('[quest] Partial save refused —', outcome)
          publishSourceSave({
            state: 'conflict',
            kind: 'partial',
            canRetry: false,
            ...partialNoticeOwner,
          })
        })
        .catch((err) => {
          console.error('Failed to auto-save partial quest session', err)
          /**
           * The SLOT is guarded, not just the notice (UX-494).
           *
           * This rejection can arrive long after the intro it belonged to has
           * been replaced — by a newer run on the same child whose own close
           * failed and is already offering a Retry for ITS payload. Writing the
           * old partial in here silently swapped the payload under that live
           * control, so the Retry on screen re-saved a stale partial and did
           * nothing for the answers it named. A retired attempt owns neither
           * the slot nor the status: it leaves both exactly as found, and the
           * owning intro — the only surface that can offer this payload a
           * retry — is the only one that takes it.
           */
          if (!ownsIntro()) return
          pendingSourceRef.current = {
            run: exitingRun,
            payload: partialSession,
            kind: 'partial',
            viewGeneration: introGeneration,
          }
          publishSourceSave({
            state: 'failed',
            kind: 'partial',
            canRetry: true,
            ...partialNoticeOwner,
          })
        })

      // Count the partial toward instructional hours (idle-aware), exactly like a
      // completed session. Additive + guarded per run so a session that already
      // logged at endSession can't double-count (resetToIntro and endSession are
      // mutually exclusive per session anyway).
      if (!hoursLoggedRunsRef.current.has(docId)) {
        hoursLoggedRunsRef.current.add(docId)
        const activeSeconds = sessionTimer.stop()
        const minutes = Math.ceil(activeSeconds / 60 / 5) * 5
        if (minutes >= 5) {
          addDoc(hoursCollection(exitingRun.familyId), {
            childId: exitingRun.childId,
            date: todayKey(),
            minutes,
            subjectBucket: domainToSubjectBucket(domain),
            quickCapture: true,
            notes: `${exitingRun.questMode || domain} quest session (partial)`,
            source: 'knowledge-mine',
          }).catch((err) => console.error('[SessionTimer] Failed to log partial quest hours:', err))
        }
      }
    }

    if (timerRef.current) {
      clearInterval(timerRef.current)
      timerRef.current = null
    }
    sessionTimer.stop() // idempotent — no-op if the partial path already stopped/logged it
    setScreen(QuestScreen.Intro)
    setQuestState(null)
    setCurrentQuestion(null)
    setAnsweredQuestions([])
    setFindings([])
    setLastAnswer(null)
    setSessionSaved(false)
    sessionSavedRef.current = false
    setSummarizing(false)
    setStartQuestError(null)
    setHitLevelCap(false)
    setFluencyPassages([])
    setFluencyDiamonds(0)
    setCurrentPassageText('')
    conversationRef.current = []
    bonusRoundUsedRef.current = false
    activeQuestModeRef.current = undefined
    sessionIdRef.current = null
    // UX-494 — the run ends here, which is also what makes every delayed
    // callback from it stop being allowed to touch this hook's state (the
    // generation was claimed at the top of this function). Its Firestore writes
    // still finish, under its own identity.
    runRef.current = null
    // UX-339 — the session is over, so the hook goes back to following the live
    // child. Cleared LAST, after the partial save above has used it.
    sessionOwnerRef.current = null
  }, [
    questState,
    currentQuestion,
    answeredQuestions,
    findings,
    streak.currentStreak,
    sessionTimer,
    publishSourceSave,
  ])

  // UX-339 — what the quest screen needs to say whose quest this is. Read from
  // the ref at render: a header change re-renders this hook's consumers, so the
  // notice appears on the same frame the child chip moves.
  const sessionOwner = sessionOwnerRef.current
  const sessionLeftItsChild = questLeftItsChild(sessionOwner, liveChildId)

  return {
    sessionOwnerName: sessionOwner?.childName ?? '',
    sessionLeftItsChild,
    screen,
    questState,
    currentQuestion,
    answeredQuestions,
    findings,
    streak,
    lastAnswer,
    sessionSaved,
    /**
     * UX-494 — the two successes, separately. `sourceSave` is his answers under
     * this run's id; `graphSync` is the learner model's evidence, concept states
     * and the parent's queued requests. A surface that reported one as the other
     * is the defect this repair exists for.
     */
    sourceSave,
    /**
     * The same notice, with WHO may see it derived from the live identity
     * (UX-494 promotion) — what every surface renders. `sourceSave` above is
     * the settled status itself, which stays bound to the attempt that
     * produced it even when the header has moved on.
     */
    visibleSourceSave,
    /**
     * UX-496 — the live hold a completion exit must consult before it mutates
     * return state, resets or navigates. See `sourceSaveExitHold`.
     */
    sourceSaveExitHold,
    graphSync,
    retrySourceSave,
    retryGraphProjection,
    /** The scope a recovery control must be rendered — and re-checked — under. */
    recoveryScope,
    /** The epoch it was rendered under — the same-tick `A → B → A` catch. */
    recoveryEpoch: identityEpoch,
    /** The view generation a recovery control belongs to. */
    viewGeneration: runGenerationRef.current,
    /** Re-read the resume card: a partial has just landed (UX-494). */
    resumeReloadNonce,
    summarizing,
    aiLoading,
    aiError,
    startQuestError,
    hitLevelCap,
    questMode: activeQuestModeRef.current,
    /** The live run's domain — what a graph retry must find on the source. */
    questDomain: runRef.current?.domain,
    startQuest,
    resumeSession,
    /** *Start fresh instead* — the discard, in the shared intro lane (UX-494). */
    discardPartial,
    submitAnswer,
    handleSkip,
    resetToIntro,
    // Fluency-specific
    currentPassageText,
    currentPassageTargetWords,
    currentPassageSpeechWords,
    fluencyPassages,
    fluencyDiamonds,
    recordFluencyAttempt,
    requestNewFluencyPassage,
    endFluencySession,
  }
}
