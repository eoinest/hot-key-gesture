import { describe, expect, it } from 'vitest'
import { buildAppleScript } from '../src/main/keysender/darwin'
import { buildSendKeysSequence, buildXdotoolArgs } from '../src/main/keysender'

describe('buildAppleScript', () => {
  it('uses keystroke for character keys', () => {
    expect(buildAppleScript({ key: 't', modifiers: ['cmd'] })).toBe(
      'tell application "System Events" to keystroke "t" using {command down}',
    )
  })

  it('uses key code for special keys', () => {
    expect(buildAppleScript({ key: 'escape', modifiers: [] })).toBe(
      'tell application "System Events" to key code 53',
    )
    expect(buildAppleScript({ key: 'tab', modifiers: ['cmd'] })).toBe(
      'tell application "System Events" to key code 48 using {command down}',
    )
  })

  it('joins multiple modifiers', () => {
    expect(buildAppleScript({ key: '4', modifiers: ['cmd', 'shift'] })).toBe(
      'tell application "System Events" to keystroke "4" using {command down, shift down}',
    )
  })

  it('escapes quotes and backslashes', () => {
    expect(buildAppleScript({ key: '"', modifiers: [] })).toContain('keystroke "\\""')
    expect(buildAppleScript({ key: '\\', modifiers: [] })).toContain('keystroke "\\\\"')
  })
})

describe('buildXdotoolArgs', () => {
  it('builds combos with mapped modifiers and keys', () => {
    expect(buildXdotoolArgs({ key: 't', modifiers: ['cmd', 'shift'] })).toEqual([
      'key',
      '--clearmodifiers',
      'super+shift+t',
    ])
    expect(buildXdotoolArgs({ key: 'pageup', modifiers: ['ctrl'] })).toEqual([
      'key',
      '--clearmodifiers',
      'ctrl+Page_Up',
    ])
  })
})

describe('buildSendKeysSequence', () => {
  it('maps modifiers to sendkeys prefixes', () => {
    expect(buildSendKeysSequence({ key: 't', modifiers: ['ctrl', 'shift'] })).toBe('^+t')
  })

  it('wraps special keys in braces and escapes reserved characters', () => {
    expect(buildSendKeysSequence({ key: 'enter', modifiers: [] })).toBe('{ENTER}')
    expect(buildSendKeysSequence({ key: '+', modifiers: ['ctrl'] })).toBe('^{+}')
  })
})
