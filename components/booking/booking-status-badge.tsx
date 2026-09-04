import { Badge } from '@/components/ui/badge'

const TONE: Record<
  string,
  'default' | 'secondary' | 'destructive' | 'outline'
> = {
  pending: 'secondary',
  payment_pending: 'secondary',
  confirmed: 'default',
  checked_in: 'default',
  checked_out: 'outline',
  cancelled: 'outline',
  rejected: 'destructive',
  expired: 'destructive',
}

export function BookingStatusBadge({
  code,
  name,
}: {
  code: string | null
  name: string | null
}) {
  return (
    <Badge variant={TONE[code ?? ''] ?? 'outline'}>
      {name ?? code ?? 'Unknown'}
    </Badge>
  )
}
