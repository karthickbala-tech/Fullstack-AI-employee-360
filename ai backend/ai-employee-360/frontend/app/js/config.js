'use strict';

/**
 * AI Employee 360 - Frontend Configuration
 * Connects Zoho People Web Tab with Zoho Catalyst Advanced I/O backend
 */
const AppConfig = {
  // Deployed Zoho Catalyst Function Base URL
  cloudBackendUrl: 'https://employee360-ai-60085182165.development.catalystserverless.in/server/employee_360_ai_function',

  // Same-origin development proxy URL
  localBackendUrl: '/server/employee_360_ai_function',

  // Organization & Tenant configuration
  tenant: {
    tenantId: 'vsk_hr_solution',
    organizationName: 'VSK HR Solution Private Limited',
    portalId: '60076299713',
    dataCenter: 'in',
    peopleBaseUrl: 'https://people.zoho.in',
    defaultEmployeeId: 'OWN01'
  },

  // API Endpoints builder
  endpoints: {
    health: (base) => `${base.replace(/\/$/, '')}/health`,
    serviceInfo: (base) => `${base.replace(/\/$/, '')}/`,
    employee360: (base, employeeId) => `${base.replace(/\/$/, '')}/v1/employees/${encodeURIComponent(employeeId)}/360`,
    summary: (base, employeeId) => `${base.replace(/\/$/, '')}/v1/employees/${encodeURIComponent(employeeId)}/summary`,
    insights: (base, employeeId) => `${base.replace(/\/$/, '')}/v1/employees/${encodeURIComponent(employeeId)}/insights`,
    timeline: (base, employeeId) => `${base.replace(/\/$/, '')}/v1/employees/${encodeURIComponent(employeeId)}/timeline`,
    ask: (base, employeeId) => `${base.replace(/\/$/, '')}/v1/employees/${encodeURIComponent(employeeId)}/ask`,
    zohoStatus: (base) => `${base.replace(/\/$/, '')}/v1/zoho/status`,
    zohoEmployees: (base) => `${base.replace(/\/$/, '')}/v1/zoho/employees`,
    zohoConfigure: (base) => `${base.replace(/\/$/, '')}/v1/zoho/configure`
  }
};

window.AppConfig = AppConfig;
