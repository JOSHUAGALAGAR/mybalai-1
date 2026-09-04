import type { Metadata } from 'next'
import { Geist, Geist_Mono } from 'next/font/google'
import './globals.css'

const geistSans = Geist({
  variable: '--font-sans',
  subsets: ['latin'],
})

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
})

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000'

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: 'MyBalai — Property & Rental Management',
    template: '%s · MyBalai',
  },
  description:
    'MyBalai is a property and rental management platform for tenants, landlords, and caretakers — listings, bookings, payments, and messaging in one place.',
  openGraph: {
    type: 'website',
    siteName: 'MyBalai',
    title: 'MyBalai — Property & Rental Management',
    description:
      'Listings, bookings, payments, and messaging for tenants, landlords, and caretakers.',
    url: siteUrl,
  },
  twitter: {
    card: 'summary_large_image',
    title: 'MyBalai — Property & Rental Management',
    description:
      'Listings, bookings, payments, and messaging for tenants, landlords, and caretakers.',
  },
}

export default function RootLayout({ children }: LayoutProps<'/'>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="flex min-h-full flex-col bg-background text-foreground">
        {children}
      </body>
    </html>
  )
}
