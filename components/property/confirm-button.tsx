'use client'

import { useFormStatus } from 'react-dom'

import { Button } from '@/components/ui/button'

type Props = {
  action: (formData: FormData) => void | Promise<void>
  confirm: string
  children: React.ReactNode
  hidden: Record<string, string | number>
  variant?: 'destructive' | 'outline' | 'ghost'
  size?: 'sm' | 'default'
}

function Submit({
  children,
  variant,
  size,
}: {
  children: React.ReactNode
  variant: Props['variant']
  size: Props['size']
}) {
  const { pending } = useFormStatus()
  return (
    <Button
      type="submit"
      variant={variant}
      size={size}
      disabled={pending}
      aria-busy={pending}
    >
      {pending ? 'Working…' : children}
    </Button>
  )
}

/** A one-click form with a native confirm() guard, for destructive mutations. */
export function ConfirmButton({
  action,
  confirm,
  children,
  hidden,
  variant = 'destructive',
  size = 'default',
}: Props) {
  return (
    <form
      action={action}
      onSubmit={(event) => {
        if (!window.confirm(confirm)) event.preventDefault()
      }}
    >
      {Object.entries(hidden).map(([name, value]) => (
        <input key={name} type="hidden" name={name} value={value} />
      ))}
      <Submit variant={variant} size={size}>
        {children}
      </Submit>
    </form>
  )
}
