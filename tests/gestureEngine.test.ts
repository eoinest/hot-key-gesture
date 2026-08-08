import { describe, expect, it } from 'vitest'
import { GestureEngine } from '../src/shared/gestureEngine'
import type { EngineOptions, HandSample } from '../src/shared/gestureEngine'
import type {
  EngineSettings,
  GestureMapping,
  GestureName,
  MouseSettings,
} from '../src/shared/types'

/** Single-hand baseline: safety guard off, short timings for readable tests. */
const SETTINGS: EngineSettings = {
  holdMs: 200,
  cooldownMs: 600,
  minConfidence: 0.5,
  smoothingFrames: 3,
  requireRelease: true,
  requireArmHand: false,
  armGesture: 'Closed_Fist',
  // Off by default in tests so each case isolates one behaviour; the bridging
  // suite below opts in.
  gapToleranceMs: 0,
  maxHands: 2,
}

const THUMB_UP_MAPPING: GestureMapping = {
  id: 'm1',
  gesture: 'Thumb_Up',
  hotkey: { key: 't', modifiers: ['cmd'] },
  enabled: true,
}

function makeEngine(overrides: Partial<EngineSettings> = {}, mappings = [THUMB_UP_MAPPING]) {
  const options: EngineOptions = { settings: { ...SETTINGS, ...overrides }, mappings }
  return { engine: new GestureEngine(() => options), options }
}

const hand = (gesture: GestureName | null, confidence = 0.9): HandSample => ({ gesture, confidence })

/** Feed identical frames every `step` ms starting at `t0`; returns all results. */
function feed(
  engine: GestureEngine,
  hands: HandSample[],
  count: number,
  t0: number,
  step = 33,
) {
  const results = []
  for (let i = 0; i < count; i++) {
    results.push(engine.frame({ hands, t: t0 + i * step }))
  }
  return results
}

/** Convenience: one hand showing `gesture`. */
function feed1(
  engine: GestureEngine,
  gesture: GestureName | null,
  count: number,
  t0: number,
  step = 33,
  confidence = 0.9,
) {
  return feed(engine, gesture === null ? [] : [hand(gesture, confidence)], count, t0, step)
}

describe('smoothing', () => {
  it('requires a majority of the window before a gesture becomes stable', () => {
    const { engine } = makeEngine()
    expect(engine.frame({ hands: [hand('Thumb_Up')], t: 0 }).stable).toBeNull()
    expect(engine.frame({ hands: [hand('Thumb_Up')], t: 33 }).stable).toBe('Thumb_Up')
  })

  it('ignores low-confidence frames', () => {
    const { engine } = makeEngine()
    const results = feed1(engine, 'Thumb_Up', 10, 0, 33, 0.3)
    expect(results.at(-1)!.stable).toBeNull()
  })

  it('a single flickery frame does not reset the stable gesture', () => {
    const { engine } = makeEngine()
    feed1(engine, 'Thumb_Up', 3, 0)
    engine.frame({ hands: [], t: 99 })
    expect(engine.frame({ hands: [hand('Thumb_Up')], t: 132 }).stable).toBe('Thumb_Up')
  })
})

