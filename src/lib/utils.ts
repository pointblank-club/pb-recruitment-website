import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatTimestamp(timestamp: number): string {
  const date = new Date(timestamp);
  const now = new Date();
  const diffInSeconds = Math.floor((now.getTime() - date.getTime()) / 1000);
  const minutes = Math.floor(diffInSeconds / 60);
  
  return `${minutes}m ago`;
}

export function formatScore(score: number | null | undefined): string {
  if (score == null || !Number.isFinite(score)) return '—';
  // Integers print bare; fractions use 2 decimals.
  return Number.isInteger(score) ? score.toString() : score.toFixed(2);
}
