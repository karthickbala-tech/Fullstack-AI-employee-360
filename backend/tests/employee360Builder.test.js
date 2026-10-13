'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { fn } = require('./helpers');

const Employee360Builder = fn('intelligence/employee360Builder');

function build(raw, extra = {}) {
  return Employee360Builder.build('HRM2', {
    available: true,
    recordId: '371370000000338068',
    raw,
    attendance: null,
    leave: null,
    ...extra
  });
}

test('maps verified employee form fields and keeps the exact record ID', () => {
  const c = build({
    EmployeeID: 'HRM2',
    FirstName: 'Sarah',
    LastName: 'Sanders',
    EmailID: 'sarah@example.com',
    Employee_type: 'Permanent',
    Employeestatus: 'Probation',
    LocationName: 'Chennai HQ',
    Work_location: 'Desk 12',
    Department: 'Management',
    Designation: 'Manager',
    Dateofjoining: '15-Mar-2023'
  });
  assert.equal(c.metadata.sourceRecordId, '371370000000338068');
  assert.equal(c.employee.fullName, 'Sarah Sanders');
  assert.equal(c.employment.employeeType, 'Permanent');
  assert.equal(c.employment.employmentStatus, 'Probation');
  assert.equal(c.employment.workLocation, 'Chennai HQ');
  assert.equal(c.organisation.department, 'Management');
});

test('personal mobile is not exposed; work phone is used', () => {
  const c = build({ EmployeeID: 'HRM2', Mobile: '+91 98400 00000', Work_phone: '044-1234' });
  assert.equal(c.employee.phone, '044-1234');
  const noWork = build({ EmployeeID: 'HRM2', Mobile: '+91 98400 00000' });
  assert.equal(noWork.employee.phone, null);
});

test('seating location is never used as the geographic location', () => {
  const c = build({ EmployeeID: 'HRM2', Work_location: 'Desk 12' });
  assert.equal(c.employment.workLocation, null);
});

test('missing attendance values stay null (never 0)', () => {
  const c = build({ EmployeeID: 'HRM2' }, { attendance: { message: 'no data' } });
  assert.equal(c.attendance.totalWorkingDays, null);
  assert.equal(c.attendance.presentDays, null);
  assert.equal(c.attendance.absentDays, null);
  assert.equal(c.attendance.lateDays, null);
  assert.equal(c.attendance.attendancePercentage, null);
  assert.equal(c.deterministicMetrics.attendancePercentage.value, null);
});

test('real zero attendance values are kept as facts', () => {
  const c = build({ EmployeeID: 'HRM2' }, { attendance: { total_days: 20, present_days: 0, absent_days: 20, late_days: 0 } });
  assert.equal(c.attendance.presentDays, 0);
  assert.equal(c.attendance.attendancePercentage, 0);
});

test('leave items without a type are dropped; missing counts stay null', () => {
  const c = build({ EmployeeID: 'HRM2' }, {
    leave: [{ Balance_Count: '' }, { Leave_Type: 'Casual Leave', Balance_Count: '4', Taken_Count: null }]
  });
  assert.deepEqual(c.leave.balance, [{ type: 'Casual Leave', balance: 4, taken: null }]);
});

test('an empty leave response does not invent a "Leave" balance', () => {
  const c = build({ EmployeeID: 'HRM2' }, { leave: { response: 'none' } });
  assert.deepEqual(c.leave.balance, []);
});
