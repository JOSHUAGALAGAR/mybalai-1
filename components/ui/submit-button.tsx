'use client'

import { useFormStatus } from 'react-dom'

import { Button } from '@/components/ui/button'

type Props = {
  children: React.ReactNode
  pendingText?: string
  variant?: 'default' | 'secondary' | 'destructive' | 'outline'
  className?: string
}

export function SubmitButton({
  children,
  pendingText = 'Working…',
  variant = 'default',
  className,
}: Props) {
  const { pending } = useFormStatus()
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
