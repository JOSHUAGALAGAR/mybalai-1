import type { Metadata } from 'next'
import Image from 'next/image'
import Link from 'next/link'
import {
  Building2,
  CalendarCheck,
  CreditCard,
  MessagesSquare,
  ShieldCheck,
  Users,
  Search,
  BedDouble,
  ClipboardList,
  Wallet,
  Star,
  ArrowRight,
  Download,
  Smartphone,
  Signal,
  Wifi,
  BatteryFull,
} from 'lucide-react'

import { FeaturedProperties } from '@/components/marketing/featured-properties'
import { SiteFooter } from '@/components/marketing/site-footer'
import { SiteHeader } from '@/components/marketing/site-header'
import { formatMegabytes, getAndroidApp } from '@/lib/android-app'
import { getAuthUser } from '@/lib/auth/dal'
import { getFeaturedProperties } from '@/services/featured.service'
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

export const metadata: Metadata = {
  title: 'MyBalai — Property & Rental Management',
  description:
    'List properties, manage rooms and beds, take bookings and payments, and message tenants — MyBalai brings the rental lifecycle into one platform.',
}

const STEPS = [
  {
    icon: Search,
    title: 'Discover',
    body: 'Tenants browse and filter verified properties, then view rooms, beds, rates, and house rules.',
  },
  {
    icon: CalendarCheck,
    title: 'Book',
    body: 'A guided request captures dates and unit. Landlords and caretakers review and confirm.',
  },
  {
    icon: CreditCard,
    title: 'Pay',
    body: 'Tenants submit payments and receipts. Verification is done server-side by the landlord.',
  },
  {
    icon: ClipboardList,
    title: 'Operate',
    body: 'Track occupancy, extensions, messages, and reviews from a single dashboard.',
  },
]

const TENANT_FEATURES = [
  'Search and filter properties by location, type, and availability',
  'View rooms, beds, rates, amenities, and policies before booking',
  'Submit booking requests and track their status',
  'Upload payment receipts and follow payment history',
  'Message landlords and caretakers, and leave reviews',
]

const LANDLORD_FEATURES = [
  'Manage properties, rooms, beds, and rental rates',
  'Review, approve, or reject booking requests',
  'Verify tenant payments and add payment notes',
  'Create and assign caretakers to specific properties',
  'See occupancy, bookings, and payment status at a glance',
]

const CARETAKER_FEATURES = [
  'Access only the properties a landlord assigns',
  'Update room and bed operational status',
  'Assist with bookings and handle assigned inquiries',
  'Message tenants for assigned properties',
]

const FEATURES = [
  {
    icon: Building2,
    title: 'Property & inventory',
    body: 'Properties, rooms, and beds modelled as real inventory with per-unit status.',
  },
  {
    icon: BedDouble,
    title: 'Bookings & extensions',
    body: 'Status history, rate snapshots, and database-enforced double-booking protection.',
  },
  {
    icon: CreditCard,
    title: 'Payments & receipts',
    body: 'Separate payment records, statuses, and receipt files with server-side verification.',
  },
  {
    icon: MessagesSquare,
    title: 'Messaging & inquiries',
    body: 'Direct tenant–landlord–caretaker messaging and property inquiries, updated in realtime.',
  },
  {
    icon: Star,
    title: 'Ratings & reviews',
    body: 'Tenants rate properties on a 1–5 scale with optional written reviews.',
  },
  {
    icon: Wallet,
    title: 'Wallets & boosts',
    body: 'Landlord wallets and boosted listings, with exact monetary handling.',
  },
]

const BOOKING_FLOW = [
  'Property',
  'Room',
  'Bed',
  'Rental period',
  'Details',
  'Review',
  'Submit',
]

