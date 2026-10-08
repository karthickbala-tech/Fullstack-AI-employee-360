'use strict';

const DateUtils = require('../utils/dates');
const { DATA_CLASSIFICATION } = require('../config/constants');

class MetricsService {
  static calculate(canonical) {
    const metrics = {};
    const emp = canonical.employment || {};
    const att = canonical.attendance || {};
    const leave = canonical.leave || {};
    const perf = canonical.performance || {};

    // 1. Tenure
    if (emp.dateOfJoining) {
      metrics.tenure = {
        ...DateUtils.calculateTenure(emp.dateOfJoining),
        classification: DATA_CLASSIFICATION.CALCULATION
      };
    } else {
      metrics.tenure = {
        formatted: 'Unknown',
        classification: DATA_CLASSIFICATION.UNKNOWN
      };
    }

    // 2. Attendance rate
    if (
      Number.isFinite(att.totalWorkingDays) &&
      att.totalWorkingDays > 0 &&
      Number.isFinite(att.presentDays) &&
      att.presentDays >= 0
    ) {
      const percentage = Math.round((att.presentDays / att.totalWorkingDays) * 100);
      metrics.attendancePercentage = {
        value: percentage,
        formatted: `${percentage}%`,
        classification: DATA_CLASSIFICATION.CALCULATION
      };
    } else {
      metrics.attendancePercentage = {
        value: null,
        formatted: 'Unknown',
        classification: DATA_CLASSIFICATION.UNKNOWN
      };
    }

    // 3. Leave Utilization
    const balanceItems = Array.isArray(leave.balance) ? leave.balance : [];
    const entitledValues = balanceItems
      .map(item => item?.entitled)
      .filter(value => Number.isFinite(value) && value >= 0);

    const takenValues = balanceItems
      .map(item => item?.taken)
      .filter(value => Number.isFinite(value) && value >= 0);

    const totalEntitled = entitledValues.length > 0
      ? entitledValues.reduce((acc, value) => acc + value, 0)
      : null;

    const totalTaken = takenValues.length > 0
      ? takenValues.reduce((acc, value) => acc + value, 0)
      : null;

    if (
      totalEntitled !== null &&
      totalEntitled > 0 &&
      totalTaken !== null
    ) {
      const rate = Math.round((totalTaken / totalEntitled) * 100);
      metrics.leaveUtilization = {
        value: rate,
        formatted: `${rate}%`,
        classification: DATA_CLASSIFICATION.CALCULATION
      };
    } else {
      metrics.leaveUtilization = {
        value: null,
        formatted: 'Unknown',
        classification: DATA_CLASSIFICATION.UNKNOWN
      };
    }

    // 4. Performance Rating
    if (perf.overallRating !== null && perf.overallRating !== undefined) {
      metrics.performanceRating = {
        value: perf.overallRating,
        classification: DATA_CLASSIFICATION.FACT
      };
    } else {
      metrics.performanceRating = {
        value: null,
        formatted: 'Unknown',
        classification: DATA_CLASSIFICATION.UNKNOWN
      };
    }

    return metrics;
  }
}

module.exports = MetricsService;


