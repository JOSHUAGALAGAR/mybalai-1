'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

import type { NavSection } from '@/lib/navigation/nav-config'
import { cn } from '@/lib/utils'

function isActive(
  pathname: string,
  href: string,
  match: 'exact' | 'startsWith' = 'exact',
) {
  if (match === 'startsWith') {
    return pathname === href || pathname.startsWith(`${href}/`)
  }
  return pathname === href
}

export function SidebarNav({
  sections,
  collapsed = false,
  onNavigate,
}: {
  sections: NavSection[]
  collapsed?: boolean
  onNavigate?: () => void
}) {
  const pathname = usePathname()

  return (
    <nav className="flex flex-col gap-4 py-2">
      {sections.map((section, index) => (
        <div key={section.label ?? index} className="flex flex-col gap-1">
          {section.label && !collapsed && (
            <p className="px-3 pb-1 text-xs font-medium tracking-wide text-muted-foreground uppercase">
              {section.label}
            </p>
          )}
          {section.items.map((item) => {
            const active = isActive(pathname, item.href, item.match)
            const Icon = item.icon

            if (item.soon) {
              return (
                <span
                  key={item.href}
                  aria-disabled
                  title="Coming soon"
                  className={cn(
                    'flex items-center gap-3 rounded-md px-3 py-2 text-sm text-muted-foreground/60',
                    collapsed && 'justify-center',
                  )}
                >
                  <Icon className="size-4 shrink-0" />
                  {!collapsed && (
                    <span className="flex-1 truncate">{item.label}</span>
                  )}
                  {!collapsed && (
                    <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
                      Soon
                    </span>
                  )}
                </span>
              )
            }

            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={onNavigate}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors',
                  collapsed && 'justify-center',
                  active
                    ? 'bg-muted font-medium text-foreground'
                    : 'text-muted-foreground hover:bg-muted hover:text-foreground',
                )}
              >
                <Icon className="size-4 shrink-0" />
                {!collapsed && (
                  <span className="flex-1 truncate">{item.label}</span>
                )}
              </Link>
            )
          })}
        </div>
      ))}
    </nav>
  )
}
