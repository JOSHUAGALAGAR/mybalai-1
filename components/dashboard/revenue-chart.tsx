'use client'

import { useEffect, useRef, useState } from 'react'

import { niceScale } from '@/lib/dashboard/landlord-metrics'

type Month = { key: string; label: string; year: number; amount: number }

const peso = new Intl.NumberFormat('en-PH', {
  style: 'currency',
  currency: 'PHP',
  maximumFractionDigits: 0,
})
const number = new Intl.NumberFormat('en-PH', { maximumFractionDigits: 0 })

// Drawn at the container's real pixel width (not a scaled viewBox) so axis text
// stays readable on phones.
const H = 240
const M = { top: 20, right: 12, bottom: 28, left: 64 }
const PLOT_H = H - M.top - M.bottom
const MAX_BAR = 24
const RADIUS = 4

/** Column with a rounded data-end and a square baseline. */
function columnPath(x: number, y: number, w: number, h: number): string {
  const r = Math.min(RADIUS, h, w / 2)
  return `M${x},${y + h} V${y + r} Q${x},${y} ${x + r},${y} H${x + w - r} Q${x + w},${y} ${x + w},${y + r} V${y + h} Z`
}

export function RevenueChart({ months }: { months: Month[] }) {
  const [active, setActive] = useState<number | null>(null)
  const [W, setW] = useState(640)
  const wrapRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const el = wrapRef.current
    if (!el) return
    const update = () => setW(Math.max(260, Math.round(el.clientWidth)))
    update()
    const observer = new ResizeObserver(update)
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  const total = months.reduce((n, m) => n + m.amount, 0)
  if (total === 0) {
    return (
      <p className="py-10 text-center text-sm text-muted-foreground">
        No verified payments in the last {months.length} months yet.
      </p>
    )
  }

  const { top, ticks } = niceScale(Math.max(...months.map((m) => m.amount)))
  const plotW = W - M.left - M.right
  const band = plotW / months.length
  const barW = Math.min(MAX_BAR, band * 0.5)
  const yFor = (v: number) => M.top + PLOT_H - (v / top) * PLOT_H
  const last = months.length - 1

  const hovered = active !== null ? months[active] : null
  const tipX = active !== null ? M.left + band * active + band / 2 : 0
  const tipY = hovered ? yFor(hovered.amount) : 0

  return (
    <div>
      <div className="relative" ref={wrapRef}>
        <svg
          width={W}
          height={H}
          className="block max-w-full"
          role="img"
          aria-label={`Verified revenue by month. ${months
            .map((m) => `${m.label} ${peso.format(m.amount)}`)
            .join(', ')}.`}
        >
          {/* gridlines + y ticks */}
          {ticks.map((t) => (
            <g key={t}>
              <line
                x1={M.left}
                x2={W - M.right}
                y1={yFor(t)}
                y2={yFor(t)}
                className={t === 0 ? 'stroke-foreground/25' : 'stroke-border'}
                strokeWidth={1}
              />
              <text
                x={M.left - 8}
                y={yFor(t)}
                textAnchor="end"
                dominantBaseline="middle"
                className="fill-muted-foreground text-[11px]"
              >
                ₱{number.format(t)}
              </text>
            </g>
          ))}

          {months.map((m, i) => {
            const cx = M.left + band * i + band / 2
            const h = (m.amount / top) * PLOT_H
            return (
              <g key={m.key}>
                {active === i && (
                  <rect
                    x={M.left + band * i}
                    y={M.top}
                    width={band}
                    height={PLOT_H}
                    className="fill-muted"
                  />
                )}
                {h > 0 && (
                  <path
                    d={columnPath(cx - barW / 2, yFor(m.amount), barW, h)}
                    className="fill-viz-1"
                  />
                )}
                <text
                  x={cx}
                  y={H - 8}
                  textAnchor="middle"
                  className="fill-muted-foreground text-[11px]"
                >
                  {m.label}
                </text>
                {/* Label the current month only; the rest live in the tooltip. */}
                {i === last && m.amount > 0 && active === null && (
                  <text
                    x={cx}
                    y={yFor(m.amount) - 6}
                    textAnchor="middle"
                    className="fill-foreground text-[11px] font-medium"
                  >
                    {peso.format(m.amount)}
                  </text>
                )}
                {/* Hit target: the whole band, far bigger than the bar. */}
                <rect
                  x={M.left + band * i}
                  y={M.top}
                  width={band}
                  height={PLOT_H + M.bottom}
                  fill="transparent"
                  tabIndex={0}
                  role="img"
                  aria-label={`${m.label} ${m.year}: ${peso.format(m.amount)}`}
                  className="outline-none focus-visible:stroke-ring"
                  onMouseEnter={() => setActive(i)}
                  onMouseLeave={() => setActive(null)}
                  onFocus={() => setActive(i)}
                  onBlur={() => setActive(null)}
                />
              </g>
            )
          })}
        </svg>

        {hovered && (
          <div
            className="pointer-events-none absolute z-10 -translate-x-1/2 -translate-y-full rounded-md bg-popover px-2.5 py-1.5 text-xs text-popover-foreground shadow-md ring-1 ring-foreground/10"
            style={{
              left: Math.min(Math.max(tipX, 70), W - 70),
              top: tipY - 8,
            }}
          >
            <p className="text-muted-foreground">
              {hovered.label} {hovered.year}
            </p>
            <p className="font-semibold">{peso.format(hovered.amount)}</p>
          </div>
        )}
      </div>

      <details className="mt-3 text-xs text-muted-foreground">
        <summary className="cursor-pointer select-none hover:text-foreground">
          View as table
        </summary>
        <table className="mt-2 w-full max-w-xs">
          <thead>
            <tr className="text-left">
              <th className="py-1 font-medium">Month</th>
              <th className="py-1 text-right font-medium">Verified revenue</th>
            </tr>
          </thead>
          <tbody>
            {months.map((m) => (
              <tr key={m.key} className="border-t border-border">
                <td className="py-1">
                  {m.label} {m.year}
                </td>
                <td className="py-1 text-right tabular-nums">
                  {peso.format(m.amount)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </div>
  )
}
