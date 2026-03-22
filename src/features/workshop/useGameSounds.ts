import { useCallback, useEffect, useRef, useState } from 'react'

// ── Web Audio API synthesized game sounds ──────────────────────
// All sounds are generated programmatically — no audio files needed.
// Total bundle impact: ~0 bytes of assets.

type AudioContextType = typeof AudioContext

function getAudioContext(): AudioContext | null {
  const Ctx: AudioContextType | undefined =
    window.AudioContext ?? (window as unknown as { webkitAudioContext?: AudioContextType }).webkitAudioContext
  if (!Ctx) return null
  try {
    return new Ctx()
  } catch {
    return null
  }
}

function playTone(
  ctx: AudioContext,
  frequency: number,
  duration: number,
  type: OscillatorType = 'square',
  volume = 0.15,
  startTime = ctx.currentTime,
) {
  const osc = ctx.createOscillator()
  const gain = ctx.createGain()
  osc.type = type
  osc.frequency.value = frequency
  gain.gain.setValueAtTime(volume, startTime)
  gain.gain.exponentialRampToValueAtTime(0.001, startTime + duration)
  osc.connect(gain)
  gain.connect(ctx.destination)
  osc.start(startTime)
  osc.stop(startTime + duration)
}

function playNoise(
  ctx: AudioContext,
  duration: number,
  volume = 0.1,
  startTime = ctx.currentTime,
) {
  const bufferSize = Math.floor(ctx.sampleRate * duration)
  const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate)
  const data = buffer.getChannelData(0)
  for (let i = 0; i < bufferSize; i++) {
    data[i] = (Math.random() * 2 - 1) * 0.5
  }
  const source = ctx.createBufferSource()
  source.buffer = buffer
  const gain = ctx.createGain()
  gain.gain.setValueAtTime(volume, startTime)
  gain.gain.exponentialRampToValueAtTime(0.001, startTime + duration)
  source.connect(gain)
  gain.connect(ctx.destination)
  source.start(startTime)
  source.stop(startTime + duration)
}

// ── Sound definitions ────────────────────────────────────────────

function diceRoll(ctx: AudioContext) {
  // Rapid noise bursts simulating a rattle
  for (let i = 0; i < 6; i++) {
    playNoise(ctx, 0.06, 0.08, ctx.currentTime + i * 0.08)
  }
}

function diceLand(ctx: AudioContext) {
  // Low thunk
  playTone(ctx, 120, 0.15, 'sine', 0.2)
  playNoise(ctx, 0.08, 0.12)
}

function tokenStep(ctx: AudioContext) {
  // Quick hop
  playTone(ctx, 600, 0.06, 'sine', 0.08)
}

function challengeChime(ctx: AudioContext) {
  // Mystery attention chime — ascending two-note
  playTone(ctx, 523, 0.15, 'sine', 0.12)
  playTone(ctx, 784, 0.2, 'sine', 0.12, ctx.currentTime + 0.12)
}

function cardFlip(ctx: AudioContext) {
  // Whoosh — swept noise
  const duration = 0.25
  const bufferSize = Math.floor(ctx.sampleRate * duration)
  const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate)
  const data = buffer.getChannelData(0)
  for (let i = 0; i < bufferSize; i++) {
    const t = i / bufferSize
    data[i] = (Math.random() * 2 - 1) * (1 - t) * 0.3
  }
  const source = ctx.createBufferSource()
  source.buffer = buffer
  const gain = ctx.createGain()
  gain.gain.setValueAtTime(0.15, ctx.currentTime)
  gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration)
  source.connect(gain)
  gain.connect(ctx.destination)
  source.start()
  source.stop(ctx.currentTime + duration)
}

function bossReveal(ctx: AudioContext) {
  // Dramatic low rumble + rising tone
  playNoise(ctx, 0.5, 0.15)
  playTone(ctx, 80, 0.4, 'sawtooth', 0.1)
  playTone(ctx, 160, 0.3, 'sawtooth', 0.08, ctx.currentTime + 0.2)
  playTone(ctx, 320, 0.2, 'square', 0.06, ctx.currentTime + 0.35)
}

function success(ctx: AudioContext) {
  // Bright ascending arpeggio
  const notes = [523, 659, 784, 1047] // C5, E5, G5, C6
  notes.forEach((freq, i) => {
    playTone(ctx, freq, 0.2, 'sine', 0.1, ctx.currentTime + i * 0.1)
  })
}

