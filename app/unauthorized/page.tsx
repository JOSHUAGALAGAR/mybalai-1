import type { Metadata } from 'next'
import Link from 'next/link'

import { Button } from '@/components/ui/button'

export const metadata: Metadata = { title: 'Not authorized' }

export default function UnauthorizedPage() {
  return (
    <div className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center gap-4 px-4 text-center">
      <p className="text-sm font-medium text-primary">403</p>
      <h1 className="text-xl font-semibold text-foreground">
        You don&apos;t have access to this page
      </h1>
      <p className="text-sm text-muted-foreground">
        Your account role doesn&apos;t permit this area. If you think this is a
        mistake, contact the account owner or an administrator.
      </p>
      <Button asChild variant="outline">
        <Link href="/dashboard">Back to dashboard</Link>
      </Button>
    </div>
  )
}
