import { useCallback, useEffect, useRef, useState } from 'react'
import { doc, getDoc, getDocs, orderBy, query, setDoc, where } from 'firebase/firestore'

import { useAI, TaskType } from '../../core/ai/useAI'
import type { ChatMessage as AIChatMessage } from '../../core/ai/useAI'
import { useFamilyId } from '../../core/auth/useAuth'
import { evaluationSessionsCollection, skillSnapshotsCollection } from '../../core/firebase/firestore'
import { useActiveChild } from '../../core/hooks/useActiveChild'
import type { EvaluationFinding, EvaluationSession, PrioritySkill, SkillSnapshot } from '../../core/types/domain'
import type { EvaluationDomain } from '../../core/types/enums'
import { MasteryGate, SkillLevel } from '../../core/types/enums'
import { calculateStreak, computeNextState, formatSkillLabel, shouldEndSession } from './questAdaptive'
import type {
  InteractiveSessionData,
  QuestQuestion,
  QuestState,
  QuestStreak,
  SessionQuestion,
} from './questTypes'
import {
  QuestScreen,
} from './questTypes'

// ── Helpers ─────────────────────────────────────────────────────

function parseQuestBlock(text: string): QuestQuestion | null {
  // Try <quest>...</quest> block first
  const regex = /<quest>([\s\S]*?)<\/quest>/
  const match = regex.exec(text)
  const jsonStr = match ? match[1] : text

  try {
    const parsed = JSON.parse(jsonStr.trim())
    return {
      id: `q_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      type: 'multiple-choice',
      level: parsed.level ?? 2,
      skill: parsed.skill ?? '',
      prompt: parsed.prompt ?? '',
      phonemeDisplay: parsed.phonemeDisplay,
      options: parsed.options ?? [],
      correctAnswer: parsed.correctAnswer ?? '',
      encouragement: parsed.encouragement,
    }
  } catch {
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

function getDateString(d: Date): string {
  return d.toISOString().slice(0, 10)
}

// ── Hook ────────────────────────────────────────────────────────

export function useQuestSession() {
  const familyId = useFamilyId()
  const { activeChildId, activeChild } = useActiveChild()
  const { chat, loading: aiLoading, error: aiError } = useAI()

  const [screen, setScreen] = useState<QuestScreen>(QuestScreen.Intro)
  const [questState, setQuestState] = useState<QuestState | null>(null)
  const [currentQuestion, setCurrentQuestion] = useState<QuestQuestion | null>(null)
  const [answeredQuestions, setAnsweredQuestions] = useState<SessionQuestion[]>([])
  const [findings, setFindings] = useState<EvaluationFinding[]>([])
  const [streak, setStreak] = useState<QuestStreak>({ currentStreak: 0, lastQuestDate: null })
  const [lastAnswer, setLastAnswer] = useState<{ correct: boolean; correctAnswer: string; encouragement?: string } | null>(null)
  const [sessionSaved, setSessionSaved] = useState(false)
  const [previousSessions, setPreviousSessions] = useState<Array<{ evaluatedAt: string }>>([])

  const conversationRef = useRef<AIChatMessage[]>([])
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const questionStartRef = useRef<number>(0)

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

      const now = new Date().toISOString()
      const initialState: QuestState = {
        currentLevel: 2,
        consecutiveCorrect: 0,
        consecutiveWrong: 0,
        levelDownsInARow: 0,
        totalQuestions: 0,
        totalCorrect: 0,
        questionsThisLevel: 0,
        startedAt: now,
        elapsedSeconds: 0,
      }

      setQuestState(initialState)
      setAnsweredQuestions([])
      setFindings([])
      setCurrentQuestion(null)
      setLastAnswer(null)
      setSessionSaved(false)
      setScreen(QuestScreen.Loading)
      conversationRef.current = []

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

      const response = await chat({
        familyId,
        childId: activeChildId,
        taskType: TaskType.Quest,
        messages: [userMessage],
        domain,
      })

      if (!response) {
        setScreen(QuestScreen.Intro)
        if (timerRef.current) clearInterval(timerRef.current)
        return
      }

      conversationRef.current.push({ role: 'assistant', content: response.message })

      const question = parseQuestBlock(response.message)
      if (!question) {
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
    [activeChildId, activeChild, familyId, chat],
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

      // Calculate streak (including this session)
      const todayStr = getDateString(new Date())
      const sessionsIncludingToday = [
        { evaluatedAt: todayStr },
        ...previousSessions,
      ]
      const newStreak = calculateStreak(sessionsIncludingToday)
      setStreak(newStreak)

      if (!activeChildId) return

      // Save to Firestore
      const timestamp = Date.now()
      const docId = `interactive_${activeChildId}_${timestamp}`

      const session: EvaluationSession & InteractiveSessionData = {
        childId: activeChildId,
        domain: 'reading',
        status: 'complete',
        messages: [],
        findings,
        recommendations: [],
        summary: `Interactive reading quest: ${finalState.totalCorrect}/${finalState.totalQuestions} correct, reached level ${finalState.currentLevel}`,
        evaluatedAt: new Date().toISOString(),
        sessionType: 'interactive',
        questions,
        finalLevel: finalState.currentLevel,
        totalCorrect: finalState.totalCorrect,
        totalQuestions: finalState.totalQuestions,
        diamondsMined: finalState.totalCorrect,
        streakDays: newStreak.currentStreak,
        timedOut,
      }

      try {
        const ref = doc(evaluationSessionsCollection(familyId), docId)
        await setDoc(ref, JSON.parse(JSON.stringify(session)))
        setSessionSaved(true)
      } catch (err) {
        console.error('Failed to save quest session', err)
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
    },
    [activeChildId, familyId, findings, previousSessions],
  )

  // ── Submit answer ─────────────────────────────────────────────

  const submitAnswer = useCallback(
    async (childAnswer: string) => {
      if (!currentQuestion || !questState || !activeChildId) return

      const responseTimeMs = Date.now() - questionStartRef.current
      const correct = childAnswer.trim().toLowerCase() === currentQuestion.correctAnswer.trim().toLowerCase()

      const sessionQ: SessionQuestion = {
        id: currentQuestion.id,
        type: 'multiple-choice',
        level: currentQuestion.level,
        skill: currentQuestion.skill,
        prompt: currentQuestion.prompt,
        options: currentQuestion.options,
        correctAnswer: currentQuestion.correctAnswer,
        childAnswer,
        correct,
        responseTimeMs,
        timestamp: new Date().toISOString(),
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

      if (shouldEnd) {
        await endSession(updatedQuestions, newState, timedOut)
        return
      }

      // Request next question
      setScreen(QuestScreen.Loading)

      const userMessage: AIChatMessage = {
        role: 'user',
        content: JSON.stringify({
          action: 'answer',
          childAnswer,
          correct,
          currentLevel: newState.currentLevel,
          consecutiveCorrect: newState.consecutiveCorrect,
          consecutiveWrong: newState.consecutiveWrong,
          totalQuestions: newState.totalQuestions,
          totalCorrect: newState.totalCorrect,
          questionsThisLevel: newState.questionsThisLevel,
          levelDownsInARow: newState.levelDownsInARow,
        }),
      }

      conversationRef.current.push(userMessage)

      const response = await chat({
        familyId,
        childId: activeChildId,
        taskType: TaskType.Quest,
        messages: [...conversationRef.current],
        domain: 'reading',
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

      const question = parseQuestBlock(response.message)
      if (!question) {
        // Parse failed — end session
        await endSession(updatedQuestions, newState, false)
        return
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
    conversationRef.current = []
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
    aiLoading,
    aiError,
    startQuest,
    submitAnswer,
    resetToIntro,
  }
}
