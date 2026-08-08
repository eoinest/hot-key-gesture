import { useEffect, useRef, useState } from 'react'
import type { GestureRecognizer } from '@mediapipe/tasks-vision'
import { GestureEngine } from '../../../shared/gestureEngine'
import type { EngineState, HandSample } from '../../../shared/gestureEngine'
import { isValidHotkey } from '../../../shared/hotkeys'
import { DEFAULT_ENGINE_SETTINGS } from '../../../shared/types'
import type { AppConfig, AppMode, GestureMapping, GestureName } from '../../../shared/types'
import { createGestureRecognizer } from './recognizer'
import { detectPinch, handSpan, pinchPoint, pinkyRaised } from './pinch'
import { drawOverlay } from './drawing'

export interface Hud {
  stable: GestureName | null
  state: EngineState
  holdProgress: number
  confidence: number
  fps: number
  /** Safety guard satisfied (or disabled). */
  armed: boolean
  /** How many hands the recognizer currently sees. */
  handCount: number
  /** Holding a gesture through a momentary detection dropout. */
  bridging: boolean
}

export type RecognizerStatus = 'loading' | 'ready' | 'error'

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v
}

export interface LogFn {
  (kind: 'live' | 'test' | 'error' | 'info', message: string): void
}

interface PipelineOptions {
  config: AppConfig | null
  configRef: React.RefObject<AppConfig | null>
  onFired: (mapping: GestureMapping, mode: AppMode) => void
  onClick: (mode: AppMode) => void
  onLog: LogFn
}

