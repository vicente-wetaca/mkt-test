// Timestamp utilities: generates a sortable UTC timestamp string used in file names.

/**
 * Formats a Date into the YYYYMMDD-HHMMSS-mmm string pattern.
 *
 * @param date - The date to format (defaults to now).
 * @returns A string like "20260519-143022-001".
 */
export function formatTimestamp(date: Date = new Date()): string {
  const year = date.getUTCFullYear().toString().padStart(4, '0')
  const month = (date.getUTCMonth() + 1).toString().padStart(2, '0')
  const day = date.getUTCDate().toString().padStart(2, '0')
  const hours = date.getUTCHours().toString().padStart(2, '0')
  const minutes = date.getUTCMinutes().toString().padStart(2, '0')
  const seconds = date.getUTCSeconds().toString().padStart(2, '0')
  const millis = date.getUTCMilliseconds().toString().padStart(3, '0')

  return `${year}${month}${day}-${hours}${minutes}${seconds}-${millis}`
}

/**
 * Returns a fresh timestamp string for the current UTC moment.
 *
 * @returns A string like "20260519-143022-001".
 */
export function nowTimestamp(): string {
  return formatTimestamp(new Date())
}