describe('hold-to-trigger', () => {
  it('does not fire before the hold time elapses', () => {
    const { engine } = makeEngine()
    expect(feed1(engine, 'Thumb_Up', 5, 0).every((r) => r.fired === null)).toBe(true)
  })

  it('fires exactly once when held past the hold time', () => {
    const { engine } = makeEngine()
    const fired = feed1(engine, 'Thumb_Up', 20, 0).filter((r) => r.fired !== null)
    expect(fired).toHaveLength(1)
    expect(fired[0].fired!.id).toBe('m1')
  })

  it('reports monotonic hold progress while holding', () => {
    const { engine } = makeEngine()
    const holding = feed1(engine, 'Thumb_Up', 6, 0).filter((r) => r.state === 'holding')
    expect(holding.length).toBeGreaterThan(0)
    const progresses = holding.map((r) => r.holdProgress)
    for (let i = 1; i < progresses.length; i++) {
      expect(progresses[i]).toBeGreaterThanOrEqual(progresses[i - 1])
    }
  })

  it('changing gesture mid-hold resets progress', () => {
    const { engine } = makeEngine(undefined, [
      THUMB_UP_MAPPING,
      { id: 'm2', gesture: 'Open_Palm', hotkey: { key: 'space', modifiers: [] }, enabled: true },
    ])
    feed1(engine, 'Thumb_Up', 4, 0)
    const fired = feed1(engine, 'Open_Palm', 20, 200).filter((r) => r.fired !== null)
    expect(fired).toHaveLength(1)
    expect(fired[0].fired!.id).toBe('m2')
  })

  it('disabled mappings never fire', () => {
    const { engine } = makeEngine(undefined, [{ ...THUMB_UP_MAPPING, enabled: false }])
    expect(feed1(engine, 'Thumb_Up', 20, 0).every((r) => r.fired === null)).toBe(true)
  })
})

describe('release and cooldown', () => {
  it('with requireRelease, holding does not re-fire until released and re-held', () => {
    const { engine } = makeEngine()
    expect(feed1(engine, 'Thumb_Up', 40, 0).filter((r) => r.fired).length).toBe(1)
    feed1(engine, null, 5, 40 * 33)
    expect(feed1(engine, 'Thumb_Up', 20, 2000).filter((r) => r.fired).length).toBe(1)
  })

  it('without requireRelease, repeats every cooldown while held', () => {
    const { engine } = makeEngine({ requireRelease: false })
    // Hold ~2s: fires at ~200ms then every 600ms.
    const fired = feed1(engine, 'Thumb_Up', 61, 0).filter((r) => r.fired)
    expect(fired.length).toBeGreaterThanOrEqual(3)
    expect(fired.length).toBeLessThanOrEqual(4)
  })

  it('auto-repeat progress rewinds after each fire so the ring refills', () => {
    const { engine } = makeEngine({ requireRelease: false })
    const results = feed1(engine, 'Thumb_Up', 40, 0)
    const firedIdx = results.findIndex((r) => r.fired)
    expect(results[firedIdx].holdProgress).toBe(0)
    expect(results[firedIdx + 5].holdProgress).toBeGreaterThan(0)
  })

  it('cooldown applies across release/re-hold cycles', () => {
    const { engine } = makeEngine()
    feed1(engine, 'Thumb_Up', 10, 0)
    feed1(engine, null, 5, 340)
    const results = feed1(engine, 'Thumb_Up', 30, 500)
    expect(results.filter((r) => r.fired)).toHaveLength(1)
    const fireTime = 500 + results.findIndex((r) => r.fired) * 33
    expect(fireTime).toBeGreaterThanOrEqual(231 + 600)
  })

  it('per-mapping hold and cooldown overrides win over global settings', () => {
    const { engine } = makeEngine(undefined, [{ ...THUMB_UP_MAPPING, holdMs: 500 }])
    expect(feed1(engine, 'Thumb_Up', 12, 0).every((r) => r.fired === null)).toBe(true)
    expect(feed1(engine, 'Thumb_Up', 10, 400).filter((r) => r.fired)).toHaveLength(1)
  })
})

