import {
  app,
  BrowserWindow,
  ipcMain,
  net,
  protocol,
  session,
  systemPreferences,
} from 'electron'
import { join, normalize, sep } from 'node:path'
import { pathToFileURL } from 'node:url'
import { writeFile } from 'node:fs/promises'
import { loadConfig, saveConfig } from './config'
import { sendHotkey } from './keysender'
import {
  clickCursor,
  listDisplays,
  moveCursorNormalized,
  pointerAvailable,
  stopPointer,
} from './mouse'
import type { DisplayInfo } from './mouse'
import { CONFIG_VERSION } from '../shared/types'
import type { AppConfig, AppMode, TriggerPayload, TriggerResult } from '../shared/types'
import { isValidHotkey } from '../shared/hotkeys'

const isDev = !!process.env.ELECTRON_RENDERER_URL
const isSmokeTest = process.argv.includes('--smoke')

let config: AppConfig = { ...loadConfig() }
let mainWindow: BrowserWindow | null = null

// Minimum spacing between synthesized keystrokes, independent of engine cooldowns.
const GLOBAL_RATE_LIMIT_MS = 150
let lastSentAt = 0

// Clicks are far more disruptive than a cursor move if something misfires.
const CLICK_RATE_LIMIT_MS = 350
let lastClickAt = 0

// Belt and braces alongside webPreferences.backgroundThrottling: these cover
// the renderer being backgrounded and the window being fully occluded, which
// the per-window flag alone does not always prevent.
app.commandLine.appendSwitch('disable-background-timer-throttling')
app.commandLine.appendSwitch('disable-renderer-backgrounding')
app.commandLine.appendSwitch('disable-backgrounding-occluded-windows')

protocol.registerSchemesAsPrivileged([
  {
    scheme: 'app',
    privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true },
  },
])

function registerAppProtocol(): void {
  const rendererRoot = join(import.meta.dirname, '../renderer')
  protocol.handle('app', (request) => {
    const { pathname } = new URL(request.url)
    const target = normalize(join(rendererRoot, pathname === '/' ? '/index.html' : pathname))
    if (target !== rendererRoot && !target.startsWith(rendererRoot + sep)) {
      return new Response('Not found', { status: 404 })
    }
    return net.fetch(pathToFileURL(target).toString())
  })
}

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1240,
    height: 820,
    minWidth: 1000,
    minHeight: 660,
    title: 'HotKey Gesture',
    backgroundColor: '#0d1017',
    show: false,
    webPreferences: {
      preload: join(import.meta.dirname, '../preload/index.mjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      // The whole point of this app is to keep tracking while you work in
      // another window. Chromium would otherwise throttle the render loop once
      // ours is occluded, which stops gesture detection dead.
      backgroundThrottling: false,
    },
  })

  mainWindow.once('ready-to-show', () => mainWindow?.show())
  mainWindow.on('closed', () => {
    mainWindow = null
  })

  if (isDev) {
    mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL!)
  } else {
    mainWindow.loadURL('app://bundle/index.html')
  }

  if (isSmokeTest) {
    mainWindow.webContents.once('did-finish-load', async () => {
      await new Promise((r) => setTimeout(r, 4000))
      try {
        const image = await mainWindow!.webContents.capturePage()
        await writeFile(join(app.getPath('temp'), 'hot-key-gesture-smoke.png'), image.toPNG())
        console.log(`smoke: screenshot written to ${join(app.getPath('temp'), 'hot-key-gesture-smoke.png')}`)
      } catch (err) {
        console.error('smoke: capture failed', err)
        process.exitCode = 1
      }
      app.quit()
    })
  }
}

function registerIpc(): void {
  ipcMain.handle('config:get', (): AppConfig => config)

  ipcMain.handle('config:save', (_event, next: AppConfig) => {
    if (!next || next.version !== CONFIG_VERSION || !Array.isArray(next.mappings)) {
      throw new Error('Invalid config payload')
    }
    config = next
    saveConfig(config)
  })

  ipcMain.handle('mode:set', (_event, mode: AppMode) => {
    if (!['paused', 'test', 'live'].includes(mode)) throw new Error(`Invalid mode: ${mode}`)
    // Never leave the cursor helper running once we are out of live mode.
    if (mode !== 'live') stopPointer()
    config = { ...config, mode }
    saveConfig(config)
  })

  ipcMain.handle(
    'hotkey:send',
    async (_event, payload: TriggerPayload): Promise<TriggerResult> => {
      if (config.mode !== 'live') {
        return { ok: false, error: 'Not in live mode' }
      }
      if (!isValidHotkey(payload?.hotkey)) {
        return { ok: false, error: 'Invalid hotkey' }
      }
      const now = Date.now()
      if (now - lastSentAt < GLOBAL_RATE_LIMIT_MS) {
        return { ok: false, error: 'Rate limited' }
      }
      lastSentAt = now
      return sendHotkey(payload.hotkey)
    },
  )

  ipcMain.handle('mouse:move', (_event, nx: number, ny: number): string | null => {
    if (config.mode !== 'live') return 'Not in live mode'
    if (!Number.isFinite(nx) || !Number.isFinite(ny)) return 'Invalid coordinates'
    return moveCursorNormalized(nx, ny, config.mouse)
  })

  ipcMain.handle('mouse:click', (): string | null => {
    if (config.mode !== 'live') return 'Not in live mode'
    const now = Date.now()
    if (now - lastClickAt < CLICK_RATE_LIMIT_MS) return 'Rate limited'
    lastClickAt = now
    return clickCursor()
  })

  ipcMain.handle('mouse:stop', () => {
    stopPointer()
  })

  ipcMain.handle('mouse:available', (): boolean => pointerAvailable())

  ipcMain.handle('displays:list', (): DisplayInfo[] => listDisplays())

  ipcMain.handle('accessibility:check', (_event, prompt: boolean): boolean => {
    if (process.platform !== 'darwin') return true
    return systemPreferences.isTrustedAccessibilityClient(prompt)
  })
}

app.whenReady().then(async () => {
  registerAppProtocol()
  registerIpc()

  session.defaultSession.setPermissionRequestHandler((_wc, permission, callback) => {
    callback(permission === 'media')
  })

  if (!isDev) {
    session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
      callback({
        responseHeaders: {
          ...details.responseHeaders,
          'Content-Security-Policy': [
            "default-src 'self' app:; script-src 'self' 'wasm-unsafe-eval' app:; style-src 'self' 'unsafe-inline' app:; img-src 'self' data: blob: app:; media-src 'self' blob: app:; connect-src 'self' data: blob: app:; worker-src 'self' blob: app:",
          ],
        },
      })
    })
  }

  if (process.platform === 'darwin' && !isSmokeTest) {
    try {
      await systemPreferences.askForMediaAccess('camera')
    } catch {
      // The renderer surfaces camera failures in the UI.
    }
  }

  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  app.quit()
})

app.on('before-quit', () => {
  stopPointer()
})