const FAQ = [
  {
    q: 'Who is MyBalai for?',
    a: 'Tenants looking for a place to rent, landlords managing one or more properties, and caretakers who handle day-to-day operations for a landlord.',
  },
  {
    q: 'How do I sign up?',
    a: 'Tenants can create an account directly with email and password or with Google. Landlord and caretaker accounts are provisioned — caretakers are created by a landlord.',
  },
  {
    q: 'How are payments handled?',
    a: 'Tenants record payments and upload receipts. A landlord (or an authorised caretaker) verifies each payment on the server. The platform never marks a payment as verified automatically from the browser.',
  },
  {
    q: 'Does MyBalai prevent double-booking?',
    a: 'Yes. Conflicting active bookings for the same bed are rejected by the database itself, not just by the UI.',
  },
  {
    q: 'Can a caretaker see every property?',
    a: 'No. A caretaker only sees the properties a landlord has explicitly assigned to them.',
  },
]

function Section({
  id,
  className,
  children,
}: {
  id?: string
  className?: string
  children: React.ReactNode
}) {
  return (
    <section
      id={id}
      className={`mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-20 ${className ?? ''}`}
    >
      {children}
    </section>
  )
}

function FeatureList({ items }: { items: string[] }) {
  return (
    <ul className="space-y-3">
      {items.map((item) => (
        <li key={item} className="flex gap-3 text-sm text-muted-foreground">
          <ArrowRight className="mt-0.5 size-4 shrink-0 text-primary" />
          <span>{item}</span>
        </li>
      ))}
    </ul>
  )
}

