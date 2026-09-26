'use client'

import {
  ChevronLeft,
  ChevronRight,
  Download,
  ExternalLink,
  FileText,
  Loader2,
} from 'lucide-react'
import { useState, useTransition } from 'react'

import {
  viewDocumentsAction,
  type DocumentsState,
} from '@/app/(protected)/admin/applications/actions'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from '@/components/ui/dialog'
import { cn } from '@/lib/utils'
import type { DocumentLink } from '@/services/applications.service'

/**
 * A preview window for an application's documents. The list of files is fetched as JSON only when
 * the reviewer asks (so the applications list stays light), each file is previewed in place — photos
 * as images, PDFs in the browser's viewer — and every look is recorded in the audit log.
 */
export function DocumentPreview({
  applicationId,
  title,
  count,
  loadLinks,
}: {
  applicationId: number
  title: string
  count: number
  /** Test seam: where the links come from (the server action by default). */
  loadLinks?: () => Promise<DocumentsState>
}) {
  const [open, setOpen] = useState(false)
  const [links, setLinks] = useState<DocumentLink[]>([])
  const [index, setIndex] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [broken, setBroken] = useState<Set<number>>(new Set())
  const [loading, startLoading] = useTransition()

  function load(openAfter: boolean) {
    setError(null)
    startLoading(async () => {
      const form = new FormData()
      form.set('application_id', String(applicationId))
      const result = await (loadLinks
        ? loadLinks()
        : viewDocumentsAction(undefined, form))
      if (result?.status === 'ok') {
        setLinks(result.links)
        setBroken(new Set())
        if (openAfter) {
          setIndex(0)
          setOpen(true)
        }
      } else {
        setError(
          result?.status === 'error'
            ? result.message
            : 'Could not open the documents.',
        )
      }
    })
  }

  const current = links[index]
  const step = (by: number) =>
    setIndex((i) => (i + by + links.length) % links.length)
  const isImage = current?.mime.startsWith('image/')
  const isPdf = current?.mime === 'application/pdf'

  return (
    <>
      <Button
        type="button"
        size="sm"
        variant="outline"
        onClick={() => load(true)}
        disabled={loading}
        aria-busy={loading}
      >
        {loading && !open ? (
          <Loader2 className="size-4 animate-spin" aria-hidden />
        ) : (
          <FileText className="size-4" aria-hidden />
        )}
        {loading && !open ? 'Opening…' : `Preview documents (${count})`}
      </Button>
      {error && (
        <p role="alert" className="mt-1 text-sm text-destructive">
          {error}
        </p>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent
          className="h-[90dvh] max-w-6xl"
          onKeyDown={(e) => {
            if (links.length > 1 && e.key === 'ArrowLeft') step(-1)
            if (links.length > 1 && e.key === 'ArrowRight') step(1)
          }}
        >
          <div className="border-b border-border p-4 pr-12">
            <DialogTitle className="text-base">{title}</DialogTitle>
            <DialogDescription>
              {links.length} {links.length === 1 ? 'document' : 'documents'} —
              links are private and expire in 10 minutes.
            </DialogDescription>
          </div>

          <div className="flex min-h-0 flex-1 flex-col md:flex-row">
            {/* the list of files */}
            <ul
              className="flex shrink-0 gap-1 overflow-x-auto border-b border-border p-2 md:w-64 md:flex-col md:overflow-y-auto md:border-r md:border-b-0"
              aria-label="Documents"
            >
              {links.map((l, i) => (
                <li key={i} className="shrink-0">
                  <button
                    type="button"
                    onClick={() => setIndex(i)}
                    aria-current={i === index}
                    className={cn(
                      'w-full rounded-xl px-3 py-2 text-left text-sm transition-colors',
                      i === index
                        ? 'bg-primary-soft font-semibold text-foreground'
                        : 'text-muted-foreground hover:bg-muted',
                    )}
                  >
                    <span className="block truncate">{l.label}</span>
                    <span className="block truncate text-xs font-normal">
                      {l.fileName}
                    </span>
                  </button>
                </li>
              ))}
            </ul>

            {/* the preview */}
            <div className="relative flex min-h-0 flex-1 flex-col bg-muted/30">
              {current && (
                <>
                  <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-3 py-2 text-sm">
                    <span className="min-w-0 truncate font-semibold text-foreground">
                      {current.label}
                    </span>
                    <span className="flex items-center gap-1">
                      {links.length > 1 && (
                        <>
                          <Button
                            type="button"
                            size="icon-sm"
                            variant="ghost"
                            aria-label="Previous document"
                            onClick={() => step(-1)}
                          >
                            <ChevronLeft />
                          </Button>
                          <span className="text-xs text-muted-foreground">
                            {index + 1} / {links.length}
                          </span>
                          <Button
                            type="button"
                            size="icon-sm"
                            variant="ghost"
                            aria-label="Next document"
                            onClick={() => step(1)}
                          >
                            <ChevronRight />
                          </Button>
                        </>
                      )}
                      {current.url && (
                        <>
                          <Button asChild size="sm" variant="ghost">
                            <a
                              href={current.url}
                              target="_blank"
                              rel="noopener noreferrer"
                            >
                              <ExternalLink className="size-4" aria-hidden />{' '}
                              Open
                            </a>
                          </Button>
                          <Button asChild size="sm" variant="ghost">
                            <a
                              href={`${current.url}${current.url.includes('?') ? '&' : '?'}download=${encodeURIComponent(current.fileName)}`}
                            >
                              <Download className="size-4" aria-hidden />{' '}
                              Download
                            </a>
                          </Button>
                        </>
                      )}
                    </span>
                  </div>

                  <div className="flex min-h-0 flex-1 items-center justify-center overflow-auto p-2">
                    {!current.url || broken.has(index) ? (
                      <div className="space-y-3 text-center text-sm text-muted-foreground">
                        <p>
                          {current.url
                            ? 'This link has expired or the file could not be shown.'
                            : 'This file is unavailable.'}
                        </p>
                        <Button
                          type="button"
                          size="sm"
                          onClick={() => load(false)}
                          disabled={loading}
                        >
                          Reload links
                        </Button>
                      </div>
                    ) : isImage ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        key={current.url}
                        src={current.url}
                        alt={`${current.label} — ${current.fileName}`}
                        className="max-h-full max-w-full object-contain"
                        onError={() => setBroken((b) => new Set(b).add(index))}
                      />
                    ) : isPdf ? (
                      <iframe
                        key={current.url}
                        src={current.url}
                        title={`${current.label} — ${current.fileName}`}
                        className="size-full rounded-lg border border-border bg-white"
                      />
                    ) : (
                      <p className="text-sm text-muted-foreground">
                        No preview for this type of file — use Open or Download.
                      </p>
                    )}
                  </div>
                </>
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}
