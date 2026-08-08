import { useEffect, useState } from 'react'
import type { RefObject } from 'react'
import { gestureEmoji, gestureLabel } from '../../../shared/gestures'
import type { AppMode } from '../../../shared/types'
import type { Hud, RecognizerStatus } from '../lib/useGesturePipeline'

interface CameraPanelProps {
  videoRef: RefObject<HTMLVideoElement | null>
  canvasRef: RefObject<HTMLCanvasElement | null>
  hud: Hud
  mode: AppMode
  mirror: boolean
  flashToken: number
  cameraError: string | null
  recognizerStatus: RecognizerStatus
  onRetryCamera: () => void
}

const MODE_LABELS: Record<AppMode, string> = {
  paused: 'Paused',
  test: 'Test mode',
  live: 'Live',
}

export function CameraPanel({
  videoRef,
  canvasRef,
  hud,
  mode,
  mirror,
  flashToken,
  cameraError,
  recognizerStatus,
  onRetryCamera,
}: CameraPanelProps) {
  const [flashOn, setFlashOn] = useState(false)

  useEffect(() => {
    if (flashToken === 0) return
    setFlashOn(true)
    const t = setTimeout(() => setFlashOn(false), 350)
    return () => clearTimeout(t)
  }, [flashToken])

  const showHoldState = mode !== 'paused' && hud.state !== 'idle'

  return (
    <div className="stage-inner">
      <video ref={videoRef} className={mirror ? 'mirrored' : ''} playsInline muted />
      <canvas ref={canvasRef} className="overlay" />
      <div className={`flash ${flashOn ? 'on' : ''}`} />

      {cameraError && (
        <div className="stage-message">
          <span className="stage-message-icon">📷</span>
          <p>{cameraError}</p>
          <button className="btn" onClick={onRetryCamera}>
            Retry camera
          </button>
        </div>
      )}
      {!cameraError && recognizerStatus === 'loading' && (
        <div className="stage-message subtle">
          <span className="spinner" />
          <p>Loading hand-tracking model…</p>
        </div>
      )}
      {!cameraError && recognizerStatus === 'error' && (
        <div className="stage-message">
          <span className="stage-message-icon">⚠️</span>
          <p>
            The hand-tracking model failed to load. Run <code>npm run setup-assets</code> and
            restart the app.
          </p>
        </div>
      )}

      <div className="hud">
        <div className={`gesture-chip state-${showHoldState ? hud.state : 'idle'}`}>
          <span className="chip-emoji">{gestureEmoji(hud.stable)}</span>
          <div className="chip-main">
            <div className="chip-label">{gestureLabel(hud.stable)}</div>
            <div className="conf-bar">
              <div style={{ width: `${Math.round(hud.confidence * 100)}%` }} />
            </div>
          </div>
          {showHoldState && (
            <span className="chip-state">
              {hud.state === 'cooldown' ? '✓' : `${Math.round(hud.holdProgress * 100)}%`}
            </span>
          )}
        </div>
        <div className="hud-badges">
          <span className="badge">{hud.fps} fps</span>
          <span className={`badge mode-badge mode-${mode}`}>{MODE_LABELS[mode]}</span>
        </div>
      </div>
    </div>
  )
}
