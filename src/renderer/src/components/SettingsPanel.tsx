import { GESTURES } from '../../../shared/gestures'
import { DEFAULT_ENGINE_SETTINGS } from '../../../shared/types'
import type { DisplayInfo } from '../../../shared/api'
import type {
  CameraSettings,
  EngineSettings,
  GestureName,
  MouseSettings,
  SoundSettings,
} from '../../../shared/types'
import { playBoop } from '../lib/sound'

interface SettingsPanelProps {
  engine: EngineSettings
  camera: CameraSettings
  sound: SoundSettings
  mouse: MouseSettings
  devices: MediaDeviceInfo[]
  displays: DisplayInfo[]
  pointerAvailable: boolean
  onEngineChange: (engine: EngineSettings) => void
  onCameraChange: (camera: CameraSettings) => void
  onSoundChange: (sound: SoundSettings) => void
  onMouseChange: (mouse: MouseSettings) => void
}

interface SliderRowProps {
  label: string
  hint: string
  value: number
  min: number
  max: number
  step: number
  format: (v: number) => string
  onChange: (v: number) => void
}

function SliderRow({ label, hint, value, min, max, step, format, onChange }: SliderRowProps) {
  return (
    <div className="setting-row">
      <div className="setting-text">
        <label>{label}</label>
        <p>{hint}</p>
      </div>
      <div className="setting-control">
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={(e) => onChange(Number(e.target.value))}
        />
        <span className="setting-value">{format(value)}</span>
      </div>
    </div>
  )
}

interface ToggleRowProps {
  label: string
  hint: string
  checked: boolean
  onChange: (v: boolean) => void
}

function ToggleRow({ label, hint, checked, onChange }: ToggleRowProps) {
  return (
    <div className="setting-row">
      <div className="setting-text">
        <label>{label}</label>
        <p>{hint}</p>
      </div>
      <label className="switch">
        <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
        <span />
      </label>
    </div>
  )
}

