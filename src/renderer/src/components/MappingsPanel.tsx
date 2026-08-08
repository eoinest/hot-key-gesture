import { GESTURES, GESTURE_INFO } from '../../../shared/gestures'
import type {
  GestureMapping,
  GestureName,
  Hotkey,
  MappingActionKind,
} from '../../../shared/types'
import { HotkeyRecorder } from './HotkeyRecorder'

interface MappingsPanelProps {
  mappings: GestureMapping[]
  stable: GestureName | null
  platform: string
  requireArmHand: boolean
  armGestureLabel: string
  armGestureEmoji: string
  onChange: (mappings: GestureMapping[]) => void
}

let nextId = 1
function newId(): string {
  return `mapping-${Date.now().toString(36)}-${nextId++}`
}

export function MappingsPanel({
  mappings,
  stable,
  platform,
  requireArmHand,
  armGestureLabel,
  armGestureEmoji,
  onChange,
}: MappingsPanelProps) {
  const update = (id: string, patch: Partial<GestureMapping>) => {
    onChange(mappings.map((m) => (m.id === id ? { ...m, ...patch } : m)))
  }

  const remove = (id: string) => {
    onChange(mappings.filter((m) => m.id !== id))
  }

  const add = () => {
    const used = new Set(mappings.map((m) => m.gesture))
    const gesture = GESTURES.find((g) => !used.has(g.name))?.name ?? 'Open_Palm'
    onChange([
      ...mappings,
      { id: newId(), gesture, action: 'hotkey', hotkey: { key: '', modifiers: [] }, enabled: true },
    ])
  }

  // For each gesture, only the first enabled mapping fires; flag the rest.
  const firstEnabled = new Map<GestureName, string>()
  for (const m of mappings) {
    if (m.enabled && !firstEnabled.has(m.gesture)) firstEnabled.set(m.gesture, m.id)
  }

  return (
    <div className="mappings">
      <p className="panel-hint">
        {requireArmHand ? (
          <>
            Hold <b>{armGestureEmoji} {armGestureLabel}</b> with one hand to arm, then make one of
            these gestures with your other hand. Rows light up while their gesture is recognized.
          </>
        ) : (
          <>
            Hold a gesture toward the camera to fire its shortcut. Rows light up while their
            gesture is recognized — try it now.
          </>
        )}
      </p>
      {mappings.map((m) => {
        const info = GESTURE_INFO[m.gesture]
        const shadowed = m.enabled && firstEnabled.get(m.gesture) !== m.id
        const detected = m.enabled && stable === m.gesture
        return (
          <div
            key={m.id}
            className={`mapping ${m.enabled ? '' : 'disabled'} ${detected ? 'detected' : ''}`}
          >
            <span className="mapping-emoji" title={info?.tip}>
              {info?.emoji ?? '🖐️'}
            </span>
            <select
              className="gesture-select"
              value={m.gesture}
              onChange={(e) => update(m.id, { gesture: e.target.value as GestureName })}
            >
              {GESTURES.map((g) => (
                <option key={g.name} value={g.name}>
                  {g.label}
                </option>
              ))}
            </select>
            <span className="mapping-arrow">→</span>
            <select
              className="action-select"
              value={m.action ?? 'hotkey'}
              title={
                (m.action ?? 'hotkey') === 'mouse'
                  ? 'Steers the cursor while held'
                  : 'Presses a keyboard shortcut'
              }
              onChange={(e) => update(m.id, { action: e.target.value as MappingActionKind })}
            >
              <option value="hotkey">⌨️</option>
              <option value="mouse">🖱️</option>
              <option value="sound">🔊</option>
            </select>
            {(m.action ?? 'hotkey') === 'mouse' ? (
              <span className="mouse-action" title="The cursor follows this hand's pinch point while you hold it">
                Move cursor
              </span>
            ) : m.action === 'sound' ? (
              <span className="sound-action" title={m.soundFile ?? 'No sound file set'}>
                {m.label ?? m.soundFile?.split('/').pop() ?? 'Play sound'}
              </span>
            ) : (
              <HotkeyRecorder
                value={m.hotkey ?? { key: '', modifiers: [] }}
                platform={platform}
                onChange={(hotkey: Hotkey) => update(m.id, { hotkey })}
              />
            )}
            {shadowed && (
              <span className="warn-dot" title="Another enabled row already maps this gesture — the first one wins.">
                ⚠️
              </span>
            )}
            {requireArmHand && info?.label === armGestureLabel && (
              <span
                className="warn-dot"
                title={`This is also your arm gesture — you'd need ${armGestureLabel} with both hands to fire it.`}
              >
                ✊
              </span>
            )}
            <label className="switch" title={m.enabled ? 'Enabled' : 'Disabled'}>
              <input
                type="checkbox"
                checked={m.enabled}
                onChange={(e) => update(m.id, { enabled: e.target.checked })}
              />
              <span />
            </label>
            <button className="icon-btn" title="Remove mapping" onClick={() => remove(m.id)}>
              ✕
            </button>
          </div>
        )
      })}
      <button className="btn add-btn" onClick={add}>
        + Add gesture
      </button>
    </div>
  )
}
