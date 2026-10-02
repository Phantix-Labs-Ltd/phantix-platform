import React, { useEffect, useId, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { X, Loader2, ChevronDown, Eye, EyeOff } from "lucide-react";
import { cx, statusColor, titleCase } from "@/lib/utils";

export function StatusBadge({ status }: { status: string | null | undefined }) {
  const cls = statusColor[status ?? ""] ?? "text-slate-400 bg-slate-400/10 border-slate-500/30";
  return (
    <span className={cx("chip capitalize", cls)}>
      <span className="h-1.5 w-1.5 rounded-full bg-current" />
      {titleCase(status)}
    </span>
  );
}

/** Password input with a show/hide toggle --- `leadingIcon` renders inside the
 *  same relative wrapper as the pre-existing left-icon inputs on auth pages. */
export function PasswordInput({
  leadingIcon,
  className,
  ...props
}: { leadingIcon?: React.ReactNode; className?: string } & Omit<React.InputHTMLAttributes<HTMLInputElement>, "type">) {
  const [visible, setVisible] = useState(false);
  return (
    <div className="relative">
      {leadingIcon}
      <input {...props} type={visible ? "text" : "password"} className={cx(className, "!pr-10")} />
      <button
        type="button"
        onClick={() => setVisible((v) => !v)}
        aria-label={visible ? "Hide password" : "Show password"}
        aria-pressed={visible}
        className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded-md p-2 text-slate-500 hover:bg-phantix-800/70 hover:text-slate-300"
      >
        {visible ? <EyeOff size={15} /> : <Eye size={15} />}
      </button>
    </div>
  );
}

// Card padding steps. "md" is the default; "sm" is for one-line strips and
// callouts; "none" is for cards whose children pad themselves (tables, divided
// lists), so the padding is never applied twice.
const CARD_PAD = { none: "", sm: "px-4 py-3", md: "p-4" } as const;

export function Card({ children, className, hover, pad = "md" }: { children: React.ReactNode; className?: string; hover?: boolean; pad?: keyof typeof CARD_PAD }) {
  return (
    <div className={cx("card", CARD_PAD[pad], hover && "transition-all duration-300 hover:border-phantix-500/60 hover:border-gold-400/60-blue hover:-translate-y-0.5", className)}>
      {children}
    </div>
  );
}

/** Card whose body can be collapsed away --- for informational/reference
 *  content (checklists, ID lookups, static feature lists) that a user only
 *  needs occasionally and otherwise just occupies vertical space. */
export function CollapsibleCard({
  title,
  subtitle,
  action,
  defaultOpen = true,
  className,
  children,
}: {
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  action?: React.ReactNode;
  defaultOpen?: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className={cx("card p-4", className)}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-start justify-between gap-4 text-left"
        aria-expanded={open}
      >
        <div>
          <h3 className="font-display text-[15px] font-semibold text-slate-100">{title}</h3>
          {subtitle && <p className="mt-0.5 text-xs text-slate-400">{subtitle}</p>}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {action}
          <ChevronDown size={16} className={cx("text-slate-500 transition-transform", open && "rotate-180")} />
        </div>
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
            className="overflow-hidden"
          >
            <div className="pt-4">{children}</div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/** Label/value pairs as one divided list: a hairline between rows instead of
 *  a bordered box per row, so nine fields take ~330px, not ~520px. */
export function KeyValueList({ rows, className }: { rows: ReadonlyArray<readonly [React.ReactNode, React.ReactNode]>; className?: string }) {
  return (
    <dl className={cx("divide-y divide-phantix-700/40 rounded-md border border-phantix-700/40 bg-phantix-950/50", className)}>
      {rows.map(([k, v], i) => (
        <div key={i} className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 px-3.5 py-2">
          <dt className="shrink-0 text-xs font-medium uppercase tracking-wider text-slate-500">{k}</dt>
          <dd className="min-w-0 max-w-full">{v}</dd>
        </div>
      ))}
    </dl>
  );
}

export function CardHeader({ title, subtitle, action }: { title: React.ReactNode; subtitle?: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div className="mb-3 flex items-start justify-between gap-4">
      <div>
        <h3 className="font-display text-[15px] font-semibold text-slate-100">{title}</h3>
        {subtitle && <p className="mt-0.5 text-xs text-slate-400">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}

export function PageHeader({ title, description, actions }: { title: string; description?: string; actions?: React.ReactNode }) {
  return (
    <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }} className="mb-4 flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
      <div>
        <h1 className="font-display text-[24px] font-bold leading-tight tracking-tight text-white">{title}</h1>
        {description && <p className="mt-1 max-w-3xl text-sm text-slate-400">{description}</p>}
      </div>
      {/* Header buttons run compact (~34px): they sit beside a title, not a form. */}
      {actions && <div className="flex flex-wrap items-center gap-2 [&_.btn-primary]:py-1.5 [&_.btn-secondary]:py-1.5 [&_.btn-ghost]:py-1.5 [&_.btn-danger]:py-1.5">{actions}</div>}
    </motion.div>
  );
}

export function AnimatedNumber({ value, duration = 900 }: { value: number; duration?: number }) {
  const [display, setDisplay] = useState(0);
  const prev = useRef(0);
  useEffect(() => {
    const from = prev.current;
    const start = performance.now();
    let raf: number;
    const tick = (t: number) => {
      const p = Math.min(1, (t - start) / duration);
      const eased = 1 - Math.pow(1 - p, 3);
      setDisplay(Math.round(from + (value - from) * eased));
      if (p < 1) raf = requestAnimationFrame(tick);
      else prev.current = value;
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value, duration]);
  return <>{display.toLocaleString()}</>;
}

const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

export function Modal({ open, onClose, title, children, wide }: { open: boolean; onClose: () => void; title: React.ReactNode; children: React.ReactNode; wide?: boolean }) {
  const titleId = useId();
  const dialogRef = useRef<HTMLDivElement>(null);
  const previouslyFocused = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const fn = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
        return;
      }
      if (e.key !== "Tab" || !dialogRef.current) return;
      const focusable = Array.from(dialogRef.current.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter(
        (el) => el.offsetParent !== null
      );
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    if (open) window.addEventListener("keydown", fn);
    return () => window.removeEventListener("keydown", fn);
  }, [open, onClose]);

  useEffect(() => {
    if (!open) return;
    previouslyFocused.current = document.activeElement as HTMLElement | null;
    const first = dialogRef.current?.querySelector<HTMLElement>(FOCUSABLE_SELECTOR);
    (first ?? dialogRef.current)?.focus();
    return () => {
      previouslyFocused.current?.focus?.();
    };
  }, [open]);

  return (
    <AnimatePresence>
      {open && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-[90] flex items-center justify-center bg-phantix-950/80 backdrop-blur-sm p-4" onClick={onClose}>
          <motion.div
            initial={{ opacity: 0, y: 24, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 16, scale: 0.98 }}
            transition={{ type: "spring", stiffness: 320, damping: 28 }}
            className={cx("glass-bright w-full rounded-2xl shadow-card", wide ? "max-w-3xl" : "max-w-lg")}
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-labelledby={title ? titleId : undefined}
            ref={dialogRef}
            tabIndex={-1}
          >
            <div className="flex items-center justify-between border-b border-phantix-700/40 px-6 py-4">
              <h3 id={titleId} className="font-display text-base font-semibold text-white">{title}</h3>
              <button onClick={onClose} className="rounded-lg p-1.5 text-slate-400 hover:bg-phantix-700/50 hover:text-white">
                <X size={16} />
              </button>
            </div>
            <div className="max-h-[72vh] overflow-y-auto px-6 py-5">{children}</div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

export function Spinner({ className }: { className?: string }) {
  return <Loader2 className={cx("h-4 w-4 animate-spin", className)} />;
}

export function EmptyState({ icon, title, body, action }: { icon: React.ReactNode; title: string; body?: string; action?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-8 text-center">
      <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-xl bg-phantix-800/70 text-phantix-300 [&_svg]:h-[18px] [&_svg]:w-[18px]">{icon}</div>
      <h3 className="font-display text-base font-semibold text-slate-200">{title}</h3>
      {body && <p className="mt-1 max-w-sm text-sm text-slate-400">{body}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function Tabs({ tabs, active, onChange }: { tabs: { id: string; label: React.ReactNode; count?: number }[]; active: string; onChange: (id: string) => void }) {
  return (
    <div className="mb-4 flex flex-wrap items-center gap-1 rounded-md bg-phantix-900/60 border border-phantix-700/40 p-1 w-fit">
      {tabs.map((t) => (
        <button key={t.id} onClick={() => onChange(t.id)} className={cx("relative rounded-lg px-3 py-1.5 text-sm font-medium transition-colors", active === t.id ? "text-slate-100" : "text-slate-400 hover:text-slate-100")}>
          {active === t.id && <motion.span layoutId="tab-pill" className="absolute inset-0 rounded-md border border-gold-400/40 bg-phantix-800" transition={{ type: "spring", stiffness: 400, damping: 32 }} />}
          <span className="relative flex items-center gap-1.5">
            {t.label}
            {t.count !== undefined && (
              <span className={cx("rounded-full px-1.5 py-0.5 text-[12px] font-bold", active === t.id ? "bg-phantix-950/60 text-gold-300" : "bg-phantix-700/60 text-slate-300")}>{t.count}</span>
            )}
          </span>
        </button>
      ))}
    </div>
  );
}

export function ProgressBar({ value, color = "#E8B54D" }: { value: number; color?: string }) {
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-phantix-700/50">
      <motion.div initial={{ width: 0 }} animate={{ width: `${Math.min(100, Math.max(0, value))}%` }} transition={{ duration: 1, ease: [0.22, 1, 0.36, 1] }} className="h-full rounded-full" style={{ background: color, boxShadow: `0 0 10px ${color}66` }} />
    </div>
  );
}

/** Doughnut completion gauge with the percentage in the middle. */
export function CompletionDonut({
  value,
  size = 156,
  label,
  sublabel,
}: {
  value: number;
  size?: number;
  label?: string;
  sublabel?: string;
}) {
  const pct = Math.max(0, Math.min(100, Math.round(value)));
  const stroke = 10;
  const r = 50 - stroke / 2;
  const c = 2 * Math.PI * r;
  const offset = c - (pct / 100) * c;
  return (
    <div className="relative mx-auto flex items-center justify-center" style={{ width: size, height: size }}>
      <svg viewBox="0 0 100 100" className="h-full w-full -rotate-90" role="img" aria-label={`${pct}% complete`}>
        <circle
          cx="50"
          cy="50"
          r={r}
          fill="none"
          stroke="currentColor"
          strokeWidth={stroke}
          className="text-phantix-700/50"
        />
        <motion.circle
          cx="50"
          cy="50"
          r={r}
          fill="none"
          stroke="#E8B54D"
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={c}
          initial={{ strokeDashoffset: c }}
          animate={{ strokeDashoffset: offset }}
          transition={{ duration: 1, ease: [0.22, 1, 0.36, 1] }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center px-6 text-center">
        <span className="font-mono text-[30px] font-semibold leading-none text-white">{pct}%</span>
        {label && <span className="mt-1.5 text-[12px] font-semibold uppercase tracking-[0.16em] text-slate-500">{label}</span>}
        {sublabel && <span className="mt-0.5 text-[12px] text-slate-500">{sublabel}</span>}
      </div>
    </div>
  );
}

export function TableSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <div className="space-y-2.5 p-4">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="skeleton h-11 rounded" style={{ opacity: 1 - i * 0.14 }} />
      ))}
    </div>
  );
}

export function SkeletonCard({ className }: { className?: string }) {
  return (
    <div className={cx("card border-phantix-700/40 bg-phantix-900/50 p-5", className)}>
      <div className="skeleton mb-3 h-4 w-3/4 rounded" />
      <div className="skeleton h-3 w-1/2 rounded" />
    </div>
  );
}

// -- Optimistic UI / page-layout skeletons -----------------------------------
// Each skeleton mirrors the real page layout so the loading state reads as the
// page already rendering rather than as a stalled screen. Pick the variant that
// matches what is about to appear -- a spinner in the middle of an empty page
// tells the user nothing about what they are waiting for.

export function SkeletonBlock({ className }: { className?: string }) {
  return <div className={cx("skeleton", className)} />;
}

/** Page title / subtitle / actions area. */
export function PageHeaderSkeleton({ actions = false }: { actions?: boolean }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div className="min-w-0 flex-1">
        <div className="skeleton mb-2 h-5 w-48 max-w-full rounded" />
        <div className="skeleton h-8 w-72 max-w-full rounded" />
        <div className="skeleton mt-3 h-3 w-96 max-w-full rounded" />
      </div>
      {actions && (
        <div className="flex gap-2">
          <div className="skeleton h-9 w-28 rounded-md" />
          <div className="skeleton h-9 w-32 rounded-md" />
        </div>
      )}
    </div>
  );
}

/** KPI stat card. */
export function StatCardSkeleton({ className }: { className?: string }) {
  return (
    <div className={cx("card border-phantix-700/40 bg-phantix-900/50 p-4", className)}>
      <div className="skeleton h-3 w-16 rounded" />
      <div className="skeleton mt-3 h-7 w-20 rounded" />
      <div className="skeleton mt-2 h-2.5 w-24 rounded" />
    </div>
  );
}

/** A row with icon + two text lines + trailing badge (list / card pages). */
export function CardListSkeleton({ rows = 5, className }: { rows?: number; className?: string }) {
  return (
    <div className={cx("space-y-3", className)}>
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="card border-phantix-700/40 bg-phantix-900/50 p-4">
          <div className="flex items-center gap-3">
            <div className="skeleton h-10 w-10 shrink-0 rounded-md" />
            <div className="min-w-0 flex-1 space-y-2">
              <div className="skeleton h-4 w-2/3 rounded" />
              <div className="skeleton h-3 w-1/3 rounded" />
            </div>
            <div className="skeleton h-6 w-16 shrink-0 rounded-md" />
          </div>
        </div>
      ))}
    </div>
  );
}

