import type { EngineSettings, GestureMapping, GestureName } from './types'

/** One detected hand in a single video frame. */
export interface HandSample {
  /** Raw gesture label for this hand, or null if the classifier had none. */
  gesture: GestureName | null
  /** Recognizer confidence 0..1 for the label. */
  confidence: number
}

export interface FrameSample {
  /** Every hand detected this frame, in recognizer order. */
  hands: HandSample[]
  /** Monotonic timestamp in milliseconds. */
  t: number
}

export type EngineState = 'idle' | 'holding' | 'cooldown'

export interface EngineFrameResult {
  /** The smoothed, debounced action gesture currently considered "on screen". */
  stable: GestureName | null
  /** State of the trigger state machine. */
  state: EngineState
  /**
   * 0..1 progress. While holding, progress toward the hold threshold. After
   * firing with auto-repeat on, progress toward the next repeat.
   */
  holdProgress: number
  /** True when the safety guard is satisfied (or disabled). */
  armed: boolean
  /** Index into `hands` of the arm hand, or -1. */
  armHandIndex: number
  /** Index into `hands` of the acting hand, or -1. */
  actionHandIndex: number
  /** The mapping currently being held toward a trigger, if any. */
  activeMapping: GestureMapping | null
  /** Set on the exact frame a trigger fires. */
  fired: GestureMapping | null
  /**
   * Set every frame while a pointer-control mapping is engaged. Unlike
   * `fired`, this is continuous: the cursor should follow the acting hand for
   * as long as this is non-null.
   */
  tracking: GestureMapping | null
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

interface Resolution {
  action: GestureName | null
  armed: boolean
  armHandIndex: number
  actionHandIndex: number
}

/**
 * Pure gesture→trigger state machine. Feed it one sample per video frame;
 * it applies the two-hand safety guard, confidence gating, majority-vote
 * smoothing with hysteresis, hold-to-trigger, per-gesture cooldown, and
 * release-before-retrigger.
 *
 * Time comes in via samples, so the engine is fully deterministic and testable.
 */
export class GestureEngine {
  private buffer: (GestureName | null)[] = []
  private armBuffer: boolean[] = []
  private stable: GestureName | null = null
  private stableArmed = false
  private holding: HoldState | null = null
  private lastFiredAt = new Map<GestureName, number>()

  constructor(private readonly getOptions: () => EngineOptions) {}

  reset(): void {
    this.buffer = []
    this.armBuffer = []
    this.stable = null
    this.stableArmed = false
    this.holding = null
    this.lastFiredAt.clear()
  }

  /**
   * Decide which hand is arming and which is acting.
   *
   * With the guard on, one hand must hold `armGesture`; the action comes from
   * a different hand. Either hand may arm, so it works left- or right-handed,
   * and two arm-gesture hands means the arm gesture is also the action.
   */
  private resolve(sample: FrameSample, settings: EngineSettings): Resolution {
    const gated = sample.hands.map((h) =>
      h.gesture && h.confidence >= settings.minConfidence ? h.gesture : null,
    )

    if (!settings.requireArmHand) {
      // Highest-confidence hand wins when no guard is configured.
      let best = -1
      for (let i = 0; i < gated.length; i++) {
        if (gated[i] === null) continue
        if (best === -1 || sample.hands[i].confidence > sample.hands[best].confidence) best = i
      }
      return { action: best === -1 ? null : gated[best], armed: true, armHandIndex: -1, actionHandIndex: best }
    }

    const armHandIndex = gated.indexOf(settings.armGesture)
    if (armHandIndex === -1) {
      return { action: null, armed: false, armHandIndex: -1, actionHandIndex: -1 }
    }

    let actionHandIndex = -1
    for (let i = 0; i < gated.length; i++) {
      if (i === armHandIndex || gated[i] === null) continue
      if (actionHandIndex === -1 || sample.hands[i].confidence > sample.hands[actionHandIndex].confidence) {
        actionHandIndex = i
      }
    }

    return {
      action: actionHandIndex === -1 ? null : gated[actionHandIndex],
      armed: true,
      armHandIndex,
      actionHandIndex,
    }
  }

  frame(sample: FrameSample): EngineFrameResult {
    const { settings, mappings } = this.getOptions()
    const resolution = this.resolve(sample, settings)

    // --- Smoothing: majority vote over a sliding window, with hysteresis.
    // The stable label only changes when a different label (or "nothing")
    // wins a clear majority, so a single flickery frame never resets a hold.
    const windowSize = Math.max(1, settings.smoothingFrames)
    const majorityNeeded = Math.ceil(windowSize * 0.6)

    this.buffer.push(resolution.action)
    if (this.buffer.length > windowSize) this.buffer.shift()
    const counts = new Map<GestureName | null, number>()
    for (const l of this.buffer) counts.set(l, (counts.get(l) ?? 0) + 1)
    for (const [l, count] of counts) {
      if (l !== this.stable && count >= majorityNeeded) {
        this.stable = l
        break
      }
    }

    this.armBuffer.push(resolution.armed)
    if (this.armBuffer.length > windowSize) this.armBuffer.shift()
    const armedCount = this.armBuffer.filter(Boolean).length
    if (resolution.armed !== this.stableArmed) {
      const votes = resolution.armed ? armedCount : this.armBuffer.length - armedCount
      if (votes >= majorityNeeded) this.stableArmed = resolution.armed
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
    let tracking: GestureMapping | null = null
    let holdProgress = 0

    if (this.holding && mapping) {
      const isPointer = mapping.action === 'mouse'
      const holdMs = mapping.holdMs ?? settings.holdMs
      const cooldownMs = mapping.cooldownMs ?? settings.cooldownMs
      const elapsed = sample.t - this.holding.since
      const lastFired = this.lastFiredAt.get(this.holding.gesture)
      const cooledDown = lastFired === undefined || sample.t - lastFired >= cooldownMs
      // Pointer control engages once and then stays engaged, so it behaves
      // like requireRelease regardless of the repeat setting.
      const blockedByRelease =
        this.holding.firedThisHold && (settings.requireRelease || isPointer)

      if (this.holding.firedThisHold) {
        holdProgress =
          isPointer || settings.requireRelease || lastFired === undefined
            ? 1
            : Math.min(1, (sample.t - lastFired) / Math.max(1, cooldownMs))
      } else {
        holdProgress = holdMs <= 0 ? 1 : Math.min(1, elapsed / holdMs)
      }

      if (elapsed >= holdMs && cooledDown && !blockedByRelease) {
        fired = mapping
        this.lastFiredAt.set(this.holding.gesture, sample.t)
        this.holding.firedThisHold = true
        holdProgress = isPointer || settings.requireRelease ? 1 : 0
      }

      if (isPointer && this.holding.firedThisHold) tracking = mapping
    }

    const state: EngineState = this.holding
      ? this.holding.firedThisHold
        ? 'cooldown'
        : 'holding'
      : 'idle'

    return {
      stable: this.stable,
      state,
      holdProgress,
      armed: this.stableArmed,
      armHandIndex: resolution.armHandIndex,
      actionHandIndex: resolution.actionHandIndex,
      activeMapping: this.holding && mapping ? mapping : null,
      fired,
      tracking,
    }
  }
}
