'use strict';

class ZohoPeopleEnvironment {
  static getBaseUrl(dataCenter = 'in') {
    const dcMap = {
      in: 'https://people.zoho.in',
      com: 'https://people.zoho.com',
      eu: 'https://people.zoho.eu',
      com_cn: 'https://people.zoho.com.cn',
      com_au: 'https://people.zoho.com.au'
    };
    return dcMap[(dataCenter || 'in').toLowerCase()] || dcMap.in;
  }

  static getEndpoints(dataCenter = 'in') {
    const base = this.getBaseUrl(dataCenter);
    return {
  employeeRecord: `${base}/people/api/forms/employee/getRecordByID`,
  employeeList: `${base}/people/api/forms/employee/getRecords`,
  attendanceSummary: `${base}/people/api/attendance/getUserReport`,
  leaveBalances: `${base}/people/api/leave/getLeaveTypeDetails`,
  performanceSummary: `${base}/people/api/performance/getAppraisalRating`,

  formsList: `${base}/people/api/forms`,

  formComponents: (formLinkName) =>
    `${base}/people/api/forms/${encodeURIComponent(formLinkName)}/components`,

  formRecords: (formLinkName) =>
    `${base}/people/api/forms/${encodeURIComponent(formLinkName)}/getRecords`,

  formRecordById: (formLinkName) =>
    `${base}/people/api/forms/${encodeURIComponent(formLinkName)}/getRecordByID`
};
  }
}

module.exports = ZohoPeopleEnvironment;
