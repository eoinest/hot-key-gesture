#!/usr/bin/env node
/**
 * Downloads the MediaPipe gesture recognizer model and copies the wasm
 * runtime into the renderer's public dir. Both are gitignored; this runs
 * automatically on `npm install` (postinstall) and can be re-run with
 * `npm run setup-assets [--force]`.
 */
import { cp, mkdir, stat, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = dirname(dirname(fileURLToPath(import.meta.url)))
const force = process.argv.includes('--force')

const MODEL_URL =
  'https://storage.googleapis.com/mediapipe-models/gesture_recognizer/gesture_recognizer/float16/latest/gesture_recognizer.task'
const MODEL_DEST = join(root, 'src/renderer/public/models/gesture_recognizer.task')
const WASM_SRC = join(root, 'node_modules/@mediapipe/tasks-vision/wasm')
const WASM_DEST = join(root, 'src/renderer/public/mediapipe/wasm')

async function exists(path) {
  try {
    await stat(path)
    return true
  } catch {
    return false
  }
}

async function downloadModel() {
  if (!force && (await exists(MODEL_DEST))) {
    console.log('setup-assets: model already present, skipping download')
    return
  }
  console.log(`setup-assets: downloading gesture model…`)
  const res = await fetch(MODEL_URL)
  if (!res.ok) throw new Error(`Model download failed: HTTP ${res.status}`)
  const bytes = Buffer.from(await res.arrayBuffer())
  await mkdir(dirname(MODEL_DEST), { recursive: true })
  await writeFile(MODEL_DEST, bytes)
  console.log(`setup-assets: model saved (${(bytes.length / 1024 / 1024).toFixed(1)} MB)`)
}

async function copyWasm() {
  if (!(await exists(WASM_SRC))) {
    console.warn('setup-assets: @mediapipe/tasks-vision not installed yet, skipping wasm copy')
    return
  }
  await mkdir(WASM_DEST, { recursive: true })
  await cp(WASM_SRC, WASM_DEST, { recursive: true })
  console.log('setup-assets: wasm runtime copied')
}

try {
  await copyWasm()
  await downloadModel()
} catch (err) {
  console.error(`setup-assets: ${err.message}`)
  if (await exists(MODEL_DEST)) {
    console.warn('setup-assets: continuing with previously downloaded model')
  } else {
    process.exit(1)
  }
}
