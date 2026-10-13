'use strict';

const Employee360Service = require('./employee360Service');
const TimelineRepository = require('../repositories/timelineRepository');
const Logger = require('../utils/logger');

class TimelineService {
  constructor() {
    this.employee360Service = new Employee360Service();
    this.timelineRepository = new TimelineRepository();
  }

  async getEmployeeTimeline(employeeId, context) {
    const canonical =
      await this.employee360Service.getCanonical360(employeeId, context);

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

    // Stored events are authoritative once persisted.
    // Add generated events only when they do not already exist.
    const storedIds = new Set(
      storedEvents.map(event => event.id)
    );

    const generatedEvents = (canonical.timeline || [])
      .filter(event => !storedIds.has(event.id))
      .map(event => ({
        ...event,
        source: event.source || 'employee_360'
      }));

    const merged = [
      ...storedEvents,
      ...generatedEvents
    ];

    merged.sort(
      (a, b) =>
        new Date(b.date).getTime() -
        new Date(a.date).getTime()
    );

    return {
      employeeId,
      events: merged,
      totalEvents: merged.length
    };
  }
}

module.exports = TimelineService;