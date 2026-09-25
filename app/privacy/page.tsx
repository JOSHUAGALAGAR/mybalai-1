import type { Metadata } from 'next'

import Link from 'next/link'

import { LegalPage } from '@/components/legal/legal-page'

export const metadata: Metadata = { title: 'Privacy Policy' }

export default function PrivacyPage() {
  return (
    <LegalPage title="Privacy Policy" updated="[date]">
      <p>
        This explains what personal data MyBalai (run by{' '}
        <mark>[company / owner name]</mark>) collects, why, and your choices. It
        applies to the website and the mobile app.
      </p>

      <h2>What we collect</h2>
      <ul>
        <li>
          <strong>Account details:</strong> your name and email, and optionally
          your phone number and address. If you sign in with Google we receive
          your name and email from Google — nothing else.
        </li>
        <li>
          <strong>Booking activity:</strong> the places you view and book,
          dates, messages to landlords, inquiries, reviews and payment status.
        </li>
        <li>
          <strong>Payments:</strong> handled by PayMongo. We receive the status
          and amount, not your full card number.
        </li>
        <li>
          <strong>On your device:</strong> the app stores your login session,
          your saved places and a cached copy of your profile so it opens
          quickly. Signing out clears the session and profile cache.
        </li>
      </ul>

      <h2>How we use it</h2>
      <ul>
        <li>
          To run your account, process bookings and payments, and send booking
          notifications.
        </li>
        <li>
          To show landlords the details they need to consider your request.
        </li>
        <li>To keep the service secure and prevent fraud.</li>
      </ul>
      <p>We do not sell your personal data.</p>

      <h2>Who can see it</h2>
      <ul>
        <li>
          <strong>Landlords</strong> (and their assigned caretakers) see your
          name, contact details, messages and booking details for their own
          properties only.
        </li>
        <li>
          <strong>Service providers</strong> that run MyBalai for us: Supabase
          (database and login), PayMongo (payments), Google (sign-in if you
          choose it) and our hosting provider <mark>[hosting provider]</mark>.
        </li>
        <li>Authorities, when the law requires it.</li>
      </ul>

      <h2>Your choices</h2>
      <ul>
        <li>
          Edit your name, phone and address any time in Profile → Edit profile.
        </li>
        <li>
          Delete your account yourself in the app (Profile → Delete account for
          tenants, More → Delete account for landlords), or see{' '}
          <Link href="/delete-account">how account deletion works</Link>.
        </li>
        <li>
          Ask us to export or delete your account and data at{' '}
          <mark>[privacy email]</mark>. We may keep records we are legally
          required to keep, such as payment records.
        </li>
        <li>
          Under the Philippine Data Privacy Act you also have the right to be
          informed, to access, correct and object.{' '}
          <mark>[name your Data Protection Officer / contact]</mark>
        </li>
      </ul>

      <h2>Keeping it safe</h2>
      <p>
        Data is transmitted over HTTPS and stored with access controls. No
        system is perfectly secure; please use a strong, unique password.
      </p>

      <h2>Retention, children and changes</h2>
      <p>
        We keep data while your account is active and as long as needed for the
        purposes above. MyBalai is not for people under 18{' '}
        <mark>[confirm minimum age]</mark>. We will post any changes to this
        policy here. Contact: <mark>[privacy email]</mark>.
      </p>
    </LegalPage>
  )
}
