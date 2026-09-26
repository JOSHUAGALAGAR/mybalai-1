import type { Metadata } from 'next'

import { ApplyForm } from '@/components/marketing/apply-form'

export const metadata: Metadata = {
  title: 'List your property',
  description:
    'Apply to list your boarding house, dorm or apartment on MyBalai. Listing is free.',
}

export default function ApplyPage() {
  return <ApplyForm />
}
