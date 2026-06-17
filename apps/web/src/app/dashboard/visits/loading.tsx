import { Loader2 } from 'lucide-react'

/** Route-segment skeleton shown while the server component streams in. */
export default function Loading() {
  return (
    <div className="flex-1 flex flex-col">
      <div className="px-8 py-5 border-b border-border bg-card">
        <div className="h-3 w-28 rounded bg-muted animate-pulse" />
        <div className="mt-2 h-6 w-52 rounded bg-muted animate-pulse" />
      </div>
      <div className="flex-1 overflow-auto px-8 py-6 space-y-4">
        <div className="bg-card border border-border rounded-xl p-5 flex items-center gap-2.5 text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          <span className="text-sm">Loading…</span>
        </div>
        <div className="bg-card border border-border rounded-xl h-44 animate-pulse" />
      </div>
    </div>
  )
}
