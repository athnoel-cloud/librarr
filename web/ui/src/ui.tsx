// Small shared building blocks: badges, buttons, toolbar, list rows, empty
// states, the release menu and the detail drawer. Tailwind runtime classes
// only, no library. Every label is passed in by the caller so this file stays
// free of i18n lookups.
import {
  useEffect,
  useId,
  useRef,
  useState,
  type ButtonHTMLAttributes,
  type HTMLAttributes,
  type MouseEvent,
  type ReactNode,
} from "react";

export type Tone =
  | "neutral"
  | "lang"
  | "multi"
  | "format"
  | "ok"
  | "warn"
  | "danger"
  | "info";

// Tinted background at 15 % + a -300 text keeps every badge above 7:1 on
// slate-900 and slate-950 alike.
const tones: Record<Tone, string> = {
  neutral: "bg-slate-700/60 text-slate-200",
  lang: "bg-indigo-500/15 text-indigo-300",
  multi: "bg-violet-500/15 text-violet-300",
  format: "bg-slate-700/60 text-slate-200",
  ok: "bg-emerald-500/15 text-emerald-300",
  warn: "bg-amber-500/15 text-amber-300",
  danger: "bg-red-500/15 text-red-300",
  info: "bg-sky-500/15 text-sky-300",
};
const dots: Record<Tone, string> = {
  neutral: "bg-slate-400",
  lang: "bg-indigo-400",
  multi: "bg-violet-400",
  format: "bg-slate-400",
  ok: "bg-emerald-400",
  warn: "bg-amber-400",
  danger: "bg-red-400",
  info: "bg-indigo-400",
};

export function Badge({
  tone = "neutral",
  className = "",
  ...rest
}: HTMLAttributes<HTMLSpanElement> & { tone?: Tone }) {
  return (
    <span
      className={`inline-flex items-center rounded px-1.5 py-0.5 text-xs font-medium leading-4 whitespace-nowrap ${tones[tone]} ${className}`}
      {...rest}
    />
  );
}

