import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatTimestamp(timestamp: number): string {
  const time = new Date(timestamp).getTime();
  if (!Number.isFinite(time) || timestamp <= 0) return '—';
  const minutes = Math.max(0, Math.floor((Date.now() - time) / 60_000));
  if (minutes === 0) return 'Just now';
  const days = Math.floor(minutes / 1440);
  const hours = Math.floor((minutes % 1440) / 60);
  const remainingMinutes = minutes % 60;
  return [days && `${days}d`, hours && `${hours}h`, remainingMinutes && `${remainingMinutes}m`]
    .filter(Boolean).join(' ') + ' ago';
}

export function formatScore(score: number | null | undefined): string {
  if (score == null || !Number.isFinite(score)) return '—';
  // Integers print bare; fractions use 2 decimals.
  return Number.isInteger(score) ? score.toString() : score.toFixed(2);
}
