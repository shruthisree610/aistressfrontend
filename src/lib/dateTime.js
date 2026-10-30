/**
 * Shared Authoritative DateTime Formatting Utilities for NIVARA
 * Standardizes display timezone to Asia/Kolkata (Indian Standard Time, IST)
 * with robust error handling for missing, invalid, or malformed timestamps.
 */

export const DEFAULT_TIMEZONE = 'Asia/Kolkata';

/**
 * Safely parses any date string, timestamp number, or Date instance.
 * Returns null if the value is missing, empty, or not a valid date.
 */
export function parseDate(val) {
  if (!val) return null;
  const d = new Date(val);
  return isNaN(d.getTime()) ? null : d;
}

/**
 * Formats a timestamp into a full date and time string in Asia/Kolkata timezone.
 * Example output: "30 Oct 2026, 03:15 pm"
 * 
 * @param {string|number|Date|null} val - Date to format
 * @param {object} [options] - Optional formatting options
 * @param {string} [options.fallback='—'] - Fallback text if date is invalid
 * @param {string} [options.timeZone='Asia/Kolkata'] - Override timezone
 * @returns {string} Formatted string
 */
export function formatDateTime(val, options = {}) {
  const d = parseDate(val);
  if (!d) return options.fallback || '—';
  try {
    return new Intl.DateTimeFormat('en-IN', {
      timeZone: options.timeZone || DEFAULT_TIMEZONE,
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: true,
      ...options
    }).format(d);
  } catch {
    return d.toLocaleString();
  }
}

/**
 * Formats a timestamp into time-only in Asia/Kolkata timezone.
 * Example output: "03:15 pm"
 * 
 * @param {string|number|Date|null} val - Date to format
 * @param {object} [options] - Optional formatting options
 * @param {string} [options.fallback='—'] - Fallback text if date is invalid
 * @param {string} [options.timeZone='Asia/Kolkata'] - Override timezone
 * @returns {string} Formatted time string
 */
export function formatTime(val, options = {}) {
  const d = parseDate(val);
  if (!d) return options.fallback || '—';
  try {
    return new Intl.DateTimeFormat('en-IN', {
      timeZone: options.timeZone || DEFAULT_TIMEZONE,
      hour: '2-digit',
      minute: '2-digit',
      hour12: true,
      ...options
    }).format(d);
  } catch {
    return d.toLocaleTimeString();
  }
}

/**
 * Formats a timestamp into date-only in Asia/Kolkata timezone.
 * Example output: "30 Oct 2026"
 * 
 * @param {string|number|Date|null} val - Date to format
 * @param {object} [options] - Optional formatting options
 * @param {string} [options.fallback='—'] - Fallback text if date is invalid
 * @param {string} [options.timeZone='Asia/Kolkata'] - Override timezone
 * @returns {string} Formatted date string
 */
export function formatDate(val, options = {}) {
  const d = parseDate(val);
  if (!d) return options.fallback || '—';
  try {
    return new Intl.DateTimeFormat('en-IN', {
      timeZone: options.timeZone || DEFAULT_TIMEZONE,
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      ...options
    }).format(d);
  } catch {
    return d.toLocaleDateString();
  }
}
