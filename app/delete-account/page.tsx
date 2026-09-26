import type { Metadata } from 'next'
import Link from 'next/link'

import { LegalPage } from '@/components/legal/legal-page'

export const metadata: Metadata = { title: 'Delete your account' }

/**
 * Public page (no login) describing how to delete a MyBalai account and what happens to the data.
 * Google Play asks for this address in the Data safety form ("account deletion URL").
 */
export default function DeleteAccountPage() {
  return (
    <LegalPage title="Delete your MyBalai account" updated="26 September 2026">
      <p>
        You can delete your MyBalai account and personal data at any time,
        without contacting us.
      </p>

      <h2>In the app (fastest)</h2>
      <ol>
        <li>
          Open the MyBalai app and sign in. Tenants: <strong>Profile</strong>;
          landlords: <strong>More</strong>.
        </li>
        <li>
          Tap <strong>Delete account</strong>.
        </li>
        <li>
          Enter your password (if you have one) and type <strong>DELETE</strong>
          , then confirm.
        </li>
      </ol>
      <p>
        Your account is closed straight away and you are signed out on every
        device.
      </p>

      <h2>Can&apos;t use the app?</h2>
      <p>
        Email mybalaiofficial@gmail.com from the address on your account and ask
        us to delete it. We reply within 7 days.
      </p>

      <h2>What is deleted</h2>
      <ul>
        <li>
          Your name, email address, phone number, address and profile photo.
        </li>
        <li>
          Your sign-in (Google or password), so you can no longer log in with
          it.
        </li>
        <li>
          The government ID pictures you uploaded for verification, and your
          Verified badge.
        </li>
        <li>
          Messages you sent, inquiries and reviews you wrote, and your
          notifications.
        </li>
        <li>Landlords: your properties are removed from all listings.</li>
      </ul>

      <h2>What we keep</h2>
      <p>
        Booking and payment records are kept without your name (they show a
        &quot;Deleted user&quot;), because we and the landlords you dealt with
        must keep financial records for accounting and legal reasons — for 5
        years. Payments handled by PayMongo are also subject to PayMongo&apos;s
        own records.
      </p>

      <h2>Before you delete</h2>
      <p>
        We can&apos;t delete an account while a booking is still in progress
        (pending, awaiting payment, confirmed or checked in). Cancel it or wait
        until it finishes first. Deleting is permanent and cannot be undone.
      </p>

      <p>
        See also our <Link href="/privacy">Privacy Policy</Link>.
      </p>
    </LegalPage>
  )
}
