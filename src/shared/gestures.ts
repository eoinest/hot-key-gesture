import type { GestureName } from './types'

export interface GestureInfo {
  name: GestureName
  emoji: string
  label: string
  tip: string
}

/**
 * The seven built-in MediaPipe gesture classes plus a landmark-derived pinch.
 */
export const GESTURES: GestureInfo[] = [
  {
    name: 'Open_Palm',
    emoji: '✋',
    label: 'Open palm',
    tip: 'Face your open hand toward the camera, fingers spread and relaxed.',
  },
  {
    name: 'Closed_Fist',
    emoji: '✊',
    label: 'Fist',
    tip: 'Make a fist with your knuckles facing the camera.',
  },
  {
    name: 'Pointing_Up',
    emoji: '☝️',
    label: 'Point up',
    tip: 'Point your index finger straight up, other fingers curled.',
  },
  {
    name: 'Thumb_Up',
    emoji: '👍',
    label: 'Thumbs up',
    tip: 'Classic thumbs up — thumb straight up, fist sideways.',
  },
  {
    name: 'Thumb_Down',
    emoji: '👎',
    label: 'Thumbs down',
    tip: 'Thumb pointing straight down, fist sideways.',
  },
  {
    name: 'Victory',
    emoji: '✌️',
    label: 'Peace',
    tip: 'Index and middle finger in a V, palm toward the camera.',
  },
  {
    name: 'ILoveYou',
    emoji: '🤟',
    label: 'Rock on',
    tip: 'Extend thumb, index and pinky; curl middle and ring fingers.',
  },
  {
    name: 'Pinch',
    emoji: '🤏',
    label: 'Pinch',
    tip: 'Touch your thumb and index fingertips together, other fingers open.',
  },
]

export const GESTURE_INFO: Record<string, GestureInfo> = Object.fromEntries(
  GESTURES.map((g) => [g.name, g]),
)

export function gestureEmoji(name: string | null): string {
  return (name && GESTURE_INFO[name]?.emoji) || '🖐️'
}

export function gestureLabel(name: string | null): string {
  return (name && GESTURE_INFO[name]?.label) || 'No gesture'
}
