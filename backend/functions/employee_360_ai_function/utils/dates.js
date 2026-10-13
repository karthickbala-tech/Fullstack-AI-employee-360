'use strict';

const MONTHS = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6,
  jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12
};

function pad2(n) {
  return String(n).padStart(2, '0');
}

function isValidYmd(year, month, day) {
  if (month < 1 || month > 12 || day < 1) return false;
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return day <= daysInMonth;
}

class DateUtils {
  /**
   * Converts a source date to an ISO calendar date (YYYY-MM-DD) without any
   * timezone conversion. Only unambiguous formats are accepted:
   *   YYYY-MM-DD[ HH:mm:ss | THH:mm:ss...]  and  dd-MMM-yyyy[ HH:mm:ss] (Zoho default).
   * Numeric dd-MM-yyyy / MM-dd-yyyy are ambiguous and return null (Unknown).
   */
  static toIsoDate(dateInput) {
    if (dateInput instanceof Date) {
      return isNaN(dateInput.getTime()) ? null : dateInput.toISOString().slice(0, 10);
    }
    if (typeof dateInput !== 'string') return null;
    const text = dateInput.trim();

    let match = text.match(/^(\d{4})-(\d{2})-(\d{2})(?:[ T].*)?$/);
    if (match) {
      const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])];
      return isValidYmd(year, month, day) ? `${match[1]}-${match[2]}-${match[3]}` : null;
    }

    match = text.match(/^(\d{1,2})-([A-Za-z]{3})-(\d{4})(?:\s.*)?$/);
    if (match) {
      const day = Number(match[1]);
      const month = MONTHS[match[2].toLowerCase()];
      const year = Number(match[3]);
      return month && isValidYmd(year, month, day) ? `${year}-${pad2(month)}-${pad2(day)}` : null;
    }

    return null;
  }

  /**
   * Parses a source date into a Date at UTC midnight, or null when the value is
   * missing or not in an unambiguous format.
   */
  static parse(dateInput) {
    if (!dateInput) return null;
    if (dateInput instanceof Date) {
      return isNaN(dateInput.getTime()) ? null : dateInput;
    }
    const iso = this.toIsoDate(dateInput);
    return iso ? new Date(`${iso}T00:00:00Z`) : null;
  }

  static calculateTenure(startDate, endDate = new Date()) {
    const start = this.parse(startDate);
    const end = this.parse(endDate);
    if (!start || !end || start > end) {
      return { years: 0, months: 0, totalDays: 0, formatted: 'Unknown' };
    }
    const diffMs = end.getTime() - start.getTime();
    const totalDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    let years = end.getUTCFullYear() - start.getUTCFullYear();
    let months = end.getUTCMonth() - start.getUTCMonth();
    if (end.getUTCDate() < start.getUTCDate()) {
      months -= 1;
    }
    if (months < 0) {
      years -= 1;
      months += 12;
    }
    return {
      years: Math.max(0, years),
      months: Math.max(0, months),
      totalDays,
      formatted: `${years} yr${years === 1 ? '' : 's'} ${months} mo${months === 1 ? '' : 's'}`
    };
  }

  static toIsoDateString(dateInput) {
    return this.toIsoDate(dateInput);
  }
}

module.exports = DateUtils;
