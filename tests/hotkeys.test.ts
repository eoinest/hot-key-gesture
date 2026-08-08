import { describe, expect, it } from 'vitest'
import {
  formatHotkey,
  hotkeysEqual,
  isValidHotkey,
  normalizeEventCode,
  normalizeEventKey,
  sortModifiers,
} from '../src/shared/hotkeys'

describe('normalizeEventCode', () => {
  it('maps letter and digit codes', () => {
    expect(normalizeEventCode('KeyA')).toBe('a')
    expect(normalizeEventCode('Digit4')).toBe('4')
  })

  it('maps function and special keys', () => {
    expect(normalizeEventCode('F5')).toBe('f5')
    expect(normalizeEventCode('Space')).toBe('space')
    expect(normalizeEventCode('ArrowLeft')).toBe('left')
    expect(normalizeEventCode('BracketRight')).toBe(']')
  })

  it('returns null for modifiers and unknown codes', () => {
    expect(normalizeEventCode('ShiftLeft')).toBeNull()
    expect(normalizeEventCode('MetaRight')).toBeNull()
  })
})

describe('normalizeEventKey', () => {
  it('rejects bare modifiers', () => {
    expect(normalizeEventKey('Shift')).toBeNull()
    expect(normalizeEventKey('Meta')).toBeNull()
  })

  it('maps aliases', () => {
    expect(normalizeEventKey(' ')).toBe('space')
    expect(normalizeEventKey('ArrowUp')).toBe('up')
    expect(normalizeEventKey('Escape')).toBe('escape')
  })

  it('passes through single characters', () => {
    expect(normalizeEventKey('A')).toBe('a')
    expect(normalizeEventKey('/')).toBe('/')
  })
})

describe('formatHotkey', () => {
  it('uses mac glyphs on darwin in canonical order', () => {
    expect(formatHotkey({ key: 't', modifiers: ['shift', 'cmd'] }, 'darwin')).toBe('⇧⌘T')
    expect(formatHotkey({ key: 'space', modifiers: [] }, 'darwin')).toBe('Space')
  })

  it('uses plus-separated names elsewhere', () => {
    expect(formatHotkey({ key: 't', modifiers: ['ctrl', 'shift'] }, 'linux')).toBe(
      'Ctrl+Shift+T',
    )
  })
})

describe('sortModifiers / hotkeysEqual', () => {
  it('sorts and dedupes modifiers', () => {
    expect(sortModifiers(['cmd', 'ctrl', 'cmd', 'shift'])).toEqual(['ctrl', 'shift', 'cmd'])
  })

  it('compares hotkeys order-insensitively', () => {
    expect(
      hotkeysEqual(
        { key: 'T', modifiers: ['cmd', 'shift'] },
        { key: 't', modifiers: ['shift', 'cmd'] },
      ),
    ).toBe(true)
  })
})

describe('isValidHotkey', () => {
  it('accepts special keys and single characters', () => {
    expect(isValidHotkey({ key: 'f5', modifiers: [] })).toBe(true)
    expect(isValidHotkey({ key: 'a', modifiers: ['cmd'] })).toBe(true)
  })

  it('rejects empty or unknown multi-char keys', () => {
    expect(isValidHotkey({ key: '', modifiers: ['cmd'] })).toBe(false)
    expect(isValidHotkey({ key: 'notakey', modifiers: [] })).toBe(false)
    expect(isValidHotkey(null)).toBe(false)
  })
})
