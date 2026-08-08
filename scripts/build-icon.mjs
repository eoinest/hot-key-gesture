#!/usr/bin/env node
/**
 * Builds build/icon.icns from scripts/make-icon.swift.
 * macOS-only and best-effort: without it electron-builder falls back to the
 * default Electron icon, which is cosmetic rather than fatal.
 */
import { execFile } from 'node:child_process'
import { mkdir, mkdtemp, rm, stat } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'

const run = promisify(execFile)
const root = dirname(dirname(fileURLToPath(import.meta.url)))
const SRC = join(root, 'scripts/make-icon.swift')
const ICNS = join(root, 'build/icon.icns')

if (process.platform !== 'darwin') {
  console.log('build-icon: not macOS, skipping')
  process.exit(0)
}

async function exists(p) {
  try {
    await stat(p)
    return true
  } catch {
    return false
  }
}

if (await exists(ICNS)) {
  console.log('build-icon: icon already present, skipping')
  process.exit(0)
}

const work = await mkdtemp(join(tmpdir(), 'hkg-icon-'))
try {
  await run('which', ['swiftc'])
  const bin = join(work, 'make-icon')
  await run('swiftc', ['-O', '-o', bin, SRC])

  const iconset = join(work, 'icon.iconset')
  await mkdir(iconset, { recursive: true })
  // The set of sizes iconutil expects.
  for (const size of [16, 32, 64, 128, 256, 512, 1024]) {
    await run(bin, [String(size), join(iconset, `icon_${size}x${size}.png`)])
    if (size <= 512) {
      await run(bin, [String(size * 2), join(iconset, `icon_${size}x${size}@2x.png`)])
    }
  }

  await mkdir(dirname(ICNS), { recursive: true })
  await run('iconutil', ['-c', 'icns', iconset, '-o', ICNS])
  console.log('build-icon: build/icon.icns created')
} catch (err) {
  console.warn(`build-icon: skipped (${(err.stderr || err.message || '').trim().split('\n')[0]})`)
} finally {
  await rm(work, { recursive: true, force: true })
}
