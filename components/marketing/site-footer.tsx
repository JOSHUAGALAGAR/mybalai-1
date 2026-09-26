import Link from 'next/link'
import { Mail } from 'lucide-react'

import { BrandLogo } from '@/components/brand/brand-logo'

const YEAR = new Date().getFullYear()

const linkClass =
  'text-muted-foreground transition-colors hover:text-foreground'

export function SiteFooter() {
  return (
    <footer className="border-t border-border bg-muted/30">
      <div className="mx-auto grid max-w-6xl gap-10 px-4 py-12 sm:px-6 md:grid-cols-[1.4fr_1fr_1fr_1fr]">
        <div className="max-w-xs">
          <BrandLogo size={36} />
          <p className="mt-3 text-sm text-muted-foreground">
            Find, book and manage boarding houses and rooms — for tenants,
            landlords, and caretakers.
          </p>
          <a
            href="mailto:mybalaiofficial@gmail.com"
            className="mt-4 inline-flex items-center gap-2 text-sm font-medium text-foreground hover:text-primary"
          >
            <Mail className="size-4" aria-hidden />
            mybalaiofficial@gmail.com
          </a>
        </div>

        <nav aria-label="Explore" className="text-sm">
          <h2 className="mb-3 font-semibold text-foreground">Explore</h2>
          <ul className="space-y-2">
            <li>
              <a href="#featured" className={linkClass}>
                Featured places
              </a>
            </li>
            <li>
              <a href="#how-it-works" className={linkClass}>
                How it works
              </a>
            </li>
            <li>
              <a href="#for-tenants" className={linkClass}>
                For tenants
              </a>
            </li>
            <li>
              <a href="#for-landlords" className={linkClass}>
                For landlords
              </a>
            </li>
            <li>
              <a href="#faq" className={linkClass}>
                FAQ
              </a>
            </li>
          </ul>
        </nav>

        <nav aria-label="Account" className="text-sm">
          <h2 className="mb-3 font-semibold text-foreground">Get started</h2>
          <ul className="space-y-2">
            <li>
              <Link href="/login" className={linkClass}>
                Sign in
              </Link>
            </li>
            <li>
              <Link href="/signup" className={linkClass}>
                Create an account
              </Link>
            </li>
            <li>
              <Link href="/apply" className={linkClass}>
                List your property
              </Link>
            </li>
          </ul>
        </nav>

        <nav aria-label="Legal" className="text-sm">
          <h2 className="mb-3 font-semibold text-foreground">Legal</h2>
          <ul className="space-y-2">
            <li>
              <Link href="/terms" className={linkClass}>
                Terms &amp; Conditions
              </Link>
            </li>
            <li>
              <Link href="/privacy" className={linkClass}>
                Privacy Policy
              </Link>
            </li>
            <li>
              <Link href="/cookies" className={linkClass}>
                Cookie Policy
              </Link>
            </li>
            <li>
              <Link href="/delete-account" className={linkClass}>
                Delete your account
              </Link>
            </li>
          </ul>
        </nav>
      </div>
      <div className="border-t border-border">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-2 px-4 py-4 text-xs text-muted-foreground sm:px-6">
          <p>© {YEAR} MyBalai. All rights reserved.</p>
          <p>
            <Link href="/terms" className="hover:text-foreground">
              Terms
            </Link>
            {' · '}
            <Link href="/privacy" className="hover:text-foreground">
              Privacy
            </Link>
            {' · '}
            <Link href="/cookies" className="hover:text-foreground">
              Cookies
            </Link>
          </p>
        </div>
      </div>
    </footer>
  )
}
