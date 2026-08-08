import type { Hotkey, Modifier } from './types'

export const MODIFIER_ORDER: Modifier[] = ['ctrl', 'alt', 'shift', 'cmd']

/** Canonical names for non-character keys. */
export const SPECIAL_KEYS = [
  'space',
  'enter',
  'escape',
  'tab',
  'backspace',
  'delete',
  'up',
  'down',
  'left',
  'right',
  'home',
  'end',
  'pageup',
  'pagedown',
  'f1',
  'f2',
  'f3',
  'f4',
  'f5',
  'f6',
  'f7',
  'f8',
  'f9',
  'f10',
  'f11',
  'f12',
] as const

const SPECIAL_KEY_SET = new Set<string>(SPECIAL_KEYS)

/** Map KeyboardEvent.key values to canonical key names. */
const EVENT_KEY_ALIASES: Record<string, string> = {
  ' ': 'space',
  spacebar: 'space',
  return: 'enter',
  esc: 'escape',
  arrowup: 'up',
  arrowdown: 'down',
  arrowleft: 'left',
  arrowright: 'right',
  pageup: 'pageup',
  pagedown: 'pagedown',
  del: 'delete',
}

/**
 * Normalize a KeyboardEvent.key into a canonical hotkey key name,
 * or null if the key can't be used as a hotkey (e.g. a bare modifier).
 */
export function normalizeEventKey(eventKey: string): string | null {
  const k = eventKey.toLowerCase()
  if (['shift', 'control', 'alt', 'meta', 'os', 'fn', 'capslock', 'dead'].includes(k)) return null
  const aliased = EVENT_KEY_ALIASES[k] ?? k
  if (SPECIAL_KEY_SET.has(aliased)) return aliased
  if (aliased.length === 1) return aliased
  return null
}

/** Map KeyboardEvent.code values to canonical key names (layout-stable). */
const EVENT_CODE_MAP: Record<string, string> = {
  Space: 'space',
  Enter: 'enter',
  Escape: 'escape',
  Tab: 'tab',
  Backspace: 'backspace',
  Delete: 'delete',
  ArrowUp: 'up',
  ArrowDown: 'down',
  ArrowLeft: 'left',
  ArrowRight: 'right',
  Home: 'home',
  End: 'end',
  PageUp: 'pageup',
  PageDown: 'pagedown',
  Minus: '-',
  Equal: '=',
  Comma: ',',
  Period: '.',
  Slash: '/',
  Backslash: '\\',
  Semicolon: ';',
  Quote: "'",
  Backquote: '`',
  BracketLeft: '[',
  BracketRight: ']',
}

/**
 * Normalize a KeyboardEvent.code into a canonical key name. Preferred over
 * `key` because it is unaffected by modifiers (e.g. Option-V on macOS yields
 * "√" for `key` but "KeyV" for `code`).
 */
export function normalizeEventCode(code: string): string | null {
  if (/^Key[A-Z]$/.test(code)) return code.slice(3).toLowerCase()
  if (/^Digit[0-9]$/.test(code)) return code.slice(5)
  if (/^F([1-9]|1[0-2])$/.test(code)) return code.toLowerCase()
  return EVENT_CODE_MAP[code] ?? null
}

export function isSpecialKey(key: string): boolean {
  return SPECIAL_KEY_SET.has(key.toLowerCase())
}

export function sortModifiers(mods: Modifier[]): Modifier[] {
  return [...new Set(mods)].sort((a, b) => MODIFIER_ORDER.indexOf(a) - MODIFIER_ORDER.indexOf(b))
}

const MAC_MODIFIER_GLYPHS: Record<Modifier, string> = {
  ctrl: '⌃',
  alt: '⌥',
  shift: '⇧',
  cmd: '⌘',
}

const GENERIC_MODIFIER_LABELS: Record<Modifier, string> = {
  ctrl: 'Ctrl',
  alt: 'Alt',
  shift: 'Shift',
  cmd: 'Win',
}

const KEY_DISPLAY: Record<string, string> = {
  space: 'Space',
  enter: '↩',
  escape: 'Esc',
  tab: '⇥',
  backspace: '⌫',
  delete: '⌦',
  up: '↑',
  down: '↓',
  left: '←',
  right: '→',
  home: 'Home',
  end: 'End',
  pageup: 'PgUp',
  pagedown: 'PgDn',
}

/** Human-readable hotkey, e.g. "⌘⇧T" on macOS or "Ctrl+Shift+T" elsewhere. */
export function formatHotkey(hotkey: Hotkey, platform: string): string {
  const mods = sortModifiers(hotkey.modifiers)
  const keyName = KEY_DISPLAY[hotkey.key.toLowerCase()] ?? hotkey.key.toUpperCase()
  if (platform === 'darwin') {
    return [...mods.map((m) => MAC_MODIFIER_GLYPHS[m]), keyName].join('')
  }
  return [...mods.map((m) => GENERIC_MODIFIER_LABELS[m]), keyName].join('+')
}

export function hotkeysEqual(a: Hotkey, b: Hotkey): boolean {
  return (
    a.key.toLowerCase() === b.key.toLowerCase() &&
    sortModifiers(a.modifiers).join(',') === sortModifiers(b.modifiers).join(',')
  )
}

/** A hotkey is valid if it has a usable key. Bare characters without modifiers are allowed. */
export function isValidHotkey(hotkey: Hotkey | null | undefined): hotkey is Hotkey {
  if (!hotkey || !hotkey.key) return false
  return isSpecialKey(hotkey.key) || hotkey.key.length === 1
}
