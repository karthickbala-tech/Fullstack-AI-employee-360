'use strict';

const DateUtils = require('../utils/dates');
const { buildTimelineEventId } = require('../utils/identifiers');

/**
 * Timeline event codes (BRD §54). `type` is the presentation group the API has
 * always returned; `eventCode` is the stable identity stored in TimelineEvents.eventType.
 */
const TIMELINE_EVENT_DEFINITIONS = {
  JOINED: { type: 'LIFECYCLE', title: 'Joined Company', domain: 'employment' },
  CONFIRMED: { type: 'MILESTONE', title: 'Employment Confirmed', domain: 'employment' },
  PROMOTED: { type: 'CAREER', title: 'Promoted', domain: 'career' },

  // Verified Zoho People lifecycle form events.
  RESIGNATION: { type: 'LIFECYCLE', title: 'Resignation Initiated', domain: 'lifecycle' },
  TERMINATION: { type: 'LIFECYCLE', title: 'Termination Recorded', domain: 'lifecycle' },
  DECEASED: { type: 'LIFECYCLE', title: 'Deceased Record', domain: 'lifecycle' },
  EXIT: { type: 'LIFECYCLE', title: 'Separation Recorded', domain: 'lifecycle' }
};

class TimelineIntelligenceService {
  static get definitions() {
    return TIMELINE_EVENT_DEFINITIONS;
  }

  static createEvent(canonical, { eventCode, date, description = null, title = null, sourceRecordId }) {
    const definition = TIMELINE_EVENT_DEFINITIONS[eventCode];
    const isoDate = DateUtils.toIsoDate(date);
    if (!definition || !isoDate) return null;

    const employeeId = canonical.metadata?.employeeId || null;
    const recordId = sourceRecordId === undefined ? (canonical.metadata?.sourceRecordId || null) : sourceRecordId;

    return {
      id: buildTimelineEventId({
        tenantId: canonical.metadata?.tenantId,
        employeeId,
        eventCode,
        eventDate: isoDate,
        sourceRecordId: recordId
      }),
      eventCode,
      type: definition.type,
      title: title || definition.title,
      date: isoDate,
      description,
      domain: definition.domain,
      source: 'zoho_people',
      sourceRecordId: recordId
    };
  }

  static buildEvents(canonical, lifecycleData = {}) {
    const events = [];
    const emp = canonical.employment || {};

    events.push(TimelineIntelligenceService.createEvent(canonical, {
      eventCode: 'JOINED',
      date: emp.dateOfJoining,
      description: emp.jobTitle ? `Joined as ${emp.jobTitle}` : null
    }));

    events.push(TimelineIntelligenceService.createEvent(canonical, {
      eventCode: 'CONFIRMED',
      date: emp.confirmationDate
    }));

    if (Array.isArray(canonical.career?.promotions)) {
      canonical.career.promotions.forEach(promo => {
        events.push(TimelineIntelligenceService.createEvent(canonical, {
          eventCode: 'PROMOTED',
          date: promo?.effectiveDate,
          title: promo?.designation ? `Promoted to ${promo.designation}` : null,
          description: promo?.notes || null,
          sourceRecordId: promo?.sourceRecordId || null
        }));
      });
    }

    const resignationRecords = Array.isArray(lifecycleData.resignationRecords)
      ? lifecycleData.resignationRecords
      : [];

    resignationRecords.forEach(record => {
      events.push(TimelineIntelligenceService.createEvent(canonical, {
        eventCode: 'RESIGNATION',
        date: record?.Date_of_request,
        sourceRecordId: null,
        description: record?.Reason
          ? `Resignation initiated: ${record.Reason}`
          : 'Resignation initiated'
      }));
    });

    const terminationRecords = Array.isArray(lifecycleData.terminationRecords)
      ? lifecycleData.terminationRecords
      : [];

    terminationRecords.forEach(record => {
      events.push(TimelineIntelligenceService.createEvent(canonical, {
        eventCode: 'TERMINATION',
        date: record?.Date_of_request,
        sourceRecordId: null,
        description: record?.Reason
          ? `Termination recorded: ${record.Reason}`
          : 'Termination recorded'
      }));
    });

    const deceasedRecords = Array.isArray(lifecycleData.deceasedRecords)
      ? lifecycleData.deceasedRecords
      : [];

    deceasedRecords.forEach(record => {
      events.push(TimelineIntelligenceService.createEvent(canonical, {
        eventCode: 'DECEASED',
        date: record?.Deceased_date,
        sourceRecordId: null,
        description: record?.Reason
          ? `Deceased lifecycle event: ${record.Reason}`
          : 'Deceased lifecycle event recorded'
      }));
    });

    const exitInterviewRecords = Array.isArray(lifecycleData.exitInterviewRecords)
      ? lifecycleData.exitInterviewRecords
      : [];

    exitInterviewRecords.forEach(record => {
      events.push(TimelineIntelligenceService.createEvent(canonical, {
        eventCode: 'EXIT',
        date: record?.SeparationDate,
        sourceRecordId: null,
        description: record?.ReasonForLeaving
          ? `Separation recorded: ${record.ReasonForLeaving}`
          : 'Separation recorded'
      }));
    });

    const valid = events.filter(Boolean);
    valid.sort((a, b) => b.date.localeCompare(a.date));
    return valid;
  }
}

module.exports = TimelineIntelligenceService;



