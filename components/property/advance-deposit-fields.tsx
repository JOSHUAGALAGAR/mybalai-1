/**
 * "1 month advance" / "1 month deposit" switches for the property and room forms.
 * Each checkbox is preceded by a hidden "0", so an unchecked box still reaches the server as
 * `false` (a browser sends nothing for an unchecked checkbox) — see `optionalFlag`.
 */
export function AdvanceDepositFields({
  advance,
  deposit,
  hint,
}: {
  advance: boolean
  deposit: boolean
  hint: string
}) {
  return (
    <fieldset className="space-y-2">
      <legend className="text-sm font-medium">Advance &amp; deposit</legend>
      <p className="text-muted-foreground text-xs">{hint}</p>
      <Option
        name="require_advance"
        checked={advance}
        title="Require 1 month advance"
        detail="The tenant pays one month of rent up front, on top of the stay."
      />
      <Option
        name="require_deposit"
        checked={deposit}
        title="Require 1 month deposit"
        detail="The tenant pays a refundable security deposit equal to one month of rent."
      />
    </fieldset>
  )
}

function Option({
  name,
  checked,
  title,
  detail,
}: {
  name: string
  checked: boolean
  title: string
  detail: string
}) {
  return (
    <label className="hover:bg-muted/40 flex cursor-pointer items-start gap-3 rounded-lg border p-3">
      <input type="hidden" name={name} value="0" />
      <input
        type="checkbox"
        name={name}
        value="1"
        defaultChecked={checked}
        className="accent-primary mt-0.5 size-4"
      />
      <span className="space-y-0.5">
        <span className="block text-sm font-medium">{title}</span>
        <span className="text-muted-foreground block text-xs">{detail}</span>
      </span>
    </label>
  )
}
