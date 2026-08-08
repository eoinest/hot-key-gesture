#!/usr/bin/env node
/**
 * Compiles the Swift cursor helper used for pointer-control gestures.
 * macOS only, and only when Xcode command line tools are present — the app
 * degrades with an actionable message when the binary is missing.
 */
import { execFile } from 'node:child_process'
import { mkdir, stat } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'

const run = promisify(execFile)
const root = dirname(dirname(fileURLToPath(import.meta.url)))
const SRC = join(root, 'native/mouse-helper.swift')
const OUT = join(root, 'native/build/mouse-helper')

if (process.platform !== 'darwin') {
  console.log('build-helper: not macOS, skipping cursor helper')
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

try {
  await run('which', ['swiftc'])
} catch {
  console.warn(
    'build-helper: swiftc not found — pointer-control gestures will be disabled.\n' +
      '             Install Xcode command line tools (xcode-select --install) and re-run `npm run build-helper`.',
  )
  process.exit(0)
}

if (!(await exists(SRC))) {
  console.warn('build-helper: source missing, skipping')
  process.exit(0)
}

await mkdir(dirname(OUT), { recursive: true })
try {
  await run('swiftc', ['-O', '-o', OUT, SRC])
  console.log('build-helper: cursor helper compiled')
} catch (err) {
  console.warn(`build-helper: compile failed, pointer control disabled — ${err.stderr || err.message}`)
}
