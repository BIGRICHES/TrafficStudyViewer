/**
 * Date utility functions
 */

/**
 * Format a date for display (MM/DD/YYYY)
 * @param {Date|string} date
 * @returns {string}
 */
export function formatDate(date) {
    if (!date) return '';
    const d = new Date(date);
    if (isNaN(d.getTime())) return '';

    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    const year = d.getFullYear();

    return `${month}/${day}/${year}`;
}

/**
 * Format a date range for display
 * @param {Date|string} start
 * @param {Date|string} end
 * @returns {string}
 */
export function formatDateRange(start, end) {
    const startStr = formatDate(start);
    const endStr = formatDate(end);

    if (!startStr) return 'N/A';
    if (!endStr || startStr === endStr) return startStr;

    return `${startStr} - ${endStr}`;
}

/**
 * Format date for chart label (short format)
 * @param {Date} date
 * @returns {string}
 */
export function formatChartDate(date) {
    if (!date) return '';
    const d = new Date(date);
    const month = String(d.getMonth() + 1);
    const day = String(d.getDate());
    return `${month}/${day}`;
}

/**
 * Format hour for chart label
 * @param {number} hour - Hour (0-23)
 * @returns {string}
 */
export function formatHour(hour) {
    if (hour === 0) return '12 AM';
    if (hour === 12) return '12 PM';
    if (hour < 12) return `${hour} AM`;
    return `${hour - 12} PM`;
}

/**
 * Get date string for grouping (YYYY-MM-DD)
 * @param {Date} date
 * @returns {string}
 */
export function getDateKey(date) {
    const d = new Date(date);
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

/**
 * Get hour from date (0-23)
 * @param {Date} date
 * @returns {number}
 */
export function getHour(date) {
    return new Date(date).getHours();
}

/**
 * Check if date is within range
 * @param {Date} date
 * @param {Date} start
 * @param {Date} end
 * @returns {boolean}
 */
export function isInRange(date, start, end) {
    const d = new Date(date).getTime();
    const s = start ? new Date(start).getTime() : -Infinity;
    const e = end ? new Date(end).getTime() : Infinity;
    return d >= s && d <= e;
}
