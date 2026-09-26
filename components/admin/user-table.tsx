import Link from 'next/link'

import { UserResetPassword } from '@/components/admin/user-reset-password'
import { Badge } from '@/components/ui/badge'
import { EmptyState } from '@/components/ui/empty-state'
import type { AdminUserRow } from '@/repositories/admin.repository'

export function UserTable({
  users,
  currentUserId,
}: {
  users: AdminUserRow[]
  /** The signed-in admin: their own row has no reset (they change it under Settings). */
  currentUserId?: number
}) {
  if (users.length === 0) {
    return (
      <EmptyState title="No users" description="Nothing matches this search." />
    )
  }

  return (
    <div className="overflow-x-auto rounded-lg border border-border">
      <table className="w-full min-w-[760px] text-sm">
        <thead className="bg-muted/50 text-left text-xs text-muted-foreground">
          <tr>
            <th className="px-3 py-2 font-medium">User</th>
            <th className="px-3 py-2 font-medium">Roles</th>
            <th className="px-3 py-2 font-medium">Status</th>
            <th className="px-3 py-2 font-medium">Joined</th>
            <th className="px-3 py-2 font-medium">
              <span className="sr-only">Actions</span>
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {users.map((u) => (
            <tr key={u.legacyUserId} className="hover:bg-muted/30">
              <td className="px-3 py-2">
                <Link
                  href={`/admin/users/${u.legacyUserId}`}
                  className="font-medium text-foreground underline-offset-2 hover:underline"
                >
                  {u.fullName ?? `User #${u.legacyUserId}`}
                </Link>
                <span className="block text-xs text-muted-foreground">
                  {u.email}
                </span>
              </td>
              <td className="px-3 py-2">
                <span className="flex flex-wrap gap-1">
                  {u.roles.length === 0 ? (
                    <span className="text-xs text-muted-foreground">none</span>
                  ) : (
                    u.roles.map((r) => (
                      <Badge key={r} variant="outline" className="capitalize">
                        {r}
                      </Badge>
                    ))
                  )}
                </span>
              </td>
              <td className="px-3 py-2">
                <span className="flex flex-wrap gap-1">
                  {u.isActive ? (
                    <Badge variant="secondary">Active</Badge>
                  ) : (
                    <Badge variant="destructive">Deactivated</Badge>
                  )}
                  {u.idVerifiedAt && (
                    <Badge variant="default">ID verified</Badge>
                  )}
                </span>
              </td>
              <td className="px-3 py-2 text-muted-foreground">
                {new Date(u.createdAt).toLocaleDateString()}
              </td>
              <td className="px-3 py-2 text-right">
                {u.roles.includes('superadmin') ||
                u.legacyUserId === currentUserId ? null : (
                  <UserResetPassword
                    userId={u.legacyUserId}
                    name={u.fullName ?? u.email ?? `user #${u.legacyUserId}`}
                  />
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
