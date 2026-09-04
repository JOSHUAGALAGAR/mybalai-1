import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'

/** Classes that make a native <select> match the shadcn Input look. */
export const nativeControlClass =
  'flex h-9 w-full rounded-lg border border-input bg-transparent px-3 py-1 text-sm shadow-xs outline-none transition-[color,box-shadow] focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-destructive/20'

export function FormField({
  label,
  htmlFor,
  error,
  hint,
  required,
  children,
}: {
  label: string
  htmlFor: string
  error?: string[]
  hint?: string
  required?: boolean
  children: React.ReactNode
}) {
  const errorId = error?.length ? `${htmlFor}-error` : undefined
  const hintId = hint ? `${htmlFor}-hint` : undefined
  return (
    <div className="space-y-1.5">
      <Label htmlFor={htmlFor}>
        {label}
        {required && <span className="ml-0.5 text-destructive">*</span>}
      </Label>
      {children}
      {hint && (
        <p id={hintId} className="text-xs text-muted-foreground">
          {hint}
        </p>
      )}
      {error?.map((message) => (
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

export function fieldInvalid(error?: string[]): true | undefined {
  return error?.length ? true : undefined
}

export { cn }
