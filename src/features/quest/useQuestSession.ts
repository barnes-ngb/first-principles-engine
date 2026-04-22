import { useCallback, useEffect, useRef, useState } from 'react'
import { addDoc, collection, doc, getDoc, getDocs, limit as firestoreLimit, orderBy, query, setDoc, updateDoc, where } from 'firebase/firestore'

import { useAI, TaskType } from '../../core/ai/useAI'
import { updateSkillMapFromFindings } from '../../core/curriculum/updateSkillMapFromFindings'
import { addXpEvent } from '../../core/xp/addXpEvent'
import { addDiamondEvent } from '../../core/xp/addDiamondEvent'
import { DIAMOND_EVENTS } from '../../core/types'
import type { ChatMessage as AIChatMessage } from '../../core/ai/useAI'
import { useFamilyId } from '../../core/auth/useAuth'
import { activityConfigsCollection, db, evaluationSessionsCollection, hoursCollection, skillSnapshotsCollection } from '../../core/firebase/firestore'
import { useActiveChild } from '../../core/hooks/useActiveChild'
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
import { computeStartLevel, computeWorkingLevelFromSession, canOverwriteWorkingLevel } from './workingLevels'
import type { CurriculumLevelHint } from './workingLevels'

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

    // Validate minimum required fields
    if (!parsed.prompt && !parsed.options) {
      console.warn('[parseQuestBlock] Parsed JSON but missing prompt/options:', Object.keys(parsed))
      return null
    }

    const rawTargeted = typeof parsed.targetedBlockerId === 'string'
      ? parsed.targetedBlockerId.trim()
      : ''
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
  const { activeChildId, activeChild } = useActiveChild()
  const { chat, analyzePatterns, loading: aiLoading, error: aiError } = useAI()

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
      sessionIdRef.current = null
      hoursLoggedRef.current = false
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
            childId: activeChildId,
            taskType: TaskType.Quest,
            messages: [fluencyMessage],
            domain,
          })

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
          childId: activeChildId,
          taskType: TaskType.Quest,
          messages: [userMessage],
          domain,
        })
      } catch (err) {
        clearTimeout(timeoutId)
        const errMsg = err instanceof Error ? err.message : String(err)
        console.error('[startQuest] AI call threw:', err)
        setStartQuestError(`Quest failed: ${errMsg}`)
        setScreen(QuestScreen.Intro)
        if (timerRef.current) clearInterval(timerRef.current)
        return
      }

      clearTimeout(timeoutId)

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

  // ── End session ───────────────────────────────────────────────

  const endSession = useCallback(
    async (
      questions: SessionQuestion[],
      finalState: QuestState,
      timedOut: boolean,
    ) => {
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

      // Calculate streak (including this session)
      const todayStr = getDateString(new Date())
      const sessionsIncludingToday = [
        { evaluatedAt: todayStr },
        ...previousSessions,
      ]
      const newStreak = calculateStreak(sessionsIncludingToday)
      setStreak(newStreak)

      if (!activeChildId) return

      // Request AI-generated summary
      const domain = activeDomainRef.current
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
          familyId,
          childId: activeChildId,
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
        setSummarizing(false)
      }

      // Fallback: generate client-side recommendations if AI didn't produce any
      if (sessionRecommendations.length === 0 && findings.length > 0) {
        sessionRecommendations = generateFallbackRecommendations(findings, finalState.currentLevel, domain)
      }

      // Fallback: generate level-based recommendation even with no findings
      if (sessionRecommendations.length === 0) {
        sessionRecommendations = generateFallbackRecommendations([], finalState.currentLevel, domain)
      }

      // Save to Firestore — reuse existing sessionId if resuming, else generate new
      const docId = sessionIdRef.current ?? `interactive_${activeChildId}_${Date.now()}`
      sessionIdRef.current = docId

      const skippedCount = questions.filter((q) => q.skipped).length
      const flaggedErrorCount = questions.filter((q) => q.flaggedAsError).length

      const questMode = activeQuestModeRef.current
      const session: EvaluationSession & InteractiveSessionData = {
        childId: activeChildId,
        domain,
        status: 'complete',
        messages: [],
        findings,
        recommendations: sessionRecommendations,
        summary: summaryText,
        evaluatedAt: new Date().toISOString(),
        sessionType: 'interactive',
        questMode,
        questions,
        finalLevel: finalState.currentLevel,
        totalCorrect: finalState.totalCorrect,
        totalQuestions: finalState.totalQuestions,
        diamondsMined: finalState.totalCorrect,
        streakDays: newStreak.currentStreak,
        timedOut,
        skippedCount: skippedCount || undefined,
        flaggedErrorCount: flaggedErrorCount || undefined,
      }

      try {
        const ref = doc(evaluationSessionsCollection(familyId), docId)
        await setDoc(ref, JSON.parse(JSON.stringify(session)))
        setSessionSaved(true)
      } catch (err) {
        console.error('Failed to save quest session', err)
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
            subjectBucket: domainToSubjectBucket(domain),
            quickCapture: true,
            notes: `${questMode || domain} quest session`,
            source: 'knowledge-mine',
          }).catch((err) => console.error('[SessionTimer] Failed to log quest hours:', err))
        }
      }

      // Award XP via addXpEvent (handles dedup, avatar profile update, armor unlocks)
      // 1) Quest completion bonus (flat 15 XP)
      addXpEvent(
        familyId,
        activeChildId,
        'QUEST_COMPLETE',
        15,
        `quest-complete_${docId}`,
        { domain },
      ).catch((err) => console.warn('Failed to award quest completion XP', err))

      // 2) Diamond bonus (2 XP per diamond mined)
      const XP_PER_DIAMOND = 2
      const questXp = finalState.totalCorrect * XP_PER_DIAMOND

      if (questXp > 0) {
        const dedupKey = `quest_${docId}`
        addXpEvent(
          familyId,
          activeChildId,
          'QUEST_DIAMOND',
          questXp,
          dedupKey,
          {
            domain,
            questionsCorrect: String(finalState.totalCorrect),
            questionsTotal: String(finalState.totalQuestions),
            finalLevel: String(finalState.currentLevel),
          },
        ).catch((err) => console.warn('Failed to award quest diamond XP', err))
      }

      // 3) Award diamonds: 1 per correct answer
      if (finalState.totalCorrect > 0) {
        addDiamondEvent({
          familyId,
          childId: activeChildId,
          amount: finalState.totalCorrect,
          type: DIAMOND_EVENTS.QUEST_COMPLETE,
          reason: `Quest: ${domain} (${finalState.totalCorrect} correct)`,
          dedupKey: `quest-complete_${docId}-diamond`,
        }).catch((err) => console.warn('Failed to award quest diamonds', err))
      }

      // Auto-apply findings to skill snapshot + update working level
      try {
        const snapshotRef = doc(skillSnapshotsCollection(familyId), activeChildId)
        const snapshotSnap = await getDoc(snapshotRef)
        const existing: Partial<SkillSnapshot> = snapshotSnap.exists()
          ? snapshotSnap.data()
          : {}

        // Build priority skills from findings (if any)
        const newPrioritySkills: PrioritySkill[] = findings
          .filter((f) => f.status === 'emerging' || f.status === 'not-yet')
          .map((f) => ({
            tag: f.skill,
            label: formatSkillLabel(f.skill),
            level: SkillLevel.Emerging,
            masteryGate: MasteryGate.NotYet,
            notes: `${f.evidence} (Quest ${new Date().toLocaleDateString()})`,
          }))

        // Update mastered skills
        for (const f of findings) {
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
          if (canOverwriteWorkingLevel(currentLevel)) {
            mergedWorkingLevels = { ...mergedWorkingLevels, [modeKey]: newWorkingLevel }
          }
        }

        const updated = {
          childId: activeChildId,
          prioritySkills: findings.length > 0
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
      } catch (err) {
        // Don't block session save if snapshot update fails
        console.warn('Failed to auto-apply quest findings/working level to skill snapshot', err)
      }

      // Update Learning Map from findings (fire-and-forget)
      if (findings.length > 0) {
        updateSkillMapFromFindings(familyId, activeChildId, findings)
          .catch((err) => console.warn('[LearningMap] Failed to update from quest findings', err))
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
              collection(db, `families/${familyId}/children/${activeChildId}/wordProgress`),
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
          evaluationSessionsCollection(familyId),
          where('childId', '==', activeChildId),
          orderBy('evaluatedAt', 'desc'),
          firestoreLimit(10),
        )
        const sessionsSnap = await getDocs(sessionsQuery)

        if (sessionsSnap.size >= 3) {
          analyzePatterns({
            familyId,
            childId: activeChildId,
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
        const dayRef = doc(db, `families/${familyId}/days/${activeChildId}_${today}`)
        const daySnap = await getDoc(dayRef)

        if (daySnap.exists()) {
          const dayData = daySnap.data()
          const items = dayData.checklist || []
          const questMode = activeQuestModeRef.current

          const matchIdx = items.findIndex((item: Record<string, unknown>) =>
            item.itemType === 'evaluation' &&
            !item.completed &&
            (
              (questMode === 'comprehension' && item.evaluationMode === 'comprehension') ||
              (questMode === 'phonics' && item.evaluationMode === 'phonics') ||
              (questMode === 'fluency' && item.evaluationMode === 'fluency') ||
              (domain === 'math' && item.evaluationMode === 'math') ||
              (typeof item.title === 'string' && item.title.toLowerCase().includes(domain))
            ),
          )

          if (matchIdx >= 0) {
            const updatedItems = items.map((item: Record<string, unknown>, i: number) =>
              i === matchIdx
                ? {
                    ...item,
                    completed: true,
                    completedAt: new Date().toISOString(),
                    actualMinutes: Math.round((finalState.totalQuestions * 30 + (questState?.elapsedSeconds || 0)) / 60) || finalState.totalQuestions,
                  }
                : item,
            )
            const { updateDoc } = await import('firebase/firestore')
            await updateDoc(dayRef, { checklist: updatedItems })
            console.log('[Quest] Auto-completed evaluation item:', items[matchIdx].title)
          }
        }
      } catch (err) {
        console.warn('[Quest] Failed to auto-complete evaluation item (non-blocking):', err)
      }
    },
    [activeChildId, familyId, findings, previousSessions, chat, analyzePatterns, questState?.elapsedSeconds, sessionTimer],
  )

  // ── Submit answer ─────────────────────────────────────────────

  const submitAnswer = useCallback(
    async (childAnswer: string, inputMethod?: AnswerInputMethod) => {
      if (!currentQuestion || !questState || !activeChildId) return

      const responseTimeMs = Date.now() - questionStartRef.current
      const correct = checkAnswer(childAnswer, currentQuestion)

      const sessionQ: SessionQuestion = {
        id: currentQuestion.id,
        type: 'multiple-choice',
        level: currentQuestion.level,
        skill: currentQuestion.skill,
        prompt: currentQuestion.prompt,
        stimulus: currentQuestion.stimulus,
        options: currentQuestion.options,
        correctAnswer: currentQuestion.correctAnswer,
        childAnswer,
        correct,
        responseTimeMs,
        timestamp: new Date().toISOString(),
        inputMethod: inputMethod || 'multiple-choice',
        targetedBlockerId: currentQuestion.targetedBlockerId,
      }

      const updatedQuestions = [...answeredQuestions, sessionQ]
      setAnsweredQuestions(updatedQuestions)

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

      // Send recent question types so AI can vary format
      const recentQuestionTypes = updatedQuestions
        .slice(-3)
        .map((q) => q.prompt.slice(0, 50))

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
        setScreen(QuestScreen.Question)
      } catch (err) {
        console.error('[submitAnswer] AI call threw — ending session gracefully', {
          error: err,
          currentLevel: newState.currentLevel,
          questMode: activeQuestModeRef.current,
          childId: activeChildId,
          totalQuestions: newState.totalQuestions,
        })

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
    [currentQuestion, questState, activeChildId, answeredQuestions, familyId, chat, endSession],
  )

  // ── Skip question ───────────────────────────────────────────

  const handleSkip = useCallback(
    async () => {
      if (!currentQuestion || !questState || !activeChildId) return

      const responseTimeMs = Date.now() - questionStartRef.current

      // Record skipped question — does NOT count toward adaptive state
      const flagged = shouldFlagAsError(currentQuestion)
      const sessionQ: SessionQuestion = {
        id: currentQuestion.id,
        type: 'multiple-choice',
        level: currentQuestion.level,
        skill: currentQuestion.skill,
        prompt: currentQuestion.prompt,
        stimulus: currentQuestion.stimulus,
        options: currentQuestion.options,
        correctAnswer: currentQuestion.correctAnswer,
        childAnswer: '',
        correct: false,
        skipped: true,
        flaggedAsError: flagged || undefined,
        responseTimeMs,
        timestamp: new Date().toISOString(),
        targetedBlockerId: currentQuestion.targetedBlockerId,
      }

      const updatedQuestions = [...answeredQuestions, sessionQ]
      setAnsweredQuestions(updatedQuestions)

      // DO NOT call computeNextState — skip doesn't affect adaptive state
      // DO NOT increment totalQuestions — question counter stays the same

      // Request replacement question at same level
      setScreen(QuestScreen.Loading)

      const recentQuestionTypes = updatedQuestions
        .slice(-3)
        .map((q) => q.prompt.slice(0, 50))

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
        setScreen(QuestScreen.Question)
      } catch (err) {
        console.error('[handleSkip] AI call threw — ending session gracefully', {
          error: err,
          currentLevel: questState.currentLevel,
          questMode: activeQuestModeRef.current,
          childId: activeChildId,
          totalQuestions: questState.totalQuestions,
        })

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
        const dayRef = doc(db, `families/${familyId}/days/${activeChildId}_${today}`)
        const daySnap = await getDoc(dayRef)

        if (daySnap.exists()) {
          const dayData = daySnap.data()
          const items = dayData.checklist || []

          const matchIdx = items.findIndex((item: Record<string, unknown>) =>
            item.itemType === 'evaluation' &&
            !item.completed &&
            item.evaluationMode === 'fluency',
          )

          if (matchIdx >= 0) {
            const updatedItems = items.map((item: Record<string, unknown>, i: number) =>
              i === matchIdx
                ? {
                    ...item,
                    completed: true,
                    completedAt: new Date().toISOString(),
                    actualMinutes: Math.round(totalTime / 60) || 1,
                  }
                : item,
            )
            const { updateDoc } = await import('firebase/firestore')
            await updateDoc(dayRef, { checklist: updatedItems })
            console.log('[Fluency] Auto-completed evaluation item:', items[matchIdx].title)
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
      sessionIdRef.current = docId

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

      // Mark the Firestore doc as 'resumed' so it doesn't show up in the resume card again
      const ref = doc(evaluationSessionsCollection(familyId), docId)
      updateDoc(ref, { status: 'resumed' }).catch((err) =>
        console.error('[resumeSession] Failed to mark session as resumed', err),
      )

      return true
    },
    [familyId],
  )

  // ── Reset to intro ────────────────────────────────────────────

  const resetToIntro = useCallback(() => {
    // Auto-save partial session if quest is in progress with answered questions.
    // Skip if session was saved or is currently being saved as complete — the
    // ref is set synchronously at endSession start, so this blocks ghost docs
    // even if Done is tapped before setSessionSaved(true) propagates.
    if (
      questState &&
      questState.totalQuestions > 0 &&
      !sessionSavedRef.current &&
      activeChildId &&
      familyId
    ) {
      // Reuse existing sessionId if resuming, otherwise generate new one
      const docId = sessionIdRef.current ?? `interactive_${activeChildId}_${Date.now()}`
      const domain = activeDomainRef.current
      const skippedCount = answeredQuestions.filter((q) => q.skipped).length
      const flaggedErrorCount = answeredQuestions.filter((q) => q.flaggedAsError).length

      const partialSession: EvaluationSession & InteractiveSessionData = {
        childId: activeChildId,
        domain,
        status: 'in-progress',
        messages: [],
        findings,
        recommendations: [],
        summary: `Partial session: ${questState.totalCorrect}/${questState.totalQuestions} correct at level ${questState.currentLevel} (exited early)`,
        evaluatedAt: new Date().toISOString(),
        sessionType: 'interactive',
        questMode: activeQuestModeRef.current,
        questions: answeredQuestions,
        finalLevel: questState.currentLevel,
        totalCorrect: questState.totalCorrect,
        totalQuestions: questState.totalQuestions,
        diamondsMined: questState.totalCorrect,
        streakDays: streak.currentStreak,
        skippedCount: skippedCount || undefined,
        flaggedErrorCount: flaggedErrorCount || undefined,
        // Resume support: save full state needed to restore session
        savedQuestState: questState,
        savedCurrentQuestion: currentQuestion ?? undefined,
        bonusRoundUsed: bonusRoundUsedRef.current,
      }

      // Fire-and-forget save — don't block the UI reset
      const ref = doc(evaluationSessionsCollection(familyId), docId)
      setDoc(ref, JSON.parse(JSON.stringify(partialSession))).catch((err) =>
        console.error('Failed to auto-save partial quest session', err),
      )
    }

    if (timerRef.current) {
      clearInterval(timerRef.current)
      timerRef.current = null
    }
    sessionTimer.stop() // discard idle-aware timer without logging
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
  }, [questState, currentQuestion, activeChildId, familyId, answeredQuestions, findings, streak.currentStreak, sessionTimer])

  return {
    screen,
    questState,
    currentQuestion,
    answeredQuestions,
    findings,
    streak,
    lastAnswer,
    sessionSaved,
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
