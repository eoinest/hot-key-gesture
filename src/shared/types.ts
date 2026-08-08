export type GestureName =
  | 'Closed_Fist'
  | 'Open_Palm'
  | 'Pointing_Up'
  | 'Thumb_Up'
  | 'Thumb_Down'
  | 'Victory'
  | 'ILoveYou'
  | 'Pinch'

export type Modifier = 'cmd' | 'ctrl' | 'alt' | 'shift'

export interface Hotkey {
  key: string
  modifiers: Modifier[]
}

export interface GestureMapping {
  id: string
  gesture: GestureName
  hotkey: Hotkey
  enabled: boolean
  label?: string
  /** Per-mapping overrides; fall back to global engine settings when unset. */
  holdMs?: number
  cooldownMs?: number
}

/**
 * paused — detection runs, nothing triggers.
 * test — full pipeline including debounce, but keystrokes are simulated (logged only).
 * live — gestures send real keystrokes.
 */
export type AppMode = 'paused' | 'test' | 'live'

export interface EngineSettings {
  /** Gesture must be held this long before it triggers. */
  holdMs: number
  /** Minimum time between two triggers of the same gesture. */
  cooldownMs: number
  /** Recognizer confidence below this is treated as "no gesture". */
  minConfidence: number
  /** Sliding-window size (frames) used to stabilize the detected gesture. */
  smoothingFrames: number
  /** When true a gesture must be released before it can trigger again. */
  requireRelease: boolean
}

export interface CameraSettings {
  deviceId?: string
  mirror: boolean
}

export interface AppConfig {
  version: 1
  mode: AppMode
  camera: CameraSettings
  engine: EngineSettings
  mappings: GestureMapping[]
}

export interface TriggerPayload {
  hotkey: Hotkey
  gesture: GestureName
  mappingId: string
}

export interface TriggerResult {
  ok: boolean
  error?: string
}

export const DEFAULT_ENGINE_SETTINGS: EngineSettings = {
  holdMs: 250,
  cooldownMs: 750,
  minConfidence: 0.55,
  smoothingFrames: 5,
  requireRelease: true,
}

export function defaultConfig(): AppConfig {
  return {
    version: 1,
    mode: 'paused',
    camera: { mirror: true },
    engine: { ...DEFAULT_ENGINE_SETTINGS },
    mappings: [
      {
        id: 'default-palm',
        gesture: 'Open_Palm',
        hotkey: { key: 'space', modifiers: [] },
        enabled: true,
        label: 'Play / pause media',
      },
      {
        id: 'default-fist',
        gesture: 'Closed_Fist',
        hotkey: { key: 'escape', modifiers: [] },
        enabled: true,
        label: 'Escape',
      },
      {
        id: 'default-victory',
        gesture: 'Victory',
        hotkey: { key: 't', modifiers: ['cmd'] },
        enabled: true,
        label: 'New tab',
      },
      {
        id: 'default-thumbup',
        gesture: 'Thumb_Up',
        hotkey: { key: 'tab', modifiers: ['cmd'] },
        enabled: true,
        label: 'Switch app',
      },
    ],
  }
}
