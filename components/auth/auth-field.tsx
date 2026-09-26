import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { PasswordInput } from '@/components/ui/password-input'

type Props = React.ComponentProps<'input'> & {
  label: string
  name: string
  errors?: string[]
  hint?: string
  labelRight?: React.ReactNode
}

/** Label + shadcn Input + field-level errors, wired for a11y. */
export function AuthField({
  label,
  name,
  errors,
  hint,
  labelRight,
  ...inputProps
}: Props) {
  const id = inputProps.id ?? name
  const errorId = errors?.length ? `${id}-error` : undefined
  const hintId = hint ? `${id}-hint` : undefined
  // Every password field gets a show / hide button.
  const Control = inputProps.type === 'password' ? PasswordInput : Input

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between gap-2">
        <Label htmlFor={id}>{label}</Label>
        {labelRight}
      </div>
      <Control
        id={id}
        name={name}
        aria-invalid={errors?.length ? true : undefined}
        aria-describedby={
          [errorId, hintId].filter(Boolean).join(' ') || undefined
        }
        {...inputProps}
      />
      {hint && (
        <p id={hintId} className="text-xs text-muted-foreground">
          {hint}
        </p>
      )}
      {errors?.map((message) => (
        <p
          key={message}
          id={errorId}
          className="text-xs font-medium text-destructive"
        >
          {message}
        </p>
      ))}
    </div>
  )
}
