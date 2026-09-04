import { Badge } from '@/components/ui/badge'

const TONE: Record<
  string,
  'default' | 'secondary' | 'destructive' | 'outline'
> = {
  pending: 'secondary',
  approved: 'default',
  rejected: 'destructive',
  cancelled: 'outline',
}

const LABEL: Record<string, string> = {
  pending: 'Pending',
  approved: 'Approved',
  rejected: 'Rejected',
  cancelled: 'Cancelled',
}

export function ExtensionStatusBadge({ status }: { status: string }) {
  return (
    <Badge variant={TONE[status] ?? 'outline'}>{LABEL[status] ?? status}</Badge>
  )
}