describe('two-hand safety guard', () => {
  const guarded = (overrides: Partial<EngineSettings> = {}) =>
    makeEngine({ requireArmHand: true, ...overrides })

  it('does not fire from the action gesture alone', () => {
    const { engine } = guarded()
    const results = feed(engine, [hand('Thumb_Up')], 30, 0)
    expect(results.every((r) => r.fired === null)).toBe(true)
    expect(results.at(-1)!.armed).toBe(false)
    expect(results.at(-1)!.stable).toBeNull()
  })

  it('does not fire from the arm gesture alone', () => {
    const { engine } = guarded()
    const results = feed(engine, [hand('Closed_Fist')], 30, 0)
    expect(results.every((r) => r.fired === null)).toBe(true)
    expect(results.at(-1)!.armed).toBe(true)
    expect(results.at(-1)!.stable).toBeNull()
  })

  it('fires when one hand arms and the other acts', () => {
    const { engine } = guarded()
    const results = feed(engine, [hand('Closed_Fist'), hand('Thumb_Up')], 20, 0)
    const fired = results.filter((r) => r.fired)
    expect(fired).toHaveLength(1)
    expect(fired[0].fired!.id).toBe('m1')
    expect(fired[0].armed).toBe(true)
  })

  it('works with the hands in either order (left- or right-handed)', () => {
    const { engine } = guarded()
    const results = feed(engine, [hand('Thumb_Up'), hand('Closed_Fist')], 20, 0)
    expect(results.filter((r) => r.fired)).toHaveLength(1)
    expect(results.at(-1)!.armHandIndex).toBe(1)
    expect(results.at(-1)!.actionHandIndex).toBe(0)
  })

  it('stops firing the moment the arm hand drops', () => {
    const { engine } = guarded({ requireRelease: false })
    expect(feed(engine, [hand('Closed_Fist'), hand('Thumb_Up')], 20, 0).filter((r) => r.fired)).toHaveLength(1)
    // Arm hand leaves the frame; the action hand keeps gesturing.
    const after = feed(engine, [hand('Thumb_Up')], 60, 660)
    expect(after.every((r) => r.fired === null)).toBe(true)
    expect(after.at(-1)!.armed).toBe(false)
  })

  it('the arm gesture on both hands resolves to that gesture as the action', () => {
    const { engine } = makeEngine({ requireArmHand: true }, [
      { id: 'mf', gesture: 'Closed_Fist', hotkey: { key: 'escape', modifiers: [] }, enabled: true },
    ])
    const results = feed(engine, [hand('Closed_Fist'), hand('Closed_Fist')], 20, 0)
    expect(results.filter((r) => r.fired)).toHaveLength(1)
    expect(results.at(-1)!.armHandIndex).toBe(0)
    expect(results.at(-1)!.actionHandIndex).toBe(1)
  })

  it('a low-confidence arm hand does not arm the guard', () => {
    const { engine } = guarded()
    const results = feed(engine, [hand('Closed_Fist', 0.2), hand('Thumb_Up')], 30, 0)
    expect(results.every((r) => r.fired === null)).toBe(true)
    expect(results.at(-1)!.armed).toBe(false)
  })

  it('honours 3s hold then repeats every 3s while both hands stay up', () => {
    const { engine } = makeEngine({
      requireArmHand: true,
      requireRelease: false,
      holdMs: 3000,
      cooldownMs: 3000,
      smoothingFrames: 5,
    })
    // 10 seconds at 30fps: fires at 3s, 6s, 9s.
    const results = feed(engine, [hand('Closed_Fist'), hand('Thumb_Up')], 300, 0, 33)
    const fireTimes = results
      .map((r, i) => (r.fired ? i * 33 : -1))
      .filter((t) => t >= 0)
    expect(fireTimes).toHaveLength(3)
    expect(fireTimes[0]).toBeGreaterThanOrEqual(3000)
    expect(fireTimes[0]).toBeLessThan(3200)
    expect(fireTimes[1] - fireTimes[0]).toBeGreaterThanOrEqual(3000)
    expect(fireTimes[2] - fireTimes[1]).toBeGreaterThanOrEqual(3000)
  })

  it('guard can be turned off for one-handed use', () => {
    const { engine } = makeEngine({ requireArmHand: false })
    expect(feed(engine, [hand('Thumb_Up')], 20, 0).filter((r) => r.fired)).toHaveLength(1)
  })
})

