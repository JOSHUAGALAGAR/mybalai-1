'use client'

import Link from 'next/link'
import { useSyncExternalStore } from 'react'

const KEY = 'mb_cookie_notice'
const listeners = new Set<() => void>()

function read(): boolean {
  try {
    return window.localStorage.getItem(KEY) === '1'
  } catch {
    return false // storage blocked: show the notice each visit rather than never
  }
}
const subscribe = (cb: () => void) => {
  listeners.add(cb)
  return () => void listeners.delete(cb)
}

/**
 * A short, honest notice: MyBalai only uses the cookies it needs to work, so there is nothing to
 * accept or reject — it links to the policy and can be dismissed for good.
 */
export function CookieNotice() {
  // Server render and first paint: treated as already seen, so there is no flash before we can read storage.
  const seen = useSyncExternalStore(subscribe, read, () => true)
  if (seen) return null

  return (
    <div
      role="region"
      aria-label="Cookie notice"
      className="fixed inset-x-3 bottom-3 z-50 mx-auto max-w-xl rounded-2xl border border-border bg-card p-4 shadow-lg sm:bottom-5"
    >
      <p className="text-sm text-foreground">
        MyBalai only uses cookies it needs to keep you signed in and to make the
        site work — no ads, no tracking.{' '}
        <Link
          href="/cookies"
          className="font-medium text-primary underline-offset-2 hover:underline"
        >
          Cookie Policy
        </Link>
        {' · '}
        <Link
          href="/privacy"
          className="font-medium text-primary underline-offset-2 hover:underline"
        >
          Privacy
        </Link>
      </p>
      <div className="mt-3 flex justify-end">
        <button
          type="button"
          onClick={() => {
            try {
              window.localStorage.setItem(KEY, '1')
            } catch {
              // ignore: it will show again next visit
            }
            listeners.forEach((l) => l())
          }}
          className="rounded-full bg-primary px-5 py-2 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:ring-4 focus-visible:ring-brand/30 focus-visible:outline-none"
        >
          Got it
        </button>
      </div>
    </div>
  )
}
