import { Badge } from '@/components/ui/badge'
import type { MyPlan } from '@/services/subscriptions.service'

const TONE: Record<
  string,
  'default' | 'secondary' | 'destructive' | 'outline'
> = {
  active: 'default',
  suspended: 'secondary',
  cancelled: 'destructive',
}

function UsageBar({
  label,
  used,
  max,
}: {
  label: string
  used: number
  max: number
}) {
  const pct = max > 0 ? Math.min(100, Math.round((used / max) * 100)) : 0
  const full = max > 0 && used >= max
  return (
    <div>
      <div className="flex justify-between text-sm">
        <span className="text-foreground">{label}</span>
        <span className={full ? 'text-destructive' : 'text-muted-foreground'}>
          {used} / {max}
        </span>
      </div>
      <div className="mt-1 h-2 overflow-hidden rounded-full bg-muted">
        <div
          className={full ? 'h-full bg-destructive' : 'h-full bg-primary'}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  )
}

export function MyPlanView({ data }: { data: MyPlan }) {
  if (!data.plan) {
    return (
      <div className="rounded-lg border border-dashed border-border bg-muted/20 px-6 py-12 text-center">
        <h3 className="text-sm font-semibold text-foreground">
          No subscription yet
        </h3>
        <p className="mx-auto mt-1 max-w-sm text-sm text-muted-foreground">
          A superadmin needs to assign you a plan before you can list
          properties, add rooms, or create caretakers.
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-card p-4">
        <div>
          <p className="text-lg font-semibold text-foreground">
            {data.plan.name}
          </p>
          <p className="text-xs text-muted-foreground">{data.plan.code}</p>
        </div>
        <div className="text-right">
          {data.status && (
            <Badge variant={TONE[data.status] ?? 'outline'}>
              {data.status}
            </Badge>
          )}
          {!data.isActive && (
            <p className="mt-1 text-xs text-destructive">
              Not active — listing actions are blocked.
            </p>
          )}
          {data.endsAt && (
            <p className="mt-1 text-xs text-muted-foreground">
              Ends {new Date(data.endsAt).toLocaleDateString()}
            </p>
          )}
        </div>
      </div>

      <div className="space-y-4 rounded-lg border border-border bg-card p-4">
        <UsageBar
          label="Properties"
          used={data.usage.properties}
          max={data.plan.maxProperties}
        />
        <UsageBar
          label="Caretakers"
          used={data.usage.caretakers}
          max={data.plan.maxCaretakers}
        />
        <div className="grid gap-1 pt-1 text-sm text-muted-foreground">
          <span>Rooms per property: up to {data.plan.maxRoomsPerProperty}</span>
          <span>Beds per room: up to {data.plan.maxBedsPerRoom}</span>
        </div>
      </div>

      <p className="text-sm text-muted-foreground">
        Need a bigger plan? Contact the platform superadmin.
      </p>
    </div>
  )
}
