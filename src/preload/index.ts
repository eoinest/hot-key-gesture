import { contextBridge, ipcRenderer } from 'electron'
import type { Api } from '../shared/api'

const api: Api = {
  platform: process.platform,
  getConfig: () => ipcRenderer.invoke('config:get'),
  saveConfig: (config) => ipcRenderer.invoke('config:save', config),
  setMode: (mode) => ipcRenderer.invoke('mode:set', mode),
  sendHotkey: (payload) => ipcRenderer.invoke('hotkey:send', payload),
  checkAccessibility: (prompt) => ipcRenderer.invoke('accessibility:check', prompt),
}

contextBridge.exposeInMainWorld('api', api)
