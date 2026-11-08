import { useId, type ButtonHTMLAttributes, type CSSProperties, type ReactNode } from 'react'

export const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(' ')

export function Card({ title, action, children, className }: { title?: ReactNode; action?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={cx('rounded-3xl border border-line bg-surface/80 p-4 backdrop-blur sm:p-5', className)}>
      {(title || action) && (
        <header className="mb-3 flex min-h-8 items-center justify-between gap-3">
          {title && <h2 className="text-sm font-semibold tracking-wide text-muted uppercase">{title}</h2>}
          {action}
        </header>
      )}
      {children}
    </section>
  )
}

interface SliderProps {
  label: ReactNode
  value: number
  min?: number
  max?: number
  step?: number
  onChange(v: number): void
  format?(v: number): string
  disabled?: boolean
  /** Custom track background (e.g. a colour-temperature gradient). */
  track?: string
}

export function Slider({ label, value, min = 0, max = 255, step = 1, onChange, format, disabled, track }: SliderProps) {
  const id = useId()
  const fill = ((value - min) / (max - min)) * 100
  const style = { '--fill': `${fill}%`, ...(track ? { '--track': track } : {}) } as CSSProperties
  return (
    <div>
      <div className="flex items-baseline justify-between text-sm">
        <label htmlFor={id} className="text-fg/90">
          {label}
        </label>
        <span className="text-muted tabular-nums">{format ? format(value) : value}</span>
      </div>
      <input
        id={id}
        type="range"
        className="range"
        min={min}
        max={max}
        step={step}
        value={value}
        disabled={disabled}
        style={style}
        onChange={(e) => onChange(Number(e.target.value))}
      />
    </div>
  )
}

export function Toggle({ checked, onChange, label, disabled }: { checked: boolean; onChange(v: boolean): void; label: string; disabled?: boolean }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cx(
        'relative h-7 w-12 shrink-0 rounded-full border transition-colors disabled:opacity-40',
        checked ? 'border-transparent bg-[rgb(var(--accent))]' : 'border-line bg-surface-2',
      )}
    >
      <span className={cx('absolute top-0.5 left-0.5 size-5.5 rounded-full bg-white shadow transition-transform', checked && 'translate-x-5')} />
    </button>
  )
}

export function Chip({ active, children, className, ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { active?: boolean }) {
  return (
    <button
      type="button"
      {...rest}
      className={cx(
        'rounded-full border px-3.5 py-1.5 text-sm whitespace-nowrap transition-colors',
        active ? 'border-transparent bg-fg text-bg' : 'border-line bg-surface-2 text-fg/80 hover:text-fg',
        className,
      )}
    >
      {children}
    </button>
  )
}

export function Button({ variant = 'default', className, ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'default' | 'primary' | 'danger' | 'ghost' }) {
  return (
    <button
      type="button"
      {...rest}
      className={cx(
        'inline-flex items-center justify-center gap-2 rounded-2xl px-4 py-2.5 text-sm font-medium transition-colors disabled:opacity-40',
        variant === 'primary' && 'bg-[rgb(var(--accent))] text-white hover:brightness-110',
        variant === 'default' && 'border border-line bg-surface-2 hover:bg-line',
        variant === 'danger' && 'bg-bad/15 text-bad hover:bg-bad/25',
        variant === 'ghost' && 'text-muted hover:bg-surface-2 hover:text-fg',
        className,
      )}
    />
  )
}

export function Empty({ icon, title, children }: { icon?: ReactNode; title: string; children?: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-2 px-4 py-10 text-center">
      {icon && <div className="text-muted">{icon}</div>}
      <p className="font-medium">{title}</p>
      {children && <div className="max-w-sm text-sm text-muted">{children}</div>}
    </div>
  )
}

export function Row({ label, children }: { label: ReactNode; children: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-line/60 py-2.5 text-sm last:border-0">
      <span className="text-muted">{label}</span>
      <span className="text-right break-all">{children}</span>
    </div>
  )
}