export default async function LandingPage() {
  // Light JWT check only (no DB) — the app entry point forwards to the right
  // role home via route guards.
  const [authUser, featured, androidApp] = await Promise.all([
    getAuthUser(),
    getFeaturedProperties(),
    getAndroidApp(),
  ])

  return (
    <div className="flex min-h-dvh flex-col">
      <SiteHeader homeHref={authUser ? '/dashboard' : null} />

      <main className="flex-1">
        {/* Hero */}
        <div className="relative overflow-hidden bg-linear-to-b from-hero-top to-background">
          <div aria-hidden className="pointer-events-none absolute inset-0">
            <div className="absolute -top-24 -right-20 size-96 rounded-full bg-brand/10" />
            <div className="absolute top-24 right-1/3 size-32 rounded-full border-2 border-brand/20" />
            <div className="absolute -bottom-16 -left-16 size-72 rounded-full bg-brand/5" />
          </div>
          <Section className="relative pt-16! sm:pt-24!">
            <div className="grid items-center gap-12 lg:grid-cols-[1.05fr_0.95fr]">
              <div>
                <Badge variant="secondary" className="mb-4">
                  Property & rental management
                </Badge>
                <h1 className="text-4xl font-extrabold tracking-tight text-balance text-foreground sm:text-6xl">
                  Run the whole rental lifecycle in one place
                </h1>
                <p className="mt-4 max-w-xl text-lg text-muted-foreground">
                  MyBalai connects tenants, landlords, and caretakers — property
                  listings, rooms and beds, bookings, payments, and messaging,
                  without spreadsheets and group chats.
                </p>
                <div className="mt-8 flex flex-wrap gap-3">
                  <Button asChild size="lg" className="px-8">
                    <Link href="/signup">Get started as a tenant</Link>
                  </Button>
                  <Button asChild size="lg" variant="outline">
                    <Link href="/apply">
                      I&apos;m a landlord — list my property
                    </Link>
                  </Button>
                </div>
                <p className="mt-4 text-xs text-muted-foreground">
                  Free tenant account. No credit card required.
                </p>

                <div className="mt-8 rounded-2xl border border-border bg-card/70 p-4 backdrop-blur-sm sm:max-w-md">
                  <p className="flex items-center gap-2 text-sm font-semibold text-foreground">
                    <Smartphone className="size-4 text-primary" />
                    Get the MyBalai app
                  </p>
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    {androidApp ? (
                      <Button asChild>
                        <a href="/download/android" download>
                          <Download />
                          Download for Android
                        </a>
                      </Button>
                    ) : (
                      <Button disabled>Android app — coming soon</Button>
                    )}
                    <Badge variant="outline" className="px-3 py-1.5">
                      App Store · Coming soon
                    </Badge>
                  </div>
                  {androidApp ? (
                    <p className="mt-3 text-xs text-muted-foreground">
                      Android APK · {formatMegabytes(androidApp.bytes)}. After
                      downloading, open the file and allow installs from your
                      browser if Android asks.
                    </p>
                  ) : null}
                </div>
              </div>

              <PhoneMockup />
            </div>
          </Section>
        </div>

        {/* Trust strip */}
        <div className="border-y border-border bg-muted/30">
          <Section className="py-10!">
            <div className="grid gap-6 sm:grid-cols-3">
              <ValueProp
                icon={ShieldCheck}
                title="Server-enforced rules"
                body="Authorization and booking conflicts are enforced in the database, not just the UI."
              />
              <ValueProp
                icon={Users}
                title="Role-aware by design"
                body="Tenant, landlord, caretaker, and superadmin each see only what they should."
              />
              <ValueProp
                icon={CalendarCheck}
                title="One operational view"
                body="Occupancy, bookings, payments, and messages in a single dashboard."
              />
            </div>
          </Section>
        </div>

        {/* Featured properties */}
        <FeaturedProperties items={featured} />

        {/* How it works */}
        <Section id="how-it-works">
          <SectionHeading
            eyebrow="How it works"
            title="From discovery to check-out"
            body="A clear path for every booking, with the same stages for tenants and property teams."
          />
          <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {STEPS.map((step, index) => (
              <Card key={step.title} className="h-full">
                <CardHeader>
                  <div className="flex items-center gap-2">
                    <span className="inline-flex size-9 items-center justify-center rounded-xl bg-accent text-primary">
                      <step.icon className="size-4" />
                    </span>
                    <span className="text-xs font-medium text-muted-foreground">
                      Step {index + 1}
                    </span>
                  </div>
                  <CardTitle className="mt-2 text-base">{step.title}</CardTitle>
                </CardHeader>
                <CardContent className="text-sm text-muted-foreground">
                  {step.body}
                </CardContent>
              </Card>
            ))}
          </div>
        </Section>

        {/* For tenants */}
        <div className="border-t border-border bg-muted/30">
          <Section id="for-tenants">
            <div className="grid gap-10 lg:grid-cols-2 lg:items-center">
              <div>
                <SectionHeading
                  eyebrow="For tenants"
                  title="Find a place, book it, and keep track"
                  body="A consumer-grade rental experience — not an admin panel."
                  align="left"
                />
                <div className="mt-6">
                  <FeatureList items={TENANT_FEATURES} />
                </div>
                <Button asChild className="mt-8">
                  <Link href="/signup">Create a tenant account</Link>
                </Button>
              </div>
              <DiscoveryPreview />
            </div>
          </Section>
        </div>

        {/* For landlords */}
        <Section id="for-landlords">
          <div className="grid gap-10 lg:grid-cols-2 lg:items-center">
            <DashboardPreview />
            <div>
              <SectionHeading
                eyebrow="For landlords"
                title="Manage your portfolio and your team"
                body="Own your properties end to end, and delegate operations to caretakers you control."
                align="left"
              />
              <div className="mt-6">
                <FeatureList items={LANDLORD_FEATURES} />
              </div>
            </div>
          </div>
        </Section>

        {/* For caretakers */}
        <div className="border-y border-border bg-muted/30">
          <Section>
            <SectionHeading
              eyebrow="For caretakers"
              title="Just the properties you're assigned"
              body="Scoped access through property assignments — never the whole platform."
            />
            <div className="mx-auto mt-8 max-w-2xl">
              <FeatureList items={CARETAKER_FEATURES} />
            </div>
          </Section>
        </div>

        {/* Feature grid */}
        <Section>
          <SectionHeading
            eyebrow="Platform"
            title="Everything the rental lifecycle needs"
            body="Modelled from real operational data, not a generic CRUD template."
          />
          <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map((feature) => (
              <Card key={feature.title} className="h-full">
                <CardHeader>
                  <span className="inline-flex size-9 items-center justify-center rounded-md bg-muted text-muted-foreground">
                    <feature.icon className="size-4" />
                  </span>
                  <CardTitle className="mt-3 text-base">
                    {feature.title}
                  </CardTitle>
                </CardHeader>
                <CardContent className="text-sm text-muted-foreground">
                  {feature.body}
                </CardContent>
              </Card>
            ))}
          </div>
        </Section>

        {/* Booking flow preview */}
        <div className="border-t border-border bg-muted/30">
          <Section>
            <SectionHeading
              eyebrow="Booking flow"
              title="A guided request, not one giant form"
              body="Each step is small and reviewable, with a summary before anything is submitted."
            />
            <ol className="mt-10 flex flex-wrap items-center justify-center gap-2 text-sm">
              {BOOKING_FLOW.map((label, index) => (
                <li key={label} className="flex items-center gap-2">
                  <span className="rounded-full border border-border bg-background px-3 py-1.5 text-muted-foreground">
                    <span className="mr-1.5 text-xs font-medium text-primary">
                      {index + 1}
                    </span>
                    {label}
                  </span>
                  {index < BOOKING_FLOW.length - 1 && (
                    <ArrowRight className="size-4 text-muted-foreground" />
                  )}
                </li>
              ))}
            </ol>
          </Section>
        </div>

        {/* Landlord CTA */}
        <Section>
          <Card className="overflow-hidden">
            <CardContent className="flex flex-col items-start gap-4 p-8 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h3 className="text-lg font-semibold text-foreground">
                  Managing properties on MyBalai
                </h3>
                <p className="mt-1 max-w-xl text-sm text-muted-foreground">
                  Listing is free. Apply and our team sets up your landlord
                  account, and we only take a small fee (1.5%) on payments
                  completed through the platform. Optionally boost a property to
                  be shown first.
                </p>
              </div>
              <Button asChild size="lg">
                <Link href="/apply">List your property</Link>
              </Button>
            </CardContent>
          </Card>
        </Section>

        {/* FAQ */}
        <div className="border-t border-border bg-muted/30">
          <Section id="faq">
            <SectionHeading eyebrow="FAQ" title="Common questions" />
            <div className="mx-auto mt-8 max-w-2xl">
              <Accordion type="single" collapsible className="w-full">
                {FAQ.map((item) => (
                  <AccordionItem key={item.q} value={item.q}>
                    <AccordionTrigger className="text-left text-sm font-medium">
                      {item.q}
                    </AccordionTrigger>
                    <AccordionContent className="text-sm text-muted-foreground">
                      {item.a}
                    </AccordionContent>
                  </AccordionItem>
                ))}
              </Accordion>
            </div>
          </Section>
        </div>

        {/* Final CTA */}
        <Section className="text-center">
          <h2 className="text-3xl font-semibold tracking-tight text-foreground">
            Ready to get started?
          </h2>
          <p className="mx-auto mt-3 max-w-md text-muted-foreground">
            Create a free tenant account, or reach out to list your property for
            free.
          </p>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <Button asChild size="lg">
              <Link href="/signup">Get started</Link>
            </Button>
            <Button asChild size="lg" variant="outline">
              <Link href="/login">Sign in</Link>
            </Button>
          </div>
        </Section>
      </main>

      <SiteFooter />
    </div>
  )
}

