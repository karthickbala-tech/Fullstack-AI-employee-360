'use strict';

const ZohoPeopleClient = require('./zohoPeopleClient');
const ZohoPeopleEnvironment = require('./zohoPeopleEnvironment');
const Logger = require('../../utils/logger');

class ZohoPeopleEmployeeService {
  constructor(client = null) {
    this.client = client || new ZohoPeopleClient();
  }

  async getEmployeeRawData(employeeId, context = null) {
    Logger.info(`Fetching employee raw data in real-time from Zoho People via Catalyst Connection`, { employeeId });

    const dataCenter = context?.dataCenter || this.client.tenantConfig.dataCenter;
    const endpoints = ZohoPeopleEnvironment.getEndpoints(dataCenter);

    let rawRecord = null;
    let attendanceData = null;
    let leaveData = null;

    // Helper to unwrap Zoho People results
    const unwrapRecords = (res) => {
  if (!res) return [];

  const flatten = (value) => {
    if (!value) return [];

    if (Array.isArray(value)) {
      return value.flatMap(item => flatten(item));
    }

    if (typeof value !== 'object') {
      return [];
    }

    // This is already an employee record.
    if (
      value.EmployeeID ||
      value.EMPLOYEEID ||
      value.Employeename ||
      value.FirstName ||
      value.EmailID ||
      value.Zoho_ID
    ) {
      return [value];
    }

    // Otherwise descend into wrapper/object values.
    return Object.values(value).flatMap(item => flatten(item));
  };

  if (res.response?.result !== undefined) {
    return flatten(res.response.result);
  }

  if (res.result !== undefined) {
    return flatten(res.result);
  }

  return flatten(res);
};

    const cleanId = String(employeeId || '').trim();
    const isNumericRecordId = /^\d+$/.test(cleanId);
    const isEmail = cleanId.includes('@');

    try {
      // 1. If employeeId is purely numeric, it is a Zoho internal recordId
      if (isNumericRecordId) {
        try {
          const byIdUrl = `${endpoints.employeeRecord}?recordId=${encodeURIComponent(cleanId)}`;
          const res = await this.client.request(byIdUrl, { context, dataCenter });
          const list = unwrapRecords(res);
          if (list.length > 0) {
            rawRecord = list[0];
          }
        } catch (byIdErr) {
          if (byIdErr.isAuthError) throw byIdErr;
          // Silent fallback to column searches if numeric recordId did not resolve
        }
      }

      // 2. If it is an email address, search by EmailID
      if (!rawRecord && isEmail) {
        try {
          const emailUrl = `${endpoints.employeeList}?searchColumn=EmailID&searchValue=${encodeURIComponent(cleanId)}`;
          const res = await this.client.request(emailUrl, { context, dataCenter });
          const list = unwrapRecords(res);
          if (list.length > 0) {
            rawRecord = list[0];
          }
        } catch (emailErr) {
          if (emailErr.isAuthError) throw emailErr;
        }
      }

      // 3. For alphanumeric codes (e.g. OWN01), search by EMPLOYEEID
      if (!rawRecord) {
        try {

          const searchUrl = `${endpoints.employeeList}?searchColumn=EMPLOYEEID&searchValue=${encodeURIComponent(cleanId)}`;
          const res = await this.client.request(searchUrl, { context, dataCenter });
          const list = unwrapRecords(res);
          if (list.length > 0) {
            rawRecord = list[0];
          }
        } catch (searchErr) {
          if (searchErr.isAuthError) throw searchErr;
        }
      }

      // 4. Try searching by EmployeeID (alternate casing in some Zoho People forms)
      if (!rawRecord) {
        try {
          const searchUrl = `${endpoints.employeeList}?searchColumn=EmployeeID&searchValue=${encodeURIComponent(cleanId)}`;
          const res = await this.client.request(searchUrl, { context, dataCenter });
          const list = unwrapRecords(res);
          if (list.length > 0) {
            rawRecord = list[0];
          }
        } catch (altErr) {
          if (altErr.isAuthError) throw altErr;
        }
      }

      // 5. Try fetching live records list and matching exact ID, email or name
      if (!rawRecord) {
        try {
          const allUrl = `${endpoints.employeeList}?limit=200`;
          const res = await this.client.request(allUrl, { context, dataCenter });
          const list = unwrapRecords(res);
          rawRecord = list.find(r => {
            const empNum = r.EMPLOYEEID || r.EmpId || r.EmployeeID || r['Employee ID'] || r.recordId || r.pkId;
            const email = r.EmailID || r.email || r['Email ID'];
            const name = r.Employeename || r.fullName || r['Employee Name'];
            return (
              (empNum && String(empNum).trim().toUpperCase() === cleanId.toUpperCase()) ||
              (email && String(email).trim().toLowerCase() === cleanId.toLowerCase()) ||
              (name && String(name).trim().toUpperCase() === cleanId.toUpperCase())
            );
          });
        } catch (allErr) {
          if (allErr.isAuthError) throw allErr;
        }
      }

      // If record found, also attempt real-time attendance and leave
      if (rawRecord) {
        
        const zohoEmpId =
  rawRecord.EmployeeID ||
  rawRecord.EMPLOYEEID ||
  rawRecord.EmpId ||
  employeeId;

        // Fetch real-time attendance
        try {
          const attUrl = `${endpoints.attendanceSummary}?empId=${encodeURIComponent(zohoEmpId)}`;
          const attRes = await this.client.request(attUrl, { context, dataCenter });
          attendanceData = attRes?.response?.result || attRes?.result || attRes;
        } catch (attErr) {
          Logger.info('Attendance real-time lookup skipped', { error: attErr.message });
        }

        // Fetch real-time leave
        try {
          const leaveUrl = `${endpoints.leaveBalances}?userId=${encodeURIComponent(zohoEmpId)}`;
          const leaveRes = await this.client.request(leaveUrl, { context, dataCenter });
          leaveData = leaveRes?.response?.result || leaveRes?.result || leaveRes;
        } catch (leaveErr) {
          Logger.info('Leave real-time lookup skipped', { error: leaveErr.message });
        }
      }
    } catch (err) {
      if (err.isAuthError) {
        return {
          source: 'zoho_people',
          employeeId,
          available: false,
          error: 'AUTH_REQUIRED',
          message: `Zoho People authentication via Catalyst Connection '${this.client.connectionName}' failed or token expired.`
        };
      }
      Logger.warn(`Live Zoho People fetch error for ${employeeId}:`, { message: err.message });
      return {
        source: 'zoho_people',
        employeeId,
        available: false,
        error: 'CONNECTION_ERROR',
        message: `Failed to query Zoho People API: ${err.message}`
      };
    }

    

if (!rawRecord) {
  return {
    source: 'zoho_people',
    employeeId,
    available: false,
    error: 'NOT_FOUND',
    message: `Employee "${employeeId}" not found in Zoho People. Please ensure the employee exists in your Zoho People portal.`
  };
}

    return {
      source: 'zoho_people',
      employeeId,
      available: true,
      raw: rawRecord,
      attendance: attendanceData,
      leave: leaveData
    };
  }

