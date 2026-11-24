/**
 * The proof screen: when Robi asks for proof, it covers the whole CRM until a
 * screenshot is attached or the ten minutes run out. Nothing underneath can be
 * clicked; switching browser tabs - to find the screenshot - still works.
 *
 * 24 Nov 2026 (it froze and kept spinning): the picture is made smaller as soon
 * as it is chosen, by the browser off the screen's own work, so Send does not
 * lock the screen; the upload shows how far it has got and gives up with a
 * clear message after a minute instead of spinning for ever; and the ten
 * minutes running out never closes the screen in the middle of a send.
 */

import { useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { AlertTriangle, Camera, ImagePlus, Loader2, ShieldCheck } from 'lucide-react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { useAuth } from '@/features/auth/AuthContext'
import { demoCompanyStore, subscribeToDemoStore } from '@/lib/demo-companies'
import { whenSaved } from '@/lib/shared-data'
import type { ProofRequest } from '@/lib/types'
import type { ShrinkProofRequest, ShrinkProofResult } from './shrink-proof.worker'

/** Screenshots are shrunk to this width and sent as JPEG: a phone photo is megabytes, a proof needs a few hundred KB. */
const MAX_WIDTH = 1600
/** A very long screenshot is kept within what a browser can draw. */
const MAX_HEIGHT = 8000
/** An upload with no answer by then is given up, with a message, so the button can be pressed again. */
const UPLOAD_LIMIT_MS = 60_000

const UNREADABLE = 'That picture could not be read. Use a screenshot (PNG or JPG).'

/** A picture the worker has not answered for in this long is made on the page instead. */
const WORKER_LIMIT_MS = 30_000

/**
 * The picture made small enough to send, in a worker (shrink-proof.worker.ts)
 * so the screen never pauses; on the page itself only where a browser has no
 * worker canvas.
 */
export function shrink(file: Blob): Promise<Blob> {
  if (typeof Worker === 'undefined' || typeof OffscreenCanvas === 'undefined') return shrinkHere(file)
  return new Promise((resolve, reject) => {
    let worker: Worker
    try {
      worker = new Worker(new URL('./shrink-proof.worker.ts', import.meta.url), { type: 'module' })
    } catch {
      shrinkHere(file).then(resolve, reject)
      return
    }
    let settled = false
    const finish = (then: () => void) => {
      if (settled) return
      settled = true
      window.clearTimeout(timer)
      worker.terminate()
      then()
    }
    const timer = window.setTimeout(() => finish(() => shrinkHere(file).then(resolve, reject)), WORKER_LIMIT_MS)
    worker.onmessage = (event: MessageEvent<ShrinkProofResult>) =>
      finish(() => ('blob' in event.data ? resolve(event.data.blob) : reject(new Error(UNREADABLE))))
    worker.onerror = () => finish(() => shrinkHere(file).then(resolve, reject))
    const request: ShrinkProofRequest = { file, maxWidth: MAX_WIDTH, maxHeight: MAX_HEIGHT }
    worker.postMessage(request)
  })
}

/** The same on the page, for a browser without a worker canvas. */
async function shrinkHere(file: Blob): Promise<Blob> {
  let bitmap: ImageBitmap
  try {
    bitmap = await createImageBitmap(file)
  } catch {
    throw new Error(UNREADABLE)
  }
  const scale = Math.min(1, MAX_WIDTH / bitmap.width, MAX_HEIGHT / bitmap.height)
  const width = Math.max(1, Math.round(bitmap.width * scale))
  const height = Math.max(1, Math.round(bitmap.height * scale))
  if (scale < 1) {
    bitmap.close()
    bitmap = await createImageBitmap(file, { resizeWidth: width, resizeHeight: height, resizeQuality: 'high' })
  }
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const g = canvas.getContext('2d')
  if (!g) throw new Error(UNREADABLE)
  g.drawImage(bitmap, 0, 0)
  bitmap.close()
  return new Promise((resolve, reject) =>
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error(UNREADABLE))), 'image/jpeg', 0.8)
  )
}

