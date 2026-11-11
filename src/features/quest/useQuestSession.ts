import { useCallback, useEffect, useRef, useState } from 'react'
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
  markQuestProjectionFailed,
  markQuestSourceResumed,
  questSourceRef,
  saveFinalQuestSource,
  saveResumableQuestSource,
  type QuestSourcePayload,
  type QuestSourceSaveOutcome,
} from './questSourceWrites'
import {
  finalizedQuestSourcePayload,
  isLiveRun,
  mayRecoverQuestSource,
  nextRunStamp,
  questRunId as buildQuestRunId,
  resumableQuestSourcePayload,
  type QuestRun,
} from './questRun'
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
import { MasteryGate, SkillLevel } from '../../core/types/enums'
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

export function useQuestSession() {
  const familyId = useFamilyId()
  const { activeChildId: liveChildId, activeChild: liveChild, children } = useActiveChild()
  const { chat, analyzePatterns, loading: aiLoading, error: aiError } = useAI()

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
   * A start/resume generation. A `startQuest` does several awaited reads before
   * it can establish the run; without this, a second Start (or a Resume) landing
   * in that window let the first one finish and overwrite the newer run's
   * identity. Bumped by both doors; the loser returns having changed nothing.
   */
  const runGenerationRef = useRef(0)
  /** Keeps two runs started in the same millisecond from sharing an id. */
  const lastRunStampRef = useRef(0)

  /**
   * The final payload whose save has not been acknowledged, held in memory for
   * the retry its own summary offers. Sufficient before the first ack, and
   * deliberately NOT a new persistence store — an unsaved payload that outlives
   * the tab is out of scope for this repair.
   */
  const pendingSourceRef = useRef<{ run: QuestRun; payload: QuestSourcePayload } | null>(null)

  /** What the summary says about the SOURCE save (his answers). */
  const [sourceSave, setSourceSave] = useState<{
    state: 'idle' | 'saving' | 'saved' | 'failed' | 'conflict'
    /** True only while a held payload can still be retried. */
    canRetry: boolean
  }>({ state: 'idle', canRetry: false })

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

  // ── Start quest ───────────────────────────────────────────────

  const startQuest = useCallback(
    async (domain: EvaluationDomain, questMode?: QuestMode) => {
      if (!activeChildId || !activeChild) return

      // UX-494 — claim this start. Everything below re-checks the claim before
      // it establishes the run, so a Start raced by another Start or by a Resume
      // finishes having changed nothing rather than half-overwriting the winner.
      const generation = (runGenerationRef.current += 1)
      const startingChildId = activeChildId
      const startingChildName = activeChild.name

      activeQuestModeRef.current = questMode

      // Determine starting level via workingLevels fallback chain
      let curriculumHint: CurriculumLevelHint | null = null
      let snapshot: Partial<SkillSnapshot> | null = null

      try {
        // Load skill snapshot for workingLevels
        const snapshotRef = doc(skillSnapshotsCollection(familyId), activeChildId)
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
      try {
        const modelSnap = await getDoc(doc(learnerModelsCollection(familyId), startingChildId))
        if (modelSnap.exists()) {
          const model = modelSnap.data()
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
            activityConfigsCollection(familyId),
            where('childId', 'in', [activeChildId, 'both']),
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
      // the race stops here: it has written nothing and established nothing.
      if (runGenerationRef.current !== generation) return

      const startLevel = computeStartLevel(snapshot, questMode, curriculumHint)

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
      setSourceSave({ state: 'idle', canRetry: false })
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
      runRef.current = {
        runId: newRunId,
        familyId,
        childId: startingChildId,
        childName: startingChildName,
        domain,
        questMode,
        targetPlan,
        targetConceptIds: targetConcepts.map((t) => t.conceptId),
        startedAt: now,
      }
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
            const snap = await getDocs(query(sightWordProgressCollection(familyId)))
            const sightWords: string[] = []
            for (const d of snap.docs) {
              if (!d.id.startsWith(`${activeChildId}_`)) continue
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
              childName: activeChild.name,
            }),
          }
          conversationRef.current = [fluencyMessage]

          const response = await chat({
            familyId,
            childId: startingChildId,
            taskType: TaskType.Quest,
            messages: [fluencyMessage],
            domain,
          })

          // A passage that arrives after another run has taken over belongs to
          // nobody: it must not become the live question or clear the new run's
          // loading screen.
          if (runGenerationRef.current !== generation) return

          if (!response) {
            setStartQuestError('Failed to generate passage. Tap to try again!')
            setScreen(QuestScreen.Intro)
            return
          }

          conversationRef.current.push({ role: 'assistant', content: response.message })
          const parsed = parseFluencyPassage(response.message)
          if (!parsed) {
            setStartQuestError('Passage was unreadable. Tap to try again!')
            setScreen(QuestScreen.Intro)
            return
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
        } catch (err) {
          if (runGenerationRef.current !== generation) return
          const errMsg = err instanceof Error ? err.message : String(err)
          setStartQuestError(`Fluency failed: ${errMsg}`)
          setScreen(QuestScreen.Intro)
        }
        return
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
          childName: activeChild.name,
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

      // Timeout: if AI takes >30s, bail out with a message
      let timedOut = false
      const timeoutId = setTimeout(() => {
        timedOut = true
      }, 30_000)

      let response: Awaited<ReturnType<typeof chat>>
      try {
        response = await chat({
          familyId,
          childId: startingChildId,
          taskType: TaskType.Quest,
          messages: [userMessage],
          domain,
        })
      } catch (err) {
        clearTimeout(timeoutId)
        if (runGenerationRef.current !== generation) return
        const errMsg = err instanceof Error ? err.message : String(err)
        console.error('[startQuest] AI call threw:', err)
        setStartQuestError(`Quest failed: ${errMsg}`)
        setScreen(QuestScreen.Intro)
        if (timerRef.current) clearInterval(timerRef.current)
        return
      }

      clearTimeout(timeoutId)

      // The first question of a run nobody is on any more goes nowhere.
      if (runGenerationRef.current !== generation) return

      if (!response || timedOut) {
        // aiError from useAI contains the real Cloud Function error
        const realError = aiError?.message || (timedOut ? 'Request timed out' : 'No response from AI service')
        console.error('[startQuest] AI call returned null or timed out. aiError:', aiError)
        setStartQuestError(`Quest failed: ${realError}`)
        setScreen(QuestScreen.Intro)
        if (timerRef.current) clearInterval(timerRef.current)
        return
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
        return
      }

      const finding = extractQuestFinding(response.message)
      if (finding) {
        setFindings((prev) => [...prev, finding])
      }

      setCurrentQuestion(question)
      questionStartRef.current = Date.now()
      setScreen(QuestScreen.Question)
    },
    [activeChildId, activeChild, familyId, chat, aiError],
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
  // the scoped retry a reload offers for a source whose projection failed. Both
  // read the SAVED source, so the retry needs nothing from memory.
  //
  // `claim` is what keeps a delayed run out of a newer run's UI: the writes are
  // the delayed run's business and happen either way, the screen is not.

  const projectGraph = useCallback(
    async (
      target: { familyId: string; childId: string; sessionId: string; expectedRunId?: string },
      claim: () => boolean = () => true,
    ): Promise<QuestProjectionOutcome | 'failed'> => {
      if (claim()) {
        setGraphSync({
          state: 'running',
          sessionId: target.sessionId,
          childId: target.childId,
        })
      }
      const nowIso = new Date().toISOString()
      try {
        const outcome = await projectQuestSourceToModel({ ...target, nowIso })
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
        // The transaction rolled back, so nothing half-landed and the pending
        // work is still pending. Record the failure against the source itself
        // so a reload can offer the retry.
        console.warn('[quest] Failed to project quest source onto learner model', err)
        if (target.expectedRunId) {
          await markQuestProjectionFailed(
            questSourceRef(target.familyId, target.sessionId),
            target.expectedRunId,
            err instanceof Error ? err.message.slice(0, 120) : 'error',
            nowIso,
          ).catch((stampErr) =>
            console.warn('[quest] Failed to record the projection failure', stampErr),
          )
        }
        if (claim()) {
          setGraphSync({
            state: 'failed',
            sessionId: target.sessionId,
            childId: target.childId,
          })
        }
        return 'failed'
      }
    },
    [],
  )

  /**
   * The scoped retry, bound to the current authorised family and the correct
   * child. Used by the summary and by the Mine's recovery card; it repeats no
   * completion side effect, because the only thing it does is the projection.
   */
  const retryGraphProjection = useCallback(
    async (sessionId: string, childId: string, expectedRunId?: string) => {
      if (
        !mayRecoverQuestSource(familyId, children.map((c) => c.id), {
          familyId: familyId ?? '',
          childId,
        })
      ) {
        return 'identity-mismatch' as const
      }
      return projectGraph({
        familyId,
        childId,
        sessionId,
        expectedRunId: expectedRunId ?? sessionId,
      })
    },
    [familyId, children, projectGraph],
  )

  /**
   * Retry the held final payload — the source retry its own summary offers.
   *
   * In memory, and deliberately so: before the first acknowledgement there is no
   * saved document to recover from, and a new local store for unsaved answers is
   * outside this repair. It writes the SAME payload under the SAME id, so a first
   * attempt that actually committed and lost its acknowledgement is recognised
   * rather than written twice, and it runs the graph projection afterwards —
   * nothing else, so no completion side effect is repeated.
   */
  const retrySourceSave = useCallback(async () => {
    const pending = pendingSourceRef.current
    if (!pending) return 'nothing-pending' as const
    const { run, payload } = pending
    if (!mayRecoverQuestSource(familyId, children.map((c) => c.id), run)) {
      return 'identity-mismatch' as const
    }

    setSourceSave({ state: 'saving', canRetry: false })
    let outcome: QuestSourceSaveOutcome | 'failed'
    try {
      outcome = await saveFinalQuestSource(questSourceRef(run.familyId, run.runId), payload)
    } catch (err) {
      console.error('Failed to save quest session on retry', err)
      outcome = 'failed'
    }

    if (outcome === 'saved' || outcome === 'already-committed') {
      pendingSourceRef.current = null
      setSessionSaved(true)
      setSourceSave({ state: 'saved', canRetry: false })
      if (payload.status === 'complete') {
        await projectGraph({
          familyId: run.familyId,
          childId: run.childId,
          sessionId: run.runId,
          expectedRunId: run.runId,
        })
      } else {
        setGraphSync({ state: 'skipped', sessionId: run.runId, childId: run.childId })
      }
      return outcome
    }
    if (outcome === 'conflict') {
      pendingSourceRef.current = null
      setSourceSave({ state: 'conflict', canRetry: false })
      return outcome
    }
    setSourceSave({ state: 'failed', canRetry: true })
    return outcome
  }, [familyId, children, projectGraph])

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
      setSourceSave({ state: 'saving', canRetry: false })
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
        if (pendingSourceRef.current?.run.runId === run.runId) pendingSourceRef.current = null
      }
      const sourceCommitted = saveOutcome === 'saved' || saveOutcome === 'already-committed'
      if (sourceCommitted) {
        clearPendingIfMine()
        if (live()) {
          setSessionSaved(true)
          setSourceSave({ state: 'saved', canRetry: false })
        }
      } else if (saveOutcome === 'conflict') {
        clearPendingIfMine()
        if (live()) setSourceSave({ state: 'conflict', canRetry: false })
      } else if (live()) {
        // Held in memory so this summary can offer a real retry of THIS payload.
        pendingSourceRef.current = { run, payload }
        setSourceSave({ state: 'failed', canRetry: true })
      }

      // FEAT-54 / UX-494 — fold the queued preferred-concept results back into
      // the learner model, FROM THE SAVED SOURCE and only once it is an
      // acknowledged, sufficient, complete record. A denied save now produces
      // zero graph changes, and an insufficient close stays a preserved partial
      // with its request still waiting. Never blocks close; the snapshot /
      // findings pipeline below is untouched.
      if (sourceCommitted && sufficient) {
        void projectGraph(
          {
            familyId: run.familyId,
            childId: run.childId,
            sessionId: docId,
            expectedRunId: run.runId,
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
      // still logs its own minutes and cannot be credited twice.
      if (!hoursLoggedRunsRef.current.has(run.runId)) {
        hoursLoggedRunsRef.current.add(run.runId)
        hoursLoggedRef.current = true
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
    [findings, previousSessions, chat, analyzePatterns, questState?.elapsedSeconds, sessionTimer, bankAnswerReward, projectGraph],
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
          return
        }

        await endSession(updatedQuestions, questState, false)
      }
    },
    [currentQuestion, questState, activeChildId, answeredQuestions, familyId, chat, endSession],
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
    (partialDoc: EvaluationSession & Partial<InteractiveSessionData> & { id?: string }) => {
      if (!familyId) return

      // Validate required resume fields
      const saved = partialDoc.savedQuestState
      if (!saved || !partialDoc.savedCurrentQuestion) {
        console.warn('[resumeSession] Partial session missing savedQuestState or savedCurrentQuestion — cannot resume')
        return false
      }

      // Restore session identity so endSession updates this doc, not creates a new one
      const docId = partialDoc.id
      if (!docId) {
        console.warn('[resumeSession] Partial session missing doc id — cannot resume')
        return false
      }
      // UX-494 — a Resume claims the run, so a `startQuest` still awaiting its
      // reads cannot establish itself on top of the session just reopened.
      runGenerationRef.current += 1
      sessionIdRef.current = docId

      // UX-339 — a resumed session belongs to the child on the DOCUMENT, never
      // to whoever the header happens to be on. `partialDoc.childId` is what
      // the earlier run wrote, so resuming under a different active child
      // continues that child's quest rather than adopting it.
      const resumedChildId = partialDoc.childId || liveChildId
      const resumedChildName = children.find((c) => c.id === resumedChildId)?.name ?? ''
      sessionOwnerRef.current = {
        childId: resumedChildId,
        childName: resumedChildName,
      }

      /**
       * UX-494 — the target plan comes off THIS partial, and only off this
       * partial.
       *
       * The ref was simply never touched here, so cold and warm Resume
       * disagreed: a freshly mounted hook resumed with no targets, and a hook
       * that had already run a session resumed holding the PREVIOUS run's
       * targets — which that session's close then attributed evidence to and
       * resolved requests for. A legacy partial saved before the plan existed
       * carries no field, and `parseQuestTargetPlan` answers `[]` for it, which
       * is what makes the two agree.
       */
      const resumedPlan = parseQuestTargetPlan(partialDoc.targetPlan)
      runRef.current = {
        runId: docId,
        familyId,
        childId: resumedChildId,
        childName: resumedChildName,
        domain: partialDoc.domain as EvaluationDomain,
        questMode: partialDoc.questMode,
        targetPlan: resumedPlan,
        targetConceptIds: resumedPlan.map((row) => row.conceptId),
        startedAt: partialDoc.evaluatedAt,
      }
      // A reopened run has not been closed, however many times it was resumed.
      closedRunsRef.current.delete(docId)
      hoursLoggedRunsRef.current.delete(docId)
      setSourceSave({ state: 'idle', canRetry: false })
      setGraphSync({ state: 'idle' })

      // Restore adaptive state
      setQuestState(saved)
      setAnsweredQuestions(partialDoc.questions ?? [])
      setFindings(partialDoc.findings ?? [])

      // Check if the saved currentQuestion was already answered (edge case: save race)
      const alreadyAnswered = (partialDoc.questions ?? []).some(
        (q) => q.id === partialDoc.savedCurrentQuestion!.id,
      )

      // Restore the exact question or flag that we need a new one
      if (alreadyAnswered) {
        // Question was answered before save completed — we'll need a fresh one.
        // Set currentQuestion to null; the normal submitAnswer→fetchNextQuestion flow
        // doesn't apply here, so we trigger a new AI call after setting screen.
        setCurrentQuestion(null)
      } else {
        setCurrentQuestion(partialDoc.savedCurrentQuestion)
      }

      // Restore refs
      bonusRoundUsedRef.current = partialDoc.bonusRoundUsed ?? false
      activeDomainRef.current = partialDoc.domain as EvaluationDomain
      activeQuestModeRef.current = partialDoc.questMode
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

      // Mark the Firestore doc as 'resumed' so it doesn't show up in the resume
      // card again — conditionally (UX-494), so a stale Resume cannot push a
      // record that has since been finalized back into a resumable state.
      markQuestSourceResumed(questSourceRef(familyId, docId)).catch((err) =>
        console.error('[resumeSession] Failed to mark session as resumed', err),
      )

      return true
    },
    [familyId, liveChildId, children],
  )

  // ── Reset to intro ────────────────────────────────────────────

  const resetToIntro = useCallback(() => {
    // Auto-save partial session if quest is in progress with answered questions.
    // Skip if session was saved or is currently being saved as complete — the
    // run is admitted to `closedRunsRef` synchronously at endSession start, so
    // this blocks ghost docs even if Done is tapped before setSessionSaved(true)
    // propagates, and does so PER RUN rather than per hook (UX-494).
    const exitingRun = runRef.current
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

      // Fire-and-forget, and CONDITIONAL (UX-494): a partial may never land on
      // top of a finalized record. A late exit tap used to turn a completed
      // session back into a resumable one, resume point and all.
      saveResumableQuestSource(questSourceRef(exitingRun.familyId, docId), partialSession)
        .then((outcome) => {
          if (outcome === 'refused-finalized') {
            console.warn('[quest] Partial save refused — this session is already finalized')
          }
        })
        .catch((err) => console.error('Failed to auto-save partial quest session', err))

      // Count the partial toward instructional hours (idle-aware), exactly like a
      // completed session. Additive + guarded per run so a session that already
      // logged at endSession can't double-count (resetToIntro and endSession are
      // mutually exclusive per session anyway).
      if (!hoursLoggedRunsRef.current.has(docId)) {
        hoursLoggedRunsRef.current.add(docId)
        hoursLoggedRef.current = true
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
    // callback from it stop being allowed to touch this hook's state. Its
    // Firestore writes still finish, under its own identity.
    runRef.current = null
    runGenerationRef.current += 1
    // UX-339 — the session is over, so the hook goes back to following the live
    // child. Cleared LAST, after the partial save above has used it.
    sessionOwnerRef.current = null
  }, [questState, currentQuestion, answeredQuestions, findings, streak.currentStreak, sessionTimer])

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
    graphSync,
    retrySourceSave,
    retryGraphProjection,
    summarizing,
    aiLoading,
    aiError,
    startQuestError,
    hitLevelCap,
    questMode: activeQuestModeRef.current,
    startQuest,
    resumeSession,
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