  /**
   * Fetches the real-time list of all employees currently in Zoho People using the Catalyst Connection
   */
  async getLiveEmployeeDirectory(context = null) {
    const dataCenter = context?.dataCenter || this.client.tenantConfig.dataCenter;
    const endpoints = ZohoPeopleEnvironment.getEndpoints(dataCenter);
    const res = await this.client.request(`${endpoints.employeeList}?limit=200`, { context, dataCenter });
    const records = Array.isArray(res)
  ? res
  : (res?.response?.result || res?.result || []);

const flatList = [];


if (Array.isArray(records)) {
  for (const item of records) {
    if (!item || typeof item !== 'object') continue;

    for (const value of Object.values(item)) {
      if (Array.isArray(value)) {
        flatList.push(...value);
      } else if (value && typeof value === 'object') {
        flatList.push(value);
      }
    }
  }
} else if (records && typeof records === 'object') {
  for (const value of Object.values(records)) {
    if (Array.isArray(value)) {
      flatList.push(...value);
    } else if (value && typeof value === 'object') {
      flatList.push(value);
    }
  }
}
    
    return flatList
  .filter(r => r && typeof r === 'object')
  .map(r => ({
    recordId: r.Zoho_ID || r.recordId || r.pkId || null,
    employeeId: r.EmployeeID || null,
    fullName: `${r.FirstName || ''} ${r.LastName || ''}`.trim() || 'Unknown',
    jobTitle: r.Designation || null,
    department: r.Department || null,
    email: r.EmailID || null,
    workLocation: r.LocationName || r.Work_location || null,
    status: r.Employeestatus || 'Active'
  }));
  }
}

module.exports = ZohoPeopleEmployeeService;