function SectionHeading({
  eyebrow,
  title,
  body,
  align = 'center',
}: {
  eyebrow: string
  title: string
  body?: string
  align?: 'center' | 'left'
}) {
  return (
    <div className={align === 'center' ? 'mx-auto max-w-2xl text-center' : ''}>
      <p className="text-sm font-medium text-primary">{eyebrow}</p>
      <h2 className="mt-2 text-3xl font-semibold tracking-tight text-balance text-foreground">
        {title}
      </h2>
      {body && <p className="mt-3 text-muted-foreground">{body}</p>}
    </div>
  )
}

function ValueProp({
  icon: Icon,
  title,
  body,
}: {
  icon: typeof ShieldCheck
  title: string
  body: string
}) {
  return (
    <div className="flex gap-3">
      <span className="inline-flex size-9 shrink-0 items-center justify-center rounded-md bg-background text-muted-foreground">
        <Icon className="size-4" />
      </span>
      <div>
        <p className="text-sm font-medium text-foreground">{title}</p>
        <p className="mt-1 text-sm text-muted-foreground">{body}</p>
      </div>
    </div>
  )
}

/* ---- Decorative product previews (pure CSS, no images) ---- */

/** The MyBalai tenant app in an iPhone-style frame: titanium edge, Dynamic Island, side buttons. */
function PhoneMockup() {
  return (
    <div className="relative mx-auto w-64 sm:w-72 lg:ml-auto">
      <div
        aria-hidden
        className="absolute -inset-8 -z-10 rounded-[4rem] bg-brand/15 blur-3xl"
      />
      {/* side buttons: action + volume on the left, power on the right */}
      <span
        aria-hidden
        className="absolute top-[13%] -left-[3px] h-6 w-[3px] rounded-l-sm bg-zinc-400"
      />
      <span
        aria-hidden
        className="absolute top-[20%] -left-[3px] h-11 w-[3px] rounded-l-sm bg-zinc-400"
      />
      <span
        aria-hidden
        className="absolute top-[28.5%] -left-[3px] h-11 w-[3px] rounded-l-sm bg-zinc-400"
      />
      <span
        aria-hidden
        className="absolute top-[24%] -right-[3px] h-16 w-[3px] rounded-r-sm bg-zinc-400"
      />

      {/* titanium band, then the black bezel */}
      <div className="rounded-[3rem] bg-linear-to-br from-zinc-300 via-zinc-500 to-zinc-300 p-[3px] shadow-2xl shadow-brand/25">
        <div className="rounded-[2.85rem] bg-black p-[9px]">
          <div className="relative overflow-hidden rounded-[2.35rem] bg-white">
            {/* status bar with the Dynamic Island */}
            <div
              aria-hidden
              className="relative flex h-11 items-end justify-between bg-white px-7 pb-1 text-[11px] font-semibold text-black"
            >
              <span>9:41</span>
              <span className="absolute top-2.5 left-1/2 h-[22px] w-[76px] -translate-x-1/2 rounded-full bg-black" />
              <span className="flex items-center gap-1">
                <Signal className="size-3" strokeWidth={2.5} />
                <Wifi className="size-3" strokeWidth={2.5} />
                <BatteryFull className="size-4" strokeWidth={2} />
              </span>
            </div>
            <Image
              src="/app-preview.jpg"
              alt="The MyBalai app: a tenant's home screen with a matched boarding house, its price and why it fits."
              width={720}
              height={1472}
              priority
              sizes="(min-width: 640px) 288px, 256px"
              className="block h-auto w-full"
            />
            {/* home indicator */}
            <div
              aria-hidden
              className="flex h-5 items-center justify-center bg-white"
            >
              <span className="h-1 w-24 rounded-full bg-black/85" />
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

function DiscoveryPreview() {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {[
        { name: 'Sunrise Dorm', meta: 'Bed space · from ₱3,500/mo' },
        { name: 'Bayview Apartments', meta: 'Private room · from ₱8,000/mo' },
        { name: 'Hillside Rooms', meta: 'Bed space · from ₱2,800/mo' },
        { name: 'Garden Residences', meta: 'Studio · from ₱12,000/mo' },
      ].map((property) => (
        <div
          key={property.name}
          className="rounded-lg border border-border bg-card p-4"
        >
          <div className="mb-3 h-20 rounded-md bg-muted" />
          <p className="text-sm font-medium text-foreground">{property.name}</p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {property.meta}
          </p>
        </div>
      ))}
    </div>
  )
}

function DashboardPreview() {
  return (
    <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
      <p className="text-sm font-medium text-foreground">Bookings</p>
      <div className="mt-3 space-y-2">
        {[
          ['Room 2B', 'Sunrise Dorm', 'Pending review'],
          ['Unit 5', 'Bayview Apartments', 'Confirmed'],
          ['Bed 3', 'Hillside Rooms', 'Payment submitted'],
          ['Studio A', 'Garden Residences', 'Checked out'],
        ].map(([unit, prop, status]) => (
          <div
            key={`${prop}-${unit}`}
            className="flex items-center justify-between rounded-lg border border-border bg-background px-3 py-2 text-sm"
          >
            <span className="text-foreground">
              {unit} <span className="text-muted-foreground">· {prop}</span>
            </span>
            <span className="text-xs text-muted-foreground">{status}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
