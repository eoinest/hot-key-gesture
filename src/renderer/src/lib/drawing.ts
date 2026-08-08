import type { EngineFrameResult } from '../../../shared/gestureEngine'
import type { Point3 } from './pinch'

const HAND_CONNECTIONS: ReadonlyArray<readonly [number, number]> = [
  [0, 1], [1, 2], [2, 3], [3, 4],
  [0, 5], [5, 6], [6, 7], [7, 8],
  [5, 9], [9, 10], [10, 11], [11, 12],
  [9, 13], [13, 14], [14, 15], [15, 16],
  [13, 17], [17, 18], [18, 19], [19, 20],
  [0, 17],
]

const FINGERTIPS = [4, 8, 12, 16, 20]

const ACCENT = '#8b9dff'
const ACCENT_SOFT = 'rgba(139, 157, 255, 0.55)'
const FIRED = '#4ade80'

interface Mapped {
  x: number
  y: number
}

/**
 * Map a normalized landmark to canvas pixels, accounting for the video being
 * rendered with object-fit: cover (cropped) and optional mirroring.
 */
function makeMapper(
  videoW: number,
  videoH: number,
  elemW: number,
  elemH: number,
  mirror: boolean,
): (p: Point3) => Mapped {
  const videoAspect = videoW / videoH
  const elemAspect = elemW / elemH
  let scaleW: number
  let scaleH: number
  if (videoAspect > elemAspect) {
    scaleH = elemH
    scaleW = elemH * videoAspect
  } else {
    scaleW = elemW
    scaleH = elemW / videoAspect
  }
  const offsetX = (elemW - scaleW) / 2
  const offsetY = (elemH - scaleH) / 2
  return (p) => ({
    x: offsetX + (mirror ? 1 - p.x : p.x) * scaleW,
    y: offsetY + p.y * scaleH,
  })
}

/**
 * Draw the hand skeleton plus a hold-progress arc around the hand.
 */
export function drawOverlay(
  canvas: HTMLCanvasElement,
  video: HTMLVideoElement,
  landmarks: Point3[] | null,
  mirror: boolean,
  engine: EngineFrameResult,
  showProgress: boolean,
): void {
  const dpr = window.devicePixelRatio || 1
  const elemW = canvas.clientWidth
  const elemH = canvas.clientHeight
  if (elemW === 0 || elemH === 0) return
  if (canvas.width !== Math.round(elemW * dpr) || canvas.height !== Math.round(elemH * dpr)) {
    canvas.width = Math.round(elemW * dpr)
    canvas.height = Math.round(elemH * dpr)
  }
  const ctx = canvas.getContext('2d')
  if (!ctx) return
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  ctx.clearRect(0, 0, elemW, elemH)

  if (!landmarks || landmarks.length < 21 || !video.videoWidth) return

  const map = makeMapper(video.videoWidth, video.videoHeight, elemW, elemH, mirror)
  const pts = landmarks.map(map)

  ctx.lineWidth = 3
  ctx.lineCap = 'round'
  ctx.strokeStyle = ACCENT_SOFT
  for (const [a, b] of HAND_CONNECTIONS) {
    ctx.beginPath()
    ctx.moveTo(pts[a].x, pts[a].y)
    ctx.lineTo(pts[b].x, pts[b].y)
    ctx.stroke()
  }

  ctx.fillStyle = ACCENT
  for (let i = 0; i < pts.length; i++) {
    ctx.beginPath()
    ctx.arc(pts[i].x, pts[i].y, FINGERTIPS.includes(i) ? 5 : 3, 0, Math.PI * 2)
    ctx.fill()
  }

  if (!showProgress || engine.state === 'idle') return

  // Hold-progress ring centered on the hand.
  const cx = pts.reduce((s, p) => s + p.x, 0) / pts.length
  const cy = pts.reduce((s, p) => s + p.y, 0) / pts.length
  const spread = Math.max(...pts.map((p) => Math.hypot(p.x - cx, p.y - cy)))
  const radius = spread + 18
  const fired = engine.state === 'cooldown'

  ctx.lineWidth = 5
  ctx.strokeStyle = 'rgba(255,255,255,0.15)'
  ctx.beginPath()
  ctx.arc(cx, cy, radius, 0, Math.PI * 2)
  ctx.stroke()

  ctx.strokeStyle = fired ? FIRED : ACCENT
  ctx.beginPath()
  ctx.arc(cx, cy, radius, -Math.PI / 2, -Math.PI / 2 + engine.holdProgress * Math.PI * 2)
  ctx.stroke()

  if (fired) {
    ctx.fillStyle = FIRED
    ctx.font = 'bold 16px system-ui'
    ctx.textAlign = 'center'
    ctx.fillText('✓', cx, cy - radius - 10)
  }
}
