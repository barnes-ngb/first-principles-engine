import { useCallback, useEffect, useRef, useState } from 'react'
import { collection, doc, getDoc, getDocs, limit as firestoreLimit, orderBy, query, setDoc, where } from 'firebase/firestore'

import { useAI, TaskType } from '../../core/ai/useAI'
import { addXpEvent } from '../../core/xp/addXpEvent'
import type { ChatMessage as AIChatMessage } from '../../core/ai/useAI'
import { useFamilyId } from '../../core/auth/useAuth'
import { db, evaluationSessionsCollection, skillSnapshotsCollection, workbookConfigsCollection } from '../../core/firebase/firestore'
import { useActiveChild } from '../../core/hooks/useActiveChild'
import type { EvaluationFinding, EvaluationSession, PrioritySkill, SkillSnapshot, WordProgress } from '../../core/types'
import type { EvaluationDomain } from '../../core/types/enums'
import { MasteryGate, SkillLevel } from '../../core/types/enums'
import { calculateStreak, computeNextState, formatSkillLabel, shouldEndSession } from './questAdaptive'
import { checkAnswer, extractPattern, extractTargetWord, generateFallbackQuestion, shouldFlagAsError, validateQuestion } from './questHelpers'
import type {
  AnswerInputMethod,
  InteractiveSessionData,
  QuestQuestion,
  QuestState,
  QuestStreak,
  SessionQuestion,
} from './questTypes'
import {
  FRUSTRATION_LIMIT,
  QuestScreen,
  VALIDATION_RETRIES,
} from './questTypes'

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
  const [previousSessions, setPreviousSessions] = useState<Array<{ evaluatedAt: string }>>([])
  const activeDomainRef = useRef<EvaluationDomain>('reading')

  const conversationRef = useRef<AIChatMessage[]>([])
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const questionStartRef = useRef<number>(0)
  const bonusRoundUsedRef = useRef(false)

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
    async (domain: EvaluationDomain) => {
      if (!activeChildId || !activeChild) return

      // Determine starting level from curriculum completion data
      let startLevel = 2
      if (domain === 'reading') {
        try {
          const wbQuery = query(
            workbookConfigsCollection(familyId),
            where('childId', '==', activeChildId),
          )
          const wbSnap = await getDocs(wbQuery)
          for (const wbDoc of wbSnap.docs) {
            const config = wbDoc.data()
            if (config.subjectBucket !== 'Reading') continue
            if (!config.curriculum) continue
            if (config.curriculum.completed) {
              startLevel = Math.max(startLevel, 5)
            }
            const mastered = config.curriculum.masteredSkills ?? []
            if (mastered.includes('vowel-teams-ea-ai-oa-ee-oo')) {
              startLevel = Math.max(startLevel, 6)
            }
            if (mastered.includes('diphthongs-ear-ue') || mastered.includes('le-endings')) {
              startLevel = Math.max(startLevel, 7)
            }
          }
        } catch (err) {
          console.warn('[startQuest] Failed to load curriculum data for starting level', err)
        }
      }

      const now = new Date().toISOString()
      const initialState: QuestState = {
        currentLevel: startLevel,
        consecutiveCorrect: 0,
        consecutiveWrong: 0,
        levelDownsInARow: 0,
        totalQuestions: 0,
        totalCorrect: 0,
        questionsThisLevel: 0,
        startedAt: now,
        elapsedSeconds: 0,
      }

      activeDomainRef.current = domain
      setStartQuestError(null)
      setQuestState(initialState)
      setAnsweredQuestions([])
      setFindings([])
      setCurrentQuestion(null)
      setLastAnswer(null)
      setSessionSaved(false)
      setScreen(QuestScreen.Loading)
      conversationRef.current = []
      bonusRoundUsedRef.current = false

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

      // Save to Firestore
      const timestamp = Date.now()
      const docId = `interactive_${activeChildId}_${timestamp}`

      const skippedCount = questions.filter((q) => q.skipped).length
      const flaggedErrorCount = questions.filter((q) => q.flaggedAsError).length

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
        addXpEvent(
          familyId,
          activeChildId,
          'QUEST_DIAMOND',
          finalState.totalCorrect,
          `quest-complete_${docId}-diamond`,
          {
            domain,
            questionsCorrect: String(finalState.totalCorrect),
          },
          { currencyType: 'diamond', category: 'earn' },
        ).catch((err) => console.warn('Failed to award quest diamonds', err))
      }

      // Auto-apply findings to skill snapshot
      if (findings.length > 0) {
        try {
          const snapshotRef = doc(skillSnapshotsCollection(familyId), activeChildId)
          const snapshotSnap = await getDoc(snapshotRef)
          const existing: Partial<SkillSnapshot> = snapshotSnap.exists()
            ? snapshotSnap.data()
            : {}

          // Build priority skills from findings
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

          const updated = {
            childId: activeChildId,
            prioritySkills: [...existingSkills, ...newPrioritySkills],
            supports: existing.supports || [],
            stopRules: existing.stopRules || [],
            evidenceDefinitions: existing.evidenceDefinitions || [],
            updatedAt: new Date().toISOString(),
          }

          await setDoc(snapshotRef, JSON.parse(JSON.stringify(updated)))
        } catch (err) {
          // Don't block session save if snapshot update fails
          console.warn('Failed to auto-apply quest findings to skill snapshot', err)
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
    },
    [activeChildId, familyId, findings, previousSessions, chat, analyzePatterns],
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

      // Compute new adaptive state
      const newState = computeNextState(questState, correct)
      setQuestState(newState)

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
    },
    [currentQuestion, questState, activeChildId, answeredQuestions, familyId, chat, endSession],
  )

  // ── Reset to intro ────────────────────────────────────────────

  const resetToIntro = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current)
      timerRef.current = null
    }
    setScreen(QuestScreen.Intro)
    setQuestState(null)
    setCurrentQuestion(null)
    setAnsweredQuestions([])
    setFindings([])
    setLastAnswer(null)
    setSessionSaved(false)
    setSummarizing(false)
    setStartQuestError(null)
    conversationRef.current = []
    bonusRoundUsedRef.current = false
  }, [])

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
    startQuest,
    submitAnswer,
    handleSkip,
    resetToIntro,
  }
}
