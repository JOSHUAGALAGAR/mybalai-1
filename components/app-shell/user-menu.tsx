'use client'

import Link from 'next/link'
import { LogOut, Settings } from 'lucide-react'

import { logout } from '@/app/(auth)/actions'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'

export type UserMenuUser = {
  fullName: string | null
  email: string | null
  roleLabel: string
  avatarUrl?: string | null
}

function initials(user: UserMenuUser): string {
  const source = user.fullName ?? user.email ?? '?'
  return source
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('')
}

export function UserMenu({ user }: { user: UserMenuUser }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className="h-9 gap-2 px-1.5"
          aria-label="Account menu"
        >
          <Avatar className="size-7">
            {user.avatarUrl && (
              <AvatarImage
                src={user.avatarUrl}
                alt=""
                className="object-cover"
              />
            )}
            <AvatarFallback className="text-xs">
              {initials(user)}
            </AvatarFallback>
          </Avatar>
          <span className="hidden max-w-[10rem] truncate text-sm sm:inline">
            {user.fullName ?? user.email}
          </span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel className="font-normal">
          <span className="block truncate text-sm font-medium">
            {user.fullName ?? 'Account'}
          </span>
          <span className="block truncate text-xs text-muted-foreground">
            {user.email}
          </span>
          <span className="mt-1 block text-xs text-muted-foreground">
            {user.roleLabel}
          </span>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link href="/settings">
            <Settings className="size-4" />
            Settings
          </Link>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild variant="destructive">
          <form action={logout} className="w-full">
            <button type="submit" className="flex w-full items-center gap-2">
              <LogOut className="size-4" />
              Sign out
            </button>
          </form>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
