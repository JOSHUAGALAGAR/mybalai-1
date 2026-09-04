import { Skeleton } from '@/components/ui/skeleton'

export default function DiscoverLoading() {
  return (
    <div className="space-y-6">
      <Skeleton className="h-8 w-40" />
      <div className="lg:grid lg:grid-cols-[260px_1fr] lg:gap-8">
        <Skeleton className="hidden h-96 lg:block" />
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-64 rounded-lg" />
          ))}
        </div>
      </div>
    </div>
  )
}
