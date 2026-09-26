import Link from 'next/link'

import { BrandLogo } from '@/components/brand/brand-logo'

export default function ApplyLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div className="relative flex min-h-dvh flex-col overflow-hidden bg-linear-to-b from-hero-top to-background">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-96"
      >
        <div className="absolute -top-20 -right-16 size-72 rounded-full bg-brand/10" />
        <div className="absolute top-16 right-24 size-28 rounded-full border-2 border-brand/20" />
        <div className="absolute -top-10 -left-16 size-56 rounded-full bg-brand/5" />
      </div>
      <div className="relative mx-auto flex w-full max-w-2xl flex-1 flex-col px-4 py-10">
        <Link href="/" aria-label="MyBalai home" className="mb-8 self-start">
          <BrandLogo size={44} />
        </Link>
        <div className="rounded-[32px] border border-border bg-card p-6 shadow-sheet sm:p-8">
          {children}
        </div>
        <p className="mt-6 text-center text-xs text-muted-foreground">
          Already have a landlord account?{' '}
          <Link href="/login" className="underline hover:text-foreground">
            Sign in
          </Link>
          . By applying you agree to our{' '}
          <Link href="/terms" className="underline hover:text-foreground">
            Terms
          </Link>{' '}
          and{' '}
          <Link href="/privacy" className="underline hover:text-foreground">
            Privacy Policy
          </Link>
          .
        </p>
      </div>
    </div>
  )
}
