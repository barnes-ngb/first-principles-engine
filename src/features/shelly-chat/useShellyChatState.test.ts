import { describe, it, expect } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import { useShellyChatState } from './useShellyChatState'

describe('useShellyChatState', () => {
  it('seeds activeThreadId from the initial value and defaults everything else', () => {
    const { result } = renderHook(() => useShellyChatState('thread-123'))

    expect(result.current.activeThreadId).toBe('thread-123')
    expect(result.current.chatContext).toBe('general')
    expect(result.current.threads).toEqual([])
    expect(result.current.messages).toEqual([])
    expect(result.current.input).toBe('')
    expect(result.current.sending).toBe(false)
    expect(result.current.drawerOpen).toBe(false)
    expect(result.current.followUps).toEqual([])
    expect(result.current.reflectionSuggestions).toEqual([])
    expect(result.current.generatingImage).toBe(false)
    expect(result.current.uploading).toBe(false)
    expect(result.current.uploadDialogOpen).toBe(false)
    expect(result.current.pendingAttachment).toBeNull()
    expect(result.current.pendingReferenceImage).toBeNull()
    expect(result.current.imageFlowOpen).toBe(false)
    expect(result.current.imageFlowStep).toBe('idea')
    expect(result.current.imageIdea).toBe('')
    expect(result.current.imageQuestions).toEqual([])
    expect(result.current.imageAnswers).toEqual({})
    expect(result.current.loadingQuestions).toBe(false)
  })

  it('defaults activeThreadId to null when no initial thread is provided', () => {
    const { result } = renderHook(() => useShellyChatState(null))
    expect(result.current.activeThreadId).toBeNull()
  })

  it('updates simple state via its setters', () => {
    const { result } = renderHook(() => useShellyChatState(null))

    act(() => {
      result.current.setInput('hello')
      result.current.setChatContext('lincoln')
      result.current.setSending(true)
    })

    expect(result.current.input).toBe('hello')
    expect(result.current.chatContext).toBe('lincoln')
    expect(result.current.sending).toBe(true)
  })

  it('drives the image refinement flow state machine', () => {
    const { result } = renderHook(() => useShellyChatState(null))

    act(() => {
      result.current.setImageFlowOpen(true)
      result.current.setImageFlowStep('questions')
      result.current.setImageQuestions([{ question: 'What style?', options: ['A', 'B'] }])
      result.current.setImageAnswers({ 0: 'A' })
    })

    expect(result.current.imageFlowOpen).toBe(true)
    expect(result.current.imageFlowStep).toBe('questions')
    expect(result.current.imageQuestions).toHaveLength(1)
    expect(result.current.imageAnswers).toEqual({ 0: 'A' })
  })

  it('keeps setter and ref identities stable across re-renders', () => {
    const { result, rerender } = renderHook(() => useShellyChatState(null))

    const firstSetInput = result.current.setInput
    const firstMessagesEndRef = result.current.messagesEndRef
    const firstAutoSendTriggered = result.current.autoSendTriggered

    rerender()

    expect(result.current.setInput).toBe(firstSetInput)
    expect(result.current.messagesEndRef).toBe(firstMessagesEndRef)
    expect(result.current.autoSendTriggered).toBe(firstAutoSendTriggered)
  })

  it('exposes mutable refs initialized to their resting values', () => {
    const { result } = renderHook(() => useShellyChatState(null))

    expect(result.current.autoSendTriggered.current).toBe(false)
    expect(result.current.imageIdeaTimeoutFired.current).toBe(false)
    expect(result.current.fileInputRef.current).toBeNull()
    expect(result.current.messagesEndRef.current).toBeNull()

    act(() => {
      result.current.autoSendTriggered.current = true
    })
    expect(result.current.autoSendTriggered.current).toBe(true)
  })
})
