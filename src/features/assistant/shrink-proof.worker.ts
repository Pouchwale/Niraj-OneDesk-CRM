/**
 * Makes a proof picture small enough to send, off the page's thread (24 Nov
 * 2026): resizing a phone photo on the page paused the proof screen for up to
 * three quarters of a second on a slow PC. Receives the picture, answers with
 * the JPEG, or that it could not read it.
 */

export interface ShrinkProofRequest {
  file: Blob
  maxWidth: number
  maxHeight: number
}

export type ShrinkProofResult = { blob: Blob } | { error: string }

const scope = self as unknown as {
  onmessage: ((event: MessageEvent<ShrinkProofRequest>) => void) | null
  postMessage: (message: ShrinkProofResult) => void
}

scope.onmessage = async (event) => {
  const { file, maxWidth, maxHeight } = event.data
  try {
    const bitmap = await createImageBitmap(file)
    const scale = Math.min(1, maxWidth / bitmap.width, maxHeight / bitmap.height)
    const width = Math.max(1, Math.round(bitmap.width * scale))
    const height = Math.max(1, Math.round(bitmap.height * scale))
    const canvas = new OffscreenCanvas(width, height)
    const g = canvas.getContext('2d')
    if (!g) throw new Error('no canvas')
    g.imageSmoothingQuality = 'high'
    g.drawImage(bitmap, 0, 0, width, height)
    bitmap.close()
    scope.postMessage({ blob: await canvas.convertToBlob({ type: 'image/jpeg', quality: 0.8 }) })
  } catch (err) {
    scope.postMessage({ error: err instanceof Error ? err.message : String(err) })
  }
}
