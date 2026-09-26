import type { Metadata } from 'next'
import Link from 'next/link'

import { LegalPage } from '@/components/legal/legal-page'

export const metadata: Metadata = { title: 'Cookie Policy' }

export default function CookiesPage() {
  return (
    <LegalPage title="Cookie Policy" updated="26 September 2026">
      <p>
        This page explains the small files (&ldquo;cookies&rdquo;) and similar
        storage that MyBalai puts on your phone or computer. MyBalai is run by
        Joshua Tuyor. In short:{' '}
        <strong>we only use cookies the site needs to work</strong>. We do not
        use advertising or tracking cookies, and we do not sell information
        about you.
      </p>

      <h2>What we use</h2>
      <ul>
        <li>
          <strong>Sign-in cookies</strong> keep you signed in and let us check
          who you are on each page. They are set when you sign in, last for your
          session (up to a few weeks if you stay signed in), and are removed
          when you sign out. Their names start with <code>sb-</code>.
        </li>
        <li>
          <strong>Sign-in helper cookies</strong> (
          <code>sb-…-code-verifier</code> and <code>mb_auth_next</code>) exist
          for a few minutes while you sign in with Google or follow a
          password-reset link, so we know where to take you afterwards.
        </li>
        <li>
          <strong>A notice preference</strong> (<code>mb_cookie_notice</code>,
          stored in your browser) remembers that you have seen this cookie
          notice, so we do not show it again.
        </li>
      </ul>
      <p>
        These are &ldquo;strictly necessary&rdquo;: without them you could not
        sign in or book, so they do not need a separate opt-in.
      </p>

      <h2>Other companies&apos; cookies</h2>
      <ul>
        <li>
          If you choose <strong>Continue with Google</strong>, Google sets its
          own cookies on its sign-in page, under Google&apos;s policies.
        </li>
        <li>
          When you pay, you are taken to <strong>PayMongo</strong>&apos;s secure
          page, which uses its own cookies to process the payment. We never see
          or store your card details.
        </li>
        <li>
          Property maps load tiles from <strong>OpenStreetMap</strong>, which
          can see your IP address like any website you visit.
        </li>
      </ul>

      <h2>Your choices</h2>
      <p>
        You can delete or block cookies in your browser settings. If you block
        the sign-in cookies, MyBalai will not be able to keep you signed in. To
        see how we handle your personal information more generally, read our{' '}
        <Link href="/privacy">Privacy Policy</Link>; the rules for using the
        service are in our <Link href="/terms">Terms of Service</Link>.
      </p>

      <h2>Changes and contact</h2>
      <p>
        If we ever add cookies that are not strictly necessary (for example
        analytics), we will update this page and ask for your consent first.
        Questions: mybalaiofficial@gmail.com.
      </p>
    </LegalPage>
  )
}
