import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, act } from '@testing-library/react'

// ── Hoisted mocks ────────────────────────────────────────────────

const {
  mockUseSpeechRecognition,
  mockUseTranscription,
  mockUseAudioRecording,
  mockUseTTS,
  mockTranscribe,
  mockUpdateFinalText,
  mockStartRecording,
  mockStopRecording,
  mockCancelRecording,
  mockSttStart,
  mockSttStop,
  mockSttReset,
} = vi.hoisted(() => {
  return {
    mockUseSpeechRecognition: vi.fn(),
    mockUseTranscription: vi.fn(),
    mockUseAudioRecording: vi.fn(),
    mockUseTTS: vi.fn(),
    mockTranscribe: vi.fn(),
    mockUpdateFinalText: vi.fn(async () => undefined),
    mockStartRecording: vi.fn(async () => undefined),
    mockStopRecording: vi.fn(async () => new Blob(['x'])),
    mockCancelRecording: vi.fn(),
    mockSttStart: vi.fn(),
    mockSttStop: vi.fn(),
    mockSttReset: vi.fn(),
  }
})

vi.mock('../../../core/hooks/useSpeechRecognition', () => ({
  useSpeechRecognition: () => mockUseSpeechRecognition(),
}))

vi.mock('../../../core/hooks/useTranscription', () => ({
  useTranscription: () => mockUseTranscription(),
}))

vi.mock('../../../core/hooks/useAudioRecording', () => ({
  useAudioRecording: () => mockUseAudioRecording(),
}))

vi.mock('../../../core/hooks/useTTS', () => ({
  useTTS: () => mockUseTTS(),
}))

import VoiceInput from '../VoiceInput'

const lincolnProfile = { id: 'child-lincoln', voiceInputEnhanced: true }
const londonProfile = { id: 'child-london', voiceInputEnhanced: false }

const happyResult = {
  eventId: 'event-1',
  text: 'Hello world',
  durationSec: 4,
  language: 'en',
  segments: [],
}

beforeEach(() => {
  vi.clearAllMocks()
  mockUseSpeechRecognition.mockReturnValue({
    transcript: '',
    interimTranscript: '',
    isListening: false,
    isSupported: true,
    start: mockSttStart,
    stop: mockSttStop,
    reset: mockSttReset,
    error: null,
  })
  mockUseTranscription.mockReturnValue({
    transcribe: mockTranscribe,
    isTranscribing: false,
    error: null,
    lastResult: null,
    updateFinalText: mockUpdateFinalText,
  })
  mockUseAudioRecording.mockReturnValue({
    isSupported: true,
    isRecording: false,
    durationMs: 0,
    startRecording: mockStartRecording,
    stopRecording: mockStopRecording,
    cancelRecording: mockCancelRecording,
    error: null,
    reset: vi.fn(),
  })
  mockUseTTS.mockReturnValue({
    speak: vi.fn(),
    speakQueue: vi.fn(),
    cancel: vi.fn(),
    isSpeaking: false,
    isSupported: true,
  })
  mockTranscribe.mockResolvedValue(happyResult)
})

