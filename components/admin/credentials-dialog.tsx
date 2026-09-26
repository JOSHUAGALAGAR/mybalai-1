'use client'

import { Check, Copy, KeyRound } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'

import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'

export type Credentials = {
  email: string
  password: string
  reason: 'created' | 'reset'
}

/** Copy text; falls back to a hidden textarea where the clipboard API is not allowed. */
async function copy(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    try {
      const area = document.createElement('textarea')
      area.value = text
      area.style.position = 'fixed'
      area.style.opacity = '0'
      document.body.appendChild(area)
      area.select()
      const ok = document.execCommand('copy')
      area.remove()
      return ok
    } catch {
      return false
    }
  }
}

function CopyButton({ text, label }: { text: string; label: string }) {
  const [done, setDone] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => () => void (timer.current && clearTimeout(timer.current)), [])
  return (
    <Button
      type="button"
      size="sm"
      variant="outline"
      aria-label={label}
      onClick={async () => {
        if (await copy(text)) {
          setDone(true)
          if (timer.current) clearTimeout(timer.current)
          timer.current = setTimeout(() => setDone(false), 2000)
        }
      }}
    >
      {done ? (
        <Check className="size-4 text-primary" aria-hidden />
      ) : (
        <Copy className="size-4" aria-hidden />
      )}
      {done ? 'Copied' : 'Copy'}
    </Button>
  )
}

/**
 * The landlord's new sign-in, in a window that stays until the admin closes it: the password is
 * shown only this once and is never stored, so it must not vanish behind a page refresh.
 */
export function CredentialsDialog({
  credentials,
  onClose,
}: {
  credentials: Credentials | null
  onClose: () => void
}) {
  const loginUrl =
    typeof window === 'undefined' ? '/login' : `${window.location.origin}/login`
  const message = credentials
    ? `${
        credentials.reason === 'reset'
          ? 'Your MyBalai password was reset.'
          : 'Your MyBalai landlord account is ready.'
      }\nSign in: ${loginUrl}\nEmail: ${credentials.email}\nTemporary password: ${credentials.password}\nPlease change your password after signing in (Settings → Password).`
    : ''

  return (
    <Dialog open={credentials !== null} onOpenChange={() => undefined}>
      <DialogContent
        showClose={false}
        className="max-w-lg"
        onEscapeKeyDown={(e) => e.preventDefault()}
        onPointerDownOutside={(e) => e.preventDefault()}
        onInteractOutside={(e) => e.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <KeyRound className="size-5 text-primary" aria-hidden />
            {credentials?.reason === 'reset'
              ? 'New password issued'
              : 'Landlord account created'}
          </DialogTitle>
          <DialogDescription>
            Give these sign-in details to{' '}
            {credentials?.reason === 'reset'
              ? 'the account owner'
              : 'the landlord'}
            . The password is shown <strong>only once</strong> and cannot be
            looked up later.
          </DialogDescription>
        </DialogHeader>

        {credentials && (
          <DialogBody className="space-y-4">
            <dl className="space-y-3 text-sm">
              <div>
                <dt className="text-xs font-semibold text-muted-foreground">
                  Email
                </dt>
                <dd className="mt-1 flex flex-wrap items-center justify-between gap-2">
                  <span className="min-w-0 font-mono text-base font-bold break-all text-foreground select-all">
                    {credentials.email}
                  </span>
                  <CopyButton text={credentials.email} label="Copy email" />
                </dd>
              </div>
              <div>
                <dt className="text-xs font-semibold text-muted-foreground">
                  Temporary password
                </dt>
                <dd className="mt-1 flex flex-wrap items-center justify-between gap-2">
                  <span className="rounded-lg bg-muted px-3 py-1.5 font-mono text-lg font-bold tracking-wider text-foreground select-all">
                    {credentials.password}
                  </span>
                  <CopyButton
                    text={credentials.password}
                    label="Copy password"
                  />
                </dd>
              </div>
            </dl>
            <p className="text-xs text-muted-foreground">
              They sign in at{' '}
              <span className="font-medium text-foreground">{loginUrl}</span>,
              then change the password under Settings — or use “Forgot password”
              to choose their own.
            </p>
          </DialogBody>
        )}

        <DialogFooter>
          {credentials ? (
            <CopyButton text={message} label="Copy the whole message" />
          ) : (
            <span />
          )}
          <Button type="button" size="lg" onClick={onClose}>
            I’ve saved these details
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
