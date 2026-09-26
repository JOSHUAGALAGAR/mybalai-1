'use client'

import { useFormStatus } from 'react-dom'

import { Button } from '@/components/ui/button'

type Props = {
  children: React.ReactNode
  pendingText?: string
  variant?: 'default' | 'secondary' | 'destructive' | 'outline'
  className?: string
  /** For forms submitted by script (not a plain `action`), where useFormStatus stays false. */
  pending?: boolean
}

export function SubmitButton({
  children,
  pendingText = 'Working…',
  variant = 'default',
  className,
  pending: externalPending,
}: Props) {
  const status = useFormStatus()
  const pending = status.pending || Boolean(externalPending)
  return (
    <Button
      type="submit"
      variant={variant}
      size="lg"
      disabled={pending}
      aria-busy={pending}
      className={className}
    >
      {pending ? pendingText : children}
    </Button>
  )
}
