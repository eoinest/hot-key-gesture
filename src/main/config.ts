import { app } from 'electron'
import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { defaultConfig } from '../shared/types'
import type { AppConfig } from '../shared/types'

export function configPath(): string {
  return join(app.getPath('userData'), 'config.json')
}

/**
 * Load config from disk, merging over defaults so new fields added in
 * later versions pick up sane values without wiping user settings.
 */
export function loadConfig(): AppConfig {
  const defaults = defaultConfig()
  try {
    const raw = JSON.parse(readFileSync(configPath(), 'utf-8')) as Partial<AppConfig>
    return {
      ...defaults,
      ...raw,
      camera: { ...defaults.camera, ...raw.camera },
      engine: { ...defaults.engine, ...raw.engine },
      mappings: Array.isArray(raw.mappings) ? raw.mappings : defaults.mappings,
    }
  } catch {
    return defaults
  }
}

export function saveConfig(config: AppConfig): void {
  const path = configPath()
  mkdirSync(join(path, '..'), { recursive: true })
  const tmp = `${path}.tmp`
  writeFileSync(tmp, JSON.stringify(config, null, 2), 'utf-8')
  renameSync(tmp, path)
}
