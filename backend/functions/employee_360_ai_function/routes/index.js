'use strict';

const url = require('url');
const { NotFoundError, AppError } = require('../utils/errors');
const { HTTP_STATUS, ERROR_CODES } = require('../config/constants');
const HttpUtils = require('../utils/http');
const Environment = require('../config/environment');

const Employee360Controller = require('../controllers/employee360Controller');
const SummaryController = require('../controllers/summaryController');
const InsightsController = require('../controllers/insightsController');
const TimelineController = require('../controllers/timelineController');
const AskController = require('../controllers/askController');
const ZohoPeopleController = require('../controllers/zohoPeopleController');

const employee360Controller = new Employee360Controller();
const summaryController = new SummaryController();
const insightsController = new InsightsController();
const timelineController = new TimelineController();
const askController = new AskController();
const zohoPeopleController = new ZohoPeopleController();

const routes = [
  {
    method: 'GET',
    pattern: /^\/v1\/zoho\/status\/?$/,
    paramNames: [],
    handler: (req, res, params, ctx) => zohoPeopleController.getStatus(req, res, params, ctx)
  },
  {
    method: 'GET',
    pattern: /^\/v1\/zoho\/forms\/?$/,
    paramNames: [],
    handler: (req, res, params, ctx) => zohoPeopleController.getForms(req, res, params, ctx)
  },
  {
    method: 'GET',
    pattern: /^\/v1\/zoho\/forms\/([^/]+)\/components\/?$/,
    paramNames: ['formLinkName'],
    handler: (req, res, params, ctx) => zohoPeopleController.getFormComponents(req, res, params, ctx)
  },
  {
    method: 'GET',
    pattern: /^\/v1\/zoho\/forms\/([^/]+)\/records\/?$/,
    paramNames: ['formLinkName'],
    handler: (req, res, params, ctx) => zohoPeopleController.getFormRecords(req, res, params, ctx)
  },  {
    method: 'GET',
    pattern: /^\/v1\/zoho\/employees\/?$/,
    paramNames: [],
    handler: (req, res, params, ctx) => zohoPeopleController.getEmployees(req, res, params, ctx)
  },
  {
    method: 'GET',
    pattern: /^\/v1\/employees\/([^/]+)\/360\/?$/,
    paramNames: ['employeeId'],
    handler: (req, res, params, ctx) => employee360Controller.handle(req, res, params, ctx)
  },
  {
    method: 'GET',
    pattern: /^\/v1\/employees\/([^/]+)\/summary\/?$/,
    paramNames: ['employeeId'],
    handler: (req, res, params, ctx) => summaryController.handle(req, res, params, ctx)
  },
  {
    method: 'GET',
    pattern: /^\/v1\/employees\/([^/]+)\/insights\/?$/,
    paramNames: ['employeeId'],
    handler: (req, res, params, ctx) => insightsController.handle(req, res, params, ctx)
  },
  {
    method: 'GET',
    pattern: /^\/v1\/employees\/([^/]+)\/timeline\/?$/,
    paramNames: ['employeeId'],
    handler: (req, res, params, ctx) => timelineController.handle(req, res, params, ctx)
  },
  {
    method: 'POST',
    pattern: /^\/v1\/employees\/([^/]+)\/ask\/?$/,
    paramNames: ['employeeId'],
    handler: (req, res, params, ctx) => askController.handle(req, res, params, ctx)
  }
];

class Router {
  static normalizePath(req) {
    const parsedUrl = url.parse(req.url || '/', true);
    let pathname = parsedUrl.pathname || '/';

    // Normalize Catalyst serverless function prefix if present:
    pathname = pathname.replace(/^\/server\/employee_360_ai_function(\/|$)/, '/');
    if (!pathname.startsWith('/')) {
      pathname = '/' + pathname;
    }
    return pathname;
  }

  /**
   * Only the service identification and health routes are reachable without
   * authentication.
   */
  static isPublicRequest(req) {
    const method = req.method ? req.method.toUpperCase() : 'GET';
    const pathname = this.normalizePath(req);
    return method === 'GET' && (pathname === '/' || pathname === '' || pathname === '/health');
  }

  static async dispatch(req, res, context) {
    const pathname = this.normalizePath(req);
    const method = req.method ? req.method.toUpperCase() : 'GET';

    // Root Identification Route
    if (pathname === '/' || pathname === '') {
      if (method !== 'GET') {
        throw new AppError('Method not allowed', ERROR_CODES.VALIDATION_ERROR, HTTP_STATUS.METHOD_NOT_ALLOWED);
      }
      const serviceConfig = Environment.getServiceConfig();
      HttpUtils.sendSuccess(res, {
        service: serviceConfig.serviceName,
        version: serviceConfig.version,
        status: 'ONLINE',
        documentation: '/v1/employees/{employeeId}/360'
      });
      return;
    }

    // Health Route
    if (pathname === '/health') {
      if (method !== 'GET') {
        throw new AppError('Method not allowed', ERROR_CODES.VALIDATION_ERROR, HTTP_STATUS.METHOD_NOT_ALLOWED);
      }
      HttpUtils.sendSuccess(res, {
        status: 'UP',
        nodeVersion: process.version,
        uptimeSeconds: Math.floor(process.uptime()),
        geminiConfigured: Boolean(Environment.getGeminiApiKey()),
        connection: Environment.getTenantConfig().connectionName
      });
      return;
    }

    // Route matching
    let matchedPath = false;
    for (const route of routes) {
      const match = pathname.match(route.pattern);
      if (match) {
        matchedPath = true;
        if (route.method !== method) {
          throw new AppError(
            `Method ${method} not allowed for route ${pathname}. Expected ${route.method}`,
            ERROR_CODES.VALIDATION_ERROR,
            HTTP_STATUS.METHOD_NOT_ALLOWED
          );
        }
        const params = {};
        route.paramNames.forEach((name, idx) => {
          params[name] = decodeURIComponent(match[idx + 1]);
        });
        await route.handler(req, res, params, context);
        return;
      }
    }

    if (matchedPath) {
      throw new AppError('Method not allowed', ERROR_CODES.VALIDATION_ERROR, HTTP_STATUS.METHOD_NOT_ALLOWED);
    }

    throw new NotFoundError(`Endpoint not found: ${method} ${pathname}`);
  }
}

module.exports = Router;


