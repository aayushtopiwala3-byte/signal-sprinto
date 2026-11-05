import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function fmtUsd(n: number): string {
  return `$${n.toFixed(4)}`;
}

export function fmtInr(n: number): string {
  return `₹${n.toFixed(2)}`;
}

export function pct(n: number): string {
  return `${Math.round(n * 100)}%`;
}

/** Shorten a quote for card previews without ever altering the stored verbatim text. */
export function truncate(s: string, max: number): string {
  return s.length <= max ? s : `${s.slice(0, max - 1).trimEnd()}…`;
}

export function timeAgo(iso: string | Date | null): string {
  if (!iso) return "never";
  const then = typeof iso === "string" ? new Date(iso) : iso;
  const mins = Math.floor((Date.now() - then.getTime()) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}
