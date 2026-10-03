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

  async getFormRecords(formLinkName, context = null) {
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
        dataCenter
      }
    );
  }
}

module.exports = ZohoPeopleFormsService;