/** Sends the picture, telling how much has gone; gives up after a minute rather than spinning for ever. */
export function upload(blob: Blob, onProgress: (percent: number) => void): Promise<string> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    xhr.open('POST', '/api/proofs')
    xhr.setRequestHeader('Content-Type', 'image/jpeg')
    xhr.timeout = UPLOAD_LIMIT_MS
    xhr.responseType = 'json'
    xhr.upload.onprogress = (e) => e.lengthComputable && onProgress(Math.round((e.loaded / e.total) * 100))
    xhr.onload = () => {
      const body = xhr.response as { url?: string; error?: { message?: string } } | null
      if (xhr.status >= 200 && xhr.status < 300 && body?.url) resolve(body.url)
      else reject(new Error(body?.error?.message ?? 'The screenshot did not upload. Press Send proof again.'))
    }
    xhr.ontimeout = () => reject(new Error('The upload took too long. Check the network and press Send proof again.'))
    xhr.onerror = () => reject(new Error('Could not reach the CRM. Check the network and press Send proof again.'))
    xhr.send(blob)
  })
}

function useMyPendingProof(userId: string | undefined): ProofRequest | null {
  const all = useSyncExternalStore(subscribeToDemoStore, () => demoCompanyStore.proofRequests)
  return all.find((r) => r.coordinatorId === userId && r.status === 'pending') ?? null
}

type Stage = 'idle' | 'preparing' | 'uploading' | 'saving'

