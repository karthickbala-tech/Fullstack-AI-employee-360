'use strict';

const ZohoPeopleClient = require('./zohoPeopleClient');
const ZohoPeopleEnvironment = require('./zohoPeopleEnvironment');

class ZohoPeopleFormsService {
  constructor(client = null) {
    this.client = client || new ZohoPeopleClient();
  }

  async listForms(context = null) {
    const dataCenter =
      context?.dataCenter || this.client.tenantConfig.dataCenter;

    const endpoints = ZohoPeopleEnvironment.getEndpoints(dataCenter);

    return this.client.request(endpoints.formsList, {
      context,
      dataCenter
    });
  }

  async getFormComponents(formLinkName, context = null) {
    const cleanFormLinkName = String(formLinkName || '').trim();

    if (!cleanFormLinkName) {
      throw new Error('formLinkName is required');
    }

    const dataCenter =
      context?.dataCenter || this.client.tenantConfig.dataCenter;

    const endpoints = ZohoPeopleEnvironment.getEndpoints(dataCenter);

    return this.client.request(
      endpoints.formComponents(cleanFormLinkName),
      {
        context,
        dataCenter
      }
    );
  }

  async getFormRecords(formLinkName, context = null, params = {}) {
    const cleanFormLinkName = String(formLinkName || '').trim();

    if (!cleanFormLinkName) {
      throw new Error('formLinkName is required');
    }

    const dataCenter =
      context?.dataCenter || this.client.tenantConfig.dataCenter;

    const endpoints = ZohoPeopleEnvironment.getEndpoints(dataCenter);

    return this.client.request(
      endpoints.formRecords(cleanFormLinkName),
      {
        context,
        dataCenter,
        params
      }
    );
  }

  async getLifecycleRecords(employeeId, context = null) {
    const cleanEmployeeId = String(employeeId || '').trim();

    if (!cleanEmployeeId) {
      throw new Error('employeeId is required');
    }

    const lifecycleForms = [
      {
        formLinkName: 'zp_resignation',
        employeeField: 'Employee_ID'
      },
      {
        formLinkName: 'zp_termination',
        employeeField: 'Employee_ID'
      },
      {
        formLinkName: 'zp_deceased',
        employeeField: 'Employee_ID'
      },
      {
        formLinkName: 'exitinterview',
        employeeField: 'EmployeeID'
      }
    ];

    const lifecycle = {};

    for (const form of lifecycleForms) {
      try {
        const response = await this.getFormRecords(
          form.formLinkName,
          context,
          {
            searchColumn: form.employeeField,
            searchValue: cleanEmployeeId,
            sIndex: 1,
            limit: 200
          }
        );

        lifecycle[form.formLinkName] = {
          employeeField: form.employeeField,
          records:
            response?.response?.result ??
            response?.result ??
            response ??
            []
        };
      } catch (err) {
        lifecycle[form.formLinkName] = {
          employeeField: form.employeeField,
          records: [],
          error: err.message,
          errorCode: err.code ?? null,
          zohoCode: err.zohoCode ?? null,
          isAuthError: Boolean(err.isAuthError),
          isPermissionError: Boolean(err.isPermissionError),
          upstreamStatus: err.upstreamStatus ?? null
        };
      }
    }

    return lifecycle;
  }
}

module.exports = ZohoPeopleFormsService;

