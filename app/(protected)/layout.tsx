import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'

import { logout } from '@/app/(auth)/actions'
import { AppShell, SIDEBAR_COOKIE } from '@/components/app-shell/app-shell'
import { Button } from '@/components/ui/button'
import { getAuthUser, getCurrentUser } from '@/lib/auth/dal'
import { ROLE_LABELS, primaryRole } from '@/lib/auth/roles'
import { getUnreadCount } from '@/services/notifications.service'

export default async function ProtectedLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const [authUser, user] = await Promise.all([getAuthUser(), getCurrentUser()])

  // Auth session exists but the legacy account row is missing — the
  // `handle_new_user` trigger (migration 0003) has not run.
  if (authUser && !user) {
    return (
      <div className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center gap-4 px-4 text-center">
        <h1 className="text-lg font-semibold text-foreground">
          Account setup incomplete
        </h1>
        <p className="text-sm text-muted-foreground">
          Your sign-in worked, but your MyBalai profile has not been created
          yet. This usually means the database provisioning step is still
          pending. Sign out and try again, or contact an administrator.
        </p>
        <form action={logout}>
          <Button type="submit" variant="secondary">
            Sign out
          </Button>
        </form>
      </div>
    )
  }

  if (!user) {
    // No session at all. `proxy.ts` normally handles this; belt and braces.
    redirect('/login')
  }

  const [collapsed, unreadCount] = await Promise.all([
    cookies().then((c) => c.get(SIDEBAR_COOKIE)?.value === '1'),
    getUnreadCount().catch(() => 0),
  ])

  return (
    <AppShell
      roles={user.roles}
      defaultCollapsed={collapsed}
      unreadCount={unreadCount}
      legacyUserId={user.legacyUserId}
      user={{
        fullName: user.fullName,
        email: user.email,
        roleLabel: ROLE_LABELS[primaryRole(user.roles)],
      }}
    >
      {children}
    </AppShell>
  )
}