export function ProofGate() {
  const { user, isCoordinator } = useAuth()
  const request = useMyPendingProof(isCoordinator ? user?.id : undefined)
  const [now, setNow] = useState(() => Date.now())
  const [preview, setPreview] = useState<string | null>(null)
  /** The picture made ready to send (shrunk when chosen). */
  const [ready, setReady] = useState<Blob | null>(null)
  const [stage, setStage] = useState<Stage>('idle')
  const [percent, setPercent] = useState(0)
  const [problem, setProblem] = useState<string | null>(null)
  /** Only the last picture chosen counts, if two are chosen quickly. */
  const pickId = useRef(0)
  /** Already uploaded: pressing Send again after a failed save does not upload it twice. */
  const uploaded = useRef<{ blob: Blob; url: string } | null>(null)
  const sending = stage === 'uploading' || stage === 'saving'

  useEffect(() => {
    if (!request) return
    const id = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(id)
  }, [request])

  // Each proof starts empty.
  useEffect(() => {
    setReady(null)
    setProblem(null)
    setStage('idle')
    uploaded.current = null
    setPreview((old) => {
      if (old) URL.revokeObjectURL(old)
      return null
    })
  }, [request?.id])

  // Time up: recorded as missed, and the screen lets go - but never in the middle of a send.
  const left = request ? Date.parse(request.dueAt) - now : 0
  useEffect(() => {
    if (request && left <= 0 && !sending) {
      demoCompanyStore.markProofMissed(request.id, new Date().toISOString())
      toast.error('Proof not attached in time — your team leader will see it as missed.')
    }
  }, [request, left, sending])

  const pick = (blob: Blob) => {
    const id = ++pickId.current
    setProblem(null)
    setReady(null)
    setStage('preparing')
    setPreview((old) => {
      if (old) URL.revokeObjectURL(old)
      return null
    })
    shrink(blob)
      .then((small) => {
        if (pickId.current !== id) return
        setReady(small)
        setPreview(URL.createObjectURL(small))
        setStage('idle')
      })
      .catch((err) => {
        if (pickId.current !== id) return
        setProblem(err instanceof Error ? err.message : UNREADABLE)
        setStage('idle')
      })
  }
  const pickRef = useRef(pick)
  pickRef.current = pick

  // A screenshot pasted with Ctrl+V is the quickest way to attach one.
  useEffect(() => {
    if (!request) return
    const onPaste = (event: ClipboardEvent) => {
      const image = [...(event.clipboardData?.files ?? [])].find((f) => f.type.startsWith('image/'))
      if (image) pickRef.current(image)
    }
    window.addEventListener('paste', onPaste)
    return () => window.removeEventListener('paste', onPaste)
  }, [request])

  if (!request || (left <= 0 && !sending)) return null

  const submit = async () => {
    if (!ready || sending) return
    setProblem(null)
    setPercent(0)
    try {
      let url = uploaded.current?.blob === ready ? uploaded.current.url : null
      if (!url) {
        setStage('uploading')
        url = await upload(ready, setPercent)
        uploaded.current = { blob: ready, url }
      }
      setStage('saving')
      demoCompanyStore.submitProof(request.id, url, new Date().toISOString())
      await whenSaved()
      toast.success('Proof sent to your team leader.')
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Try again.'
      setProblem(message)
      toast.error('Proof not sent.', { description: message })
    } finally {
      setStage('idle')
    }
  }

  const shown = Math.max(0, left)
  const minutes = Math.floor(shown / 60_000)
  const seconds = Math.floor((shown % 60_000) / 1000)
  const label =
    stage === 'preparing'
      ? 'Getting the picture ready…'
      : stage === 'uploading'
        ? `Uploading… ${percent}%`
        : stage === 'saving'
          ? 'Saving…'
          : 'Send proof'

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm" role="dialog" aria-modal="true" data-testid="proof-gate">
      <div className="w-full max-w-md space-y-4 rounded-2xl border border-border bg-background p-5 shadow-2xl">
        <div className="flex items-start gap-3">
          <div className="rounded-full bg-primary/10 p-2 text-primary">
            <ShieldCheck className="h-5 w-5" />
          </div>
          <div className="min-w-0 flex-1">
            <h2 className="font-semibold">Robi needs proof</h2>
            <p className="text-sm text-muted-foreground">
              Attach a screenshot of your call, email, WhatsApp or meeting with <span className="font-medium text-foreground">{request.entityName}</span>.
              It goes to your team leader for checking.
            </p>
          </div>
          <div className={`shrink-0 rounded-lg px-2.5 py-1 font-mono text-lg font-bold tabular-nums ${shown < 120_000 ? 'bg-rose-500/10 text-rose-600' : 'bg-muted'}`} data-testid="proof-timer">
            {minutes}:{String(seconds).padStart(2, '0')}
          </div>
        </div>

        <label className={`flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-border p-4 text-center text-sm text-muted-foreground ${sending ? 'pointer-events-none opacity-70' : 'cursor-pointer hover:border-primary/50'}`}>
          {preview ? (
            <img src={preview} alt="Screenshot to send" decoding="async" className="max-h-56 rounded-lg object-contain" />
          ) : stage === 'preparing' ? (
            <>
              <Loader2 className="h-8 w-8 animate-spin" />
              <span>Getting the picture ready…</span>
            </>
          ) : (
            <>
              <ImagePlus className="h-8 w-8" />
              <span>Choose a screenshot, or press <kbd className="rounded border px-1">Ctrl</kbd>+<kbd className="rounded border px-1">V</kbd> to paste one</span>
            </>
          )}
          <input
            type="file"
            accept="image/*"
            className="sr-only"
            data-testid="proof-file"
            disabled={sending}
            onChange={(e) => {
              const chosen = e.target.files?.[0]
              // Cleared, so choosing the same file again after a problem still works.
              e.target.value = ''
              if (chosen) pick(chosen)
            }}
          />
        </label>

        {problem && (
          <p className="flex items-start gap-1.5 rounded-lg border border-rose-500/30 bg-rose-500/10 p-2 text-sm text-rose-700 dark:text-rose-300" data-testid="proof-problem">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            {problem}
          </p>
        )}

        <Button className="w-full" disabled={!ready || stage !== 'idle'} onClick={submit} data-testid="proof-submit">
          {stage === 'idle' ? <Camera className="mr-2 h-4 w-4" /> : <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          {label}
        </Button>
        <p className="text-center text-xs text-muted-foreground">
          The CRM stays locked until you send it. You can switch to another browser tab to find the screenshot.
        </p>
      </div>
    </div>
  )
}
