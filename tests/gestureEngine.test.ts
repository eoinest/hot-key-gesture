import { describe, expect, it } from 'vitest'
import { GestureEngine } from '../src/shared/gestureEngine'
import type { EngineOptions, FrameSample } from '../src/shared/gestureEngine'
import type { EngineSettings, GestureMapping, GestureName } from '../src/shared/types'

const SETTINGS: EngineSettings = {
  holdMs: 200,
  cooldownMs: 600,
  minConfidence: 0.5,
  smoothingFrames: 3,
  requireRelease: true,
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

/** Feed identical frames every `step` ms starting at `t0`; returns all results. */
function feed(
  engine: GestureEngine,
  gesture: GestureName | null,
  count: number,
  t0: number,
  step = 33,
  confidence = 0.9,
) {
  const results = []
  for (let i = 0; i < count; i++) {
    results.push(engine.frame({ gesture, confidence, t: t0 + i * step } as FrameSample))
  }
  return results
}

describe('smoothing', () => {
  it('requires a majority of the window before a gesture becomes stable', () => {
    const { engine } = makeEngine()
    const r1 = engine.frame({ gesture: 'Thumb_Up', confidence: 0.9, t: 0 })
    expect(r1.stable).toBeNull()
    const r2 = engine.frame({ gesture: 'Thumb_Up', confidence: 0.9, t: 33 })
    expect(r2.stable).toBe('Thumb_Up')
  })

  it('ignores low-confidence frames', () => {
    const { engine } = makeEngine()
    const results = feed(engine, 'Thumb_Up', 10, 0, 33, 0.3)
    expect(results.at(-1)!.stable).toBeNull()
  })

  it('a single flickery frame does not reset the stable gesture', () => {
    const { engine } = makeEngine()
    feed(engine, 'Thumb_Up', 3, 0)
    engine.frame({ gesture: null, confidence: 0, t: 99 })
    const r = engine.frame({ gesture: 'Thumb_Up', confidence: 0.9, t: 132 })
    expect(r.stable).toBe('Thumb_Up')
  })
})

describe('hold-to-trigger', () => {
  it('does not fire before the hold time elapses', () => {
    const { engine } = makeEngine()
    const results = feed(engine, 'Thumb_Up', 5, 0, 33)
    expect(results.every((r) => r.fired === null)).toBe(true)
  })

  it('fires exactly once when held past the hold time', () => {
    const { engine } = makeEngine()
    const results = feed(engine, 'Thumb_Up', 20, 0, 33)
    const fired = results.filter((r) => r.fired !== null)
    expect(fired).toHaveLength(1)
    expect(fired[0].fired!.id).toBe('m1')
  })

  it('reports hold progress while holding', () => {
    const { engine } = makeEngine()
    const results = feed(engine, 'Thumb_Up', 6, 0, 33)
    const holding = results.filter((r) => r.state === 'holding')
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
    feed(engine, 'Thumb_Up', 4, 0) // stable + holding, below 200ms hold
    const results = feed(engine, 'Open_Palm', 20, 200)
    const fired = results.filter((r) => r.fired !== null)
    expect(fired).toHaveLength(1)
    expect(fired[0].fired!.id).toBe('m2')
  })

  it('disabled mappings never fire', () => {
    const { engine } = makeEngine(undefined, [{ ...THUMB_UP_MAPPING, enabled: false }])
    const results = feed(engine, 'Thumb_Up', 20, 0)
    expect(results.every((r) => r.fired === null)).toBe(true)
  })
})

describe('release and cooldown', () => {
  it('with requireRelease, holding does not re-fire until released and re-held', () => {
    const { engine } = makeEngine()
    const heldLong = feed(engine, 'Thumb_Up', 40, 0, 33) // ~1.3s hold
    expect(heldLong.filter((r) => r.fired).length).toBe(1)

    // Release long enough for the majority vote to flip to null.
    feed(engine, null, 5, 40 * 33)

    // Re-hold: fires again (cooldown of 600ms has passed by now).
    const reHeld = feed(engine, 'Thumb_Up', 20, 2000, 33)
    expect(reHeld.filter((r) => r.fired).length).toBe(1)
  })

  it('without requireRelease, repeats every cooldown while held', () => {
    const { engine } = makeEngine({ requireRelease: false })
    // Hold for 2 seconds: fires at ~200ms, then every 600ms → ~4 triggers.
    const results = feed(engine, 'Thumb_Up', 61, 0, 33)
    const fired = results.filter((r) => r.fired)
    expect(fired.length).toBeGreaterThanOrEqual(3)
    expect(fired.length).toBeLessThanOrEqual(4)
  })

  it('cooldown applies across release/re-hold cycles', () => {
    const { engine } = makeEngine()
    feed(engine, 'Thumb_Up', 10, 0, 33) // fires at ~200ms
    feed(engine, null, 5, 340)
    // Re-hold immediately; hold completes at ~700ms but cooldown ends 800ms after fire.
    const results = feed(engine, 'Thumb_Up', 30, 500, 33)
    const fired = results.filter((r) => r.fired)
    expect(fired).toHaveLength(1)
    expect(fired[0].fired).toBeTruthy()
    // Fire time must be ≥ 600ms after the first fire (~231ms).
    const fireIndex = results.findIndex((r) => r.fired)
    const fireTime = 500 + fireIndex * 33
    expect(fireTime).toBeGreaterThanOrEqual(231 + 600)
  })

  it('per-mapping hold and cooldown overrides win over global settings', () => {
    const { engine } = makeEngine(undefined, [{ ...THUMB_UP_MAPPING, holdMs: 500 }])
    const early = feed(engine, 'Thumb_Up', 12, 0, 33) // ~400ms
    expect(early.every((r) => r.fired === null)).toBe(true)
    const later = feed(engine, 'Thumb_Up', 10, 400, 33)
    expect(later.filter((r) => r.fired)).toHaveLength(1)
  })
})

describe('reset', () => {
  it('clears all state', () => {
    const { engine } = makeEngine()
    feed(engine, 'Thumb_Up', 10, 0)
    engine.reset()
    const r = engine.frame({ gesture: 'Thumb_Up', confidence: 0.9, t: 1000 })
    expect(r.stable).toBeNull()
    expect(r.state).toBe('idle')
  })
})
