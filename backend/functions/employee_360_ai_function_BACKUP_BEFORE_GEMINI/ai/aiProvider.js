'use strict';

class AIProvider {
  async generateCompletion(prompt, options = {}) {
    throw new Error('generateCompletion must be implemented by provider adapter');
  }
}

module.exports = AIProvider;
