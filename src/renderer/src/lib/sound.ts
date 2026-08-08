let ctx: AudioContext | null = null

function context(): AudioContext | null {
  try {
    ctx ??= new AudioContext()
    // Autoplay policy can leave the context suspended until a user gesture.
    if (ctx.state === 'suspended') void ctx.resume()
    return ctx
  } catch {
    return null
  }
}

function blip(
  volume: number,
  fromHz: number,
  toHz: number,
  durationMs: number,
  type: OscillatorType = 'sine',
): void {
  const audio = context()
  if (!audio || volume <= 0) return
  const t0 = audio.currentTime
  const dur = durationMs / 1000
  const osc = audio.createOscillator()
  const gain = audio.createGain()

  osc.type = type
  osc.frequency.setValueAtTime(fromHz, t0)
  osc.frequency.exponentialRampToValueAtTime(toHz, t0 + dur * 0.5)

  // Fast attack, exponential decay — a short, soft "boop" rather than a beep.
  gain.gain.setValueAtTime(0.0001, t0)
  gain.gain.exponentialRampToValueAtTime(volume, t0 + 0.012)
  gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur)

  osc.connect(gain)
  gain.connect(audio.destination)
  osc.start(t0)
  osc.stop(t0 + dur + 0.02)
}

/** Confirmation boop played when a gesture fires its shortcut. */
export function playBoop(volume = 0.3): void {
  blip(volume, 620, 980, 130)
}

/** Lower, duller tone for a shortcut that failed to send. */
export function playErrorTone(volume = 0.3): void {
  blip(volume * 0.9, 320, 180, 220, 'triangle')
}
