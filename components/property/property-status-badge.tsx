import { Badge } from '@/components/ui/badge'

type Tone = 'default' | 'secondary' | 'destructive' | 'outline'

const TONE: Record<string, Tone> = {
  active: 'default',
  available: 'default',
  pending: 'secondary',
  reserved: 'secondary',
  maintenance: 'outline',
  inactive: 'outline',
  occupied: 'secondary',
  archived: 'destructive',
}

export function StatusBadge({
  code,
  label,
}: {
  code: string | null
  label: string | null
}) {
  const text = label ?? code ?? 'Unknown'
  return (
    <Badge variant={TONE[code ?? ''] ?? 'outline'} className="capitalize">
      {text}
    </Badge>
  )
}
