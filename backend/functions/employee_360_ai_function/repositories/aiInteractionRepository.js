'use strict';

const crypto = require('crypto');
const { DATASTORE_TABLE_IDS } = require('../config/constants');
const Logger = require('../utils/logger');

class AIInteractionRepository {
  constructor() {
    this.tableId = DATASTORE_TABLE_IDS.AIInteractions;
  }

  _getCatalystApp(req = null) {
    let catalyst;

    try {
      catalyst = require('zcatalyst-sdk-node');
    } catch (e1) {
      try {
        catalyst = require('zcatalyst-sdk');
      } catch (e2) {
        catalyst = global.catalyst;
      }
    }

    if (catalyst && typeof catalyst.initialize === 'function') {
      return req ? catalyst.initialize(req) : catalyst.initialize();
    }

    return null;
  }

  _formatDateTime(value = new Date()) {
    const date = new Date(value);

    if (Number.isNaN(date.getTime())) {
      throw new Error(`Invalid datetime value: ${value}`);
    }

    return date.toISOString().slice(0, 19).replace('T', ' ');
  }

  async logInteraction(record, context = null) {
    if (!record || typeof record !== 'object') {
      throw new Error('AIInteractionRepository.logInteraction requires a record');
    }

    if (!record.interactionId) {
      throw new Error('AIInteractionRepository.logInteraction requires interactionId');
    }

    if (!record.tenantId) {
      throw new Error('AIInteractionRepository.logInteraction requires tenantId');
    }

    if (!record.userId) {
      throw new Error('AIInteractionRepository.logInteraction requires userId');
    }

    if (!record.question) {
      throw new Error('AIInteractionRepository.logInteraction requires question');
    }

    if (!record.answer) {
      throw new Error('AIInteractionRepository.logInteraction requires answer');
    }

    const rowData = {
      interactionId: String(record.interactionId),
      tenantId: String(record.tenantId),
      employeeId: record.employeeId ? String(record.employeeId) : null,
      userId: String(record.userId),
      question: String(record.question),
      answer: String(record.answer),
      confidence: record.confidence || null,
      evidence:
        record.evidence !== undefined && record.evidence !== null
          ? JSON.stringify(record.evidence)
          : null,
      model: record.model || null,
      createdAt: this._formatDateTime(record.createdAt || new Date())
    };

    Logger.info('Persisting AI interaction audit in Data Store', {
      tableId: this.tableId,
      interactionId: rowData.interactionId,
      employeeId: rowData.employeeId
    });

    const app = this._getCatalystApp(context?.req);

    if (!app || typeof app.datastore !== 'function') {
      throw new Error('Catalyst Data Store is not available');
    }

    const table = app.datastore().table(this.tableId);
    const result = await table.insertRow(rowData);

    Logger.info('Successfully persisted AI interaction audit in Catalyst Data Store', {
      tableId: this.tableId,
      interactionId: rowData.interactionId,
      employeeId: rowData.employeeId,
      rowId: result?.ROWID || null
    });

    return result;
  }
}

module.exports = AIInteractionRepository;
