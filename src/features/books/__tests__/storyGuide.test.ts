import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import {
  assembleStoryPrompt,
  LINCOLN_QUESTIONS,
  LONDON_QUESTIONS,
  useStoryGuide,
  VoiceState,
} from '../useStoryGuide'
import type { StoryBrief } from '../useStoryGuide'

// ── assembleStoryPrompt ───────────────────────────────────────────

describe('assembleStoryPrompt', () => {
  const baseBrief: StoryBrief = {
    childId: 'lincoln',
    childAge: 10,
    theme: 'minecraft',
    hero: 'Steve',
    setting: 'the nether',
    problem: 'a broken portal',
    solution: 'using a flint and steel',
    ending: 'he got home',
  }

  it('assembles all five fields into a paragraph', () => {
    const prompt = assembleStoryPrompt(baseBrief, 10)
    expect(prompt).toContain('Steve')
    expect(prompt).toContain('the nether')
    expect(prompt).toContain('a broken portal')
    expect(prompt).toContain('using a flint and steel')
    expect(prompt).toContain('he got home')
    expect(prompt).toContain('10 pages long')
  })

  it('includes sight words when provided', () => {
    const brief: StoryBrief = { ...baseBrief, sightWords: ['the', 'is', 'was'] }
    const prompt = assembleStoryPrompt(brief, 10)
    expect(prompt).toContain('the, is, was')
  })

  it('omits sight word line when sightWords is empty', () => {
    const brief: StoryBrief = { ...baseBrief, sightWords: [] }
    const prompt = assembleStoryPrompt(brief, 10)
    expect(prompt).not.toContain('Include these words')
  })

  it('omits sight word line when sightWords is undefined', () => {
    const prompt = assembleStoryPrompt(baseBrief, 10)
    expect(prompt).not.toContain('Include these words')
  })

  it('adds sentence complexity note for storybook theme (London)', () => {
    const brief: StoryBrief = { ...baseBrief, theme: 'storybook', childAge: 6 }
    const prompt = assembleStoryPrompt(brief, 6)
    expect(prompt).toContain('5-8 words')
    expect(prompt).toContain('6 pages long')
  })

  it('does NOT add sentence complexity note for minecraft theme', () => {
    const prompt = assembleStoryPrompt(baseBrief, 10)
    expect(prompt).not.toContain('5-8 words')
  })

  it('includes extraDetail when provided', () => {
    const brief: StoryBrief = { ...baseBrief, extraDetail: 'There was also a dragon!' }
    const prompt = assembleStoryPrompt(brief, 10)
    expect(prompt).toContain('There was also a dragon!')
  })

  it('falls back gracefully when hero is empty string', () => {
    const brief: StoryBrief = { ...baseBrief, hero: '' }
    const prompt = assembleStoryPrompt(brief, 10)
    expect(prompt).toContain('a brave hero')
  })

  it('falls back gracefully when setting is empty string', () => {
    const brief: StoryBrief = { ...baseBrief, setting: '' }
    const prompt = assembleStoryPrompt(brief, 10)
    expect(prompt).toContain('a magical place')
  })

  it('handles pageCount correctly — Lincoln 10, London 6', () => {
    const lincolnPrompt = assembleStoryPrompt(baseBrief, 10)
    const londonBrief: StoryBrief = { ...baseBrief, theme: 'storybook', childAge: 6 }
    const londonPrompt = assembleStoryPrompt(londonBrief, 6)
    expect(lincolnPrompt).toContain('10 pages long')
    expect(londonPrompt).toContain('6 pages long')
  })
})

// ── assembleBrief ─────────────────────────────────────────────────

