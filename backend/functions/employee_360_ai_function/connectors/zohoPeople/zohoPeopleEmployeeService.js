'use strict';

const ZohoPeopleClient = require('./zohoPeopleClient');
const ZohoPeopleEnvironment = require('./zohoPeopleEnvironment');
const ZohoPeopleFormsService = require('./zohoPeopleFormsService');
const {
  NotFoundError,
  ConflictError,
  ExternalServiceError,
  RateLimitError
} = require('../../utils/errors');
const Logger = require('../../utils/logger');

// Forms API getRecords: `sIndex` starts at 1, `limit` max 200
// (https://www.zoho.com/people/api/bulk-records.html).
const DIRECTORY_PAGE_SIZE = 200;
const DIRECTORY_MAX_PAGES = 50;

function normalizeId(value) {
  if (value === null || value === undefined) return null;
  const text = String(value).trim();
  return text.length > 0 ? text : null;
}

class ZohoPeopleEmployeeService {
  constructor(client = null) {
    this.client = client || new ZohoPeopleClient();
    this.formsService = new ZohoPeopleFormsService(this.client);
  }

  /**
   * Flattens a Forms API getRecords response into [{ recordId, fields }].
   * Zoho keys each record by its record ID: result = [{ "<recordId>": [ {fields} ] }].
   */
  static unwrapRecords(res) {
    const result = res?.response?.result ?? res?.result;
    const items = Array.isArray(result) ? result : (result && typeof result === 'object' ? [result] : []);
    const records = [];

    for (const item of items) {
      if (!item || typeof item !== 'object') continue;

      for (const [key, value] of Object.entries(item)) {
        const entries = Array.isArray(value) ? value : [value];

        for (const fields of entries) {
          if (!fields || typeof fields !== 'object' || Array.isArray(fields)) continue;

          const recordId = normalizeId(fields.Zoho_ID) || (/^\d+$/.test(key) ? key : null);
          records.push({ recordId, fields });
        }
      }
    }

    return records;
  }

  /**
   * getRecordByID returns the record grouped by section; collect every object
   * that carries employee form fields.
   */
  static findEmployeeObjects(value) {
    if (!value || typeof value !== 'object') return [];
    if (Array.isArray(value)) return value.flatMap(item => ZohoPeopleEmployeeService.findEmployeeObjects(item));
    if (value.EmployeeID !== undefined || value.EmailID !== undefined || value.Zoho_ID !== undefined) {
      return [value];
    }
    return Object.values(value).flatMap(item => ZohoPeopleEmployeeService.findEmployeeObjects(item));
  }

  /**
   * Reporting_To on a directory record is "<manager name> <manager EmployeeID>".
   * The trailing token is accepted only when it is the EmployeeID of exactly one
   * record in the same directory; anything else yields null rather than a guess.
   */
  static resolveReportingManagerId(reportingTo, employeeIdCounts) {
    if (typeof reportingTo !== 'string') return null;
    const tokens = reportingTo.trim().split(/\s+/);
    if (tokens.length < 2) return null;

    const candidate = tokens[tokens.length - 1];
    return employeeIdCounts.get(candidate) === 1 ? candidate : null;
  }

  static _isUpstreamOutage(err) {
    return err instanceof RateLimitError ||
      (err instanceof ExternalServiceError && (err.isAuthError || err.isPermissionError || err.zohoCode === undefined));
  }

  async _findByRecordId(recordId, context, dataCenter, endpoints) {
    let res;
    try {
      res = await this.client.request(`${endpoints.employeeRecord}?recordId=${encodeURIComponent(recordId)}`, {
        context,
        dataCenter
      });
    } catch (err) {
      if (err instanceof NotFoundError) return null;
      throw err;
    }

    const objects = ZohoPeopleEmployeeService.findEmployeeObjects(res?.response?.result ?? res?.result);
    const matches = objects.filter(fields => normalizeId(fields.Zoho_ID) === null || normalizeId(fields.Zoho_ID) === recordId);
    if (matches.length === 0) return null;

    // getRecordByID can split one record across sections; merge them.
    const fields = Object.assign({}, ...matches);
    return { recordId, fields };
  }

