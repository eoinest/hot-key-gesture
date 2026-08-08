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

/**
 * 'hotkey' presses a key combination once. 'mouse' takes over the cursor and
 * steers it from the acting hand's pinch point for as long as it is held.
 */
export type MappingActionKind = 'hotkey' | 'mouse'

export interface GestureMapping {
  id: string
  gesture: GestureName
  /** Absent means 'hotkey' — older configs predate pointer control. */
  action?: MappingActionKind
  /** Required for 'hotkey' actions, unused for 'mouse'. */
  hotkey?: Hotkey
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
  /**
   * Safety guard: require a second hand holding `armGesture` before any
   * action gesture can fire. Prevents everyday one-handed motions from
   * triggering shortcuts.
   */
  requireArmHand: boolean
  /** The gesture the arm hand must hold while the other hand acts. */
  armGesture: GestureName
  /**
   * How long a recognized gesture survives a detection dropout before it is
   * considered gone. Hand tracking drops frames routinely — especially during
   * a pinch, where the fingers occlude each other — and without this a blink
   * costs a full re-hold.
   */
  gapToleranceMs: number
}

export interface CameraSettings {
  deviceId?: string
  mirror: boolean
}

export interface SoundSettings {
  /** Play a short boop when a gesture fires its shortcut. */
  enabled: boolean
  /** 0..1 */
  volume: number
}

export const DEFAULT_SOUND_SETTINGS: SoundSettings = {
  enabled: true,
  volume: 0.3,
}

export interface MouseSettings {
  /**
   * Fraction of each frame edge left out of the mapping. The remaining centre
   * spans the whole display, so you can reach the corners without moving your
   * hand out of camera view.
   */
  margin: number
  /** 0..1 exponential smoothing. Higher is steadier but lags more. */
  smoothing: number
  /**
   * Which screen the camera frame maps onto: 'all' spans every display as one
   * surface (the only way to reach a second screen), a number targets one
   * display by id, null means the primary display.
   */
  displayId: number | 'all' | null
  /** Click when the steering hand switches to `clickGesture` mid-session. */
  clickEnabled: boolean
  /**
   * Gesture that clicks while pointer control is engaged. It may equal the
   * arm gesture — hand roles are locked for the duration of a session, so a
   * fist on the steering hand is unambiguous.
   */
  clickGesture: GestureName
}

export const DEFAULT_MOUSE_SETTINGS: MouseSettings = {
  margin: 0.2,
  smoothing: 0.55,
  // Spanning is the same as the primary display on a single-screen setup, and
  // the only thing that works on more than one, so it is the better default.
  displayId: 'all',
  clickEnabled: true,
  clickGesture: 'Closed_Fist',
}

/** Appended on load when a config has no pointer-control mapping yet. */
export function defaultPinchMouseMapping(): GestureMapping {
  return {
    id: 'default-pinch-mouse',
    gesture: 'Pinch',
    action: 'mouse',
    enabled: true,
    label: 'Move the cursor',
  }
}

/** Bumped when tuning defaults change in a way that should adopt the new values. */
export const CONFIG_VERSION = 3

export interface AppConfig {
  version: number
  mode: AppMode
  camera: CameraSettings
  engine: EngineSettings
  sound: SoundSettings
  mouse: MouseSettings
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
  holdMs: 1000,
  cooldownMs: 1000,
  minConfidence: 0.55,
  smoothingFrames: 5,
  requireRelease: false,
  requireArmHand: true,
  armGesture: 'Closed_Fist',
  gapToleranceMs: 400,
}

export function defaultConfig(): AppConfig {
  return {
    version: CONFIG_VERSION,
    mode: 'paused',
    camera: { mirror: true },
    engine: { ...DEFAULT_ENGINE_SETTINGS },
    sound: { ...DEFAULT_SOUND_SETTINGS },
    mouse: { ...DEFAULT_MOUSE_SETTINGS },
    mappings: [
      {
        id: 'default-palm',
        gesture: 'Open_Palm',
        hotkey: { key: 'space', modifiers: [] },
        enabled: true,
        label: 'Play / pause media',
      },
      {
        id: 'default-point',
        gesture: 'Pointing_Up',
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
      defaultPinchMouseMapping(),
    ],
  }
}
