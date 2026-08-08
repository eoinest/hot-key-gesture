import type { Hotkey, Modifier } from '../../shared/types'

/** macOS virtual key codes for non-character keys (System Events `key code`). */
export const MAC_KEY_CODES: Record<string, number> = {
  enter: 36,
  tab: 48,
  space: 49,
  backspace: 51,
  escape: 53,
  delete: 117,
  home: 115,
  end: 119,
  pageup: 116,
  pagedown: 121,
  left: 123,
  right: 124,
  down: 125,
  up: 126,
  f1: 122,
  f2: 120,
  f3: 99,
  f4: 118,
  f5: 96,
  f6: 97,
  f7: 98,
  f8: 100,
  f9: 101,
  f10: 109,
  f11: 103,
  f12: 111,
}

const MOD_PHRASES: Record<Modifier, string> = {
  cmd: 'command down',
  ctrl: 'control down',
  alt: 'option down',
  shift: 'shift down',
}

function escapeAppleScriptString(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/"/g, '\\"')
}

/**
 * Build the AppleScript snippet that synthesizes the hotkey via System Events.
 * Character keys use `keystroke`; special keys use `key code`.
 */
export function buildAppleScript(hotkey: Hotkey): string {
  const mods = hotkey.modifiers.map((m) => MOD_PHRASES[m]).filter(Boolean)
  const using = mods.length ? ` using {${mods.join(', ')}}` : ''
  const key = hotkey.key.toLowerCase()
  const code = MAC_KEY_CODES[key]
  if (code !== undefined) {
    return `tell application "System Events" to key code ${code}${using}`
  }
  return `tell application "System Events" to keystroke "${escapeAppleScriptString(key)}"${using}`
}