export function useGesturePipeline({
  config,
  configRef,
  onFired,
  onClick,
  onLog,
}: PipelineOptions) {
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
    armed: false,
    handCount: 0,
    bridging: false,
  })
  const [flashToken, setFlashToken] = useState(0)
  const [cameraError, setCameraError] = useState<string | null>(null)
  const [recognizerStatus, setRecognizerStatus] = useState<RecognizerStatus>('loading')
  const [cameraNonce, setCameraNonce] = useState(0)

  const onFiredRef = useRef(onFired)
  const onClickRef = useRef(onClick)
  const onLogRef = useRef(onLog)
  useEffect(() => {
    onFiredRef.current = onFired
    onClickRef.current = onClick
    onLogRef.current = onLog
  })

  const smoothedPointer = useRef<{ x: number; y: number } | null>(null)
  const wasTracking = useRef(false)
  const wasPinching = useRef<boolean[]>([])
  const wasPinkyUp = useRef<boolean[]>([])
  const lastCursorError = useRef<string | null>(null)

  const engineRef = useRef<GestureEngine | null>(null)
  if (!engineRef.current) {
    engineRef.current = new GestureEngine(() => ({
      settings: configRef.current?.engine ?? DEFAULT_ENGINE_SETTINGS,
      mouse: configRef.current?.mouse,
      mappings: (configRef.current?.mappings ?? []).filter(
        (m) => m.action === 'mouse' || isValidHotkey(m.hotkey),
      ),
    }))
  }

  // Load the hand-tracking model, and rebuild it if the hand limit changes —
  // numHands is fixed at construction time.
  const maxHands = config?.engine.maxHands ?? 2
  useEffect(() => {
    let cancelled = false
    setRecognizerStatus('loading')
    createGestureRecognizer(maxHands)
      .then((recognizer) => {
        if (cancelled) {
          recognizer.close()
          return
        }
        recognizerRef.current?.close()
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
    }
  }, [maxHands])

  useEffect(
    () => () => {
      recognizerRef.current?.close()
      recognizerRef.current = null
    },
    [],
  )

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

      // Classify every detected hand; fall back to landmark-derived pinch
      // when the built-in classifier reports nothing for that hand.
      // Keep only the two hands nearest the camera. The recognizer is asked for
      // more than we need so that a passer-by's hand can't occupy a slot and
      // stop the user's own second hand from being tracked.
      const detected = (result.landmarks ?? []).map((landmarks, i) => ({ landmarks, i }))
      const kept =
        detected.length <= 2
          ? detected
          : [...detected].sort((a, b) => handSpan(b.landmarks) - handSpan(a.landmarks)).slice(0, 2)

      const allLandmarks = kept.map((h) => h.landmarks)
      const hands: HandSample[] = kept.map(({ landmarks, i: sourceIndex }, i) => {
        const top = result.gestures?.[sourceIndex]?.[0]
        const named = top?.categoryName && top.categoryName !== 'None' ? top : null

        // Pinch wins over the classifier. MediaPipe has no pinch class and
        // confidently reports pinched fingers as a fist, so deferring to it
        // would hide a pinch that the landmarks state outright. detectPinch
        // requires the free fingers to be extended, so a real fist won't match.
        const handedness = result.handedness?.[sourceIndex]?.[0]?.categoryName
        const pinkyUp = pinkyRaised(landmarks, wasPinkyUp.current[i] ?? false)
        wasPinkyUp.current[i] = pinkyUp

        // Only look for a pinch when the classifier has nothing confident to
        // say. A fist and a pinch are nearly indistinguishable geometrically
        // (measured on real hands), but MediaPipe recognizes a fist reliably —
        // so deferring to a confident classification is what keeps the arming
        // hand from being read as a pinch.
        if (!named || named.score < cfg.engine.minConfidence) {
          const pinch = detectPinch(landmarks, wasPinching.current[i] ?? false)
          wasPinching.current[i] = pinch.pinch
          if (pinch.pinch) {
            return { gesture: 'Pinch' as GestureName, confidence: pinch.confidence, handedness, pinkyUp }
          }
        } else {
          wasPinching.current[i] = false
        }

        return named
          ? { gesture: named.categoryName as GestureName, confidence: named.score, handedness, pinkyUp }
          : { gesture: null, confidence: 0, handedness, pinkyUp }
      })
      wasPinching.current.length = allLandmarks.length
      wasPinkyUp.current.length = allLandmarks.length

      const frame = engine.frame({ hands, t })

      // --- Pointer control: steer the cursor from the acting hand's pinch.
      //
      // While tracking continues but the hand is momentarily missing, freeze
      // the cursor where it was rather than releasing it. Only a real end of
      // tracking tears the session down.
      let pointer: { x: number; y: number } | null = frame.tracking
        ? smoothedPointer.current
        : null
      if (frame.tracking && frame.actionHandIndex >= 0) {
        const raw = pinchPoint(allLandmarks[frame.actionHandIndex])
        if (raw) {
          // Match what the user sees: with a mirrored preview, moving the hand
          // right must move the cursor right.
          const seenX = cfg.camera.mirror ? 1 - raw.x : raw.x
          const { margin, smoothing } = cfg.mouse
          const span = Math.max(0.05, 1 - margin * 2)
          const nx = clamp01((seenX - margin) / span)
          const ny = clamp01((raw.y - margin) / span)
          const prev = smoothedPointer.current
          const a = 1 - Math.min(0.95, Math.max(0, smoothing))
          pointer = prev
            ? { x: prev.x + (nx - prev.x) * a, y: prev.y + (ny - prev.y) * a }
            : { x: nx, y: ny }
          smoothedPointer.current = pointer
          if (cfg.mode === 'live') {
            // Surface a failing cursor helper instead of the pointer silently
            // going dead. Reported once per outage, not once per frame.
            void window.api.moveCursor(pointer.x, pointer.y).then((error) => {
              if (error && error !== lastCursorError.current) {
                lastCursorError.current = error
                onLogRef.current('error', `Cursor control failed: ${error}`)
              } else if (!error) {
                lastCursorError.current = null
              }
            })
          }
        }
      } else if (!frame.tracking && wasTracking.current) {
        smoothedPointer.current = null
        void window.api.stopCursor()
      }
      wasTracking.current = !!frame.tracking

      drawOverlay(
        canvas,
        video,
        allLandmarks,
        cfg.camera.mirror,
        frame,
        cfg.mode !== 'paused',
        pointer,
      )

      if (frame.fired && cfg.mode !== 'paused') {
        setFlashToken((n) => n + 1)
        onFiredRef.current(frame.fired, cfg.mode)
      }

      if (frame.click && cfg.mode !== 'paused') {
        setFlashToken((n) => n + 1)
        onClickRef.current(cfg.mode)
      }

      if (t - lastHudPush > 100) {
        lastHudPush = t
        setHud({
          stable: frame.stable,
          state: frame.state,
          holdProgress: frame.holdProgress,
          confidence: hands[frame.actionHandIndex]?.confidence ?? 0,
          fps: Math.round(fpsEma),
          armed: frame.armed,
          handCount: hands.length,
          bridging: frame.bridging,
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
