import {
  forwardRef,
  useEffect,
  useId,
  useRef,
  useState,
  type ButtonHTMLAttributes,
  type InputHTMLAttributes,
  type ReactNode,
  type TextareaHTMLAttributes,
} from 'react'
import { createPortal } from 'react-dom'
import { AnimatePresence, motion } from 'motion/react'
import { create } from 'zustand'
import { Check, X, AlertTriangle, Info, Loader2 } from 'lucide-react'

export function cn(...xs: (string | false | null | undefined | 0)[]) {
  return xs.filter(Boolean).join(' ')
}

/** className 里带 hidden 时不再加基础 display，避免 inline-flex 覆盖 hidden */
function hidesBase(className?: string) {
  return /(^|\s)hidden(\s|$)/.test(className ?? '')
}

// ---------------- Button ----------------

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'ai' | 'outline'
type Size = 'sm' | 'md' | 'lg'

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant
  size?: Size
  icon?: ReactNode
  iconRight?: ReactNode
  loading?: boolean
}

const variantCls: Record<Variant, string> = {
  primary: 'bg-accent-gradient text-accent-fg font-semibold hover:brightness-105 active:brightness-95',
  secondary:
    'bg-surface-2 text-fg border border-line-2 shadow-[var(--highlight)] hover:bg-surface-3 hover:border-line-3',
  ghost: 'text-fg-2 hover:text-fg hover:bg-[color-mix(in_oklab,var(--fg)_6%,transparent)]',
  outline: 'border border-line-2 text-fg hover:bg-[color-mix(in_oklab,var(--fg)_5%,transparent)]',
  danger: 'bg-[color-mix(in_oklab,var(--err)_14%,transparent)] text-err hover:bg-[color-mix(in_oklab,var(--err)_22%,transparent)]',
  ai: 'bg-ai-gradient text-white font-semibold hover:brightness-110',
}
const sizeCls: Record<Size, string> = {
  sm: 'h-8 px-3 text-[13px] gap-1.5 rounded-[10px]',
  md: 'h-10 px-4 text-sm gap-2 rounded-xl',
  lg: 'h-12 px-6 text-[15px] gap-2.5 rounded-2xl',
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'secondary', size = 'md', icon, iconRight, loading, className, children, disabled, ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      disabled={disabled || loading}
      className={cn(
        hidesBase(className) ? '' : 'inline-flex',
        'select-none items-center justify-center whitespace-nowrap font-medium transition-all duration-200 disabled:opacity-45 active:scale-[0.97]',
        variantCls[variant],
        sizeCls[size],
        className,
      )}
      {...rest}
    >
      {loading ? <Loader2 className="size-4 animate-spin" /> : icon}
      {children}
      {iconRight}
    </button>
  )
})

interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  label: string
  active?: boolean
  size?: 'sm' | 'md' | 'lg'
}

export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton(
  { label, active, size = 'md', className, children, ...rest },
  ref,
) {
  const s = size === 'sm' ? 'size-8 rounded-[10px]' : size === 'lg' ? 'size-12 rounded-2xl' : 'size-10 rounded-xl'
  return (
    <button
      ref={ref}
      aria-label={label}
      title={label}
      className={cn(
        hidesBase(className) ? '' : 'inline-flex',
        'shrink-0 items-center justify-center transition-all duration-200 active:scale-90 disabled:opacity-40',
        active
          ? 'bg-accent-soft text-accent'
          : 'text-fg-2 hover:bg-[color-mix(in_oklab,var(--fg)_7%,transparent)] hover:text-fg',
        s,
        className,
      )}
      {...rest}
    >
      {children}
    </button>
  )
})

// ---------------- Segmented ----------------

