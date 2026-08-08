import { contextBridge, ipcRenderer } from 'electron'
import type { Api } from '../shared/api'

const api: Api = {
  platform: process.platform,
  getConfig: () => ipcRenderer.invoke('config:get'),
  saveConfig: (config) => ipcRenderer.invoke('config:save', config),
  setMode: (mode) => ipcRenderer.invoke('mode:set', mode),
  sendHotkey: (payload) => ipcRenderer.invoke('hotkey:send', payload),
  checkAccessibility: (prompt) => ipcRenderer.invoke('accessibility:check', prompt),
  moveCursor: (nx, ny) => ipcRenderer.invoke('mouse:move', nx, ny),
  stopCursor: () => ipcRenderer.invoke('mouse:stop'),
  pointerAvailable: () => ipcRenderer.invoke('mouse:available'),
  listDisplays: () => ipcRenderer.invoke('displays:list'),
}

contextBridge.exposeInMainWorld('api', api)
