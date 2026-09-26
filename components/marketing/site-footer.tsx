import Link from 'next/link'

import { BrandLogo } from '@/components/brand/brand-logo'

const YEAR = new Date().getFullYear()

export function SiteFooter() {
  return (
    <footer className="border-t border-border bg-muted/30">
      <div className="mx-auto flex max-w-6xl flex-col gap-6 px-4 py-10 sm:px-6 md:flex-row md:items-start md:justify-between">
        <div className="max-w-xs">
          <BrandLogo size={36} />
          <p className="mt-2 text-sm text-muted-foreground">
            Property and rental management for tenants, landlords, and
            caretakers.
          </p>
        </div>

        <nav className="grid grid-cols-2 gap-x-12 gap-y-2 text-sm sm:grid-cols-3">
          <a
            href="#how-it-works"
            className="text-muted-foreground hover:text-foreground"
          >
            How it works
          </a>
          <a
            href="#for-tenants"
            className="text-muted-foreground hover:text-foreground"
          >
            For tenants
          </a>
          <a
            href="#for-landlords"
            className="text-muted-foreground hover:text-foreground"
          >
            For landlords
          </a>
          <a
            href="#faq"
            className="text-muted-foreground hover:text-foreground"
          >
            FAQ
          </a>
          <Link
            href="/login"
            className="text-muted-foreground hover:text-foreground"
          >
            Sign in
          </Link>
          <Link
            href="/signup"
            className="text-muted-foreground hover:text-foreground"
          >
            Get started
          </Link>
        </nav>
      </div>
      <div className="border-t border-border">
        <p className="mx-auto max-w-6xl px-4 py-4 text-xs text-muted-foreground sm:px-6">
          © {YEAR} MyBalai. All rights reserved.
        </p>
      </div>
    </footer>
  )
}