  async _findByEmployeeId(employeeId, context, dataCenter, endpoints) {
    let candidates = [];

    try {
      const res = await this.client.request(endpoints.employeeList, {
        context,
        dataCenter,
        params: { searchColumn: 'EMPLOYEEID', searchValue: employeeId }
      });
      candidates = ZohoPeopleEmployeeService.unwrapRecords(res);
    } catch (err) {
      if (!(err instanceof NotFoundError)) {
        if (ZohoPeopleEmployeeService._isUpstreamOutage(err)) throw err;
        Logger.warn('Zoho People EMPLOYEEID search rejected; falling back to directory scan', {
          employeeId,
          zohoCode: err.zohoCode ?? null
        });
      }
    }

    let match = this._selectByEmployeeId(candidates, employeeId);

    if (match === null && candidates.length === 0) {
      // Search returned nothing usable; confirm against the full directory.
      const directory = await this._listAllEmployeeRecords(context);
      match = this._selectByEmployeeId(directory, employeeId);
    }

    return match;
  }

  /**
   * Exact EmployeeID match first; a single case-insensitive match second.
   * More than one match is ambiguous and is never resolved by picking the first.
   */
  _selectByEmployeeId(records, employeeId) {
    const exact = records.filter(r => normalizeId(r.fields.EmployeeID) === employeeId);
    if (exact.length === 1) return exact[0];
    if (exact.length > 1) {
      throw new ConflictError(`Employee ID '${employeeId}' matches more than one Zoho People record`);
    }

    const lower = employeeId.toLowerCase();
    const caseInsensitive = records.filter(r => (normalizeId(r.fields.EmployeeID) || '').toLowerCase() === lower);
    if (caseInsensitive.length === 1) return caseInsensitive[0];
    if (caseInsensitive.length > 1) {
      throw new ConflictError(`Employee ID '${employeeId}' matches more than one Zoho People record`);
    }

    return null;
  }

  /**
   * Reads every employee form record, page by page.
   */
  async _listAllEmployeeRecords(context = null, pageSize = DIRECTORY_PAGE_SIZE) {
    const dataCenter = context?.dataCenter || this.client.tenantConfig.dataCenter;
    const endpoints = ZohoPeopleEnvironment.getEndpoints(dataCenter);
    const all = [];
    let previousPageKey = null;

    for (let page = 0; page < DIRECTORY_MAX_PAGES; page++) {
      const sIndex = 1 + page * pageSize;
      let records;

      try {
        const res = await this.client.request(endpoints.employeeList, {
          context,
          dataCenter,
          params: { sIndex, limit: pageSize }
        });
        records = ZohoPeopleEmployeeService.unwrapRecords(res);
      } catch (err) {
        if (err instanceof NotFoundError) break; // 7024: no records beyond this index
        throw err;
      }

      if (records.length === 0) break;

      const pageKey = records.map(r => r.recordId).join(',');
      if (pageKey === previousPageKey) {
        throw new ExternalServiceError('Zoho People returned the same directory page twice');
      }
      previousPageKey = pageKey;

      all.push(...records);
      Logger.info('Fetched Zoho People employee directory page', { sIndex, count: records.length });

      if (records.length < pageSize) return all;
    }

    if (all.length >= DIRECTORY_MAX_PAGES * pageSize) {
      throw new ExternalServiceError('Zoho People employee directory exceeds the supported page limit');
    }

    return all;
  }

