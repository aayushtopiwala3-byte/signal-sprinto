"use client";

import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

/* ---------------------------------------------------------------- Button */

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 rounded-md text-sm font-medium transition-colors disabled:pointer-events-none disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60 whitespace-nowrap",
  {
    variants: {
      variant: {
        primary: "bg-accent text-white hover:bg-accent-soft",
        outline: "border border-ink-600 bg-transparent hover:bg-ink-800 text-ink-100",
        ghost: "bg-transparent hover:bg-ink-800 text-ink-300 hover:text-ink-100",
        danger: "bg-drop/15 text-drop border border-drop/40 hover:bg-drop/25",
        success: "bg-send/15 text-send border border-send/40 hover:bg-send/25",
      },
      size: {
        sm: "h-7 px-2.5 text-xs",
        md: "h-9 px-3.5",
        lg: "h-10 px-5",
      },
    },
    defaultVariants: { variant: "primary", size: "md" },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, ...props }, ref) => (
    <button ref={ref} className={cn(buttonVariants({ variant, size }), className)} {...props} />
  ),
);
Button.displayName = "Button";

/* ------------------------------------------------------------------ Card */

export function Card({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn("rounded-lg border border-ink-700 bg-ink-900 shadow-sm", className)}
      {...props}
    />
  );
}

export function CardHeader({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("px-4 pt-3.5 pb-2", className)} {...props} />;
}

export function CardTitle({ className, ...props }: React.HTMLAttributes<HTMLHeadingElement>) {
  return <h3 className={cn("text-sm font-semibold tracking-tight", className)} {...props} />;
}

export function CardBody({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("px-4 pb-4", className)} {...props} />;
}

/* ----------------------------------------------------------------- Badge */

const badgeVariants = cva(
  "inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide",
  {
    variants: {
      tone: {
        neutral: "bg-ink-800 text-ink-300 border border-ink-700",
        send: "bg-send/15 text-send border border-send/35",
        hold: "bg-hold/15 text-hold border border-hold/35",
        drop: "bg-drop/15 text-drop border border-drop/35",
        accent: "bg-accent/15 text-accent-soft border border-accent/35",
      },
    },
    defaultVariants: { tone: "neutral" },
  },
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {}

export function Badge({ className, tone, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ tone }), className)} {...props} />;
}

/* ----------------------------------------------------------------- Input */

export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  ({ className, ...props }, ref) => (
    <input
      ref={ref}
      className={cn(
        "h-9 w-full rounded-md border border-ink-700 bg-ink-850 px-3 text-sm placeholder:text-ink-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60",
        className,
      )}
      {...props}
    />
  ),
);
Input.displayName = "Input";

export const Textarea = React.forwardRef<
  HTMLTextAreaElement,
  React.TextareaHTMLAttributes<HTMLTextAreaElement>
>(({ className, ...props }, ref) => (
  <textarea
    ref={ref}
    className={cn(
      "w-full rounded-md border border-ink-700 bg-ink-850 p-3 text-sm leading-relaxed placeholder:text-ink-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60",
      className,
    )}
    {...props}
  />
));
Textarea.displayName = "Textarea";

export function Select({
  className,
  ...props
}: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      className={cn(
        "h-9 rounded-md border border-ink-700 bg-ink-850 px-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60",
        className,
      )}
      {...props}
    />
  );
}

/* ---------------------------------------------------------------- Switch */

export function Switch({
  checked,
  onChange,
  label,
  hint,
  id,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  hint?: string;
  id?: string;
}) {
  return (
    <label htmlFor={id} className="flex cursor-pointer items-start gap-2.5 py-1">
      <button
        id={id}
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        onClick={() => onChange(!checked)}
        className={cn(
          "mt-0.5 h-4.5 w-8 shrink-0 rounded-full border transition-colors",
          checked ? "border-accent bg-accent" : "border-ink-600 bg-ink-800",
        )}
      >
        <span
          className={cn(
            "block h-3 w-3 rounded-full bg-white transition-transform",
            checked ? "translate-x-4" : "translate-x-0.5",
          )}
        />
      </button>
      <span className="min-w-0">
        <span className="block text-xs font-medium text-ink-100">{label}</span>
        {hint ? <span className="block text-[11px] leading-snug text-ink-400">{hint}</span> : null}
      </span>
    </label>
  );
}

/* ---------------------------------------------------------------- Slider */

export function Slider({
  value,
  onChange,
  min = 0,
  max = 50,
  label,
  sublabel,
}: {
  value: number;
  onChange: (v: number) => void;
  min?: number;
  max?: number;
  label: string;
  sublabel?: string;
}) {
  return (
    <div className="py-1">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-xs font-medium text-ink-100">{label}</span>
        <span className="font-mono text-xs text-accent-soft">{value}</span>
      </div>
      {sublabel ? (
        <p className="mb-1 text-[11px] leading-snug text-ink-400">{sublabel}</p>
      ) : null}
      <input
        type="range"
        min={min}
        max={max}
        value={value}
        aria-label={label}
        onChange={(e) => onChange(Number(e.target.value))}
        className="h-1.5 w-full cursor-pointer appearance-none rounded-full bg-ink-700 accent-accent"
      />
    </div>
  );
}

/* ------------------------------------------------------------------ Tabs */

export function Tabs({
  tabs,
  active,
  onChange,
}: {
  tabs: { id: string; label: string; count?: number }[];
  active: string;
  onChange: (id: string) => void;
}) {
  return (
    <div className="flex gap-1 overflow-x-auto border-b border-ink-700">
      {tabs.map((t) => (
        <button
          key={t.id}
          onClick={() => onChange(t.id)}
          className={cn(
            "-mb-px whitespace-nowrap border-b-2 px-3 py-2 text-xs font-medium transition-colors",
            active === t.id
              ? "border-accent text-ink-100"
              : "border-transparent text-ink-400 hover:text-ink-100",
          )}
        >
          {t.label}
          {t.count !== undefined ? (
            <span className="ml-1.5 font-mono text-ink-400">{t.count}</span>
          ) : null}
        </button>
      ))}
    </div>
  );
}

/* ----------------------------------------------------------------- Chips */

/** Marks a value the model produced (§9 labelling rules). */
export function AiChip() {
  return (
    <Badge tone="accent" title="Produced by Gemini Flash">
      AI
    </Badge>
  );
}

/** Marks a verbatim quote and links to the page it came from (§9 labelling rules). */
export function QuoteChip({ url }: { url: string | null }) {
  if (!url) return <Badge tone="neutral">quote</Badge>;
  return (
    <a
      href={url}
      target="_blank"
      rel="noreferrer"
      className="inline-flex"
      title={`Open source: ${url}`}
    >
      <Badge tone="neutral" className="hover:border-accent hover:text-accent-soft">
        quote ↗
      </Badge>
    </a>
  );
}

/** The literal string `not stated`, in muted type. Never blank, never guessed. */
export function NotStated() {
  return <span className="font-mono text-xs text-ink-400">not stated</span>;
}
