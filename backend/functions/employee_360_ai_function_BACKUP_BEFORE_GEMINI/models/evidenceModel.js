'use strict';

const { DATA_CLASSIFICATION } = require('../config/constants');

class EvidenceItem {
  constructor({
    domain,
    field,
    source,
    classification = DATA_CLASSIFICATION.FACT,
    sourceRecordId = null,
    sourceTimestamp = null,
    confidence = 'high',
    notes = null
  }) {
    this.domain = domain;
    this.field = field;
    this.source = source;
    this.classification = classification;
    this.sourceRecordId = sourceRecordId;
    this.sourceTimestamp = sourceTimestamp || new Date().toISOString();
    this.confidence = confidence;
    this.notes = notes;
  }

  toJSON() {
    return {
      domain: this.domain,
      field: this.field,
      source: this.source,
      classification: this.classification,
      sourceRecordId: this.sourceRecordId,
      sourceTimestamp: this.sourceTimestamp,
      confidence: this.confidence,
      notes: this.notes
    };
  }
}

module.exports = EvidenceItem;
