import { useCallback, useEffect, useRef, useState } from 'react'
import { GESTURE_INFO } from '../../shared/gestures'
import { formatHotkey } from '../../shared/hotkeys'
import type { AppConfig, AppMode, GestureMapping } from '../../shared/types'
import { ActivityPanel } from './components/ActivityPanel'
import type { LogEntry } from './components/ActivityPanel'
import { CameraPanel } from './components/CameraPanel'
import { GuidePanel } from './components/GuidePanel'
import { MappingsPanel } from './components/MappingsPanel'
import { SettingsPanel } from './components/SettingsPanel'
import { playBoop, playErrorTone } from './lib/sound'
import { useGesturePipeline } from './lib/useGesturePipeline'

type Tab = 'gestures' | 'guide' | 'settings' | 'activity'

const TABS: { id: Tab; label: string }[] = [
  { id: 'gestures', label: 'Gestures' },
  { id: 'guide', label: 'Guide' },
  { id: 'settings', label: 'Settings' },
  { id: 'activity', label: 'Activity' },
]

const MODES: { id: AppMode; label: string; hint: string }[] = [
  { id: 'paused', label: 'Paused', hint: 'Detection preview only — nothing triggers.' },
  { id: 'test', label: 'Test', hint: 'Full triggers, but keystrokes are simulated.' },
  { id: 'live', label: 'Live', hint: 'Gestures send real keystrokes.' },
]

