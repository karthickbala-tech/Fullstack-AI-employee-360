'use strict';

const Employee360Service = require('./employee360Service');
const TimelineRepository = require('../repositories/timelineRepository');
const TimelineIntelligenceService = require('../intelligence/timelineService');
const Logger = require('../utils/logger');

class TimelineService {
  constructor() {
    this.employee360Service = new Employee360Service();
    this.timelineRepository = new TimelineRepository();
  }

  async getEmployeeTimeline(employeeId, context) {
    const canonical =
      await this.employee360Service.getCanonical360(employeeId, context, { persist: false });

    // Persist deterministic timeline events generated from canonical data.
    for (const event of canonical.timeline || []) {
      try {
        await this.timelineRepository.recordEvent(
          {
            ...event,
            employeeId,
            source: event.source || 'employee_360'
          },
          {
            ...context,
            employeeId
          }
        );
      } catch (err) {
        Logger.warn('Timeline event persistence skipped', {
          employeeId,
          eventId: event.id || null,
          message: err.message
        });
      }
    }

    const storedEvents =
      await this.timelineRepository.getEventsByEmployeeId(
        employeeId,
        context
      );

    // Events derived from the current Zoho record are authoritative. Generated and
    // stored events share one deterministic ID, so a persisted event is never
    // returned twice. A stored row for a derived code whose ID is no longer
    // generated is stale (its source value changed) and is not returned.
    const generatedEvents = canonical.timeline || [];
    const generatedIds = new Set(generatedEvents.map(event => event.id));
    const derivedCodes = new Set(Object.keys(TimelineIntelligenceService.definitions));

    const storedOnlyEvents = storedEvents.filter(
      event => !generatedIds.has(event.id) && !derivedCodes.has(event.eventCode)
    );

    const merged = [
      ...generatedEvents,
      ...storedOnlyEvents
    ];

    merged.sort((a, b) => b.date.localeCompare(a.date));

    return {
      employeeId,
      events: merged,
      totalEvents: merged.length
    };
  }
}

module.exports = TimelineService;