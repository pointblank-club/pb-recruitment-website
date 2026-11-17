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
  if (score == null || isNaN(score)) return '0';
  // Strip trailing zeroes if clean integer, or show up to 2 decimal places:
  return Number.isInteger(score) ? score.toString() : score.toFixed(2);
}
