import type { AppConfig, AppMode, TriggerPayload, TriggerResult } from './types'

/** IPC surface exposed to the renderer via the preload script. */
export interface Api {
  platform: string
  getConfig: () => Promise<AppConfig>
  saveConfig: (config: AppConfig) => Promise<void>
  setMode: (mode: AppMode) => Promise<void>
  sendHotkey: (payload: TriggerPayload) => Promise<TriggerResult>
  checkAccessibility: (prompt: boolean) => Promise<boolean>
}
