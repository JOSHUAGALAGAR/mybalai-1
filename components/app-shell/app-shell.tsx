'use client'

import { useState } from 'react'
import Link from 'next/link'
import { PanelLeftClose, PanelLeftOpen, Menu } from 'lucide-react'

import { NotificationBell } from '@/components/app-shell/notification-bell'
import { SidebarNav } from '@/components/app-shell/sidebar-nav'
import { UserMenu, type UserMenuUser } from '@/components/app-shell/user-menu'
import { Button } from '@/components/ui/button'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet'
import type { AppRole } from '@/lib/auth/roles'
import { navForRoles } from '@/lib/navigation/nav-config'
import { cn } from '@/lib/utils'

export const SIDEBAR_COOKIE = 'mybalai_sidebar_collapsed'

export function AppShell({
  roles,
  user,
  defaultCollapsed = false,
  unreadCount = 0,
  legacyUserId,
  children,
}: {
  roles: AppRole[]
  user: UserMenuUser
  defaultCollapsed?: boolean
  unreadCount?: number
  legacyUserId: number
  children: React.ReactNode
}) {
  const sections = navForRoles(roles)
  const [collapsed, setCollapsed] = useState(defaultCollapsed)
  const [mobileOpen, setMobileOpen] = useState(false)

  function toggleCollapsed() {
    setCollapsed((value) => {
      const next = !value
      try {
        document.cookie = `${SIDEBAR_COOKIE}=${next ? '1' : '0'}; path=/; max-age=31536000; samesite=lax`
      } catch {
        /* ignore */
      }
      return next
    })
  }

  return (
    <div className="flex min-h-dvh flex-col bg-muted/20">
      {/* Top bar */}
      <header className="sticky top-0 z-30 flex h-14 items-center gap-2 border-b border-border bg-background px-3 sm:px-4">
        {/* Mobile nav trigger */}
        <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
          <SheetTrigger asChild>
            <Button
              variant="ghost"
              size="icon-sm"
              className="lg:hidden"
              aria-label="Open navigation"
            >
              <Menu className="size-5" />
            </Button>
          </SheetTrigger>
          <SheetContent side="left" className="w-72 p-0">
            <SheetHeader className="border-b border-border">
              <SheetTitle className="text-left">MyBalai</SheetTitle>
            </SheetHeader>
            <div className="overflow-y-auto px-3">
              <SidebarNav
                sections={sections}
                onNavigate={() => setMobileOpen(false)}
              />
            </div>
          </SheetContent>
        </Sheet>

        {/* Desktop collapse toggle */}
        <Button
          variant="ghost"
          size="icon-sm"
          className="hidden lg:inline-flex"
          onClick={toggleCollapsed}
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          {collapsed ? (
            <PanelLeftOpen className="size-5" />
          ) : (
            <PanelLeftClose className="size-5" />
          )}
        </Button>

        <Link href="/" className="font-semibold tracking-tight text-foreground">
          MyBalai
        </Link>

        <div className="ml-auto flex items-center gap-1">
          <NotificationBell initialUnread={unreadCount} userId={legacyUserId} />
          <UserMenu user={user} />
        </div>
      </header>

      <div className="flex flex-1">
        {/* Desktop sidebar */}
        <aside
          className={cn(
            'hidden shrink-0 border-r border-border bg-background px-3 lg:block',
            collapsed ? 'w-16' : 'w-60',
          )}
        >
          <div className="sticky top-14">
            <SidebarNav sections={sections} collapsed={collapsed} />
          </div>
        </aside>

        <main className="min-w-0 flex-1 px-4 py-6 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-5xl">{children}</div>
        </main>
      </div>
    </div>
  )
}
