import { execFile } from 'node:child_process'
import type { Hotkey, Modifier, TriggerResult } from '../../shared/types'
import { buildAppleScript } from './darwin'

function run(cmd: string, args: string[]): Promise<TriggerResult> {
  return new Promise((resolve) => {
    execFile(cmd, args, { timeout: 5000 }, (error, _stdout, stderr) => {
      if (error) {
        resolve({ ok: false, error: (stderr || error.message).trim() })
      } else {
        resolve({ ok: true })
      }
    })
  })
}

const XDOTOOL_MODS: Record<Modifier, string> = {
  cmd: 'super',
  ctrl: 'ctrl',
  alt: 'alt',
  shift: 'shift',
}

const XDOTOOL_KEYS: Record<string, string> = {
  enter: 'Return',
  escape: 'Escape',
  tab: 'Tab',
  space: 'space',
  backspace: 'BackSpace',
  delete: 'Delete',
  up: 'Up',
  down: 'Down',
  left: 'Left',
  right: 'Right',
  home: 'Home',
  end: 'End',
  pageup: 'Page_Up',
  pagedown: 'Page_Down',
}

export function buildXdotoolArgs(hotkey: Hotkey): string[] {
  const key = hotkey.key.toLowerCase()
  const mapped = XDOTOOL_KEYS[key] ?? (key.startsWith('f') && key.length <= 3 ? key.toUpperCase() : key)
  const combo = [...hotkey.modifiers.map((m) => XDOTOOL_MODS[m]), mapped].join('+')
  return ['key', '--clearmodifiers', combo]
}

const SENDKEYS_MODS: Record<Modifier, string> = {
  ctrl: '^',
  alt: '%',
  shift: '+',
  cmd: '', // SendKeys cannot synthesize the Windows key.
}

const SENDKEYS_SPECIAL: Record<string, string> = {
  enter: '{ENTER}',
  escape: '{ESC}',
  tab: '{TAB}',
  space: ' ',
  backspace: '{BACKSPACE}',
  delete: '{DELETE}',
  up: '{UP}',
  down: '{DOWN}',
  left: '{LEFT}',
  right: '{RIGHT}',
  home: '{HOME}',
  end: '{END}',
  pageup: '{PGUP}',
  pagedown: '{PGDN}',
}

export function buildSendKeysSequence(hotkey: Hotkey): string {
  const key = hotkey.key.toLowerCase()
  const mapped =
    SENDKEYS_SPECIAL[key] ??
    (key.startsWith('f') && key.length <= 3 ? `{${key.toUpperCase()}}` : key.replace(/([+^%~(){}[\]])/g, '{$1}'))
  const mods = hotkey.modifiers.map((m) => SENDKEYS_MODS[m]).join('')
  return `${mods}${mapped}`
}

/**
 * Synthesize a hotkey press at the OS level.
 *
 * macOS: AppleScript via System Events (requires Accessibility permission).
 * Linux: xdotool (X11).
 * Windows: PowerShell SendKeys (no Win-key support).
 */
export async function sendHotkey(hotkey: Hotkey): Promise<TriggerResult> {
  switch (process.platform) {
    case 'darwin':
      return run('osascript', ['-e', buildAppleScript(hotkey)])
    case 'linux':
      return run('xdotool', buildXdotoolArgs(hotkey))
    case 'win32': {
      if (hotkey.modifiers.includes('cmd')) {
        return { ok: false, error: 'The Windows key is not supported on this platform yet.' }
      }
      const script = `Add-Type -AssemblyName System.Windows.Forms; [System.Windows.Forms.SendKeys]::SendWait('${buildSendKeysSequence(hotkey).replace(/'/g, "''")}')`
      return run('powershell', ['-NoProfile', '-Command', script])
    }
    default:
      return { ok: false, error: `Unsupported platform: ${process.platform}` }
  }
}
