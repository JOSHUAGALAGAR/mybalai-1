import Link from 'next/link'

/**
 * Shared layout for the Terms / Privacy pages. Public (no login) so the mobile app, the
 * sign-up form and Google's consent screen can link to them.
 */
export function LegalPage({
  title,
  updated,
  children,
}: {
  title: string
  updated: string
  children: React.ReactNode
}) {
  return (
    <main className="mx-auto w-full max-w-2xl px-4 py-10 sm:px-6">
      <Link
        href="/"
        className="text-sm text-muted-foreground hover:text-foreground"
      >
        ← MyBalai
      </Link>
      <h1 className="mt-4 text-3xl font-semibold tracking-tight text-foreground">
        {title}
      </h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Last updated {updated}
      </p>

      <div className="mt-8 space-y-6 text-[15px] leading-7 text-foreground [&_h2]:mt-10 [&_h2]:text-xl [&_h2]:font-semibold [&_li]:ml-5 [&_li]:list-disc [&_mark]:rounded [&_mark]:bg-amber-500/20 [&_mark]:px-1 [&_p]:text-muted-foreground [&_li]:text-muted-foreground">
        {children}
      </div>
    </main>
  )
}
