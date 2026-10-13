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
    if (att.totalWorkingDays && att.totalWorkingDays > 0) {
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
    const totalEntitled = balanceItems.reduce((acc, curr) => acc + (curr.entitled || 0), 0);
    const totalTaken = leave.takenThisYear || 0;
    if (totalEntitled > 0) {
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
