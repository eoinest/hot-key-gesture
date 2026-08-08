import { DEFAULT_ENGINE_SETTINGS } from '../../../shared/types'
import type { CameraSettings, EngineSettings } from '../../../shared/types'

interface SettingsPanelProps {
  engine: EngineSettings
  camera: CameraSettings
  devices: MediaDeviceInfo[]
  onEngineChange: (engine: EngineSettings) => void
  onCameraChange: (camera: CameraSettings) => void
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
  devices,
  onEngineChange,
  onCameraChange,
}: SettingsPanelProps) {
  const set = (patch: Partial<EngineSettings>) => onEngineChange({ ...engine, ...patch })

  return (
    <div className="settings">
      <h3 className="settings-heading">Triggering</h3>
      <SliderRow
        label="Hold time"
        hint="How long a gesture must be held before it fires."
        value={engine.holdMs}
        min={50}
        max={1500}
        step={50}
        format={(v) => `${v} ms`}
        onChange={(holdMs) => set({ holdMs })}
      />
      <SliderRow
        label="Cooldown"
        hint="Minimum time between two triggers of the same gesture."
        value={engine.cooldownMs}
        min={100}
        max={3000}
        step={50}
        format={(v) => `${v} ms`}
        onChange={(cooldownMs) => set({ cooldownMs })}
      />
      <ToggleRow
        label="Release to re-trigger"
        hint="Require dropping the gesture before it can fire again. Off = repeats every cooldown while held."
        checked={engine.requireRelease}
        onChange={(requireRelease) => set({ requireRelease })}
      />

      <h3 className="settings-heading">Recognition</h3>
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
        Reset triggering &amp; recognition to defaults
      </button>
    </div>
  )
}
