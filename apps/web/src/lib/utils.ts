import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

/**
 * Merge Tailwind class names with proper conflict resolution.
 * Standard shadcn helper — clsx for conditional logic, tailwind-merge to
 * dedupe conflicting utility classes (e.g. `bg-cobalt bg-cobalt-soft`).
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}