/** Card with a header line + table-ish rows (list / report / tracker pages). */
export function TableCardSkeleton({ rows = 5, cols = 4, title = true }: { rows?: number; cols?: number; title?: boolean }) {
  return (
    <div className="card overflow-hidden border-phantix-700/40 bg-phantix-900/50">
      {title && (
        <div className="flex items-center justify-between border-b border-phantix-700/40 px-4 py-3">
          <div className="skeleton h-4 w-40 rounded" />
          <div className="skeleton h-6 w-16 rounded-md" />
        </div>
      )}
      <div className="divide-y divide-phantix-800/40 px-4">
        {Array.from({ length: rows }).map((_, i) => (
          <div key={i} className="grid items-center gap-4 py-3.5" style={{ gridTemplateColumns: `repeat(${cols}, 1fr)` }}>
            {Array.from({ length: cols }).map((__, j) => (
              <div key={j} className="skeleton h-3.5 rounded" style={{ width: j === 0 ? "82%" : "100%", opacity: 1 - i * 0.07 - j * 0.05 }} />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

/** Two-column split (list + detail). */
export function SplitPaneSkeleton({ rows = 4 }: { rows?: number }) {
  return (
    <div className="grid grid-cols-1 gap-5 xl:grid-cols-3">
      <div className="xl:col-span-1">
        <CardListSkeleton rows={rows} />
      </div>
      <div className="xl:col-span-2">
        <SkeletonCard className="h-96" />
      </div>
    </div>
  );
}

/** Stacked label + control rows -- settings and configuration screens. */
export function SettingsSkeleton({ groups = 3, rows = 3 }: { groups?: number; rows?: number }) {
  return (
    <div className="space-y-5">
      {Array.from({ length: groups }).map((_, g) => (
        <div key={g} className="card border-phantix-700/40 bg-phantix-900/50 p-5">
          <div className="skeleton h-4 w-44 rounded" />
          <div className="skeleton mt-2 h-3 w-72 max-w-full rounded" />
          <div className="mt-5 space-y-4">
            {Array.from({ length: rows }).map((__, i) => (
              <div key={i} className="flex items-center justify-between gap-4">
                <div className="min-w-0 flex-1 space-y-2">
                  <div className="skeleton h-3.5 w-40 rounded" />
                  <div className="skeleton h-2.5 w-64 max-w-full rounded" />
                </div>
                <div className="skeleton h-8 w-24 shrink-0 rounded-md" />
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

/** Numbered step rail + active step panel -- the setup wizard shape. */
export function WizardSkeleton({ steps = 5 }: { steps?: number }) {
  return (
    <div className="grid grid-cols-1 gap-5 lg:grid-cols-4">
      <div className="space-y-2 lg:col-span-1">
        {Array.from({ length: steps }).map((_, i) => (
          <div key={i} className="flex items-center gap-3 rounded-md border border-phantix-700/40 bg-phantix-900/50 p-3">
            <div className="skeleton h-7 w-7 shrink-0 rounded-full" />
            <div className="min-w-0 flex-1 space-y-1.5">
              <div className="skeleton h-3 w-24 rounded" />
              <div className="skeleton h-2.5 w-16 rounded" />
            </div>
          </div>
        ))}
      </div>
      <div className="lg:col-span-3">
        <div className="card border-phantix-700/40 bg-phantix-900/50 p-6">
          <div className="skeleton h-5 w-56 rounded" />
          <div className="skeleton mt-3 h-3 w-full max-w-lg rounded" />
          <div className="mt-6 space-y-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="space-y-2">
                <div className="skeleton h-3 w-28 rounded" />
                <div className="skeleton h-9 w-full rounded-md" />
              </div>
            ))}
          </div>
          <div className="mt-6 flex gap-2">
            <div className="skeleton h-9 w-24 rounded-md" />
            <div className="skeleton h-9 w-28 rounded-md" />
          </div>
        </div>
      </div>
    </div>
  );
}

/** KPI grid used on dashboards. */
export function StatGridSkeleton({ count = 4, className }: { count?: number; className?: string }) {
  return (
    <div className={cx("grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4", className)}>
      {Array.from({ length: count }).map((_, i) => <StatCardSkeleton key={i} />)}
    </div>
  );
}

/** Full-page optimistic loading shell -- pick the layout matching the page. */
export function PageSkeleton({
  variant = "cards",
  rows = 5,
  cols = 4,
  actions = false,
  className,
}: {
  variant?: "cards" | "table" | "list" | "split" | "dashboard" | "settings" | "wizard";
  rows?: number;
  cols?: number;
  actions?: boolean;
  className?: string;
}) {
  return (
    <div className={cx("mx-auto max-w-[1400px]", className)}>
      <PageHeaderSkeleton actions={actions} />
      {variant === "dashboard" && (
        <>
          <StatGridSkeleton />
          <div className="mt-5 grid grid-cols-1 gap-5 xl:grid-cols-3">
            <div className="xl:col-span-2"><SkeletonCard className="h-80" /></div>
            <SkeletonCard className="h-80" />
          </div>
        </>
      )}
      {variant === "split" && <SplitPaneSkeleton rows={rows} />}
      {variant === "table" && <TableCardSkeleton rows={rows} cols={cols} />}
      {variant === "list" && <CardListSkeleton rows={rows} />}
      {variant === "settings" && <SettingsSkeleton rows={rows} />}
      {variant === "wizard" && <WizardSkeleton />}
      {variant === "cards" && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: Math.min(rows, 6) }).map((_, i) => <SkeletonCard key={i} />)}
        </div>
      )}
    </div>
  );
}

export function CopyChip({ value, label }: { value: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      onClick={() => {
        navigator.clipboard?.writeText(value).catch(() => {});
        setCopied(true);
        setTimeout(() => setCopied(false), 1600);
      }}
      className="group inline-flex items-center gap-2 rounded-lg border border-phantix-700/50 bg-phantix-950/60 px-2.5 py-1 font-mono text-xs text-slate-300 transition-colors hover:border-gold-400/40 hover:text-gold-300"
      title="Copy"
    >
      {label && <span className="font-sans text-[12px] uppercase tracking-wider text-slate-500">{label}</span>}
      {value}
      <span className="text-[12px] text-slate-600 group-hover:text-gold-400">{copied ? "✓ copied" : "copy"}</span>
    </button>
  );
}
