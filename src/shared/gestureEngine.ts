import type { EngineSettings, GestureMapping, GestureName, MouseSettings } from './types'

/** One detected hand in a single video frame. */
export interface HandSample {
  /** Raw gesture label for this hand, or null if the classifier had none. */
  gesture: GestureName | null
  /** Recognizer confidence 0..1 for the label. */
  confidence: number
  /**
   * 'Left' / 'Right' from the recognizer. Detection order can swap between
   * frames, so this is what pins a hand to a role during a pointer session.
   */
  handedness?: string
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
  /**
   * True while the engine is holding a gesture through a detection dropout —
   * the gesture is not currently visible but has not timed out. Callers should
   * keep doing what they were doing and freeze any position they derive.
   */
  bridging: boolean
  /** Index into `hands` of the arm hand, or -1. */
  armHandIndex: number
  /** Index into `hands` of the acting hand, or -1. */
  actionHandIndex: number
  /** The mapping currently being held toward a trigger, if any. */
  activeMapping: GestureMapping | null
  /** Set on the exact frame a trigger fires. */
  fired: GestureMapping | null
  /** Set on the exact frame a pointer-session click should be sent. */
  click: boolean
  /** True while the steering hand is holding the click gesture. */
  clickHeld: boolean
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
  mouse?: MouseSettings
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
  /** Steering hand is showing the click gesture this frame. */
  clickHeld: boolean
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
  /** When the current stable gesture was last actually observed. */
  private lastStableSeenAt = 0
  /** When the guard was last actually satisfied. */
  private lastArmedAt = 0
  /** Whether a pointer mapping was tracking on the previous frame. */
  private pointerEngaged = false
  /** Gesture that started the active pointer session. */
  private sessionGesture: GestureName | null = null
  private lockedActionHand: string | null = null
  private lockedArmHand: string | null = null
  /** Frames the click gesture has been held for, and whether it already fired. */
  private clickFrames = 0
  private clickFired = false

  constructor(private readonly getOptions: () => EngineOptions) {}

  reset(): void {
    this.buffer = []
    this.armBuffer = []
    this.stable = null
    this.stableArmed = false
    this.holding = null
    this.lastFiredAt.clear()
    this.lastStableSeenAt = 0
    this.lastArmedAt = 0
    this.pointerEngaged = false
    this.sessionGesture = null
    this.lockedActionHand = null
    this.lockedArmHand = null
    this.clickFrames = 0
    this.clickFired = false
  }

  /**
   * Decide which hand is arming and which is acting.
   *
   * With the guard on, one hand must hold `armGesture`; the action comes from
   * a different hand. Either hand may arm, so it works left- or right-handed,
   * and two arm-gesture hands means the arm gesture is also the action.
   */
  private resolve(sample: FrameSample, settings: EngineSettings, mouse?: MouseSettings): Resolution {
    const gated = sample.hands.map((h) =>
      h.gesture && h.confidence >= settings.minConfidence ? h.gesture : null,
    )

    // While pointer control is engaged, keep each hand in the role it started
    // with. Otherwise a click gesture that matches the arm gesture would let
    // the steering hand be mistaken for the arming hand and swap the two.
    if (this.pointerEngaged && this.lockedActionHand) {
      const actionHandIndex = sample.hands.findIndex(
        (h) => h.handedness && h.handedness === this.lockedActionHand,
      )
      const armHandIndex = sample.hands.findIndex(
        (h, i) => i !== actionHandIndex && h.handedness && h.handedness === this.lockedArmHand,
      )
      if (actionHandIndex !== -1) {
        const armOk = !settings.requireArmHand || gated[armHandIndex] === settings.armGesture
        const raw = gated[actionHandIndex]
        const clickHeld =
          !!mouse?.clickEnabled &&
          raw === mouse.clickGesture &&
          this.sessionGesture !== null &&
          mouse.clickGesture !== this.sessionGesture
        return {
          // A click must not end the session, so report the session's own
          // gesture while the steering hand is clicking.
          action: clickHeld ? this.sessionGesture : raw,
          armed: armOk,
          armHandIndex,
          actionHandIndex,
          clickHeld,
        }
      }
    }

    if (!settings.requireArmHand) {
      // Highest-confidence hand wins when no guard is configured.
      let best = -1
      for (let i = 0; i < gated.length; i++) {
        if (gated[i] === null) continue
        if (best === -1 || sample.hands[i].confidence > sample.hands[best].confidence) best = i
      }
      return {
        action: best === -1 ? null : gated[best],
        armed: true,
        armHandIndex: -1,
        actionHandIndex: best,
        clickHeld: false,
      }
    }

    const armHandIndex = gated.indexOf(settings.armGesture)
    if (armHandIndex === -1) {
      return { action: null, armed: false, armHandIndex: -1, actionHandIndex: -1, clickHeld: false }
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
      clickHeld: false,
    }
  }

