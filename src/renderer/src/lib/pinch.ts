export interface Point3 {
  x: number
  y: number
  z: number
}

const THUMB_TIP = 4
const INDEX_TIP = 8
const WRIST = 0
const MIDDLE_MCP = 9

/**
 * Schmitt trigger: it takes a tighter pinch to start than to keep going.
 * A single threshold makes the gesture flicker every time the fingers drift
 * a millimetre, which reads to the user as the tracker losing their hand.
 */
const PINCH_ENGAGE_RATIO = 0.32
const PINCH_RELEASE_RATIO = 0.48

function dist(a: Point3, b: Point3): number {
  return Math.hypot(a.x - b.x, a.y - b.y)
}

/**
 * Apparent size of a hand, as the span of its landmarks. A hand close to the
 * camera measures larger, which is how the user's own hands are told apart
 * from someone standing behind them.
 */
export function handSpan(landmarks: Point3[]): number {
  if (!landmarks || landmarks.length < 21) return 0
  const xs = landmarks.map((p) => p.x)
  const ys = landmarks.map((p) => p.y)
  return Math.hypot(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys))
}

/**
 * The point the cursor should follow: midway between thumb and index tips,
 * i.e. where the pinch visually "is". Returns normalized image coordinates.
 */
export function pinchPoint(landmarks: Point3[]): { x: number; y: number } | null {
  if (!landmarks || landmarks.length < 21) return null
  const a = landmarks[THUMB_TIP]
  const b = landmarks[INDEX_TIP]
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }
}

/**
 * Landmark-derived pinch detector: thumb tip touching index tip, normalized by
 * palm length so it is scale-invariant with distance from the camera.
 *
 * This is purely geometric and deliberately does *not* try to rule out a fist.
 * Measuring real hands showed a fist and a pinch are near-identical here — the
 * fingers that a pinch supposedly leaves extended are curled in practice. The
 * caller keeps the two apart by only consulting this when the classifier has no
 * confident opinion; a fist is something MediaPipe recognizes reliably.
 *
 * @param wasPinching whether this hand was pinching on the previous frame,
 *   which widens the release threshold (see the Schmitt trigger above).
 */
export function detectPinch(
  landmarks: Point3[],
  wasPinching = false,
): { pinch: boolean; confidence: number } {
  if (!landmarks || landmarks.length < 21) return { pinch: false, confidence: 0 }
  const palm = dist(landmarks[WRIST], landmarks[MIDDLE_MCP])
  if (palm <= 0) return { pinch: false, confidence: 0 }
  const ratio = dist(landmarks[THUMB_TIP], landmarks[INDEX_TIP]) / palm
  const threshold = wasPinching ? PINCH_RELEASE_RATIO : PINCH_ENGAGE_RATIO
  if (ratio >= threshold) return { pinch: false, confidence: 0 }
  // Sits above any sane confidence gate: the tips are either touching or they
  // are not, and that is not a guess we should let a threshold discard.
  const confidence = 0.75 + 0.25 * (1 - Math.min(1, ratio / threshold))
  return { pinch: true, confidence }
}
