/**
 * Chat mentions: "@" for a person (or @all), "#" for a department.
 * Pure helpers only (no React), so they are unit-tested directly.
 *
 * The lists come from the backend (GET /v1/me `mentionable`) and contain only
 * people and departments the signed-in user may ask about. They are a
 * convenience: the backend authorizes every mention again.
 */
import type { AskMentions, EmployeeDirectoryEntry, Mentionable } from '../types/employee360';

export type MentionToken =
  | { kind: 'employee'; id: string; label: string; detail: string | null }
  | { kind: 'department'; label: string }
  | { kind: 'all'; label: string; detail: string };

export type MentionTrigger = '@' | '#';

export interface ActiveTrigger {
  trigger: MentionTrigger;
  query: string;
  /** Index of the "@" or "#" in the text. */
  start: number;
}

const MAX_QUERY_LENGTH = 40;
export const EMPTY_MENTIONS: AskMentions = { employeeIds: [], departments: [], all: false };

/** Mentionable lists from directory entries (Demo mode, or Development without sign-in). */
export function buildMentionable(
  employees: EmployeeDirectoryEntry[],
  allScope: Mentionable['allScope']
): Mentionable {
  const departments = [...new Set(employees.map((e) => (e.department || '').trim()).filter(Boolean))].sort((a, b) =>
    a.localeCompare(b)
  );
  return {
    employees: employees.map((e) => ({ employeeId: e.employeeId, fullName: e.fullName, department: e.department })),
    departments,
    canMentionAll: allScope !== 'self',
    allScope,
  };
}

/**
 * The "@" or "#" the user is currently typing after, if any: it must start the
 * text or follow whitespace, and the query up to the caret has no line break.
 */
export function activeTrigger(text: string, caret: number): ActiveTrigger | null {
  const before = text.slice(0, caret);
  for (let i = before.length - 1; i >= 0 && before.length - i <= MAX_QUERY_LENGTH + 1; i -= 1) {
    const ch = before[i];
    if (ch === '\n') return null;
    if (ch === '@' || ch === '#') {
      if (i > 0 && !/\s/.test(before[i - 1])) return null;
      const query = before.slice(i + 1);
      if (/\s{2,}/.test(query)) return null;
      return { trigger: ch, query, start: i };
    }
  }
  return null;
}

function matches(value: string | null | undefined, query: string): boolean {
  if (!query) return true;
  const target = (value || '').toLowerCase();
  const q = query.toLowerCase();
  return target.startsWith(q) || target.split(/\s+/).some((word) => word.startsWith(q)) || target.includes(q);
}

export function allLabel(mentionable: Mentionable): string {
  return mentionable.allScope === 'organization' ? 'Everyone in the organization' : 'Everyone in your team';
}

/** Suggestions for the current trigger and query, only from the allowed lists. */
export function suggestions(
  mentionable: Mentionable | null,
  trigger: MentionTrigger,
  query: string,
  limit = 8
): MentionToken[] {
  if (!mentionable) return [];
  const q = query.trim();
  if (trigger === '#') {
    if (!mentionable.canMentionAll) return [];
    return mentionable.departments
      .filter((department) => matches(department, q))
      .slice(0, limit)
      .map((department) => ({ kind: 'department' as const, label: department }));
  }
  const result: MentionToken[] = [];
  if (mentionable.canMentionAll && 'all'.startsWith(q.toLowerCase())) {
    result.push({ kind: 'all', label: 'all', detail: allLabel(mentionable) });
  }
  for (const employee of mentionable.employees) {
    if (result.length >= limit) break;
    if (matches(employee.fullName, q) || matches(employee.employeeId, q)) {
      result.push({
        kind: 'employee',
        id: employee.employeeId,
        label: employee.fullName || employee.employeeId,
        detail: [employee.employeeId, employee.department].filter(Boolean).join(' · ') || null,
      });
    }
  }
  return result;
}

export function tokenText(token: MentionToken): string {
  return token.kind === 'department' ? `#${token.label}` : `@${token.label}`;
}

/** Replaces the typed "@que…" with the chosen token followed by a space. */
export function insertToken(
  text: string,
  caret: number,
  active: ActiveTrigger,
  token: MentionToken
): { text: string; caret: number } {
  const inserted = `${tokenText(token)} `;
  const next = text.slice(0, active.start) + inserted + text.slice(caret).replace(/^\s+/, '');
  return { text: next, caret: active.start + inserted.length };
}

/** Mentions whose token text is still present in the question. */
export function mentionsFromText(text: string, tokens: MentionToken[]): AskMentions {
  const lower = text.toLowerCase();
  const present = tokens.filter((token) => lower.includes(tokenText(token).toLowerCase()));
  return {
    employeeIds: [...new Set(present.filter((t) => t.kind === 'employee').map((t) => (t as { id: string }).id))],
    departments: [...new Set(present.filter((t) => t.kind === 'department').map((t) => t.label))],
    all: present.some((t) => t.kind === 'all'),
  };
}

/**
 * Mentions for a spoken question, which has no @ or # tokens: the full names of
 * people (and the departments) the user may mention, when said in full. Only
 * whole names count, so a common word never narrows a question by accident.
 * The backend still authorizes every mention.
 */
export function mentionsFromSpeech(transcript: string, mentionable: Mentionable | null): AskMentions {
  if (!mentionable) return EMPTY_MENTIONS;
  const text = ` ${transcript.toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, ' ').replace(/\s+/g, ' ')} `;
  const says = (name: string | null) => {
    const clean = (name || '').toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, ' ').replace(/\s+/g, ' ').trim();
    return clean.split(' ').length >= 2 && text.includes(` ${clean} `);
  };
  return {
    employeeIds: mentionable.employees.filter((employee) => says(employee.fullName)).map((employee) => employee.employeeId),
    departments: mentionable.departments.filter((department) => says(department)),
    all: false,
  };
}