describe('VoiceInput — Whisper path', () => {
  it('renders the mic button when voiceInputEnhanced is true', () => {
    render(
      <VoiceInput
        profile={lincolnProfile}
        sourceSurface="generate-chat"
        onTranscript={() => {}}
      />,
    )
    expect(screen.getByRole('button', { name: /start recording/i })).toBeTruthy()
  })

  it('flows recording → transcribing → confirmation', async () => {
    const onTranscript = vi.fn()
    render(
      <VoiceInput
        profile={lincolnProfile}
        sourceSurface="generate-chat"
        onTranscript={onTranscript}
      />,
    )

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /start recording/i }))
    })
    expect(mockStartRecording).toHaveBeenCalled()

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /stop recording/i }))
    })

    // Confirmation banner now visible.
    expect(screen.getByText(/Did I hear you right/i)).toBeTruthy()
    expect(screen.getByLabelText(/Edit transcript/i)).toBeTruthy()
    // onTranscript should NOT have fired yet (still in confirmation).
    expect(onTranscript).not.toHaveBeenCalled()
  })

  it('"Sounds right!" with unchanged text fires onTranscript and does NOT call updateFinalText', async () => {
    const onTranscript = vi.fn()

    render(
      <VoiceInput
        profile={lincolnProfile}
        sourceSurface="generate-chat"
        onTranscript={onTranscript}
      />,
    )

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /start recording/i }))
    })
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /stop recording/i }))
    })

    fireEvent.click(screen.getByRole('button', { name: /sounds right/i }))

    expect(onTranscript).toHaveBeenCalledWith('Hello world', {
      eventId: 'event-1',
    })
    expect(mockUpdateFinalText).not.toHaveBeenCalled()
  })

  it('"Sounds right!" with edited text fires onTranscript AND calls updateFinalText', async () => {
    const onTranscript = vi.fn()

    render(
      <VoiceInput
        profile={lincolnProfile}
        sourceSurface="generate-chat"
        onTranscript={onTranscript}
      />,
    )

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /start recording/i }))
    })
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /stop recording/i }))
    })

    const editField = screen.getByLabelText(/Edit transcript/i) as HTMLInputElement
    fireEvent.change(editField, { target: { value: 'Hello edited world' } })
    fireEvent.click(screen.getByRole('button', { name: /sounds right/i }))

    expect(onTranscript).toHaveBeenCalledWith('Hello edited world', {
      eventId: 'event-1',
    })
    expect(mockUpdateFinalText).toHaveBeenCalledWith(
      'event-1',
      'Hello edited world',
    )
  })

  it('"Try again" returns to idle and stores eventId for next call', async () => {
    const onTranscript = vi.fn()

    render(
      <VoiceInput
        profile={lincolnProfile}
        sourceSurface="generate-chat"
        onTranscript={onTranscript}
      />,
    )

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /start recording/i }))
    })
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /stop recording/i }))
    })

    fireEvent.click(screen.getByRole('button', { name: /try again/i }))

    // Back to idle (mic button visible).
    expect(screen.getByRole('button', { name: /start recording/i })).toBeTruthy()
    expect(onTranscript).not.toHaveBeenCalled()

    // Next transcribe call should pass replacesEventId.
    mockTranscribe.mockClear()
    mockTranscribe.mockResolvedValueOnce({
      ...happyResult,
      eventId: 'event-2',
    })

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /start recording/i }))
    })
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /stop recording/i }))
    })

    expect(mockTranscribe).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ replacesEventId: 'event-1' }),
    )
  })

  it('shows the type-instead fallback after a transcription error', async () => {
    const onTranscript = vi.fn()
    mockTranscribe.mockResolvedValueOnce(null)
    mockUseTranscription.mockReturnValue({
      transcribe: mockTranscribe,
      isTranscribing: false,
      error: 'Network down',
      lastResult: null,
      updateFinalText: mockUpdateFinalText,
    })

    render(
      <VoiceInput
        profile={lincolnProfile}
        sourceSurface="generate-chat"
        onTranscript={onTranscript}
      />,
    )

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /start recording/i }))
    })
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /stop recording/i }))
    })

    expect(screen.getByText(/Couldn't transcribe/i)).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: /type instead/i }))

    const typeField = screen.getByLabelText(
      /Type message instead/i,
    ) as HTMLInputElement
    fireEvent.change(typeField, { target: { value: 'I typed it' } })
    fireEvent.click(screen.getByRole('button', { name: /send message/i }))

    expect(onTranscript).toHaveBeenCalledWith('I typed it')
  })

  it('skips confirmation when showConfirmation=false', async () => {
    const onTranscript = vi.fn()

    render(
      <VoiceInput
        profile={lincolnProfile}
        sourceSurface="generate-chat"
        onTranscript={onTranscript}
        showConfirmation={false}
      />,
    )

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /start recording/i }))
    })
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /stop recording/i }))
    })

    expect(onTranscript).toHaveBeenCalledWith('Hello world', {
      eventId: 'event-1',
    })
  })

  it('renders a Done button during recording in toggle mode', async () => {
    const onTranscript = vi.fn()
    render(
      <VoiceInput
        profile={lincolnProfile}
        sourceSurface="generate-chat"
        onTranscript={onTranscript}
      />,
    )

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /start recording/i }))
    })

    const doneButton = screen.getByRole('button', { name: /done recording/i })
    expect(doneButton).toBeTruthy()
    expect(doneButton.textContent).toMatch(/done/i)

    await act(async () => {
      fireEvent.click(doneButton)
    })

    expect(mockStopRecording).toHaveBeenCalled()
    // Same stop+transcribe flow lands in confirmation.
    expect(screen.getByText(/Did I hear you right/i)).toBeTruthy()
  })

  it('does not render a Done button in hold-to-talk mode', async () => {
    render(
      <VoiceInput
        profile={lincolnProfile}
        sourceSurface="generate-chat"
        onTranscript={() => {}}
        mode="hold-to-talk"
      />,
    )

    const mic = screen.getByRole('button', { name: /start recording/i })
    await act(async () => {
      fireEvent.pointerDown(mic)
    })

    // Now in recording state — no Done button should be present.
    expect(screen.queryByRole('button', { name: /done recording/i })).toBeNull()

    // Pointer-up still ends recording (existing hold-to-talk behavior).
    await act(async () => {
      fireEvent.pointerUp(mic)
    })
    expect(mockStopRecording).toHaveBeenCalled()
  })

  it('clamps maxDurationSec > 120 (no runtime error; effect is in useAudioRecording)', () => {
    // The clamp itself is exercised by useAudioRecording's own tests.
    // Here we just verify the component renders with an extreme value.
    render(
      <VoiceInput
        profile={lincolnProfile}
        sourceSurface="generate-chat"
        onTranscript={() => {}}
        maxDurationSec={9999}
      />,
    )
    expect(screen.getByRole('button', { name: /start recording/i })).toBeTruthy()
  })
})

describe('VoiceInput — Web Speech path', () => {
  it('renders the Web Speech mic when voiceInputEnhanced is false', () => {
    render(
      <VoiceInput
        profile={londonProfile}
        sourceSurface="generate-chat"
        onTranscript={() => {}}
      />,
    )
    expect(screen.getByRole('button', { name: /start recording/i })).toBeTruthy()
    // Whisper-only hooks should NOT be called for Web Speech profile.
    expect(mockUseAudioRecording).not.toHaveBeenCalled()
    expect(mockUseTranscription).not.toHaveBeenCalled()
  })
})