describe('pointer-control mappings', () => {
  const POINTER_MAPPING: GestureMapping = {
    id: 'mouse1',
    gesture: 'Pinch',
    action: 'mouse',
    enabled: true,
  }

  it('does not engage before the hold completes', () => {
    const { engine } = makeEngine(undefined, [POINTER_MAPPING])
    const results = feed1(engine, 'Pinch', 5, 0)
    expect(results.every((r) => r.tracking === null)).toBe(true)
  })

  it('engages once and then tracks continuously while held', () => {
    const { engine } = makeEngine(undefined, [POINTER_MAPPING])
    const results = feed1(engine, 'Pinch', 40, 0)
    expect(results.filter((r) => r.fired)).toHaveLength(1)
    const tracked = results.filter((r) => r.tracking !== null)
    expect(tracked.length).toBeGreaterThan(20)
    // Every frame after engagement keeps tracking.
    const firstTracked = results.findIndex((r) => r.tracking !== null)
    expect(results.slice(firstTracked).every((r) => r.tracking !== null)).toBe(true)
  })

  it('never auto-repeats even with requireRelease off', () => {
    const { engine } = makeEngine({ requireRelease: false }, [POINTER_MAPPING])
    // A hotkey mapping would fire repeatedly over this span.
    expect(feed1(engine, 'Pinch', 120, 0).filter((r) => r.fired)).toHaveLength(1)
  })

  it('stops tracking as soon as the gesture is released', () => {
    const { engine } = makeEngine(undefined, [POINTER_MAPPING])
    expect(feed1(engine, 'Pinch', 30, 0).at(-1)!.tracking).not.toBeNull()
    const released = feed1(engine, null, 10, 1000)
    expect(released.at(-1)!.tracking).toBeNull()
  })

  it('respects the safety guard', () => {
    const { engine } = makeEngine({ requireArmHand: true }, [POINTER_MAPPING])
    expect(feed(engine, [hand('Pinch')], 40, 0).every((r) => r.tracking === null)).toBe(true)
    expect(feed(engine, [hand('Closed_Fist'), hand('Pinch')], 40, 2000).at(-1)!.tracking).not.toBeNull()
  })

  it('reports the acting hand so the caller knows which hand steers', () => {
    const { engine } = makeEngine({ requireArmHand: true }, [POINTER_MAPPING])
    const results = feed(engine, [hand('Closed_Fist'), hand('Pinch')], 40, 0)
    const last = results.at(-1)!
    expect(last.actionHandIndex).toBe(1)
    expect(last.armHandIndex).toBe(0)
  })
})

describe('bridging detection dropouts', () => {
  const POINTER_MAPPING: GestureMapping = {
    id: 'mouse1',
    gesture: 'Pinch',
    action: 'mouse',
    enabled: true,
  }

  it('keeps a pointer session alive across a short dropout', () => {
    const { engine } = makeEngine({ gapToleranceMs: 400 }, [POINTER_MAPPING])
    expect(feed1(engine, 'Pinch', 30, 0).at(-1)!.tracking).not.toBeNull()
    // ~200 ms with no hand detected at all.
    const gap = feed(engine, [], 6, 1000)
    expect(gap.every((r) => r.tracking !== null)).toBe(true)
    expect(gap.at(-1)!.bridging).toBe(true)
    // Pinch returns: still the same session, no re-hold required.
    const resumed = feed1(engine, 'Pinch', 5, 1200)
    expect(resumed.at(-1)!.tracking).not.toBeNull()
    expect(resumed.at(-1)!.bridging).toBe(false)
    expect(resumed.some((r) => r.fired)).toBe(false)
  })

  it('still releases once the dropout exceeds the tolerance', () => {
    const { engine } = makeEngine({ gapToleranceMs: 400 }, [POINTER_MAPPING])
    feed1(engine, 'Pinch', 30, 0)
    const gap = feed(engine, [], 30, 1000)
    expect(gap.at(-1)!.tracking).toBeNull()
    expect(gap.at(-1)!.stable).toBeNull()
  })

  it('bridges a misclassification while a pointer session is engaged', () => {
    const { engine } = makeEngine({ gapToleranceMs: 400 }, [POINTER_MAPPING])
    feed1(engine, 'Pinch', 30, 0)
    // Pinched fingers briefly read as a fist.
    const misread = feed1(engine, 'Closed_Fist', 6, 1000)
    expect(misread.every((r) => r.tracking !== null)).toBe(true)
    expect(feed1(engine, 'Pinch', 5, 1200).at(-1)!.stable).toBe('Pinch')
  })

  it('does not bridge a deliberate gesture change outside a pointer session', () => {
    const { engine } = makeEngine({ gapToleranceMs: 400 }, [
      THUMB_UP_MAPPING,
      { id: 'm2', gesture: 'Open_Palm', hotkey: { key: 'space', modifiers: [] }, enabled: true },
    ])
    feed1(engine, 'Thumb_Up', 10, 0)
    // Switching to a different gesture takes effect on majority, not after the grace.
    const switched = feed1(engine, 'Open_Palm', 4, 400)
    expect(switched.at(-1)!.stable).toBe('Open_Palm')
  })

  it('keeps the guard armed through a blink of the arm hand', () => {
    const { engine } = makeEngine({ gapToleranceMs: 400, requireArmHand: true }, [POINTER_MAPPING])
    expect(feed(engine, [hand('Closed_Fist'), hand('Pinch')], 30, 0).at(-1)!.armed).toBe(true)
    // Arm hand vanishes for ~130 ms.
    const blink = feed(engine, [hand('Pinch')], 4, 1000)
    expect(blink.at(-1)!.armed).toBe(true)
    expect(blink.at(-1)!.tracking).not.toBeNull()
  })

  it('tolerance of zero preserves the original drop-immediately behaviour', () => {
    const { engine } = makeEngine({ gapToleranceMs: 0 }, [POINTER_MAPPING])
    feed1(engine, 'Pinch', 30, 0)
    expect(feed(engine, [], 5, 1000).at(-1)!.tracking).toBeNull()
  })
})

