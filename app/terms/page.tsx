import type { Metadata } from 'next'

import { LegalPage } from '@/components/legal/legal-page'

export const metadata: Metadata = { title: 'Terms of Service' }

export default function TermsPage() {
  return (
    <LegalPage title="Terms of Service" updated="26 September 2026">
      <p>
        These terms cover your use of MyBalai (the website and the mobile app)
        run by Joshua Tuyor (&ldquo;we&rdquo;). By creating an account or using
        MyBalai you agree to them.
      </p>

      <h2>What MyBalai is</h2>
      <p>
        MyBalai is a marketplace that connects people looking for a place to
        stay (&ldquo;tenants&rdquo;) with owners of boarding houses, dormitories
        and similar rentals (&ldquo;landlords&rdquo;). We provide the platform;
        the rental itself is an agreement between the tenant and the landlord.
        We do not own, manage or guarantee any listed property.
      </p>

      <h2>Your account</h2>
      <ul>
        <li>You must give accurate details and keep your password secret.</li>
        <li>You are responsible for what happens under your account.</li>
        <li>
          Tenant accounts can be created by anyone. Landlord and caretaker
          accounts are set up by us or, for caretakers, by a landlord.
        </li>
        <li>
          We may suspend an account that breaks these terms or misuses the
          service.
        </li>
      </ul>

      <h2>Bookings and payments</h2>
      <ul>
        <li>
          A booking request is not confirmed until the landlord approves it and
          the payment is verified.
        </li>
        <li>
          After a landlord approves a request you have a limited time to pay; if
          you do not, the booking expires and the bed is released.
        </li>
        <li>
          Online payments are processed by our payment provider (PayMongo). We
          do not store your card details.
        </li>
        <li>
          Cancellation and refund rules are set by the landlord&apos;s booking
          policy shown on the property page. If a booking is cancelled or
          rejected after you have paid, MyBalai can return the payment through
          our payment provider (PayMongo); the amount follows that policy.
        </li>
      </ul>

      <h2>Reviews and messages</h2>
      <p>
        Reviews and messages must be honest and respectful. Do not post anything
        unlawful, misleading or abusive. We may remove content that breaks this
        rule.
      </p>

      <h2>Acceptable use</h2>
      <ul>
        <li>No fake listings, fake bookings or attempts to defraud others.</li>
        <li>No attempts to break, overload or reverse-engineer the service.</li>
        <li>
          No using other people&apos;s personal data for anything unrelated to a
          booking.
        </li>
      </ul>

      <h2>Liability</h2>
      <p>
        MyBalai is provided &ldquo;as is&rdquo;. To the extent the law allows,
        we are not liable for disputes between tenants and landlords, the
        condition of a property, or losses from service interruptions. These
        terms are governed by the laws of the Republic of the Philippines.
      </p>

      <h2>Changes and contact</h2>
      <p>
        We may update these terms; continuing to use MyBalai after a change
        means you accept it. Questions: mybalaiofficial@gmail.com.
      </p>
    </LegalPage>
  )
}
