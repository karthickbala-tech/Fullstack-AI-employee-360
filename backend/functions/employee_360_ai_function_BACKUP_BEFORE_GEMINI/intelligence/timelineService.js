'use strict';

class TimelineIntelligenceService {
  static buildEvents(canonical) {
    const events = [];
    const emp = canonical.employment || {};

    if (emp.dateOfJoining) {
      events.push({
        id: 'evt-doj',
        type: 'LIFECYCLE',
        title: 'Joined Company',
        date: emp.dateOfJoining,
        description: `Commenced role as ${emp.jobTitle || 'Employee'}`,
        domain: 'employment'
      });
    }

    if (emp.confirmationDate) {
      events.push({
        id: 'evt-conf',
        type: 'MILESTONE',
        title: 'Probation Confirmed',
        date: emp.confirmationDate,
        description: 'Successfully passed probation evaluation',
        domain: 'employment'
      });
    }

    if (Array.isArray(canonical.career?.promotions)) {
      canonical.career.promotions.forEach((promo, idx) => {
        events.push({
          id: `evt-promo-${idx}`,
          type: 'CAREER',
          title: `Promoted to ${promo.designation}`,
          date: promo.effectiveDate,
          description: promo.notes || 'Internal promotion',
          domain: 'career'
        });
      });
    }

    events.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    return events;
  }
}

module.exports = TimelineIntelligenceService;
