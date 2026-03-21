import { useCallback, useEffect, useRef, useState } from 'react'

// Web Speech API types (not universally present in TS DOM lib)
interface SpeechRecognition extends EventTarget {
  lang: string
  interimResults: boolean
  maxAlternatives: number
  onresult: ((event: SpeechRecognitionEvent) => void) | null
  onerror: ((event: Event) => void) | null
  onend: (() => void) | null
  start(): void
  stop(): void
  abort(): void
}
declare const SpeechRecognition: { new (): SpeechRecognition }
interface SpeechRecognitionEvent extends Event {
  readonly results: SpeechRecognitionResultList
}
declare global {
  interface Window {
    SpeechRecognition?: typeof SpeechRecognition
  }
}

// ── Question definitions ─────────────────────────────────────────

export interface StoryQuestion {
  text: string
  hint: string
}

export const LINCOLN_QUESTIONS: StoryQuestion[] = [
  { text: "Who is the hero of your story?", hint: "Is it you? A creeper? A knight?" },
  { text: "Where does the story happen?", hint: "A cave? The nether? A jungle? Outer space?" },
  { text: "What problem does the hero have to solve?", hint: "A monster? A missing treasure? A broken portal?" },
  { text: "How does the hero solve it?", hint: "With a sword? Magic? A friend? Being really smart?" },
  { text: "How does the story end?", hint: "Win a battle? Find something? Build something cool?" },
]

export const LONDON_QUESTIONS: StoryQuestion[] = [
  { text: "Who is in your story?", hint: "A bunny? A princess? A talking flower? YOU?" },
  { text: "Where do they live?", hint: "A garden? A cloud? Under the sea? A cozy cottage?" },
  { text: "What happens one day that's surprising?", hint: "They find something magical? A new friend arrives? Something goes missing?" },
  { text: "Who helps them?", hint: "A friend? An animal? A fairy? Their family?" },
  { text: "What happens at the end that makes everyone happy?", hint: "" },
]

// ── Story brief types ───────────────────────────────────────────

export interface StoryBrief {
  childId: string
  childAge: number
  theme: 'minecraft' | 'storybook'
  hero: string
  setting: string
  problem: string
  solution: string
  ending: string
  extraDetail?: string
  sightWords?: string[]
}

/** Assemble the story brief into a natural-language paragraph for the generator. */
export function assembleStoryPrompt(brief: StoryBrief, pageCount: number): string {
  const sentenceNote = brief.theme === 'storybook' ? ' Use short sentences of 5-8 words.' : ''
  const parts: string[] = [
    `Write a story for a ${brief.childAge}-year-old about ${brief.hero || 'a brave hero'} who lives in ${brief.setting || 'a magical place'}.`,
    `One day ${brief.problem || 'something amazing happened'}.`,
    `They solve it by ${brief.solution || 'being clever and brave'}.`,
    `In the end, ${brief.ending || 'everyone was happy'}.`,
  ]
  if (brief.extraDetail) {
    parts.push(brief.extraDetail)
  }
  if (brief.sightWords && brief.sightWords.length > 0) {
    parts.push(`Include these words naturally in the story: ${brief.sightWords.join(', ')}.`)
  }
  parts.push(`Make it ${pageCount} pages long.${sentenceNote}`)
  return parts.join(' ')
}

// ── Voice recording state ───────────────────────────────────────

export const VoiceState = {
  Idle: 'idle',
  Recording: 'recording',
  Confirming: 'confirming',
} as const
export type VoiceState = (typeof VoiceState)[keyof typeof VoiceState]

// ── Hook ────────────────────────────────────────────────────────

