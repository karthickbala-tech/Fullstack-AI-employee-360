'use strict';

const crypto = require('crypto');

/**
 * Deterministic timeline event ID. The same function is used when events are
 * generated, persisted and read back, so one source event always has one ID.
 *
 * eventDate must be an ISO calendar date (YYYY-MM-DD).
 */
function buildTimelineEventId({ tenantId, employeeId, eventCode, eventDate, sourceRecordId }) {
  const identity = [
    tenantId || '',
    employeeId || '',
    eventCode || '',
    eventDate || '',
    sourceRecordId || ''
  ].join('|');

  return crypto.createHash('sha256').update(identity).digest('hex');
}

module.exports = {
  buildTimelineEventId
};
