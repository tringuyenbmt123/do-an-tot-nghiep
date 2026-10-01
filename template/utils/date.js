// =============================================================================
// src/utils/date.js
// Safe UTC / Local Date Parser and Formatter
// =============================================================================

/**
 * Parses a date string or timestamp into a valid JavaScript Date object.
 * If the input string is an ISO format without timezone indicator,
 * treats it as UTC (since backend stores naive UTC timestamps).
 */
export function parseDate(dateInput) {
  if (!dateInput) return null;
  if (dateInput instanceof Date) return isNaN(dateInput.getTime()) ? null : dateInput;

  // If number or numeric string (Unix epoch)
  if (typeof dateInput === 'number' || (/^\d+$/.test(String(dateInput).trim()) && !isNaN(Number(dateInput)))) {
    const num = Number(dateInput);
    // If seconds instead of milliseconds (e.g. 10 digits vs 13 digits)
    const ms = num < 1e11 ? num * 1000 : num;
    const d = new Date(ms);
    return isNaN(d.getTime()) ? null : d;
  }

  let s = String(dateInput).trim();

  // If standard ISO or SQL datetime without timezone (e.g., "2026-09-19T01:18:00" or "2026-09-19 01:18:00")
  // Backend stores naive UTC, so we append 'Z' so the browser displays it in user's local timezone (+07:00)
  if (/^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}(:\d{2}(\.\d+)?)?$/.test(s)) {
    s = s.replace(' ', 'T') + 'Z';
  }

  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d;
}

/**
 * Formats time as HH:mm:ss in user's local timezone.
 */
export function formatTime(dateInput, fallback = '—') {
  const d = parseDate(dateInput);
  if (!d) return fallback;
  return d.toLocaleTimeString('en-GB');
}

/**
 * Formats date and time as DD/MM/YYYY, HH:mm:ss in user's local timezone.
 */
export function formatDateTime(dateInput, fallback = '—') {
  const d = parseDate(dateInput);
  if (!d) return fallback;
  return d.toLocaleString('en-GB');
}

/**
 * Formats date as DD/MM/YYYY in user's local timezone.
 */
export function formatDate(dateInput, fallback = '—') {
  const d = parseDate(dateInput);
  if (!d) return fallback;
  return d.toLocaleDateString('en-GB');
}
