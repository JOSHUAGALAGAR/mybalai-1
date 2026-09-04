import { Badge } from '@/components/ui/badge'

const TONE: Record<
  string,
  'default' | 'secondary' | 'destructive' | 'outline'
> = {
  new: 'secondary',
  read: 'default',
  closed: 'outline',
}
const LABEL: Record<string, string> = {
  new: 'New',
  read: 'Read',
  closed: 'Closed',
}

export function InquiryStatusBadge({ status }: { status: string }) {
  return (
    <Badge variant={TONE[status] ?? 'outline'}>{LABEL[status] ?? status}</Badge>
  )
}
