import { FilesetResolver, GestureRecognizer } from '@mediapipe/tasks-vision'

/**
 * Create the MediaPipe gesture recognizer. Assets (wasm + model) are served
 * from the renderer's public dir — populated by `npm run setup-assets`.
 * Tries the GPU delegate first and falls back to CPU.
 */
export async function createGestureRecognizer(numHands = 2): Promise<GestureRecognizer> {
  const fileset = await FilesetResolver.forVisionTasks('mediapipe/wasm')
  const options = (delegate: 'GPU' | 'CPU') => ({
    baseOptions: {
      modelAssetPath: 'models/gesture_recognizer.task',
      delegate,
    },
    runningMode: 'VIDEO' as const,
    // Looking for more hands than are present makes MediaPipe re-run palm
    // detection every frame, which costs real frame rate — so this is a
    // setting rather than a fixed 4. The caller keeps the two nearest hands.
    numHands,
  })
  try {
    return await GestureRecognizer.createFromOptions(fileset, options('GPU'))
  } catch {
    return await GestureRecognizer.createFromOptions(fileset, options('CPU'))
  }
}