export function useStoryGuide(isLincoln: boolean) {
  const questions = isLincoln ? LINCOLN_QUESTIONS : LONDON_QUESTIONS

  const [currentIndex, setCurrentIndex] = useState(0)
  const [answers, setAnswers] = useState<(string | undefined)[]>(Array(5).fill(undefined))
  const [inputMode, setInputMode] = useState<'voice' | 'type'>('type')
  const [typedValue, setTypedValue] = useState('')
  const [voiceState, setVoiceState] = useState<VoiceState>(VoiceState.Idle)
  const [transcription, setTranscription] = useState('')
  const [aiShapingQuestion, setAiShapingQuestion] = useState<string | null>(null)
  const [aiShapingAnswer, setAiShapingAnswer] = useState<string | undefined>(undefined)
  const [showAiShaping, setShowAiShaping] = useState(false)

  // Use a ref so the recognition handler closure sees stable values
  const voiceStateRef = useRef<VoiceState>(VoiceState.Idle)
  voiceStateRef.current = voiceState

  // Stable ref to the recognition instance
  type SpeechRecognitionInstance = InstanceType<typeof SpeechRecognition>
  const recognitionRef = useRef<SpeechRecognitionInstance | null>(null)

  // ── TTS ──────────────────────────────────────────────────────

  const speakText = useCallback((text: string) => {
    if (!('speechSynthesis' in window)) return
    window.speechSynthesis.cancel()
    const utterance = new SpeechSynthesisUtterance(text)
    utterance.rate = 0.85
    window.speechSynthesis.speak(utterance)
  }, [])

  // Read question aloud when index changes
  useEffect(() => {
    if (currentIndex < questions.length) {
      speakText(questions[currentIndex].text)
    }
    // Cancel TTS when unmounting or switching questions
    return () => {
      window.speechSynthesis?.cancel()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentIndex])

  // ── Voice recording ──────────────────────────────────────────

  const startRecording = useCallback(() => {
    const SpeechRecognitionCtor =
      (window as typeof window & { webkitSpeechRecognition?: typeof SpeechRecognition })
        .webkitSpeechRecognition ?? window.SpeechRecognition
    if (!SpeechRecognitionCtor) return

    const recognition = new SpeechRecognitionCtor()
    recognition.lang = 'en-US'
    recognition.interimResults = false
    recognition.maxAlternatives = 1

    recognition.onresult = (event: SpeechRecognitionEvent) => {
      const text = event.results[0][0].transcript
      setTranscription(text)
      setVoiceState(VoiceState.Confirming)
    }

    recognition.onerror = () => {
      setVoiceState(VoiceState.Idle)
    }

    recognition.onend = () => {
      if (voiceStateRef.current === VoiceState.Recording) {
        setVoiceState(VoiceState.Idle)
      }
    }

    recognitionRef.current = recognition
    recognition.start()
    setVoiceState(VoiceState.Recording)
  }, [])

  const stopRecording = useCallback(() => {
    recognitionRef.current?.stop()
  }, [])

  // ── Answer management ────────────────────────────────────────

  const saveAnswer = useCallback(
    (value: string | undefined) => {
      setAnswers((prev) => {
        const next = [...prev]
        next[currentIndex] = value
        return next
      })
    },
    [currentIndex],
  )

  const confirmTranscription = useCallback(() => {
    saveAnswer(transcription)
    setTranscription('')
    setVoiceState(VoiceState.Idle)
    if (currentIndex < questions.length - 1) {
      setCurrentIndex((i) => i + 1)
      setTypedValue('')
    } else {
      setCurrentIndex(questions.length) // signals "done"
    }
  }, [currentIndex, transcription, questions.length, saveAnswer])

  const retryRecording = useCallback(() => {
    setTranscription('')
    setVoiceState(VoiceState.Idle)
  }, [])

  const advanceWithTyped = useCallback(() => {
    saveAnswer(typedValue.trim() || undefined)
    setTypedValue('')
    if (currentIndex < questions.length - 1) {
      setCurrentIndex((i) => i + 1)
    } else {
      setCurrentIndex(questions.length)
    }
  }, [currentIndex, typedValue, questions.length, saveAnswer])

  const skip = useCallback(() => {
    saveAnswer(undefined)
    setTypedValue('')
    setTranscription('')
    setVoiceState(VoiceState.Idle)
    if (currentIndex < questions.length - 1) {
      setCurrentIndex((i) => i + 1)
    } else {
      setCurrentIndex(questions.length)
    }
  }, [currentIndex, questions.length, saveAnswer])

  const goBack = useCallback(() => {
    if (currentIndex > 0) {
      const prevIndex = currentIndex - 1
      setCurrentIndex(prevIndex)
      setTypedValue(answers[prevIndex] ?? '')
      setVoiceState(VoiceState.Idle)
      setTranscription('')
    }
  }, [currentIndex, answers])

  const isDone = currentIndex >= questions.length

  // ── Story brief assembly ─────────────────────────────────────

  const assembleBrief = useCallback(
    (
      childId: string,
      childAge: number,
      sightWords: string[],
    ): StoryBrief => ({
      childId,
      childAge,
      theme: isLincoln ? 'minecraft' : 'storybook',
      hero: answers[0] ?? '',
      setting: answers[1] ?? '',
      problem: answers[2] ?? '',
      solution: answers[3] ?? '',
      ending: answers[4] ?? '',
      ...(aiShapingAnswer ? { extraDetail: aiShapingAnswer } : {}),
      ...(sightWords.length > 0 ? { sightWords: sightWords.slice(0, 10) } : {}),
    }),
    [isLincoln, answers, aiShapingAnswer],
  )

  return {
    questions,
    currentIndex,
    answers,
    inputMode,
    setInputMode,
    typedValue,
    setTypedValue,
    voiceState,
    transcription,
    startRecording,
    stopRecording,
    confirmTranscription,
    retryRecording,
    advanceWithTyped,
    skip,
    goBack,
    isDone,
    aiShapingQuestion,
    setAiShapingQuestion,
    aiShapingAnswer,
    setAiShapingAnswer,
    showAiShaping,
    setShowAiShaping,
    speakText,
    assembleBrief,
  } as const
}