function bonusMove(ctx: AudioContext) {
  // Fast ascending whoosh
  const osc = ctx.createOscillator()
  const gain = ctx.createGain()
  osc.type = 'sine'
  osc.frequency.setValueAtTime(300, ctx.currentTime)
  osc.frequency.exponentialRampToValueAtTime(1200, ctx.currentTime + 0.3)
  gain.gain.setValueAtTime(0.1, ctx.currentTime)
  gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.35)
  osc.connect(gain)
  gain.connect(ctx.destination)
  osc.start()
  osc.stop(ctx.currentTime + 0.35)
}

function setbackSlide(ctx: AudioContext) {
  // Comedic slide whistle down
  const osc = ctx.createOscillator()
  const gain = ctx.createGain()
  osc.type = 'sine'
  osc.frequency.setValueAtTime(800, ctx.currentTime)
  osc.frequency.exponentialRampToValueAtTime(200, ctx.currentTime + 0.4)
  gain.gain.setValueAtTime(0.1, ctx.currentTime)
  gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.45)
  osc.connect(gain)
  gain.connect(ctx.destination)
  osc.start()
  osc.stop(ctx.currentTime + 0.45)
}

function shortcutSparkle(ctx: AudioContext) {
  // Magical sparkle — rapid high notes
  const notes = [1047, 1319, 1568, 2093, 1568, 2093]
  notes.forEach((freq, i) => {
    playTone(ctx, freq, 0.1, 'sine', 0.06, ctx.currentTime + i * 0.06)
  })
}

function fanfare(ctx: AudioContext) {
  // Victory fanfare — triumphant ascending melody
  const melody = [
    { freq: 523, dur: 0.15 },  // C5
    { freq: 659, dur: 0.15 },  // E5
    { freq: 784, dur: 0.15 },  // G5
    { freq: 1047, dur: 0.3 },  // C6
    { freq: 784, dur: 0.1 },   // G5
    { freq: 1047, dur: 0.5 },  // C6 (hold)
  ]
  let t = ctx.currentTime
  for (const note of melody) {
    playTone(ctx, note.freq, note.dur + 0.05, 'square', 0.08, t)
    playTone(ctx, note.freq, note.dur + 0.05, 'sine', 0.06, t)
    t += note.dur
  }
}

function applause(ctx: AudioContext) {
  // Warm applause — extended noise with envelope
  for (let i = 0; i < 20; i++) {
    const startTime = ctx.currentTime + i * 0.1
    const vol = 0.04 + Math.sin((i / 20) * Math.PI) * 0.06
    playNoise(ctx, 0.12, vol, startTime)
  }
}

// ── Hook ──────────────────────────────────────────────────────────

const MUTE_KEY = 'workshop-sounds-muted'

export function useGameSounds() {
  const ctxRef = useRef<AudioContext | null>(null)
  const [muted, setMuted] = useState(() => {
    try {
      return localStorage.getItem(MUTE_KEY) === 'true'
    } catch {
      return false
    }
  })

  // Lazily create AudioContext on first user interaction
  const ensureContext = useCallback(() => {
    if (!ctxRef.current) {
      ctxRef.current = getAudioContext()
    }
    const ctx = ctxRef.current
    if (ctx?.state === 'suspended') {
      ctx.resume().catch(() => {})
    }
    return ctx
  }, [])

  const play = useCallback(
    (fn: (ctx: AudioContext) => void) => {
      if (muted) return
      const ctx = ensureContext()
      if (!ctx) return
      try {
        fn(ctx)
      } catch {
        // Graceful degradation — no sounds
      }
    },
    [muted, ensureContext],
  )

  const toggleMute = useCallback(() => {
    setMuted((prev) => {
      const next = !prev
      try {
        localStorage.setItem(MUTE_KEY, String(next))
      } catch {
        // localStorage unavailable
      }
      return next
    })
  }, [])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      ctxRef.current?.close().catch(() => {})
    }
  }, [])

  return {
    muted,
    toggleMute,
    playDiceRoll: useCallback(() => play(diceRoll), [play]),
    playDiceLand: useCallback(() => play(diceLand), [play]),
    playTokenStep: useCallback(() => play(tokenStep), [play]),
    playChallengeChime: useCallback(() => play(challengeChime), [play]),
    playCardFlip: useCallback(() => play(cardFlip), [play]),
    playBossReveal: useCallback(() => play(bossReveal), [play]),
    playSuccess: useCallback(() => play(success), [play]),
    playBonusMove: useCallback(() => play(bonusMove), [play]),
    playSetbackSlide: useCallback(() => play(setbackSlide), [play]),
    playShortcutSparkle: useCallback(() => play(shortcutSparkle), [play]),
    playFanfare: useCallback(() => play(fanfare), [play]),
    playApplause: useCallback(() => play(applause), [play]),
  }
}