  async getEmployeeRawData(employeeId, context = null) {
    Logger.info('Fetching employee raw data in real-time from Zoho People via Catalyst Connection', { employeeId });

    const dataCenter = context?.dataCenter || this.client.tenantConfig.dataCenter;
    const endpoints = ZohoPeopleEnvironment.getEndpoints(dataCenter);
    const cleanId = normalizeId(employeeId);

    let match = null;

    if (cleanId && /^\d+$/.test(cleanId)) {
      match = await this._findByRecordId(cleanId, context, dataCenter, endpoints);
    }

    if (!match && cleanId) {
      match = await this._findByEmployeeId(cleanId, context, dataCenter, endpoints);
    }

    if (!match) {
      return {
        source: 'zoho_people',
        employeeId,
        available: false,
        error: 'NOT_FOUND',
        message: `Employee "${employeeId}" not found in Zoho People.`
      };
    }

    const rawRecord = match.fields;
    const zohoEmpId = normalizeId(rawRecord.EmployeeID) || cleanId;

    // The three lookups are independent, so they run concurrently. Each stays
    // best-effort: a failure leaves its domain null, exactly as before.
    // Attendance and leave remain best-effort until their APIs are verified (Phase 2).
    const [attendanceData, leaveData, lifecycleData] = await Promise.all([
      (async () => {
        try {
          const attUrl = `${endpoints.attendanceSummary}?empId=${encodeURIComponent(zohoEmpId)}`;
          const attRes = await this.client.request(attUrl, { context, dataCenter });
          return attRes?.response?.result || attRes?.result || null;
        } catch (attErr) {
          Logger.info('Attendance real-time lookup skipped', { code: attErr.code, zohoCode: attErr.zohoCode ?? null });
          return null;
        }
      })(),
      (async () => {
        try {
          const leaveUrl = `${endpoints.leaveBalances}?userId=${encodeURIComponent(zohoEmpId)}`;
          const leaveRes = await this.client.request(leaveUrl, { context, dataCenter });
          return leaveRes?.response?.result || leaveRes?.result || null;
        } catch (leaveErr) {
          Logger.info('Leave real-time lookup skipped', { code: leaveErr.code, zohoCode: leaveErr.zohoCode ?? null });
          return null;
        }
      })(),
      (async () => {
        try {
          const lifecycle = await this.formsService.getLifecycleRecords(cleanId, context);
          Logger.info('Lifecycle real-time lookup completed', {
            employeeId: cleanId,
            forms: Object.keys(lifecycle || {})
          });
          return lifecycle;
        } catch (lifecycleErr) {
          Logger.info('Lifecycle real-time lookup skipped', {
            employeeId: cleanId,
            code: lifecycleErr.code,
            zohoCode: lifecycleErr.zohoCode ?? null
          });
          return null;
        }
      })()
    ]);

    return {
      source: 'zoho_people',
      employeeId,
      available: true,
      recordId: match.recordId,
      raw: rawRecord,
      attendance: attendanceData,
      leave: leaveData,
      lifecycle: lifecycleData
    };
  }

  /**
   * Fetches the real-time list of all employees currently in Zoho People using the Catalyst Connection.
   * Records without a stable EmployeeID and record ID are dropped.
   */
  async getLiveEmployeeDirectory(context = null, options = {}) {
    const records = await this._listAllEmployeeRecords(context, options.pageSize || DIRECTORY_PAGE_SIZE);
    const directory = [];
    let dropped = 0;

    const employeeIdCounts = new Map();
    for (const { fields } of records) {
      const id = normalizeId(fields.EmployeeID);
      if (id) employeeIdCounts.set(id, (employeeIdCounts.get(id) || 0) + 1);
    }

    for (const { recordId, fields } of records) {
      const employeeId = normalizeId(fields.EmployeeID);

      if (!employeeId || !recordId) {
        dropped += 1;
        continue;
      }

      directory.push({
        recordId,
        employeeId,
        fullName: [fields.FirstName, fields.LastName].map(normalizeId).filter(Boolean).join(' ') || null,
        jobTitle: fields.Designation || null,
        department: fields.Department || null,
        email: fields.EmailID || null,
        workLocation: fields.LocationName || null,
        status: fields.Employeestatus || null,
        reportingManagerId: ZohoPeopleEmployeeService.resolveReportingManagerId(fields.Reporting_To, employeeIdCounts)
      });
    }

    if (dropped > 0) {
      Logger.warn('Dropped Zoho People records without a stable employee identifier', { dropped });
    }

    return directory;
  }

  /**
   * Returns directory entries whose EmailID equals the given address (case-insensitive).
   */
  async findEmployeesByEmail(email, context = null) {
    const target = normalizeId(email);
    if (!target) return [];
    const lower = target.toLowerCase();
    const directory = await this.getLiveEmployeeDirectory(context);
    return directory.filter(entry => (entry.email || '').trim().toLowerCase() === lower);
  }
}

module.exports = ZohoPeopleEmployeeService;




