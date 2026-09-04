'use client'

import { useEffect } from 'react'
import Link from 'next/link'

import { Button } from '@/components/ui/button'

export default function PropertiesError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error(error)
  }, [error])

  return (
    <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-6">
      <h2 className="text-sm font-semibold text-destructive">
        Could not load this page
      </h2>
      <p className="mt-1 text-sm text-muted-foreground">
        {error.message || 'An unexpected error occurred.'}
      </p>
      <div className="mt-4 flex gap-2">
        <Button variant="outline" onClick={reset}>
          Try again
        </Button>
        <Button asChild variant="ghost">
          <Link href="/landlord">Back to overview</Link>
        </Button>
      </div>
    </div>
  )
}