export function SettingsPanel({
  engine,
  camera,
  sound,
  mouse,
  devices,
  displays,
  pointerAvailable,
  onEngineChange,
  onCameraChange,
  onSoundChange,
  onMouseChange,
}: SettingsPanelProps) {
  const set = (patch: Partial<EngineSettings>) => onEngineChange({ ...engine, ...patch })

  const fmtSeconds = (v: number) => (v >= 1000 ? `${(v / 1000).toFixed(1)} s` : `${v} ms`)

  return (
    <div className="settings">
      <h3 className="settings-heading">Safety guard</h3>
      <ToggleRow
        label="Require a second hand"
        hint="Nothing fires unless one hand holds the arm gesture while the other acts. Strongly recommended."
        checked={engine.requireArmHand}
        onChange={(requireArmHand) => set({ requireArmHand })}
      />
      <div className={`setting-row ${engine.requireArmHand ? '' : 'setting-disabled'}`}>
        <div className="setting-text">
          <label>Arm gesture</label>
          <p>The gesture the arming hand must hold. Either hand can arm.</p>
        </div>
        <select
          className="device-select"
          disabled={!engine.requireArmHand}
          value={engine.armGesture}
          onChange={(e) => set({ armGesture: e.target.value as GestureName })}
        >
          {GESTURES.map((g) => (
            <option key={g.name} value={g.name}>
              {g.emoji} {g.label}
            </option>
          ))}
        </select>
      </div>

      <h3 className="settings-heading">Triggering</h3>
      <SliderRow
        label="Hold time"
        hint="How long the gesture must be held before it fires."
        value={engine.holdMs}
        min={250}
        max={6000}
        step={250}
        format={fmtSeconds}
        onChange={(holdMs) => set({ holdMs })}
      />
      <SliderRow
        label="Repeat interval"
        hint="With auto-repeat on, how long until it fires again while still held. Otherwise the minimum gap between triggers."
        value={engine.cooldownMs}
        min={250}
        max={6000}
        step={250}
        format={fmtSeconds}
        onChange={(cooldownMs) => set({ cooldownMs })}
      />
      <ToggleRow
        label="Release to re-trigger"
        hint="On: drop the gesture before it can fire again. Off: keeps firing every repeat interval while held."
        checked={engine.requireRelease}
        onChange={(requireRelease) => set({ requireRelease })}
      />

      <h3 className="settings-heading">Recognition</h3>
      <div className="setting-row">
        <div className="setting-text">
          <label>Hands to look for</label>
          <p>
            Only the two nearest the camera are used. Searching for more costs frame rate — raise
            it only if someone else’s hands keep taking a slot.
          </p>
        </div>
        <select
          className="device-select"
          value={engine.maxHands}
          onChange={(e) => set({ maxHands: Number(e.target.value) as 2 | 4 })}
        >
          <option value={4}>4 — reliable</option>
          <option value={2}>2 — faster</option>
        </select>
      </div>
      <SliderRow
        label="Dropout tolerance"
        hint="How long a gesture survives when tracking briefly loses your hand. Raise it if the pinch keeps letting go; lower it if gestures linger after you stop."
        value={engine.gapToleranceMs}
        min={0}
        max={1200}
        step={50}
        format={(v) => (v === 0 ? 'off' : `${v} ms`)}
        onChange={(gapToleranceMs) => set({ gapToleranceMs })}
      />
      <SliderRow
        label="Confidence threshold"
        hint="Lower catches gestures more eagerly; higher avoids false positives."
        value={engine.minConfidence}
        min={0.3}
        max={0.95}
        step={0.05}
        format={(v) => `${Math.round(v * 100)}%`}
        onChange={(minConfidence) => set({ minConfidence })}
      />
      <SliderRow
        label="Smoothing"
        hint="Frames of agreement needed to change the detected gesture. Higher = steadier, slower."
        value={engine.smoothingFrames}
        min={2}
        max={10}
        step={1}
        format={(v) => `${v} frames`}
        onChange={(smoothingFrames) => set({ smoothingFrames })}
      />

      <h3 className="settings-heading">Feedback</h3>
      <ToggleRow
        label="Boop on trigger"
        hint="Play a short sound whenever a gesture fires its shortcut, so you know it worked without looking."
        checked={sound.enabled}
        onChange={(enabled) => {
          onSoundChange({ ...sound, enabled })
          if (enabled) playBoop(sound.volume)
        }}
      />
      <div className={`setting-row ${sound.enabled ? '' : 'setting-disabled'}`}>
        <div className="setting-text">
          <label>Volume</label>
          <p>Click the speaker to preview.</p>
        </div>
        <div className="setting-control">
          <input
            type="range"
            min={0.05}
            max={1}
            step={0.05}
            disabled={!sound.enabled}
            value={sound.volume}
            onChange={(e) => onSoundChange({ ...sound, volume: Number(e.target.value) })}
            onMouseUp={() => sound.enabled && playBoop(sound.volume)}
          />
          <button
            className="btn small"
            disabled={!sound.enabled}
            onClick={() => playBoop(sound.volume)}
            title="Preview the boop"
          >
            🔊
          </button>
        </div>
      </div>

      <h3 className="settings-heading">Cursor control</h3>
      {!pointerAvailable && (
        <p className="setting-warning">
          The cursor helper isn’t built, so pointer gestures won’t move the mouse. Run{' '}
          <code>npm run build-helper</code> (needs Xcode command line tools).
        </p>
      )}
      <div className={`setting-row ${pointerAvailable ? '' : 'setting-disabled'}`}>
        <div className="setting-text">
          <label>Display</label>
          <p>
            Which screen the camera frame maps onto. Span all to reach a second screen —
            targeting one display keeps the cursor inside it.
          </p>
        </div>
        <select
          className="device-select"
          disabled={!pointerAvailable}
          value={mouse.displayId === 'all' ? 'all' : (mouse.displayId ?? '')}
          onChange={(e) => {
            const v = e.target.value
            onMouseChange({
              ...mouse,
              displayId: v === 'all' ? 'all' : v ? Number(v) : null,
            })
          }}
        >
          <option value="all">All displays (span)</option>
          <option value="">Primary display only</option>
          {displays.map((d) => (
            <option key={d.id} value={d.id}>
              {d.label}
              {d.primary ? ' (primary)' : ''}
            </option>
          ))}
        </select>
      </div>
      <SliderRow
        label="Reach"
        hint="How much of the camera frame maps to the whole screen. Higher reach means smaller hand movements cover more ground."
        value={mouse.margin}
        min={0}
        max={0.35}
        step={0.05}
        format={(v) => `${Math.round((1 - v * 2) * 100)}% of frame`}
        onChange={(margin) => onMouseChange({ ...mouse, margin })}
      />
      <ToggleRow
        label="Click while steering"
        hint="Left-click without letting go of the cursor. Return to a plain pinch before it can click again."
        checked={mouse.clickEnabled}
        onChange={(clickEnabled) => onMouseChange({ ...mouse, clickEnabled })}
      />
      <div className={`setting-row ${mouse.clickEnabled ? '' : 'setting-disabled'}`}>
        <div className="setting-text">
          <label>Click by</label>
          <p>
            Raising a pinky barely moves the pinch point, so the cursor stays put as you click.
            A whole-hand gesture is more deliberate but drags the pointer.
          </p>
        </div>
        <select
          className="device-select"
          disabled={!mouse.clickEnabled}
          value={mouse.clickMode}
          onChange={(e) =>
            onMouseChange({ ...mouse, clickMode: e.target.value as 'pinky' | 'gesture' })
          }
        >
          <option value="pinky">🤙 Raising your pinky</option>
          <option value="gesture">✊ A hand gesture</option>
        </select>
      </div>
      {mouse.clickMode === 'gesture' && (
        <div className={`setting-row ${mouse.clickEnabled ? '' : 'setting-disabled'}`}>
          <div className="setting-text">
            <label>Click gesture</label>
            <p>Only active mid-session, so it can safely match the arm gesture.</p>
          </div>
          <select
            className="device-select"
            disabled={!mouse.clickEnabled}
            value={mouse.clickGesture}
            onChange={(e) => onMouseChange({ ...mouse, clickGesture: e.target.value as GestureName })}
          >
            {GESTURES.map((g) => (
              <option key={g.name} value={g.name}>
                {g.emoji} {g.label}
              </option>
            ))}
          </select>
        </div>
      )}
      <SliderRow
        label="Cursor smoothing"
        hint="Higher is steadier against hand shake but lags behind your hand more."
        value={mouse.smoothing}
        min={0}
        max={0.9}
        step={0.05}
        format={(v) => `${Math.round(v * 100)}%`}
        onChange={(smoothing) => onMouseChange({ ...mouse, smoothing })}
      />

      <h3 className="settings-heading">Camera</h3>
      <div className="setting-row">
        <div className="setting-text">
          <label>Camera</label>
          <p>Which webcam to use.</p>
        </div>
        <select
          className="device-select"
          value={camera.deviceId ?? ''}
          onChange={(e) =>
            onCameraChange({ ...camera, deviceId: e.target.value || undefined })
          }
        >
          <option value="">Default camera</option>
          {devices.map((d) => (
            <option key={d.deviceId} value={d.deviceId}>
              {d.label || `Camera ${d.deviceId.slice(0, 6)}`}
            </option>
          ))}
        </select>
      </div>
      <ToggleRow
        label="Mirror preview"
        hint="Flip the preview horizontally, like a mirror."
        checked={camera.mirror}
        onChange={(mirror) => onCameraChange({ ...camera, mirror })}
      />

      <button
        className="btn"
        onClick={() => onEngineChange({ ...DEFAULT_ENGINE_SETTINGS })}
        style={{ marginTop: 16 }}
      >
        Reset safety, triggering &amp; recognition to defaults
      </button>
    </div>
  )
}
