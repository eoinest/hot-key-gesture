export interface Point3 {
  x: number
  y: number
  z: number
}

const THUMB_TIP = 4
const INDEX_TIP = 8
const WRIST = 0
const MIDDLE_MCP = 9

/** Tip distance below this fraction of palm length counts as a pinch. */
const PINCH_RATIO = 0.3

function dist(a: Point3, b: Point3): number {
  return Math.hypot(a.x - b.x, a.y - b.y)
}

/**
 * Landmark-derived pinch detector (thumb tip touching index tip), used when
 * the built-in classifier reports no gesture. Distance is normalized by palm
 * length so it is scale-invariant with respect to hand distance from camera.
 */
export function detectPinch(landmarks: Point3[]): { pinch: boolean; confidence: number } {
  if (!landmarks || landmarks.length < 21) return { pinch: false, confidence: 0 }
  const palm = dist(landmarks[WRIST], landmarks[MIDDLE_MCP])
  if (palm <= 0) return { pinch: false, confidence: 0 }
  const ratio = dist(landmarks[THUMB_TIP], landmarks[INDEX_TIP]) / palm
  if (ratio >= PINCH_RATIO) return { pinch: false, confidence: 0 }
  // Map ratio 0 → 1.0 confidence, PINCH_RATIO → 0.6 confidence.
  const confidence = 0.6 + 0.4 * (1 - ratio / PINCH_RATIO)
  return { pinch: true, confidence }
}
