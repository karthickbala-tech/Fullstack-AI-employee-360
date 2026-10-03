'use strict';

class ApiResponse {
  static success(data = {}, meta = {}) {
    return {
      success: true,
      data,
      meta: {
        timestamp: new Date().toISOString(),
        ...meta
      }
    };
  }

  static error(code, message) {
    return {
      success: false,
      error: {
        code,
        message
      }
    };
  }
}

module.exports = ApiResponse;
