import { useEffect, useState } from 'react'
import {
  formatHotkey,
  isValidHotkey,
  normalizeEventCode,
  normalizeEventKey,
  sortModifiers,
} from '../../../shared/hotkeys'
import type { Hotkey, Modifier } from '../../../shared/types'

interface HotkeyRecorderProps {
  value: Hotkey
  platform: string
  onChange: (hotkey: Hotkey) => void
}

/**
 * Click, then press the desired shortcut. Plain Escape cancels recording
 * (record Escape as a hotkey by combining it with a modifier — or use the
 * default Fist mapping).
 */
export function HotkeyRecorder({ value, platform, onChange }: HotkeyRecorderProps) {
  const [recording, setRecording] = useState(false)

  useEffect(() => {
    if (!recording) return

    const onKeyDown = (e: KeyboardEvent) => {
      e.preventDefault()
      e.stopPropagation()
      const noMods = !e.metaKey && !e.ctrlKey && !e.altKey && !e.shiftKey
      if (e.code === 'Escape' && noMods) {
        setRecording(false)
        return
      }
      const key = normalizeEventCode(e.code) ?? normalizeEventKey(e.key)
      if (!key) return // A bare modifier — keep waiting.
      const modifiers: Modifier[] = []
      if (e.metaKey) modifiers.push('cmd')
      if (e.ctrlKey) modifiers.push('ctrl')
      if (e.altKey) modifiers.push('alt')
      if (e.shiftKey) modifiers.push('shift')
      onChange({ key, modifiers: sortModifiers(modifiers) })
      setRecording(false)
    }

    const cancel = () => setRecording(false)
    window.addEventListener('keydown', onKeyDown, true)
    window.addEventListener('blur', cancel)
    return () => {
      window.removeEventListener('keydown', onKeyDown, true)
      window.removeEventListener('blur', cancel)
    }
  }, [recording, onChange])

  return (
    <button
      type="button"
      className={`hotkey-btn ${recording ? 'recording' : ''} ${isValidHotkey(value) ? '' : 'empty'}`}
      title={recording ? 'Press the shortcut now (Esc to cancel)' : 'Click to record a shortcut'}
      onClick={() => setRecording((r) => !r)}
    >
      {recording ? (
        'Press shortcut…'
      ) : isValidHotkey(value) ? (
        <kbd>{formatHotkey(value, platform)}</kbd>
      ) : (
        'Set shortcut'
      )}
    </button>
  )
}