export function Segmented<T extends string | number>({
  value,
  onChange,
  options,
  size = 'md',
  className,
}: {
  value: T
  onChange: (v: T) => void
  options: { value: T; label: ReactNode; title?: string }[]
  size?: 'sm' | 'md'
  className?: string
}) {
  const id = useId()
  return (
    <div className={cn('inline-flex rounded-xl bg-[color-mix(in_oklab,var(--fg)_5%,transparent)] p-1 shadow-[inset_0_0_0_1px_var(--line)]', className)} role="radiogroup">
      {options.map((o) => {
        const on = o.value === value
        return (
          <button
            key={String(o.value)}
            role="radio"
            aria-checked={on}
            title={o.title}
            onClick={() => onChange(o.value)}
            className={cn(
              'relative z-0 flex-1 whitespace-nowrap rounded-[9px] font-medium transition-colors',
              size === 'sm' ? 'h-7 px-2.5 text-xs' : 'h-8 px-3.5 text-[13px]',
              on ? 'text-fg' : 'text-fg-3 hover:text-fg-2',
            )}
          >
            {on && (
              <motion.span
                layoutId={`seg-${id}`}
                className="absolute inset-0 -z-10 rounded-[9px] bg-surface-3 shadow-[var(--highlight),0_1px_3px_rgba(0,0,0,0.25)] ring-1 ring-line light:bg-surface-2"
                transition={{ type: 'spring', stiffness: 500, damping: 38 }}
              />
            )}
            {o.label}
          </button>
        )
      })}
    </div>
  )
}

// ---------------- Switch ----------------

export function Switch({ checked, onChange, label, disabled }: { checked: boolean; onChange: (v: boolean) => void; label?: string; disabled?: boolean }) {
  return (
    <button
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn(
        'relative inline-flex h-6 w-10 shrink-0 items-center rounded-full transition-colors duration-200',
        checked ? 'bg-accent' : 'bg-line-3',
      )}
    >
      <motion.span
        className="absolute size-5 rounded-full bg-white shadow-md"
        animate={{ x: checked ? 18 : 2 }}
        transition={{ type: 'spring', stiffness: 600, damping: 35 }}
      />
    </button>
  )
}

// ---------------- Slider ----------------

export function Slider({
  value,
  min,
  max,
  step = 1,
  onChange,
  className,
  label,
}: {
  value: number
  min: number
  max: number
  step?: number
  onChange: (v: number) => void
  className?: string
  label?: string
}) {
  const p = ((value - min) / (max - min)) * 100
  return (
    <input
      type="range"
      aria-label={label}
      className={cn('slider w-full', className)}
      min={min}
      max={max}
      step={step}
      value={value}
      style={{ ['--p' as string]: `${p}%` }}
      onChange={(e) => onChange(Number(e.target.value))}
    />
  )
}

// ---------------- Inputs ----------------