  frame(sample: FrameSample): EngineFrameResult {
    const { settings, mappings, mouse } = this.getOptions()
    const resolution = this.resolve(sample, settings, mouse)

    // --- Smoothing: majority vote over a sliding window, with hysteresis.
    // The stable label only changes when a different label (or "nothing")
    // wins a clear majority, so a single flickery frame never resets a hold.
    const windowSize = Math.max(1, settings.smoothingFrames)
    const majorityNeeded = Math.ceil(windowSize * 0.6)

    this.buffer.push(resolution.action)
    if (this.buffer.length > windowSize) this.buffer.shift()
    const counts = new Map<GestureName | null, number>()
    for (const l of this.buffer) counts.set(l, (counts.get(l) ?? 0) + 1)

    if (this.stable !== null && resolution.action === this.stable) {
      this.lastStableSeenAt = sample.t
    }

    // A dropout is not a release. Hand tracking loses the hand for a few frames
    // at a time, so once a gesture is established we hold it through gaps
    // shorter than the tolerance. While a pointer session is engaged we also
    // bridge over misreads as a *different* gesture, since pinched fingers are
    // routinely misclassified — outside a pointer session, deliberately
    // switching gesture should still take effect immediately.
    const grace = Math.max(0, settings.gapToleranceMs)
    let bridging = false

    for (const [l, count] of counts) {
      if (l === this.stable || count < majorityNeeded) continue
      const withinGrace = this.stable !== null && sample.t - this.lastStableSeenAt < grace
      if (withinGrace && (l === null || this.pointerEngaged)) {
        bridging = true
        break
      }
      this.stable = l
      this.lastStableSeenAt = sample.t
      break
    }

    this.armBuffer.push(resolution.armed)
    if (this.armBuffer.length > windowSize) this.armBuffer.shift()
    if (resolution.armed) this.lastArmedAt = sample.t
    const armedCount = this.armBuffer.filter(Boolean).length
    if (resolution.armed !== this.stableArmed) {
      const votes = resolution.armed ? armedCount : this.armBuffer.length - armedCount
      // The arm hand blinks out too; don't disarm on a momentary loss.
      const armWithinGrace = !resolution.armed && sample.t - this.lastArmedAt < grace
      if (votes >= majorityNeeded && !armWithinGrace) this.stableArmed = resolution.armed
      else if (armWithinGrace) bridging = true
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

    // --- Click while steering.
    // Requires a couple of consecutive frames so a single misread fist does not
    // click, and requires returning to the steering gesture before clicking
    // again — otherwise holding a fist would machine-gun clicks.
    let click = false
    if (tracking && resolution.clickHeld) {
      this.clickFrames++
      if (this.clickFrames >= 2 && !this.clickFired) {
        click = true
        this.clickFired = true
      }
    } else {
      this.clickFrames = 0
      if (!resolution.clickHeld) this.clickFired = false
    }

    // Lock hand roles for the life of a session; release them when it ends.
    if (tracking) {
      if (!this.pointerEngaged) {
        this.sessionGesture = this.stable
        this.lockedActionHand = sample.hands[resolution.actionHandIndex]?.handedness ?? null
        this.lockedArmHand = sample.hands[resolution.armHandIndex]?.handedness ?? null
      }
    } else {
      this.sessionGesture = null
      this.lockedActionHand = null
      this.lockedArmHand = null
      this.clickFired = false
    }

    this.pointerEngaged = tracking !== null

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
      bridging,
      armHandIndex: resolution.armHandIndex,
      actionHandIndex: resolution.actionHandIndex,
      activeMapping: this.holding && mapping ? mapping : null,
      fired,
      tracking,
      click,
      clickHeld: resolution.clickHeld,
    }
  }
}
