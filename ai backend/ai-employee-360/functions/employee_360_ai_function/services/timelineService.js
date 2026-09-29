'use strict';

const Employee360Service = require('./employee360Service');
const TimelineRepository = require('../repositories/timelineRepository');

class TimelineService {
  constructor() {
    this.employee360Service = new Employee360Service();
    this.timelineRepository = new TimelineRepository();
  }

  async getEmployeeTimeline(employeeId, context) {
    const canonical = await this.employee360Service.getCanonical360(employeeId, context);
    const storedEvents = await this.timelineRepository.getEventsByEmployeeId(employeeId);

    const merged = [...(canonical.timeline || []), ...storedEvents];
    merged.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

    return {
      employeeId,
      events: merged,
      totalEvents: merged.length
    };
  }
}

module.exports = TimelineService;
