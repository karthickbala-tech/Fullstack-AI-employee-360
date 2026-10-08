'use strict';

const { DATA_CLASSIFICATION } = require('../config/constants');

class TrendService {
  static evaluate(canonical) {
    const trends = [];
    const perf = canonical.performance || {};
    const att = canonical.attendance || {};

    if (Array.isArray(perf.historicalRatings) && perf.historicalRatings.length >= 2) {
      const recent = perf.historicalRatings.slice(-2);
      const diff = recent[1].rating - recent[0].rating;
      let direction = 'stable';
      if (diff > 0) direction = 'upward';
      if (diff < 0) direction = 'downward';

      trends.push({
        domain: 'performance',
        metric: 'appraisal_rating',
        trend: direction,
        delta: diff,
        classification: DATA_CLASSIFICATION.TREND,
        evidenceRefs: ['performance.historicalRatings'],
        evidence: `Compared ${recent[0].period} (${recent[0].rating}) to ${recent[1].period} (${recent[1].rating})`
      });
    }

    if (att.lateDays && att.lateDays > 3) {
      trends.push({
        domain: 'attendance',
        metric: 'punctuality',
        trend: 'attention_required',
        delta: att.lateDays,
        classification: DATA_CLASSIFICATION.TREND,
        evidenceRefs: ['attendance.lateDays'],
        evidence: `${att.lateDays} late check-in instances recorded in current cycle`
      });
    }

    return trends;
  }
}

module.exports = TrendService;
