// ── Minecraft-style equip sound effects (Web Audio API) ──────────────
// No external files needed — procedurally generated tones.

function playTone(
  ctx: AudioContext,
  startFreq: number,
  endFreq: number,
  duration: number,
  type: OscillatorType,
  delay = 0,
) {
  const osc = ctx.createOscillator()
  const gain = ctx.createGain()

  osc.type = type
  osc.frequency.setValueAtTime(startFreq, ctx.currentTime + delay)
  osc.frequency.linearRampToValueAtTime(endFreq, ctx.currentTime + delay + duration)

  gain.gain.setValueAtTime(0.15, ctx.currentTime + delay)
  gain.gain.linearRampToValueAtTime(0, ctx.currentTime + delay + duration)

  osc.connect(gain)
  gain.connect(ctx.destination)

  osc.start(ctx.currentTime + delay)
  osc.stop(ctx.currentTime + delay + duration)
}

export function playEquipSound(pieceId: string) {
  try {
    const audioCtx = new AudioContext()

    switch (pieceId) {
      case 'belt':
      case 'shoes':
        // Leather creak — low frequency sweep
        playTone(audioCtx, 150, 200, 0.15, 'triangle')
        break

      case 'breastplate':
      case 'helmet':
        // Metal clang — two tones
        playTone(audioCtx, 800, 400, 0.12, 'square')
        playTone(audioCtx, 600, 300, 0.08, 'square', 0.05)
        break

      case 'shield':
        // Wood thud + metal
        playTone(audioCtx, 100, 80, 0.15, 'triangle')
        playTone(audioCtx, 500, 300, 0.08, 'square', 0.03)
        break

      case 'sword':
        // Enchantment shimmer — ascending tones
        playTone(audioCtx, 400, 800, 0.1, 'sine')
        playTone(audioCtx, 600, 1000, 0.08, 'sine', 0.08)
        playTone(audioCtx, 800, 1200, 0.06, 'sine', 0.16)
        break
    }
  } catch {
    // Web Audio not available — silently skip
  }
}