/** className 作用于外层容器（字体等会继承）；内边距等要作用在输入框本身时用 inputClassName */
export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement> & { icon?: ReactNode; inputClassName?: string }>(function Input(
  { className, icon, inputClassName, ...rest },
  ref,
) {
  return (
    <div className={cn('relative flex items-center', className)}>
      {icon && <span className="pointer-events-none absolute left-3 text-fg-3">{icon}</span>}
      <input
        ref={ref}
        className={cn(
          'w-full rounded-xl border border-line bg-[color-mix(in_oklab,var(--fg)_3%,transparent)] px-3 text-fg outline-none transition placeholder:text-fg-3 focus:border-[color-mix(in_oklab,var(--accent)_60%,transparent)] focus:bg-[color-mix(in_oklab,var(--fg)_5%,transparent)] focus:ring-4 focus:ring-accent-soft',
          // 调用方指定了高度/字号时不再叠加默认值（同类工具类同时出现时谁生效取决于 CSS 顺序，不一定是后写的）
          !/(^|\s)h-/.test(inputClassName ?? '') && 'h-10',
          !/(^|\s)text-(xs|sm|base|\[\d)/.test(inputClassName ?? '') && 'text-sm',
          icon ? 'pl-9' : '',
          inputClassName,
        )}
        {...rest}
      />
    </div>
  )
})

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(function Textarea({ className, ...rest }, ref) {
  return (
    <textarea
      ref={ref}
      className={cn(
        'w-full resize-none rounded-xl border border-line bg-[color-mix(in_oklab,var(--fg)_3%,transparent)] px-3 py-2.5 text-sm text-fg outline-none transition placeholder:text-fg-3 focus:border-[color-mix(in_oklab,var(--accent)_60%,transparent)] focus:ring-4 focus:ring-accent-soft',
        className,
      )}
      {...rest}
    />
  )
})

/**
 * 表单项。内容是输入框时用 <label> 关联；内容是按钮组（分段选择、开关）时传 group，
 * 否则 <label> 会把文字算到第一个按钮头上，点标题还会误触发它。
 */
export function Field({ label, hint, children, className, group }: { label: ReactNode; hint?: ReactNode; children: ReactNode; className?: string; group?: boolean }) {
  const inner = (
    <>
      <span className="text-xs font-medium text-fg-2">{label}</span>
      {children}
      {hint && <span className="text-[11px] leading-relaxed text-fg-3">{hint}</span>}
    </>
  )
  return group ? (
    <div role="group" aria-label={typeof label === 'string' ? label : undefined} className={cn('flex flex-col gap-1.5', className)}>
      {inner}
    </div>
  ) : (
    <label className={cn('flex flex-col gap-1.5', className)}>{inner}</label>
  )
}

export function Select<T extends string | number>({
  value,
  onChange,
  options,
  size = 'md',
  className,
}: {
  value: T
  onChange: (v: T) => void
  options: { value: T; label: string }[]
  size?: 'sm' | 'md'
  className?: string
}) {
  return (
    <select
      value={String(value)}
      onChange={(e) => {
        const o = options.find((x) => String(x.value) === e.target.value)
        if (o) onChange(o.value)
      }}
      className={cn(
        'cursor-pointer appearance-none rounded-xl border border-line bg-[color-mix(in_oklab,var(--fg)_3%,transparent)] bg-[length:12px] bg-[right_12px_center] bg-no-repeat px-3 pr-8 text-fg outline-none transition hover:border-line-2 focus:ring-4 focus:ring-accent-soft',
        size === 'sm' ? 'h-9 text-[13px]' : 'h-10 text-sm',
        className,
      )}
      style={{
        backgroundImage:
          "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%23888' stroke-width='2.5'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E\")",
      }}
    >
      {options.map((o) => (
        <option key={String(o.value)} value={String(o.value)} className="bg-surface-2 text-fg">
          {o.label}
        </option>
      ))}
    </select>
  )
}

export function Chip({
  children,
  active,
  onClick,
  className,
  tone,
}: {
  children: ReactNode
  active?: boolean
  onClick?: () => void
  className?: string
  tone?: 'accent' | 'ok' | 'warn' | 'err' | 'ai'
}) {
  const toneCls = tone
    ? {
        accent: 'bg-accent-soft text-accent',
        ok: 'bg-[color-mix(in_oklab,var(--ok)_14%,transparent)] text-ok',
        warn: 'bg-[color-mix(in_oklab,var(--warn)_14%,transparent)] text-warn',
        err: 'bg-[color-mix(in_oklab,var(--err)_14%,transparent)] text-err',
        ai: 'bg-[color-mix(in_oklab,var(--ai-1)_16%,transparent)] text-ai-1',
      }[tone]
    : active
      ? 'bg-fg text-bg'
      : 'text-fg-2 shadow-[inset_0_0_0_1px_var(--line-2)] hover:text-fg hover:shadow-[inset_0_0_0_1px_var(--line-3)]'
  const Comp = onClick ? 'button' : 'span'
  return (
    <Comp
      onClick={onClick}
      className={cn('inline-flex h-7 items-center gap-1 whitespace-nowrap rounded-full px-3 text-xs font-medium transition-all', toneCls, className)}
    >
      {children}
    </Comp>
  )
}

// ---------------- Modal ----------------

export function Modal({
  open,
  onClose,
  children,
  title,
  description,
  width = 520,
  className,
  bare,
  footer,
}: {
  open: boolean
  onClose: () => void
  children: ReactNode
  title?: ReactNode
  description?: ReactNode
  width?: number
  className?: string
  bare?: boolean
  /** 固定在底部、不随内容滚动的操作区 */
  footer?: ReactNode
}) {
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])
  return createPortal(
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-[80] flex items-end justify-center sm:items-center sm:p-6">
          <motion.div
            className="absolute inset-0 bg-black/55 backdrop-blur-[6px]"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
          />
          <motion.div
            role="dialog"
            aria-modal
            className={cn(
              'relative max-h-[92dvh] w-full overflow-hidden rounded-t-[28px] border border-line-2 bg-surface shadow-[var(--shadow-lg)] sm:rounded-[28px]',
              className,
            )}
            style={{ maxWidth: width }}
            initial={{ opacity: 0, y: 40, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 30, scale: 0.98 }}
            transition={{ type: 'spring', stiffness: 420, damping: 36 }}
          >
            {bare ? (
              children
            ) : (
              <div className="flex max-h-[92dvh] flex-col">
                {(title || description) && (
                  <div className="flex items-start gap-4 px-6 pb-2 pt-6">
                    <div className="min-w-0 flex-1">
                      {title && <h2 className="text-lg font-semibold tracking-tight">{title}</h2>}
                      {description && <p className="mt-1 text-sm text-fg-2">{description}</p>}
                    </div>
                    <IconButton label="关闭" size="sm" onClick={onClose} className="-mr-2 -mt-1">
                      <X className="size-4" />
                    </IconButton>
                  </div>
                )}
                <div className={cn('min-h-0 flex-1 overflow-y-auto px-6 pt-2', footer ? 'pb-4' : 'pb-[calc(1.5rem+var(--sab))] sm:pb-6')}>{children}</div>
                {footer && <div className="flex shrink-0 items-center gap-2 border-t border-line px-6 pb-[calc(0.875rem+var(--sab))] pt-3.5 sm:pb-3.5">{footer}</div>}
              </div>
            )}
          </motion.div>
        </div>
      )}
    </AnimatePresence>,
    document.body,
  )
}

