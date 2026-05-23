/**
 * Shared date utility functions for ArrowLive.
 * All date comparisons use local dates (not UTC) to avoid timezone bugs.
 * Dates are stored as plain YYYY-MM-DD strings.
 */

/**
 * Parse a YYYY-MM-DD date string as a local date (not UTC).
 * Using `new Date("2026-05-22")` treats it as UTC midnight which shifts
 * to the previous day in western timezones. This function avoids that.
 */
export function parseLocalDate(dateStr: string): Date {
  if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
    const [y, m, d] = dateStr.split('-').map(Number);
    return new Date(y, m - 1, d);
  }
  return new Date(dateStr);
}

/**
 * Get today's date at local midnight (no time component).
 */
export function getToday(): Date {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
}

/**
 * Get today's date as a YYYY-MM-DD string in local timezone.
 */
export function getTodayString(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/**
 * Determine tournament status from start date and optional end date.
 * - Active: today is between start and end (inclusive)
 * - Upcoming: today is before start
 * - Completed: today is after end
 */
export function getTournamentStatus(
  startDate: string,
  endDate?: string | null
): 'active' | 'upcoming' | 'completed' {
  const today = getToday();
  const start = parseLocalDate(startDate);
  const end = endDate ? parseLocalDate(endDate) : new Date(start.getTime());

  if (today >= start && today <= end) return 'active';
  if (today < start) return 'upcoming';
  return 'completed';
}

/**
 * Format a date string for display (e.g., "May 22, 2026").
 */
export function formatDate(dateStr: string): string {
  const date = parseLocalDate(dateStr);
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

/**
 * Get number of days until a given date from today.
 */
export function getDaysUntil(dateStr: string): number {
  const today = getToday();
  const target = parseLocalDate(dateStr);
  return Math.ceil((target.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
}

/**
 * Format a date range for display.
 * Single day: "May 22, 2026"
 * Multi-day: "May 22 - May 24, 2026"
 */
export function formatDateRange(startDate: string, endDate?: string | null): string {
  if (!endDate || endDate === startDate) {
    return formatDate(startDate);
  }
  const start = parseLocalDate(startDate);
  const end = parseLocalDate(endDate);
  
  if (start.getFullYear() === end.getFullYear()) {
    const startStr = start.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    const endStr = end.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    return `${startStr} - ${endStr}`;
  }
  return `${formatDate(startDate)} - ${formatDate(endDate)}`;
}