export default function App() {
  const [config, setConfig] = useState<AppConfig | null>(null)
  const configRef = useRef<AppConfig | null>(null)
  const [tab, setTab] = useState<Tab>('gestures')
  const [logs, setLogs] = useState<LogEntry[]>([])
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([])
  const [accessibilityOk, setAccessibilityOk] = useState(true)
  const logId = useRef(0)
  const platform = window.api.platform

  const addLog = useCallback((kind: LogEntry['kind'], message: string) => {
    setLogs((prev) =>
      [{ id: ++logId.current, time: Date.now(), kind, message }, ...prev].slice(0, 200),
    )
  }, [])

  // Load persisted config once.
  useEffect(() => {
    window.api.getConfig().then((c) => {
      configRef.current = c
      setConfig(c)
    })
  }, [])

  // Keep the ref (read by the frame loop) in sync with state.
  useEffect(() => {
    if (config) configRef.current = config
  }, [config])

  // Debounced persistence of any config change.
  const skipNextSave = useRef(true)
  useEffect(() => {
    if (!config) return
    if (skipNextSave.current) {
      skipNextSave.current = false
      return
    }
    const t = setTimeout(() => {
      void window.api.saveConfig(config)
    }, 400)
    return () => clearTimeout(t)
  }, [config])

  useEffect(() => {
    if (platform === 'darwin') {
      void window.api.checkAccessibility(false).then(setAccessibilityOk)
    }
  }, [platform])

  const refreshDevices = useCallback(async () => {
    try {
      const all = await navigator.mediaDevices.enumerateDevices()
      setDevices(all.filter((d) => d.kind === 'videoinput'))
    } catch {
      // Device list is a nicety; ignore failures.
    }
  }, [])

  useEffect(() => {
    void refreshDevices()
    navigator.mediaDevices.addEventListener('devicechange', refreshDevices)
    return () => navigator.mediaDevices.removeEventListener('devicechange', refreshDevices)
  }, [refreshDevices])

  const soundRef = useRef({ enabled: true, volume: 0.3 })
  useEffect(() => {
    if (config) soundRef.current = config.sound
  }, [config])

  const handleFired = useCallback(
    (mapping: GestureMapping, mode: AppMode) => {
      const info = GESTURE_INFO[mapping.gesture]
      const combo = formatHotkey(mapping.hotkey, platform)
      const { enabled, volume } = soundRef.current
      if (mode === 'test') {
        if (enabled) playBoop(volume)
        addLog('test', `${info?.emoji ?? ''} ${info?.label ?? mapping.gesture} → ${combo} (test — not sent)`)
        return
      }
      void window.api
        .sendHotkey({ hotkey: mapping.hotkey, gesture: mapping.gesture, mappingId: mapping.id })
        .then((result) => {
          if (result.ok) {
            if (enabled) playBoop(volume)
            addLog('live', `${info?.emoji ?? ''} ${info?.label ?? mapping.gesture} → sent ${combo}`)
          } else {
            if (enabled) playErrorTone(volume)
            addLog('error', `Failed to send ${combo}: ${result.error}`)
          }
        })
    },
    [addLog, platform],
  )

  const pipeline = useGesturePipeline({
    config,
    configRef,
    onFired: handleFired,
    onLog: addLog,
  })

  const setMode = (mode: AppMode) => {
    if (!config || config.mode === mode) return
    if (mode === 'live' && platform === 'darwin' && !accessibilityOk) {
      void window.api.checkAccessibility(true).then((ok) => {
        setAccessibilityOk(ok)
        if (!ok) {
          addLog(
            'info',
            'macOS needs Accessibility permission to send keystrokes: System Settings → Privacy & Security → Accessibility.',
          )
        }
      })
    }
    setConfig({ ...config, mode })
    void window.api.setMode(mode)
    const hint = MODES.find((m) => m.id === mode)?.hint ?? ''
    addLog('info', `${MODES.find((m) => m.id === mode)?.label}: ${hint}`)
  }

  const promptAccessibility = () => {
    void window.api.checkAccessibility(true).then(setAccessibilityOk)
  }

  if (!config) {
    return <div className="app-loading">Loading…</div>
  }

  const armInfo = GESTURE_INFO[config.engine.armGesture]
  const armGestureLabel = armInfo?.label ?? config.engine.armGesture
  const armGestureEmoji = armInfo?.emoji ?? '✊'

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <span className="brand-icon">🖐️</span>
          <div>
            <h1>HotKey Gesture</h1>
            <p>Webcam gestures → keyboard shortcuts</p>
          </div>
        </div>
        <div className="topbar-right">
          {platform === 'darwin' && !accessibilityOk && (
            <button className="warn-chip" onClick={promptAccessibility} title="Required to send keystrokes. Click to open the system prompt.">
              ⚠️ Accessibility permission needed
            </button>
          )}
          <div className="mode-switch" role="tablist" aria-label="Mode">
            {MODES.map((m) => (
              <button
                key={m.id}
                className={`mode-option mode-${m.id} ${config.mode === m.id ? 'active' : ''}`}
                title={m.hint}
                onClick={() => setMode(m.id)}
              >
                {m.label}
              </button>
            ))}
          </div>
        </div>
      </header>

      <main className="layout">
        <section className="stage">
          <CameraPanel
            videoRef={pipeline.videoRef}
            canvasRef={pipeline.canvasRef}
            hud={pipeline.hud}
            mode={config.mode}
            mirror={config.camera.mirror}
            flashToken={pipeline.flashToken}
            cameraError={pipeline.cameraError}
            recognizerStatus={pipeline.recognizerStatus}
            requireArmHand={config.engine.requireArmHand}
            armGestureLabel={armGestureLabel}
            armGestureEmoji={armGestureEmoji}
            onRetryCamera={pipeline.restartCamera}
          />
        </section>

        <aside className="sidebar">
          <nav className="tabs">
            {TABS.map((t) => (
              <button
                key={t.id}
                className={`tab ${tab === t.id ? 'active' : ''}`}
                onClick={() => setTab(t.id)}
              >
                {t.label}
                {t.id === 'activity' && logs.length > 0 && (
                  <span className="tab-count">{logs.length}</span>
                )}
              </button>
            ))}
          </nav>
          <div className="tab-body">
            {tab === 'gestures' && (
              <MappingsPanel
                mappings={config.mappings}
                stable={pipeline.hud.stable}
                platform={platform}
                requireArmHand={config.engine.requireArmHand}
                armGestureLabel={armGestureLabel}
                armGestureEmoji={armGestureEmoji}
                onChange={(mappings) => setConfig({ ...config, mappings })}
              />
            )}
            {tab === 'guide' && (
              <GuidePanel
                stable={pipeline.hud.stable}
                requireArmHand={config.engine.requireArmHand}
                armGestureLabel={armGestureLabel}
                armGestureEmoji={armGestureEmoji}
                holdMs={config.engine.holdMs}
                cooldownMs={config.engine.cooldownMs}
                repeats={!config.engine.requireRelease}
              />
            )}
            {tab === 'settings' && (
              <SettingsPanel
                engine={config.engine}
                camera={config.camera}
                sound={config.sound}
                devices={devices}
                onEngineChange={(engine) => setConfig({ ...config, engine })}
                onCameraChange={(camera) => setConfig({ ...config, camera })}
                onSoundChange={(sound) => setConfig({ ...config, sound })}
              />
            )}
            {tab === 'activity' && <ActivityPanel logs={logs} onClear={() => setLogs([])} />}
          </div>
        </aside>
      </main>
    </div>
  )
}