// ---------------- Popover ----------------

export function Popover({
  trigger,
  children,
  align = 'end',
  side = 'bottom',
  className,
  open: openProp,
  onOpenChange,
}: {
  trigger: (props: { open: boolean; toggle: () => void }) => ReactNode
  children: ReactNode | ((close: () => void) => ReactNode)
  align?: 'start' | 'end' | 'center'
  side?: 'bottom' | 'top'
  className?: string
  open?: boolean
  onOpenChange?: (v: boolean) => void
}) {
  const [inner, setInner] = useState(false)
  const open = openProp ?? inner
  const setOpen = (v: boolean) => {
    setInner(v)
    onOpenChange?.(v)
  }
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const onDown = (e: PointerEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    window.addEventListener('pointerdown', onDown)
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('pointerdown', onDown)
      window.removeEventListener('keydown', onKey)
    }
  })
  const close = () => setOpen(false)
  return (
    <div ref={ref} className="relative inline-flex">
      {trigger({ open, toggle: () => setOpen(!open) })}
      <AnimatePresence>
        {open && (
          <motion.div
            data-popover
            initial={{ opacity: 0, y: side === 'bottom' ? -6 : 6, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: side === 'bottom' ? -4 : 4, scale: 0.98 }}
            transition={{ duration: 0.16, ease: [0.22, 1, 0.36, 1] }}
            className={cn(
              'absolute z-50 min-w-48 rounded-2xl border border-line-2 bg-surface-2 p-1.5 shadow-[var(--shadow-lg)]',
              side === 'bottom' ? 'top-[calc(100%+8px)]' : 'bottom-[calc(100%+8px)]',
              align === 'end' ? 'right-0' : align === 'start' ? 'left-0' : 'left-1/2 -translate-x-1/2',
              className,
            )}
          >
            {typeof children === 'function' ? children(close) : children}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

export function MenuItem({
  icon,
  children,
  onClick,
  danger,
  hint,
  active,
}: {
  icon?: ReactNode
  children: ReactNode
  onClick?: () => void
  danger?: boolean
  hint?: ReactNode
  active?: boolean
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left text-sm transition-colors',
        danger ? 'text-err hover:bg-[color-mix(in_oklab,var(--err)_12%,transparent)]' : 'text-fg hover:bg-[color-mix(in_oklab,var(--fg)_7%,transparent)]',
      )}
    >
      {icon && <span className={cn('flex size-4 items-center justify-center', danger ? '' : 'text-fg-2')}>{icon}</span>}
      <span className="flex-1">{children}</span>
      {hint && <span className="text-xs text-fg-3">{hint}</span>}
      {active && <Check className="size-4 text-accent" />}
    </button>
  )
}

export function MenuSep() {
  return <div className="mx-2 my-1 h-px bg-line" />
}

// ---------------- Toast ----------------

interface ToastItem {
  id: number
  kind: 'ok' | 'err' | 'info' | 'warn'
  text: ReactNode
  action?: { label: string; onClick: () => void }
}

const useToasts = create<{ items: ToastItem[]; push: (t: Omit<ToastItem, 'id'>) => void; drop: (id: number) => void }>((set) => ({
  items: [],
  push: (t) => {
    const id = Date.now() + Math.random()
    set((s) => ({ items: [...s.items.slice(-3), { ...t, id }] }))
    setTimeout(() => set((s) => ({ items: s.items.filter((x) => x.id !== id) })), t.kind === 'err' ? 6000 : 3200)
  },
  drop: (id) => set((s) => ({ items: s.items.filter((x) => x.id !== id) })),
}))

export const toast = {
  ok: (text: ReactNode, action?: ToastItem['action']) => useToasts.getState().push({ kind: 'ok', text, action }),
  err: (text: ReactNode) => useToasts.getState().push({ kind: 'err', text }),
  info: (text: ReactNode, action?: ToastItem['action']) => useToasts.getState().push({ kind: 'info', text, action }),
  warn: (text: ReactNode) => useToasts.getState().push({ kind: 'warn', text }),
}

export function Toaster() {
  const { items, drop } = useToasts()
  return createPortal(
    <div className="pointer-events-none fixed inset-x-0 bottom-[calc(92px+var(--sab))] z-[100] flex flex-col items-center gap-2 px-4 lg:bottom-8">
      <AnimatePresence>
        {items.map((t) => (
          <motion.div
            key={t.id}
            layout
            initial={{ opacity: 0, y: 20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 10, scale: 0.97 }}
            transition={{ type: 'spring', stiffness: 500, damping: 38 }}
            className="glass pointer-events-auto flex max-w-md items-center gap-3 rounded-2xl border border-line-2 py-2.5 pl-3 pr-2 text-sm shadow-[var(--shadow-lg)]"
          >
            <span
              className={cn(
                'flex size-6 items-center justify-center rounded-full',
                t.kind === 'ok' && 'bg-[color-mix(in_oklab,var(--ok)_18%,transparent)] text-ok',
                t.kind === 'err' && 'bg-[color-mix(in_oklab,var(--err)_18%,transparent)] text-err',
                t.kind === 'warn' && 'bg-[color-mix(in_oklab,var(--warn)_18%,transparent)] text-warn',
                t.kind === 'info' && 'bg-accent-soft text-accent',
              )}
            >
              {t.kind === 'ok' ? <Check className="size-3.5" /> : t.kind === 'info' ? <Info className="size-3.5" /> : <AlertTriangle className="size-3.5" />}
            </span>
            <span className="min-w-0 flex-1 text-fg">{t.text}</span>
            {t.action && (
              <button
                className="rounded-lg px-2.5 py-1 text-xs font-semibold text-accent hover:bg-accent-soft"
                onClick={() => {
                  t.action!.onClick()
                  drop(t.id)
                }}
              >
                {t.action.label}
              </button>
            )}
          </motion.div>
        ))}
      </AnimatePresence>
    </div>,
    document.body,
  )
}

// ---------------- Confirm ----------------

interface ConfirmReq {
  title: string
  body?: ReactNode
  ok: string
  danger?: boolean
  resolve: (v: boolean) => void
}

const useConfirm = create<{ req: ConfirmReq | null; set: (r: ConfirmReq | null) => void }>((set) => ({ req: null, set: (req) => set({ req }) }))

export function confirmDialog(opts: { title: string; body?: ReactNode; ok?: string; danger?: boolean }): Promise<boolean> {
  return new Promise((resolve) => useConfirm.getState().set({ ok: '确定', ...opts, resolve }))
}

export function ConfirmHost() {
  const { req, set } = useConfirm()
  const done = (v: boolean) => {
    req?.resolve(v)
    set(null)
  }
  return (
    <Modal open={!!req} onClose={() => done(false)} width={420} bare>
      {req && (
        <div className="p-6">
          <h3 className="text-lg font-semibold">{req.title}</h3>
          {req.body && <div className="mt-2 text-sm leading-relaxed text-fg-2">{req.body}</div>}
          <div className="mt-6 flex justify-end gap-2">
            <Button variant="ghost" onClick={() => done(false)}>
              取消
            </Button>
            <Button variant={req.danger ? 'danger' : 'primary'} onClick={() => done(true)} autoFocus>
              {req.ok}
            </Button>
          </div>
        </div>
      )}
    </Modal>
  )
}

// ---------------- 其它 ----------------

export function Kbd({ children }: { children: ReactNode }) {
  return <kbd className="kbd">{children}</kbd>
}

export function SectionTitle({ children, action, count, className }: { children: ReactNode; action?: ReactNode; count?: number; className?: string }) {
  return (
    <div className={cn('mb-4 flex items-end justify-between gap-4', className)}>
      <h2 className="flex items-baseline gap-2 text-[15px] font-semibold tracking-tight text-fg">
        {children}
        {count !== undefined && <span className="font-mono text-[11px] font-medium text-fg-3 tnum">{String(count).padStart(2, '0')}</span>}
      </h2>
      {action}
    </div>
  )
}

/**
 * 页面标题区：等宽小字眉标 + 大标题 + 一行说明，右侧放操作。
 * 标题里可以用 <Dim> 把后半句压成灰色，做出主次两色的标题。
 */
export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
  className,
}: {
  eyebrow?: ReactNode
  title: ReactNode
  description?: ReactNode
  actions?: ReactNode
  className?: string
}) {
  return (
    <header className={cn('flex flex-wrap items-end justify-between gap-x-6 gap-y-4', className)}>
      <div className="min-w-0">
        {eyebrow && <div className="eyebrow mb-3 flex items-center gap-2">{eyebrow}</div>}
        <h1 className="text-[30px] font-semibold leading-[1.12] tracking-[-0.02em] sm:text-[38px]">{title}</h1>
        {description && <p className="mt-2.5 max-w-xl text-[13.5px] leading-relaxed text-fg-2">{description}</p>}
      </div>
      {actions && <div className="flex w-full items-center gap-2 sm:w-auto">{actions}</div>}
    </header>
  )
}

/** 标题里的次要部分（灰色） */
export function Dim({ children }: { children: ReactNode }) {
  return <span className="text-fg-3">{children}</span>
}

export function Spinner({ className }: { className?: string }) {
  return <Loader2 className={cn('size-4 animate-spin', className)} />
}
