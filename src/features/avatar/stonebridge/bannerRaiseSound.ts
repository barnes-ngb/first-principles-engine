// ── Banner-raise fanfare (Web Audio API) ─────────────────────────
// Procedurally generated — no external files. Mirrors the equipSound pattern.

function playTone(
  ctx: AudioContext,
  startFreq: number,
  endFreq: number,
  duration: number,
  type: OscillatorType,
  delay = 0,
  gainPeak = 0.16,
) {
  const osc = ctx.createOscillator()
  const gain = ctx.createGain()
  osc.type = type
  osc.frequency.setValueAtTime(startFreq, ctx.currentTime + delay)
  osc.frequency.linearRampToValueAtTime(endFreq, ctx.currentTime + delay + duration)
  gain.gain.setValueAtTime(gainPeak, ctx.currentTime + delay)
  gain.gain.linearRampToValueAtTime(0, ctx.currentTime + delay + duration)
  osc.connect(gain)
  gain.connect(ctx.destination)
  osc.start(ctx.currentTime + delay)
  osc.stop(ctx.currentTime + delay + duration)
}

/** Short ascending triad fanfare to celebrate a repaired location. */
export function playBannerRaiseFanfare() {
  try {
    const ctx = new AudioContext()
    // Rising major triad (C–E–G–C) — triumphant, brief.
    playTone(ctx, 523, 523, 0.16, 'triangle', 0)
    playTone(ctx, 659, 659, 0.16, 'triangle', 0.14)
    playTone(ctx, 784, 784, 0.18, 'triangle', 0.28)
    playTone(ctx, 1047, 1047, 0.32, 'triangle', 0.44, 0.2)
  } catch {
    // Web Audio not available — silently skip.
  }
}
