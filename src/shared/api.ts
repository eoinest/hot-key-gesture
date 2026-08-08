import type { AppConfig, AppMode, TriggerPayload, TriggerResult } from './types'

export interface DisplayInfo {
  id: number
  label: string
  primary: boolean
}

/** IPC surface exposed to the renderer via the preload script. */
export interface Api {
  platform: string
  getConfig: () => Promise<AppConfig>
  saveConfig: (config: AppConfig) => Promise<void>
  setMode: (mode: AppMode) => Promise<void>
  sendHotkey: (payload: TriggerPayload) => Promise<TriggerResult>
  checkAccessibility: (prompt: boolean) => Promise<boolean>
  /** Returns null on success, or an error string. */
  moveCursor: (nx: number, ny: number) => Promise<string | null>
  clickCursor: () => Promise<string | null>
  stopCursor: () => Promise<void>
  pointerAvailable: () => Promise<boolean>
  listDisplays: () => Promise<DisplayInfo[]>
}
