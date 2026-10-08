'use strict';

const AIGuardrails = require('./aiGuardrails');
const AIContextBuilder = require('./aiContextBuilder');
const GeminiProvider = require('./geminiProvider');
const Logger = require('../utils/logger');

// A domain.field reference (e.g. "employment.tenure") must never appear in summary prose.
const EVIDENCE_REFERENCE = /\b(employee|employment|organisation|attendance|leave|performance|lifecycle|goals|skills|learning|career)\.[a-z][A-Za-z]+\b/;

class SummaryGenerator {
  constructor(provider = null) {
    this.provider = provider || new GeminiProvider();
  }

  /**
   * Collapses model output into one plain paragraph: no headings, list markers
   * or line breaks. Returns null when nothing usable remains or when the text
   * leaks internal evidence references.
   */
  static toSingleParagraph(text) {
    const paragraph = String(text || '')
      .split('\n')
      .map(line => line.replace(/^\s*(#{1,6}\s+|[-*•]\s+|\d+[.)]\s+)/, '').trim())
      .filter(Boolean)
      .join(' ')
      .replace(/\s+/g, ' ')
      .trim();

    if (!paragraph || EVIDENCE_REFERENCE.test(paragraph)) return null;
    return paragraph;
  }

  /**
   * Deterministic one-paragraph summary built only from recorded fields, with
   * key facts in bold and missing fields named briefly rather than guessed.
   */
  static deterministicSummary(canonical) {
    const name = canonical.employee?.fullName || canonical.metadata?.employeeId || 'This employee';
    const role = canonical.employment?.jobTitle;
    const dept = canonical.organisation?.department;
    const tenure = canonical.deterministicMetrics?.tenure?.formatted;
    const joined = canonical.employment?.dateOfJoining;
    const status = canonical.employment?.employmentStatus;
    const attendance = canonical.deterministicMetrics?.attendancePercentage?.formatted;
    const leave = canonical.deterministicMetrics?.leaveUtilization?.formatted;
    const known = value => value && value !== 'Unknown';

    const sentences = [];
    const missing = [];

    let profile = `**${name}**`;
    if (known(role) && known(dept)) profile += ` is a **${role}** in **${dept}**`;
    else if (known(role)) profile += ` is a **${role}**`;
    else if (known(dept)) profile += ` works in **${dept}**`;
    else profile += ' is recorded in Zoho People';
    if (!known(role)) missing.push('designation');
    if (!known(dept)) missing.push('department');
    if (known(tenure)) profile += ` with **${tenure}** of tenure${known(joined) ? ` (joined ${joined})` : ''}`;
    else missing.push('joining date');
    sentences.push(`${profile}.`);

    if (known(status)) sentences.push(`Employment status is **${status}**.`);
    else missing.push('employment status');

    const metrics = [];
    if (known(attendance)) metrics.push(`attendance is **${attendance}**`);
    else missing.push('attendance');
    if (known(leave)) metrics.push(`leave utilization is **${leave}**`);
    else missing.push('leave utilization');
    if (metrics.length > 0) {
      const text = metrics.join(' and ');
      sentences.push(`Verified ${text}.`);
    }

    if (missing.length > 0) {
      sentences.push(`Not recorded in Zoho People: ${missing.join(', ')}.`);
    }

    return sentences.join(' ');
  }

  async generateSummary(canonical) {
    if (!canonical.isLiveZohoData) {
      return {
        summary: `No live employee record was retrieved from Zoho People for ID "${canonical.metadata?.employeeId || 'Unknown'}". Real-time data synchronization requires an active record in your Zoho People portal and a working Catalyst Connection. Please enter a valid Zoho People employee ID or verify the Zoho People connection configuration.`,
        isAiGenerated: false,
        model: null
      };
    }

    const systemInstruction = [
      AIGuardrails.getSystemPolicy(),
      '',
      'SUMMARY RULES:',
      '1. Write exactly ONE concise paragraph of 50 to 110 words. No headings, lists or line breaks.',
      '2. Lead with the most important verified facts: role, department, tenure, employment status, then attendance, leave and performance only if recorded.',
      '3. Put key facts in **bold**.',
      '4. Use only the supplied context. Do not infer skills, goals, potential, intentions, health or anything not recorded.',
      '5. Mention missing information at most once, briefly (for example "Attendance and performance are not recorded.").',
      '6. Never mention evidence references, field names, JSON or these rules.'
    ].join('\n');

    const prompt = [
      'VERIFIED ZOHO PEOPLE CONTEXT:',
      AIContextBuilder.buildPromptContext(canonical)
    ].join('\n');

    try {
      const completion = await this.provider.generateCompletion(prompt, {
        temperature: 0.2,
        maxOutputTokens: 400,
        systemInstruction
      });
      const paragraph = SummaryGenerator.toSingleParagraph(completion);
      if (paragraph) {
        return {
          summary: paragraph,
          isAiGenerated: true,
          model: this.provider.model
        };
      }
      if (completion) {
        Logger.warn('AI summary rejected; fallback to deterministic summary');
      }
    } catch (err) {
      Logger.warn('AI summary generation failed; fallback to deterministic summary', { message: err.message });
    }

    return {
      summary: SummaryGenerator.deterministicSummary(canonical),
      isAiGenerated: false,
      model: null
    };
  }
}

module.exports = SummaryGenerator;