export function StatusBadge({
  tone = "neutral",
  pulse = false,
  className = "",
  children,
  ...rest
}: HTMLAttributes<HTMLSpanElement> & { tone?: Tone; pulse?: boolean }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded px-2 py-0.5 text-xs font-medium whitespace-nowrap ${tones[tone]} ${className}`}
      {...rest}
    >
      <span
        aria-hidden="true"
        className={`h-2 w-2 rounded-full ${dots[tone]} ${pulse ? "animate-pulse" : ""}`}
      />
      {children}
    </span>
  );
}

export type ButtonVariant =
  | "primary"
  | "secondary"
  | "ghost"
  | "danger"
  | "danger-solid";
const variants: Record<ButtonVariant, string> = {
  primary: "bg-indigo-600 text-white hover:bg-indigo-700",
  secondary:
    "bg-slate-800 text-slate-100 border border-slate-700 hover:bg-slate-700",
  ghost: "text-slate-300 hover:bg-slate-800 hover:text-white",
  danger: "text-red-300 hover:bg-red-900/40 hover:text-red-200",
  "danger-solid": "bg-red-700 text-white hover:bg-red-800",
};
const sizes = {
  sm: "min-h-[2rem] px-3 py-1.5 text-sm",
  md: "min-h-[2.5rem] px-4 py-2 text-sm",
} as const;

// data-variant lets the id-scoped legacy rules in style.css step aside.
export function Button({
  variant = "secondary",
  size = "md",
  className = "",
  type = "button",
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: keyof typeof sizes;
}) {
  return (
    <button
      type={type}
      data-variant={variant}
      className={`inline-flex items-center justify-center gap-1.5 rounded-lg font-medium whitespace-nowrap focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-400 disabled:opacity-50 disabled:cursor-not-allowed ${variants[variant]} ${sizes[size]} ${className}`}
      {...rest}
    />
  );
}

export function Toolbar({
  start,
  end,
  className = "",
  ...rest
}: HTMLAttributes<HTMLDivElement> & { start?: ReactNode; end?: ReactNode }) {
  return (
    <div className={`flex flex-wrap items-center gap-3 ${className}`} {...rest}>
      {start && (
        <div className="flex flex-wrap items-center gap-3 min-w-0">{start}</div>
      )}
      {end && (
        <div className="ml-auto flex flex-wrap items-center gap-2">{end}</div>
      )}
    </div>
  );
}

export function PageHeader({
  title,
  subtitle,
  children,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <Toolbar
      start={
        <div className="min-w-0">
          <h2 className="text-xl font-semibold text-white flex items-center gap-2">
            {title}
          </h2>
          {subtitle && <p className="text-sm text-slate-400">{subtitle}</p>}
        </div>
      }
      end={children}
    />
  );
}

export function EmptyState({
  title,
  hint,
  action,
  className = "",
  ...rest
}: HTMLAttributes<HTMLDivElement> & {
  title: ReactNode;
  hint?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div
      className={`px-4 py-10 sm:py-14 text-center space-y-2 ${className}`}
      {...rest}
    >
      <h3 className="text-base font-semibold text-white">{title}</h3>
      {hint && (
        <p className="text-sm text-slate-400 max-w-prose mx-auto">{hint}</p>
      )}
      {action && <div className="pt-2">{action}</div>}
    </div>
  );
}

// Three-column row: leading cell (score, status), content, actions. Under
// 640 px the actions drop to their own full-width line.
export function ListRow({
  leading,
  actions,
  footer,
  children,
  className = "",
  ...rest
}: HTMLAttributes<HTMLElement> & {
  leading?: ReactNode;
  actions?: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <article
      className={`grid grid-cols-[auto_1fr] sm:grid-cols-[auto_1fr_auto] gap-x-3 gap-y-2 items-start bg-slate-900 border border-slate-700 rounded-xl p-3 ${className}`}
      {...rest}
    >
      <div className="pt-0.5 min-w-0">{leading}</div>
      <div className="min-w-0">{children}</div>
      {actions && (
        <div className="col-span-2 sm:col-span-1 flex flex-wrap items-center gap-2 sm:justify-end">
          {actions}
        </div>
      )}
      {footer && <div className="col-span-2 sm:col-span-3">{footer}</div>}
    </article>
  );
}

export function Score({
  value,
  label,
  title,
}: {
  value?: number;
  label?: string;
  title?: string;
}) {
  const rounded = value === undefined ? undefined : Math.round(value);
  const colour =
    rounded === undefined
      ? "text-slate-400"
      : rounded >= 70
        ? "text-emerald-300"
        : rounded >= 40
          ? "text-amber-300"
          : "text-slate-400";
  return (
    <div
      className="flex flex-col items-center leading-tight w-10 text-center"
      title={title}
    >
      <span className={`text-base font-semibold tabular-nums ${colour}`}>
        {rounded ?? "—"}
      </span>
      {label && <span className="text-[11px] text-slate-400">{label}</span>}
    </div>
  );
}

export interface MenuItem {
  key: string;
  label: ReactNode;
  onSelect?: () => void;
  href?: string;
  danger?: boolean;
  disabled?: boolean;
}

// "⋯" button with a popup menu: outside click and Escape close it, arrows move.
export function Menu({
  label,
  items,
  size = "md",
  className = "",
  ...rest
}: Omit<ButtonHTMLAttributes<HTMLButtonElement>, "children"> & {
  label: string;
  items: MenuItem[];
  size?: keyof typeof sizes;
}) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const id = useId();
  useEffect(() => {
    if (!open) return;
    const panel = root.current?.querySelector<HTMLElement>('[role="menu"]');
    panel?.querySelector<HTMLElement>("[role='menuitem']")?.focus();
    function outside(e: Event) {
      if (!root.current?.contains(e.target as Node)) setOpen(false);
    }
    function keys(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.stopPropagation();
        setOpen(false);
        root.current?.querySelector("button")?.focus();
        return;
      }
      if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
      const entries = Array.from(
        panel?.querySelectorAll<HTMLElement>("[role='menuitem']") ?? [],
      );
      if (!entries.length) return;
      e.preventDefault();
      const at = entries.indexOf(document.activeElement as HTMLElement);
      const next =
        e.key === "ArrowDown"
          ? entries[(at + 1) % entries.length]
          : entries[(at - 1 + entries.length) % entries.length];
      next?.focus();
    }
    document.addEventListener("mousedown", outside);
    document.addEventListener("keydown", keys);
    return () => {
      document.removeEventListener("mousedown", outside);
      document.removeEventListener("keydown", keys);
    };
  }, [open]);
  const item =
    "block w-full text-left px-3 py-2 text-sm whitespace-nowrap rounded-md hover:bg-slate-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-indigo-400 disabled:opacity-50";
  return (
    <div ref={root} className={`relative ${className}`}>
      <Button
        aria-label={label}
        title={label}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={id}
        size={size}
        variant="secondary"
        className="px-2.5"
        onClick={(e: MouseEvent<HTMLButtonElement>) => {
          e.stopPropagation();
          setOpen((value) => !value);
        }}
        {...rest}
      >
        <span aria-hidden="true">⋯</span>
      </Button>
      {open && (
        <div
          id={id}
          role="menu"
          className="absolute right-0 z-30 mt-1 min-w-[12rem] rounded-lg border border-slate-700 bg-slate-800 p-1 shadow-xl"
          onClick={(e) => e.stopPropagation()}
        >
          {items.map((entry) =>
            entry.href ? (
              <a
                key={entry.key}
                role="menuitem"
                href={entry.href}
                target="_blank"
                rel="noreferrer"
                className={`${item} text-slate-100`}
                onClick={() => setOpen(false)}
              >
                {entry.label}
              </a>
            ) : (
              <button
                key={entry.key}
                type="button"
                role="menuitem"
                disabled={entry.disabled}
                className={`${item} ${entry.danger ? "text-red-300" : "text-slate-100"}`}
                onClick={() => {
                  setOpen(false);
                  entry.onSelect?.();
                }}
              >
                {entry.label}
              </button>
            ),
          )}
        </div>
      )}
    </div>
  );
}

// Right-hand drawer on desktop, full screen on phones. Modal: focus is kept
// inside, Escape / ✕ / backdrop close it, the opener gets focus back.
export function DetailPanel({
  title,
  closeLabel,
  onClose,
  footer,
  children,
}: {
  title: ReactNode;
  closeLabel: string;
  onClose: () => void;
  footer?: ReactNode;
  children: ReactNode;
}) {
  const panel = useRef<HTMLDivElement>(null);
  const close = useRef(onClose);
  close.current = onClose;
  const titleId = useId();
  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    const focusable = () =>
      Array.from(
        panel.current?.querySelectorAll<HTMLElement>(
          'a[href],button:not([disabled]),input,select,textarea,[tabindex]:not([tabindex="-1"])',
        ) ?? [],
      );
    (focusable()[0] ?? panel.current)?.focus();
    function keys(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault();
        close.current();
        return;
      }
      if (e.key !== "Tab") return;
      const items = focusable();
      if (!items.length) return;
      const first = items[0]!;
      const last = items[items.length - 1]!;
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }
    document.addEventListener("keydown", keys);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", keys);
      document.body.style.overflow = overflow;
      opener?.focus?.();
    };
  }, []);
  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div
        className="absolute inset-0 bg-black/60"
        aria-hidden="true"
        onClick={() => close.current()}
      />
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className="relative h-full w-full sm:w-[420px] sm:max-w-[90vw] bg-slate-900 border-l border-slate-700 shadow-2xl flex flex-col"
      >
        <div className="flex items-start justify-between gap-3 p-4 border-b border-slate-800">
          <h2 id={titleId} className="text-base font-semibold text-white">
            {title}
          </h2>
          <button
            type="button"
            onClick={() => close.current()}
            aria-label={closeLabel}
            title={closeLabel}
            className="shrink-0 h-9 w-9 rounded-lg text-slate-300 hover:bg-slate-800 hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-indigo-400"
          >
            <span aria-hidden="true">✕</span>
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-4 space-y-4">{children}</div>
        {footer && (
          <div className="p-4 border-t border-slate-800 flex flex-wrap gap-2">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}

export interface ToastItem {
  id: number;
  text: string;
}

// Stack of notices, oldest on top, each closable. The caller owns the queue
// (cap, auto-dismiss) so this stays a view; the container keeps the
// #toast-container / aria-live contract the journeys read.
export function Toasts({
  items,
  closeLabel,
  onClose,
}: {
  items: ToastItem[];
  closeLabel: string;
  onClose: (id: number) => void;
}) {
  return (
    <div
      id="toast-container"
      aria-live="polite"
      className="fixed bottom-4 right-4 z-50 flex flex-col items-end gap-2"
    >
      {items.map((item) => (
        <div
          key={item.id}
          data-toast
          className="toast-enter pointer-events-auto flex items-start gap-3 max-w-[24rem] rounded-lg border border-slate-600 bg-slate-800 px-4 py-3 text-sm text-slate-100 shadow-xl"
        >
          <span className="min-w-0 [overflow-wrap:anywhere]">{item.text}</span>
          <button
            type="button"
            aria-label={closeLabel}
            title={closeLabel}
            onClick={() => onClose(item.id)}
            className="shrink-0 -my-1 -mr-2 h-8 w-8 rounded-md text-slate-300 hover:bg-slate-700 hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-indigo-400"
          >
            <span aria-hidden="true">✕</span>
          </button>
        </div>
      ))}
    </div>
  );
}
