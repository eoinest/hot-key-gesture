import { app } from 'electron'
import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { CONFIG_VERSION, defaultConfig, defaultPinchMouseMapping } from '../shared/types'
import type { AppConfig, GestureMapping } from '../shared/types'

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
    // An older config carries tuning chosen for behaviour that has since
    // changed — one-handed timings from before the safety guard, and a single
    // target display from before spanning. Merging would silently preserve
    // values nobody picked (a null displayId still traps the cursor on one
    // screen), so an out-of-date config adopts the new defaults wholesale.
    // Mappings and camera choice are the user's and are always kept.
    const current = raw.version === CONFIG_VERSION
    const engine = current ? { ...defaults.engine, ...raw.engine } : defaults.engine
    const mouse = current ? { ...defaults.mouse, ...raw.mouse } : defaults.mouse
    return {
      ...defaults,
      ...raw,
      version: CONFIG_VERSION,
      camera: { ...defaults.camera, ...raw.camera },
      sound: { ...defaults.sound, ...raw.sound },
      mouse,
      engine,
      mappings: withPointerMapping(
        Array.isArray(raw.mappings) && raw.mappings.length ? raw.mappings : defaults.mappings,
      ),
    }
  } catch {
    return defaults
  }
}

/**
 * Give configs written before pointer control a Pinch→cursor mapping, without
 * touching anything the user set up. Skipped if Pinch is already mapped.
 */
function withPointerMapping(mappings: GestureMapping[]): GestureMapping[] {
  const hasPointer = mappings.some((m) => m.action === 'mouse')
  const hasPinch = mappings.some((m) => m.gesture === 'Pinch')
  if (hasPointer || hasPinch) return mappings
  return [...mappings, defaultPinchMouseMapping()]
}

export function saveConfig(config: AppConfig): void {
  const path = configPath()
  mkdirSync(join(path, '..'), { recursive: true })
  const tmp = `${path}.tmp`
  writeFileSync(tmp, JSON.stringify(config, null, 2), 'utf-8')
  renameSync(tmp, path)
}
