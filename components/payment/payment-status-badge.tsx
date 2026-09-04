import { Badge } from '@/components/ui/badge'

const TONE: Record<
  string,
  'default' | 'secondary' | 'destructive' | 'outline'
> = {
  pending: 'secondary',
  paid: 'default',
  unpaid: 'outline',
  rejected: 'destructive',
  refunded: 'outline',
  cancelled: 'outline',
}

export function PaymentStatusBadge({
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
