'use strict';

class DateUtils {
  static parse(dateInput) {
    if (!dateInput) return null;
    const parsed = new Date(dateInput);
    if (isNaN(parsed.getTime())) return null;
    return parsed;
  }

  static calculateTenure(startDate, endDate = new Date()) {
    const start = this.parse(startDate);
    const end = this.parse(endDate);
    if (!start || !end || start > end) {
      return { years: 0, months: 0, totalDays: 0, formatted: 'Unknown' };
    }
    const diffMs = end.getTime() - start.getTime();
    const totalDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    let years = end.getFullYear() - start.getFullYear();
    let months = end.getMonth() - start.getMonth();
    if (end.getDate() < start.getDate()) {
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
    const parsed = this.parse(dateInput);
    return parsed ? parsed.toISOString().split('T')[0] : null;
  }
}

module.exports = DateUtils;
