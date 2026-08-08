import { spawn } from 'node:child_process'
import type { ChildProcessByStdio } from 'node:child_process'
import type { Readable, Writable } from 'node:stream'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { app, screen } from 'electron'
import type { MouseSettings } from '../shared/types'

/**
 * Drives the OS cursor through a long-lived Swift helper. One process is kept
 * alive while pointer control is in use — spawning per update would cap the
 * cursor far below camera frame rate.
 */

type MouseHelper = ChildProcessByStdio<Writable, null, Readable>

let helper: MouseHelper | null = null
let spawnFailed: string | null = null

function helperPath(): string {
  // Packaged builds ship the binary under resources/; dev uses the build dir.
  const packaged = join(process.resourcesPath ?? '', 'mouse-helper')
  if (app.isPackaged && existsSync(packaged)) return packaged
  return join(app.getAppPath(), 'native/build/mouse-helper')
}

export function pointerAvailable(): boolean {
  if (process.platform !== 'darwin') return false
  return existsSync(helperPath())
}

/**
 * A failure must not be permanent. The helper can die for transient reasons —
 * a broken pipe, the OS reaping it — and pointer control silently never
 * recovering for the rest of the session is worse than retrying. Only a
 * genuinely missing binary is treated as fatal.
 */
const RESPAWN_BACKOFF_MS = 1000
let lastSpawnAttempt = 0
let helperMissing = false

function ensureHelper(): MouseHelper | null {
  if (helper && !helper.killed) return helper
  if (helperMissing) return null

  const path = helperPath()
  if (!existsSync(path)) {
    helperMissing = true
    spawnFailed = 'Cursor helper is not built. Run `npm run build-helper`.'
    return null
  }

  // Back off between attempts so a failing helper can't be respawned at frame rate.
  const now = Date.now()
  if (now - lastSpawnAttempt < RESPAWN_BACKOFF_MS) return null
  lastSpawnAttempt = now

  try {
    const proc: MouseHelper = spawn(path, { stdio: ['pipe', 'ignore', 'pipe'] })
    const forget = () => {
      if (helper === proc) helper = null
    }
    proc.on('exit', forget)
    proc.on('error', (err) => {
      spawnFailed = err.message
      forget()
    })
    proc.stdin.on('error', forget)
    helper = proc
    spawnFailed = null
    return proc
  } catch (err) {
    spawnFailed = err instanceof Error ? err.message : String(err)
    return null
  }
}

export function stopPointer(): void {
  if (!helper) return
  try {
    helper.stdin.write('quit\n')
  } catch {
    // Helper already gone.
  }
  helper.kill()
  helper = null
}

export interface DisplayInfo {
  id: number
  label: string
  primary: boolean
}

export function listDisplays(): DisplayInfo[] {
  const primaryId = screen.getPrimaryDisplay().id
  return screen.getAllDisplays().map((d, i) => ({
    id: d.id,
    label: d.label || `Display ${i + 1} (${d.size.width}×${d.size.height})`,
    primary: d.id === primaryId,
  }))
}

interface Bounds {
  x: number
  y: number
  width: number
  height: number
}

/**
 * The rectangle the camera frame maps onto. 'all' returns the union of every
 * display, which is what lets the cursor cross onto a second screen — mapping
 * to one display's bounds confines it there no matter how far you reach.
 */
function targetBounds(settings: MouseSettings): Bounds {
  const displays = screen.getAllDisplays()
  if (settings.displayId === 'all' && displays.length > 0) {
    const left = Math.min(...displays.map((d) => d.bounds.x))
    const top = Math.min(...displays.map((d) => d.bounds.y))
    const right = Math.max(...displays.map((d) => d.bounds.x + d.bounds.width))
    const bottom = Math.max(...displays.map((d) => d.bounds.y + d.bounds.height))
    return { x: left, y: top, width: right - left, height: bottom - top }
  }
  const chosen =
    typeof settings.displayId === 'number'
      ? displays.find((d) => d.id === settings.displayId)
      : null
  return (chosen ?? screen.getPrimaryDisplay()).bounds
}

/**
 * Move the cursor to a normalized position (0..1) within the configured
 * display. Returns an error string if the helper is unavailable.
 */
export function moveCursorNormalized(
  nx: number,
  ny: number,
  settings: MouseSettings,
): string | null {
  const proc = ensureHelper()
  if (!proc) return spawnFailed ?? 'Cursor helper unavailable'

  const { x, y, width, height } = targetBounds(settings)
  const px = Math.round(x + clamp01(nx) * (width - 1))
  const py = Math.round(y + clamp01(ny) * (height - 1))

  try {
    proc.stdin.write(`${px} ${py}\n`)
    return null
  } catch (err) {
    helper = null
    return err instanceof Error ? err.message : String(err)
  }
}

/** Left click at the cursor's current position. */
export function clickCursor(): string | null {
  const proc = ensureHelper()
  if (!proc) return spawnFailed ?? 'Cursor helper unavailable'
  try {
    proc.stdin.write('click\n')
    return null
  } catch (err) {
    helper = null
    return err instanceof Error ? err.message : String(err)
  }
}

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v
}
