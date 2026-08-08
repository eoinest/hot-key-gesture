import type { EngineSettings, GestureMapping, GestureName } from './types'

export interface FrameSample {
  /** Raw gesture label for this frame, or null if no hand / no gesture. */
  gesture: GestureName | null
  /** Recognizer confidence 0..1 for the label. */
  confidence: number
  /** Monotonic timestamp in milliseconds. */
  t: number
}

export type EngineState = 'idle' | 'holding' | 'cooldown'

export interface EngineFrameResult {
  /** The smoothed, debounced gesture currently considered "on screen". */
  stable: GestureName | null
  /** State of the trigger state machine. */
  state: EngineState
  /** 0..1 progress toward the hold threshold (1 once fired). */
  holdProgress: number
  /** The mapping currently being held toward a trigger, if any. */
  activeMapping: GestureMapping | null
  /** Set on the exact frame a trigger fires. */
  fired: GestureMapping | null
}

export interface EngineOptions {
  settings: EngineSettings
  mappings: GestureMapping[]
}

interface HoldState {
  gesture: GestureName
  since: number
  firedThisHold: boolean
}

/**
 * Pure gesture→trigger state machine. Feed it one sample per video frame;
 * it applies confidence gating, majority-vote smoothing with hysteresis,
 * hold-to-trigger, per-gesture cooldown, and release-before-retrigger.
 *
 * Time comes in via samples, so the engine is fully deterministic and testable.
 */
export class GestureEngine {
  private buffer: (GestureName | null)[] = []
  private stable: GestureName | null = null
  private holding: HoldState | null = null
  private lastFiredAt = new Map<GestureName, number>()

  constructor(private readonly getOptions: () => EngineOptions) {}

  reset(): void {
    this.buffer = []
    this.stable = null
    this.holding = null
    this.lastFiredAt.clear()
  }

  frame(sample: FrameSample): EngineFrameResult {
    const { settings, mappings } = this.getOptions()

    const label =
      sample.gesture && sample.confidence >= settings.minConfidence ? sample.gesture : null

    // --- Smoothing: majority vote over a sliding window, with hysteresis.
    // The stable label only changes when a different label (or "nothing")
    // wins a clear majority, so a single flickery frame never resets a hold.
    const windowSize = Math.max(1, settings.smoothingFrames)
    this.buffer.push(label)
    if (this.buffer.length > windowSize) this.buffer.shift()

    const majorityNeeded = Math.ceil(windowSize * 0.6)
    const counts = new Map<GestureName | null, number>()
    for (const l of this.buffer) counts.set(l, (counts.get(l) ?? 0) + 1)
    for (const [l, count] of counts) {
      if (l !== this.stable && count >= majorityNeeded) {
        this.stable = l
        break
      }
    }

    // --- Trigger state machine.
    const mapping =
      this.stable !== null
        ? (mappings.find((m) => m.enabled && m.gesture === this.stable) ?? null)
        : null

    if (this.holding && this.holding.gesture !== this.stable) {
      this.holding = null
    }
    if (!this.holding && mapping && this.stable) {
      this.holding = { gesture: this.stable, since: sample.t, firedThisHold: false }
    }
    if (this.holding && !mapping) {
      // Mapping was disabled or removed mid-hold.
      this.holding = null
    }

    let fired: GestureMapping | null = null
    let holdProgress = 0

    if (this.holding && mapping) {
      const holdMs = mapping.holdMs ?? settings.holdMs
      const cooldownMs = mapping.cooldownMs ?? settings.cooldownMs
      const elapsed = sample.t - this.holding.since
      holdProgress = holdMs <= 0 ? 1 : Math.min(1, elapsed / holdMs)

      const lastFired = this.lastFiredAt.get(this.holding.gesture)
      const cooledDown = lastFired === undefined || sample.t - lastFired >= cooldownMs
      const blockedByRelease = this.holding.firedThisHold && settings.requireRelease

      if (elapsed >= holdMs && cooledDown && !blockedByRelease) {
        fired = mapping
        this.lastFiredAt.set(this.holding.gesture, sample.t)
        this.holding.firedThisHold = true
      }
    }

    const state: EngineState = this.holding
      ? this.holding.firedThisHold
        ? 'cooldown'
        : 'holding'
      : 'idle'

    return {
      stable: this.stable,
      state,
      holdProgress: this.holding?.firedThisHold ? 1 : holdProgress,
      activeMapping: this.holding && mapping ? mapping : null,
      fired,
    }
  }
}
