import { FilesetResolver, GestureRecognizer } from '@mediapipe/tasks-vision'

/**
 * Create the MediaPipe gesture recognizer. Assets (wasm + model) are served
 * from the renderer's public dir — populated by `npm run setup-assets`.
 * Tries the GPU delegate first and falls back to CPU.
 */
export async function createGestureRecognizer(): Promise<GestureRecognizer> {
  const fileset = await FilesetResolver.forVisionTasks('mediapipe/wasm')
  const options = (delegate: 'GPU' | 'CPU') => ({
    baseOptions: {
      modelAssetPath: 'models/gesture_recognizer.task',
      delegate,
    },
    runningMode: 'VIDEO' as const,
    // Two hands: one can arm the safety guard while the other acts.
    numHands: 2,
  })
  try {
    return await GestureRecognizer.createFromOptions(fileset, options('GPU'))
  } catch {
    return await GestureRecognizer.createFromOptions(fileset, options('CPU'))
  }
}
