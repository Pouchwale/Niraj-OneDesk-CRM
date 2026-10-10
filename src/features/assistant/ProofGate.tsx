/**
 * The proof screen: when Robi asks for proof, it covers the whole CRM until a
 * screenshot is attached or the ten minutes run out. Nothing underneath can be
 * clicked; switching browser tabs - to find the screenshot - still works.
 */

import { useEffect, useState, useSyncExternalStore } from 'react'
import { Camera, ImagePlus, Loader2, ShieldCheck } from 'lucide-react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { useAuth } from '@/features/auth/AuthContext'
import { demoCompanyStore, subscribeToDemoStore } from '@/lib/demo-companies'
import { whenSaved } from '@/lib/shared-data'
import type { ProofRequest } from '@/lib/types'

/** Screenshots are shrunk to this width and sent as JPEG: a phone photo is megabytes, a proof needs a few hundred KB. */
const MAX_WIDTH = 1600

async function shrink(file: Blob): Promise<Blob> {
  const bitmap = await createImageBitmap(file)
  const scale = Math.min(1, MAX_WIDTH / bitmap.width)
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(bitmap.width * scale)
  canvas.height = Math.round(bitmap.height * scale)
  canvas.getContext('2d')!.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
  return new Promise((resolve, reject) =>
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('Could not read that image.'))), 'image/jpeg', 0.8)
  )
}

async function upload(file: Blob): Promise<string> {
  const res = await fetch('/api/proofs', { method: 'POST', headers: { 'Content-Type': 'image/jpeg' }, body: await shrink(file) })
  const body = (await res.json().catch(() => null)) as { url?: string; error?: { message?: string } } | null
  if (!res.ok || !body?.url) throw new Error(body?.error?.message ?? 'The screenshot did not upload.')
  return body.url
}

function useMyPendingProof(userId: string | undefined): ProofRequest | null {
  const all = useSyncExternalStore(subscribeToDemoStore, () => demoCompanyStore.proofRequests)
  return all.find((r) => r.coordinatorId === userId && r.status === 'pending') ?? null
}

export function ProofGate() {
  const { user, isCoordinator } = useAuth()
  const request = useMyPendingProof(isCoordinator ? user?.id : undefined)
  const [now, setNow] = useState(() => Date.now())
  const [file, setFile] = useState<Blob | null>(null)
  const [preview, setPreview] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!request) return
    const id = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(id)
  }, [request])

  // Time up: recorded as missed, and the screen lets go.
  const left = request ? Date.parse(request.dueAt) - now : 0
  useEffect(() => {
    if (request && left <= 0 && !busy) {
      demoCompanyStore.markProofMissed(request.id, new Date().toISOString())
      toast.error('Proof not attached in time — your team leader will see it as missed.')
    }
  }, [request, left, busy])

  // A screenshot pasted with Ctrl+V is the quickest way to attach one.
  useEffect(() => {
    if (!request) return
    const onPaste = (event: ClipboardEvent) => {
      const image = [...(event.clipboardData?.files ?? [])].find((f) => f.type.startsWith('image/'))
      if (image) pick(image)
    }
    window.addEventListener('paste', onPaste)
    return () => window.removeEventListener('paste', onPaste)
  }, [request])

  const pick = (blob: Blob) => {
    setFile(blob)
    setPreview((old) => {
      if (old) URL.revokeObjectURL(old)
      return URL.createObjectURL(blob)
    })
  }

  if (!request || left <= 0) return null

  const submit = async () => {
    if (!file) return
    setBusy(true)
    try {
      const url = await upload(file)
      demoCompanyStore.submitProof(request.id, url, new Date().toISOString())
      await whenSaved()
      toast.success('Proof sent to your team leader.')
      setFile(null)
      setPreview(null)
    } catch (err) {
      toast.error('Proof not sent.', { description: err instanceof Error ? err.message : 'Try again.' })
    } finally {
      setBusy(false)
    }
  }

  const minutes = Math.floor(left / 60_000)
  const seconds = Math.floor((left % 60_000) / 1000)

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
          <div className={`shrink-0 rounded-lg px-2.5 py-1 font-mono text-lg font-bold tabular-nums ${left < 120_000 ? 'bg-rose-500/10 text-rose-600' : 'bg-muted'}`} data-testid="proof-timer">
            {minutes}:{String(seconds).padStart(2, '0')}
          </div>
        </div>

        <label className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-border p-4 text-center text-sm text-muted-foreground hover:border-primary/50">
          {preview ? (
            <img src={preview} alt="Screenshot to send" className="max-h-56 rounded-lg object-contain" />
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
            onChange={(e) => e.target.files?.[0] && pick(e.target.files[0])}
          />
        </label>

        <Button className="w-full" disabled={!file || busy} onClick={submit} data-testid="proof-submit">
          {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Camera className="mr-2 h-4 w-4" />}
          Send proof
        </Button>
        <p className="text-center text-xs text-muted-foreground">
          The CRM stays locked until you send it. You can switch to another browser tab to find the screenshot.
        </p>
      </div>
    </div>
  )
}
