import { useEffect, useRef, useState } from 'react'
import type { GestureRecognizer } from '@mediapipe/tasks-vision'
import { GestureEngine } from '../../../shared/gestureEngine'
import type { EngineState } from '../../../shared/gestureEngine'
import { isValidHotkey } from '../../../shared/hotkeys'
import { DEFAULT_ENGINE_SETTINGS } from '../../../shared/types'
import type { AppConfig, AppMode, GestureMapping, GestureName } from '../../../shared/types'
import { createGestureRecognizer } from './recognizer'
import { detectPinch } from './pinch'
import { drawOverlay } from './drawing'

export interface Hud {
  stable: GestureName | null
  state: EngineState
  holdProgress: number
  confidence: number
  fps: number
}

export type RecognizerStatus = 'loading' | 'ready' | 'error'

export interface LogFn {
  (kind: 'live' | 'test' | 'error' | 'info', message: string): void
}

interface PipelineOptions {
  config: AppConfig | null
  configRef: React.RefObject<AppConfig | null>
  onFired: (mapping: GestureMapping, mode: AppMode) => void
  onLog: LogFn
}

export function useGesturePipeline({ config, configRef, onFired, onLog }: PipelineOptions) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const recognizerRef = useRef<GestureRecognizer | null>(null)
  const streamRef = useRef<MediaStream | null>(null)

  const [hud, setHud] = useState<Hud>({
    stable: null,
    state: 'idle',
    holdProgress: 0,
    confidence: 0,
    fps: 0,
  })
  const [flashToken, setFlashToken] = useState(0)
  const [cameraError, setCameraError] = useState<string | null>(null)
  const [recognizerStatus, setRecognizerStatus] = useState<RecognizerStatus>('loading')
  const [cameraNonce, setCameraNonce] = useState(0)

  const onFiredRef = useRef(onFired)
  const onLogRef = useRef(onLog)
  useEffect(() => {
    onFiredRef.current = onFired
    onLogRef.current = onLog
  })

  const engineRef = useRef<GestureEngine | null>(null)
  if (!engineRef.current) {
    engineRef.current = new GestureEngine(() => ({
      settings: configRef.current?.engine ?? DEFAULT_ENGINE_SETTINGS,
      mappings: (configRef.current?.mappings ?? []).filter((m) => isValidHotkey(m.hotkey)),
    }))
  }

  // Load the hand-tracking model once.
  useEffect(() => {
    let cancelled = false
    createGestureRecognizer()
      .then((recognizer) => {
        if (cancelled) {
          recognizer.close()
          return
        }
        recognizerRef.current = recognizer
        setRecognizerStatus('ready')
      })
      .catch((err: unknown) => {
        if (cancelled) return
        setRecognizerStatus('error')
        const message = err instanceof Error ? err.message : String(err)
        onLogRef.current('error', `Hand-tracking model failed to load: ${message}`)
      })
    return () => {
      cancelled = true
      recognizerRef.current?.close()
      recognizerRef.current = null
    }
  }, [])

  // Start (and restart) the camera when the configured device changes.
  const configLoaded = !!config
  const deviceId = config?.camera.deviceId ?? ''
  useEffect(() => {
    if (!configLoaded) return
    let cancelled = false

    const stop = () => {
      streamRef.current?.getTracks().forEach((t) => t.stop())
      streamRef.current = null
    }

    const start = async () => {
      stop()
      setCameraError(null)
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: deviceId
            ? { deviceId: { exact: deviceId }, width: { ideal: 1280 }, height: { ideal: 720 } }
            : { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: 'user' },
        })
        const video = videoRef.current
        if (cancelled || !video) {
          stream.getTracks().forEach((t) => t.stop())
          return
        }
        streamRef.current = stream
        video.srcObject = stream
        await video.play()
      } catch (err: unknown) {
        if (cancelled) return
        const name = err instanceof DOMException ? err.name : ''
        setCameraError(
          name === 'NotAllowedError'
            ? 'Camera access was denied. Grant camera permission and retry.'
            : name === 'NotFoundError' || name === 'OverconstrainedError'
              ? 'No camera found (or the selected camera is unavailable).'
              : `Could not start the camera: ${err instanceof Error ? err.message : String(err)}`,
        )
      }
    }

    void start()
    return () => {
      cancelled = true
      stop()
    }
  }, [configLoaded, deviceId, cameraNonce])

  // Per-frame recognition loop.
  useEffect(() => {
    let raf = 0
    let lastVideoTime = -1
    let lastHudPush = 0
    let lastFrameAt = 0
    let fpsEma = 0

    const loop = () => {
      raf = requestAnimationFrame(loop)
      const video = videoRef.current
      const canvas = canvasRef.current
      const recognizer = recognizerRef.current
      const cfg = configRef.current
      const engine = engineRef.current
      if (!video || !canvas || !recognizer || !cfg || !engine) return
      if (video.readyState < 2 || video.videoWidth === 0) return
      if (video.currentTime === lastVideoTime) return
      lastVideoTime = video.currentTime

      const t = performance.now()
      if (lastFrameAt > 0) {
        const instant = 1000 / (t - lastFrameAt)
        fpsEma = fpsEma === 0 ? instant : fpsEma * 0.9 + instant * 0.1
      }
      lastFrameAt = t

      let result
      try {
        result = recognizer.recognizeForVideo(video, t)
      } catch {
        return
      }

      const landmarks = result.landmarks?.[0] ?? null
      const top = result.gestures?.[0]?.[0]
      let gesture: GestureName | null = null
      let confidence = 0
      if (top && top.categoryName && top.categoryName !== 'None') {
        gesture = top.categoryName as GestureName
        confidence = top.score
      } else if (landmarks) {
        const pinch = detectPinch(landmarks)
        if (pinch.pinch) {
          gesture = 'Pinch'
          confidence = pinch.confidence
        }
      }

      const frame = engine.frame({ gesture, confidence, t })
      drawOverlay(canvas, video, landmarks, cfg.camera.mirror, frame, cfg.mode !== 'paused')

      if (frame.fired && cfg.mode !== 'paused') {
        setFlashToken((n) => n + 1)
        onFiredRef.current(frame.fired, cfg.mode)
      }

      if (t - lastHudPush > 100) {
        lastHudPush = t
        setHud({
          stable: frame.stable,
          state: frame.state,
          holdProgress: frame.holdProgress,
          confidence,
          fps: Math.round(fpsEma),
        })
      }
    }

    raf = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf)
  }, [configRef])

  return {
    videoRef,
    canvasRef,
    hud,
    flashToken,
    cameraError,
    recognizerStatus,
    restartCamera: () => setCameraNonce((n) => n + 1),
  }
}