describe('assembleBrief (via useStoryGuide)', () => {
  beforeEach(() => {
    vi.stubGlobal('speechSynthesis', {
      cancel: vi.fn(),
      speak: vi.fn(),
    })
    vi.stubGlobal('SpeechSynthesisUtterance', vi.fn(() => ({ rate: 1 })))
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  /** Helper: set typed value then advance (separate act() calls for batching) */
  function typeAndAdvance(result: ReturnType<typeof renderHook<ReturnType<typeof useStoryGuide>, boolean>>['result'], value: string) {
    act(() => { result.current.setTypedValue(value) })
    act(() => { result.current.advanceWithTyped() })
  }

  it('assembles a brief from all five answers (Lincoln)', () => {
    const { result } = renderHook(() => useStoryGuide(true))

    typeAndAdvance(result, 'Steve')
    typeAndAdvance(result, 'The Nether')
    typeAndAdvance(result, 'a broken portal')
    typeAndAdvance(result, 'using flint and steel')
    typeAndAdvance(result, 'he went home')

    const brief = result.current.assembleBrief('child-1', 10, [])
    expect(brief.theme).toBe('minecraft')
    expect(brief.hero).toBe('Steve')
    expect(brief.setting).toBe('The Nether')
    expect(brief.problem).toBe('a broken portal')
    expect(brief.solution).toBe('using flint and steel')
    expect(brief.ending).toBe('he went home')
    expect(brief.childId).toBe('child-1')
    expect(brief.childAge).toBe(10)
  })

  it('produces undefined fields (not null) for skipped questions', () => {
    const { result } = renderHook(() => useStoryGuide(true))

    for (let i = 0; i < 5; i++) {
      act(() => { result.current.skip() })
    }

    const brief = result.current.assembleBrief('child-1', 10, [])
    expect(brief.hero).toBe('')
    expect(brief.setting).toBe('')
    expect(brief.problem).toBe('')
    expect(brief.solution).toBe('')
    expect(brief.ending).toBe('')
    // No crash — undefined coerced to empty string by assembleBrief
    expect(() => assembleStoryPrompt(brief, 10)).not.toThrow()
  })

  it('injects sight words up to maximum 10', () => {
    const { result } = renderHook(() => useStoryGuide(true))
    const manyWords = ['a', 'an', 'the', 'is', 'was', 'are', 'he', 'she', 'it', 'we', 'they']
    const brief = result.current.assembleBrief('child-1', 10, manyWords)
    expect(brief.sightWords).toHaveLength(10)
  })

  it('omits sightWords field when no sight words provided', () => {
    const { result } = renderHook(() => useStoryGuide(true))
    const brief = result.current.assembleBrief('child-1', 10, [])
    expect(brief.sightWords).toBeUndefined()
  })

  it('uses storybook theme for London', () => {
    const { result } = renderHook(() => useStoryGuide(false))
    const brief = result.current.assembleBrief('child-2', 6, [])
    expect(brief.theme).toBe('storybook')
  })
})

// ── Question sets ─────────────────────────────────────────────────

describe('question sets', () => {
  it('Lincoln has exactly 5 questions', () => {
    expect(LINCOLN_QUESTIONS).toHaveLength(5)
  })

  it('London has exactly 5 questions', () => {
    expect(LONDON_QUESTIONS).toHaveLength(5)
  })

  it('all Lincoln questions have non-empty text', () => {
    for (const q of LINCOLN_QUESTIONS) {
      expect(q.text.length).toBeGreaterThan(0)
    }
  })
})

// ── TTS read-back ─────────────────────────────────────────────────

describe('TTS read-back', () => {
  let speakMock: ReturnType<typeof vi.fn>

  beforeEach(() => {
    speakMock = vi.fn()
    vi.stubGlobal('speechSynthesis', {
      cancel: vi.fn(),
      speak: speakMock,
    })
    vi.stubGlobal('SpeechSynthesisUtterance', vi.fn(() => ({ rate: 1 })))
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('calls speechSynthesis.speak on mount (question 0)', () => {
    renderHook(() => useStoryGuide(true))
    expect(speakMock).toHaveBeenCalled()
  })

  it('calls speechSynthesis.speak again after advancing to next question', () => {
    const { result } = renderHook(() => useStoryGuide(true))
    const callsBefore = speakMock.mock.calls.length

    act(() => { result.current.setTypedValue('Steve') })
    act(() => { result.current.advanceWithTyped() })

    expect(speakMock.mock.calls.length).toBeGreaterThan(callsBefore)
  })
})

// ── Voice transcription confirmation flow ─────────────────────────

describe('voice transcription confirmation', () => {
  beforeEach(() => {
    vi.stubGlobal('speechSynthesis', { cancel: vi.fn(), speak: vi.fn() })
    vi.stubGlobal('SpeechSynthesisUtterance', vi.fn(() => ({ rate: 1 })))
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('starts in idle state', () => {
    const { result } = renderHook(() => useStoryGuide(true))
    expect(result.current.voiceState).toBe(VoiceState.Idle)
  })

  it('retryRecording resets transcription and voiceState to idle', () => {
    const { result } = renderHook(() => useStoryGuide(true))

    act(() => {
      result.current.retryRecording()
    })

    expect(result.current.voiceState).toBe(VoiceState.Idle)
    expect(result.current.transcription).toBe('')
  })

  it('advanceWithTyped saves answer and advances to next question', () => {
    const { result } = renderHook(() => useStoryGuide(true))
    expect(result.current.currentIndex).toBe(0)

    act(() => { result.current.setTypedValue('test answer') })
    act(() => { result.current.advanceWithTyped() })

    expect(result.current.currentIndex).toBe(1)
    expect(result.current.answers[0]).toBe('test answer')
  })
})

// ── Navigation: Back / Skip ───────────────────────────────────────

describe('navigation', () => {
  beforeEach(() => {
    vi.stubGlobal('speechSynthesis', { cancel: vi.fn(), speak: vi.fn() })
    vi.stubGlobal('SpeechSynthesisUtterance', vi.fn(() => ({ rate: 1 })))
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('goBack decrements the question index', () => {
    const { result } = renderHook(() => useStoryGuide(true))

    act(() => { result.current.setTypedValue('hero') })
    act(() => { result.current.advanceWithTyped() })
    expect(result.current.currentIndex).toBe(1)

    act(() => { result.current.goBack() })
    expect(result.current.currentIndex).toBe(0)
  })

  it('skip produces an undefined answer and advances', () => {
    const { result } = renderHook(() => useStoryGuide(true))

    act(() => { result.current.skip() })

    expect(result.current.answers[0]).toBeUndefined()
    expect(result.current.currentIndex).toBe(1)
  })

  it('isDone is true after all 5 questions are answered', () => {
    const { result } = renderHook(() => useStoryGuide(true))

    for (let i = 0; i < 5; i++) {
      act(() => { result.current.setTypedValue(`answer ${i}`) })
      act(() => { result.current.advanceWithTyped() })
    }

    expect(result.current.isDone).toBe(true)
  })

  it('isDone is true after all 5 questions are skipped', () => {
    const { result } = renderHook(() => useStoryGuide(true))

    for (let i = 0; i < 5; i++) {
      act(() => { result.current.skip() })
    }

    expect(result.current.isDone).toBe(true)
  })
})
