'use client'

import { useState } from 'react'

/** Shrinks a phone photo to at most 1600px JPEG before upload (spec §4.4). A 4 MB photo becomes ~250 KB. */
async function compress(file: File): Promise<Blob> {
  try {
    const bitmap = await createImageBitmap(file)
    const scale = Math.min(1, 1600 / Math.max(bitmap.width, bitmap.height))
    const canvas = document.createElement('canvas')
    canvas.width = Math.round(bitmap.width * scale)
    canvas.height = Math.round(bitmap.height * scale)
    canvas.getContext('2d')!.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.72))
    return blob ?? file
  } catch {
    return file // old browser or odd format: send as is and let the server decide
  }
}

export function PhotoUpload({ token, kind, initial, labels }: {
  token: string
  kind: string
  initial: number
  labels: { add: string; uploading: string; uploaded: string; failed: string }
}) {
  const [count, setCount] = useState(initial)
  const [state, setState] = useState<'idle' | 'busy' | 'failed'>('idle')

  async function onChange(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? [])
    e.target.value = ''
    if (files.length === 0) return
    setState('busy')
    let failed = false
    for (const file of files) {
      const body = new FormData()
      body.set('kind', kind)
      body.set('photo', new File([await compress(file)], 'photo.jpg', { type: 'image/jpeg' }))
      try {
        const res = await fetch(`/r/${token}/photo`, { method: 'POST', body })
        if (res.ok) setCount((n) => n + 1)
        else failed = true
      } catch {
        failed = true
      }
    }
    setState(failed ? 'failed' : 'idle')
  }

  return (
    <div className="flex items-center justify-between gap-3">
      <label className={`btn-secondary relative shrink-0 ${state === 'busy' ? 'opacity-60' : ''}`}>
        {state === 'busy' ? labels.uploading : labels.add}
        <input type="file" accept="image/*" capture="environment" multiple disabled={state === 'busy'} onChange={onChange} className="absolute inset-0 cursor-pointer opacity-0" />
      </label>
      <span className={`text-sm ${state === 'failed' ? 'text-red' : 'text-muted'}`} role="status">
        {state === 'failed' ? labels.failed : count > 0 ? labels.uploaded.replace('{n}', String(count)) : ''}
      </span>
    </div>
  )
}

/** Times a 150 KB download and writes the result into the form's hidden field. */
export function SpeedTest({ initial, labels }: { initial: number | null; labels: { run: string; result: string; failed: string } }) {
  const [kbps, setKbps] = useState<number | null>(initial)
  const [state, setState] = useState<'idle' | 'busy' | 'failed'>('idle')

  async function run() {
    setState('busy')
    try {
      const started = performance.now()
      const res = await fetch(`/r/speed?t=${Date.now()}`, { cache: 'no-store' })
      const bytes = (await res.arrayBuffer()).byteLength
      const seconds = (performance.now() - started) / 1000
      setKbps(Math.max(1, Math.round((bytes * 8) / 1000 / seconds)))
      setState('idle')
    } catch {
      setState('failed')
    }
  }

  return (
    <div className="flex items-center justify-between gap-3">
      <input type="hidden" name="down_kbps" value={kbps ?? ''} />
      <button type="button" onClick={run} disabled={state === 'busy'} className="btn-secondary shrink-0">{labels.run}</button>
      <span className="text-sm text-muted" role="status">
        {state === 'failed' ? labels.failed : kbps ? labels.result.replace('{n}', String(kbps)) : ''}
      </span>
    </div>
  )
}