describe('click while steering', () => {
  const POINTER_MAPPING: GestureMapping = {
    id: 'mouse1',
    gesture: 'Pinch',
    action: 'mouse',
    enabled: true,
  }
  const MOUSE: MouseSettings = {
    margin: 0.2,
    smoothing: 0.5,
    displayId: null,
    clickEnabled: true,
    clickMode: 'gesture',
    clickGesture: 'Closed_Fist',
  }

  /** Right hand steers, left hand arms — the shape the app actually produces. */
  const steer = (gesture: GestureName | null): HandSample[] => [
    { gesture: 'Closed_Fist', confidence: 0.9, handedness: 'Left' },
    { gesture, confidence: 0.9, handedness: 'Right' },
  ]

  function pointerEngine(mouse: Partial<MouseSettings> = {}) {
    const options: EngineOptions = {
      settings: { ...SETTINGS, requireArmHand: true, gapToleranceMs: 400 },
      mappings: [POINTER_MAPPING],
      mouse: { ...MOUSE, ...mouse },
    }
    const engine = new GestureEngine(() => options)
    // Establish the pointer session.
    const started = feed(engine, steer('Pinch'), 30, 0)
    expect(started.at(-1)!.tracking).not.toBeNull()
    return engine
  }

  it('clicks once when the steering hand makes a fist', () => {
    const engine = pointerEngine()
    const clicks = feed(engine, steer('Closed_Fist'), 20, 1000).filter((r) => r.click)
    expect(clicks).toHaveLength(1)
  })

  it('does not end the pointer session while clicking', () => {
    const engine = pointerEngine()
    const results = feed(engine, steer('Closed_Fist'), 20, 1000)
    expect(results.every((r) => r.tracking !== null)).toBe(true)
    expect(results.at(-1)!.stable).toBe('Pinch')
  })

  it('does not repeat while the fist is held', () => {
    const engine = pointerEngine()
    expect(feed(engine, steer('Closed_Fist'), 120, 1000).filter((r) => r.click)).toHaveLength(1)
  })

  it('clicks again after returning to the pinch', () => {
    const engine = pointerEngine()
    expect(feed(engine, steer('Closed_Fist'), 20, 1000).filter((r) => r.click)).toHaveLength(1)
    feed(engine, steer('Pinch'), 20, 2000)
    expect(feed(engine, steer('Closed_Fist'), 20, 3000).filter((r) => r.click)).toHaveLength(1)
  })

  it('ignores a single-frame fist misread', () => {
    const engine = pointerEngine()
    expect(feed(engine, steer('Closed_Fist'), 1, 1000).filter((r) => r.click)).toHaveLength(0)
  })

  it('keeps hand roles locked so a two-fist frame does not swap them', () => {
    const engine = pointerEngine()
    const results = feed(engine, steer('Closed_Fist'), 10, 1000)
    // The right hand keeps steering even though both hands now show a fist.
    expect(results.at(-1)!.actionHandIndex).toBe(1)
    expect(results.at(-1)!.armHandIndex).toBe(0)
  })

  it('does not click when clicking is disabled', () => {
    const engine = pointerEngine({ clickEnabled: false })
    expect(feed(engine, steer('Closed_Fist'), 20, 1000).filter((r) => r.click)).toHaveLength(0)
  })

  describe('pinky click mode', () => {
    /** Steering hand stays pinched throughout; only the pinky changes. */
    const pinky = (up: boolean): HandSample[] => [
      { gesture: 'Closed_Fist', confidence: 0.9, handedness: 'Left' },
      { gesture: 'Pinch', confidence: 0.9, handedness: 'Right', pinkyUp: up },
    ]

    function engine() {
      const options: EngineOptions = {
        settings: { ...SETTINGS, requireArmHand: true, gapToleranceMs: 400 },
        mappings: [POINTER_MAPPING],
        mouse: { ...MOUSE, clickMode: 'pinky' },
      }
      const e = new GestureEngine(() => options)
      expect(feed(e, pinky(false), 30, 0).at(-1)!.tracking).not.toBeNull()
      return e
    }

    it('clicks once when the pinky goes up', () => {
      expect(feed(engine(), pinky(true), 20, 1000).filter((r) => r.click)).toHaveLength(1)
    })

    it('keeps steering — the pinch never breaks', () => {
      const results = feed(engine(), pinky(true), 20, 1000)
      expect(results.every((r) => r.tracking !== null)).toBe(true)
      expect(results.at(-1)!.stable).toBe('Pinch')
    })

    it('does not repeat while the pinky stays up', () => {
      expect(feed(engine(), pinky(true), 120, 1000).filter((r) => r.click)).toHaveLength(1)
    })

    it('clicks again after lowering and raising', () => {
      const e = engine()
      expect(feed(e, pinky(true), 20, 1000).filter((r) => r.click)).toHaveLength(1)
      feed(e, pinky(false), 20, 2000)
      expect(feed(e, pinky(true), 20, 3000).filter((r) => r.click)).toHaveLength(1)
    })

    it('ignores a one-frame flicker', () => {
      expect(feed(engine(), pinky(true), 1, 1000).filter((r) => r.click)).toHaveLength(0)
    })

    it('ignores the click gesture in pinky mode', () => {
      const e = engine()
      const fistInstead: HandSample[] = [
        { gesture: 'Closed_Fist', confidence: 0.9, handedness: 'Left' },
        { gesture: 'Closed_Fist', confidence: 0.9, handedness: 'Right', pinkyUp: false },
      ]
      expect(feed(e, fistInstead, 20, 1000).filter((r) => r.click)).toHaveLength(0)
    })
  })

  it('never clicks outside a pointer session', () => {
    const options: EngineOptions = {
      settings: { ...SETTINGS, requireArmHand: true },
      mappings: [THUMB_UP_MAPPING],
      mouse: MOUSE,
    }
    const engine = new GestureEngine(() => options)
    expect(feed(engine, steer('Thumb_Up'), 40, 0).some((r) => r.click)).toBe(false)
  })
})

describe('reset', () => {
  it('clears all state', () => {
    const { engine } = makeEngine()
    feed1(engine, 'Thumb_Up', 10, 0)
    engine.reset()
    const r = engine.frame({ hands: [hand('Thumb_Up')], t: 1000 })
    expect(r.stable).toBeNull()
    expect(r.state).toBe('idle')
  })
})
