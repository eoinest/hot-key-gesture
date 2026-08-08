import { describe, expect, it } from 'vitest'
import { detectPinch, handSpan, pinchPoint, pinkyRaised } from '../src/renderer/src/lib/pinch'
import type { Point3 } from '../src/renderer/src/lib/pinch'

const WRIST = 0
const THUMB_TIP = 4
const INDEX_TIP = 8
const MIDDLE_MCP = 9

const p = (x: number, y: number): Point3 => ({ x, y, z: 0 })

interface HandOptions {
  /** Distance between thumb and index tips, in normalized units. */
  tipGap: number
  /** Whether middle/ring/pinky are extended away from the wrist. */
  freeFingersOut: boolean
}

/**
 * Build a synthetic 21-landmark hand. Wrist sits at the bottom, palm length
 * (wrist→middle MCP) is 0.3, so tipGap 0.03 is a ratio of 0.1.
 */
function hand({ tipGap, freeFingersOut }: HandOptions): Point3[] {
  const pts: Point3[] = Array.from({ length: 21 }, () => p(0.5, 0.75))
  pts[WRIST] = p(0.5, 0.9)
  pts[MIDDLE_MCP] = p(0.5, 0.6)
  pts[THUMB_TIP] = p(0.5, 0.55)
  pts[INDEX_TIP] = p(0.5 + tipGap, 0.55)
  // pips sit at 0.3 from the wrist; extended tips go beyond, curled fall short.
  for (const [tip, pip] of [
    [12, 10],
    [16, 14],
    [20, 18],
  ]) {
    pts[pip] = p(0.5, 0.6)
    pts[tip] = freeFingersOut ? p(0.5, 0.42) : p(0.5, 0.72)
  }
  return pts
}

describe('detectPinch', () => {
  it('detects a pinch when the tips touch and the other fingers are out', () => {
    const result = detectPinch(hand({ tipGap: 0.02, freeFingersOut: true }))
    expect(result.pinch).toBe(true)
    expect(result.confidence).toBeGreaterThan(0.7)
  })

  it('is purely geometric and does not inspect the other fingers', () => {
    // Measured on real hands, a pinch curls the other fingers just like a fist
    // does, so this detector cannot separate them and does not pretend to.
    // Keeping a fist out of the pinch path is the caller's job: it only asks
    // when the classifier has no confident answer.
    const curled = detectPinch(hand({ tipGap: 0.02, freeFingersOut: false }))
    const extended = detectPinch(hand({ tipGap: 0.02, freeFingersOut: true }))
    expect(curled).toEqual(extended)
  })

  it('rejects an open hand with separated tips', () => {
    expect(detectPinch(hand({ tipGap: 0.2, freeFingersOut: true })).pinch).toBe(false)
  })

  it('reports confidence above any sane gate so it is not filtered out', () => {
    const loose = detectPinch(hand({ tipGap: 0.09, freeFingersOut: true }))
    expect(loose.pinch).toBe(true)
    expect(loose.confidence).toBeGreaterThan(0.55)
  })

  it('holds on through a looser gap once already pinching (hysteresis)', () => {
    // A gap that would not start a pinch keeps an existing one alive.
    const drifted = hand({ tipGap: 0.12, freeFingersOut: true })
    expect(detectPinch(drifted, false).pinch).toBe(false)
    expect(detectPinch(drifted, true).pinch).toBe(true)
  })

  it('ignores malformed landmark sets', () => {
    expect(detectPinch([]).pinch).toBe(false)
    expect(detectPinch([p(0, 0), p(1, 1)]).pinch).toBe(false)
  })
})

describe('pinkyRaised', () => {
  const RING_TIP = 16
  const PINKY_TIP = 20

  /**
   * Pinky detection compares how far the pinky tip reaches versus the ring
   * finger. Real hands measured ~0.75 curled and ~1.10 raised.
   */
  function withPinky(vsRing: number): Point3[] {
    const pts = hand({ tipGap: 0.02, freeFingersOut: false })
    pts[RING_TIP] = p(0.5, 0.7) // 0.2 from the wrist at (0.5, 0.9)
    pts[PINKY_TIP] = p(0.5, 0.9 - 0.2 * vsRing)
    return pts
  }

  it('detects a raised pinky at the measured raised value', () => {
    expect(pinkyRaised(withPinky(1.1))).toBe(true)
  })

  it('ignores a curled pinky at the measured curled value', () => {
    expect(pinkyRaised(withPinky(0.75))).toBe(false)
  })

  it('holds through the gap once raised (hysteresis)', () => {
    // A value inside the dead band neither starts nor ends a raise.
    expect(pinkyRaised(withPinky(0.96), false)).toBe(false)
    expect(pinkyRaised(withPinky(0.96), true)).toBe(true)
  })

  it('ignores malformed landmarks', () => {
    expect(pinkyRaised([])).toBe(false)
  })
})

describe('handSpan', () => {
  it('measures a nearer hand as larger, which is how the user beats a bystander', () => {
    const near = hand({ tipGap: 0.1, freeFingersOut: true })
    // Same pose, half the apparent size — someone further from the camera.
    const far = near.map((q) => p(0.5 + (q.x - 0.5) / 2, 0.5 + (q.y - 0.5) / 2))
    expect(handSpan(near)).toBeGreaterThan(handSpan(far))
  })

  it('returns zero for malformed landmarks', () => {
    expect(handSpan([])).toBe(0)
  })
})

describe('pinchPoint', () => {
  it('returns the midpoint between thumb and index tips', () => {
    const pts = hand({ tipGap: 0.1, freeFingersOut: true })
    expect(pinchPoint(pts)).toEqual({ x: 0.55, y: 0.55 })
  })

  it('returns null for malformed landmarks', () => {
    expect(pinchPoint([])).toBeNull()
  })
})
