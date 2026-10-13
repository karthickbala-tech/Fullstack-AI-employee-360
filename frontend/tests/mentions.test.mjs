import test from 'node:test';
import assert from 'node:assert/strict';

const m = await import('../src/services/mentions.ts');

const TEAM = {
  employees: [
    { employeeId: 'OWN01', fullName: 'Owen Manager', department: 'Operations' },
    { employeeId: 'HRM4', fullName: 'Priya Nair', department: 'Information Technology' },
  ],
  departments: ['Information Technology', 'Operations'],
  canMentionAll: true,
  allScope: 'team',
};
const SELF = {
  employees: [{ employeeId: 'HRM4', fullName: 'Priya Nair', department: 'Information Technology' }],
  departments: ['Information Technology'],
  canMentionAll: false,
  allScope: 'self',
};

test('a trigger is "@" or "#" at the start or after a space, up to the caret', () => {
  assert.deepEqual(m.activeTrigger('compare @pri', 12), { trigger: '@', query: 'pri', start: 8 });
  assert.deepEqual(m.activeTrigger('#ope', 4), { trigger: '#', query: 'ope', start: 0 });
  assert.deepEqual(m.activeTrigger('ask @Priya Na', 13), { trigger: '@', query: 'Priya Na', start: 4 });
  assert.equal(m.activeTrigger('mail me at a@b.com', 18), null, 'an email address is not a mention');
  assert.equal(m.activeTrigger('no trigger here', 15), null);
  assert.equal(m.activeTrigger('@x\nnext', 7), null, 'a line break ends the mention');
});

test('suggestions come only from the allowed lists', () => {
  const people = m.suggestions(TEAM, '@', '');
  assert.equal(people[0].kind, 'all');
  assert.equal(people[0].detail, 'Everyone in your team');
  assert.deepEqual(people.slice(1).map((t) => t.id), ['OWN01', 'HRM4']);
  assert.deepEqual(m.suggestions(TEAM, '@', 'pri').map((t) => t.label), ['Priya Nair']);
  assert.deepEqual(m.suggestions(TEAM, '@', 'hrm').map((t) => t.label), ['Priya Nair'], 'matches the employee ID too');
  assert.deepEqual(m.suggestions(TEAM, '#', 'op').map((t) => t.label), ['Operations']);
  assert.deepEqual(m.suggestions(TEAM, '@', 'sarah'), [], 'nobody outside scope is suggested');
});

test('an employee with only their own record gets no @all and no departments', () => {
  assert.deepEqual(m.suggestions(SELF, '@', '').map((t) => t.kind), ['employee']);
  assert.deepEqual(m.suggestions(SELF, '#', ''), []);
  assert.deepEqual(m.suggestions(null, '@', ''), []);
});

test('picking a suggestion replaces the typed text with the token and a space', () => {
  const text = 'compare @pri attendance';
  const active = m.activeTrigger(text, 12);
  const token = { kind: 'employee', id: 'HRM4', label: 'Priya Nair', detail: null };
  const result = m.insertToken(text, 12, active, token);
  assert.equal(result.text, 'compare @Priya Nair attendance');
  assert.equal(result.caret, 'compare @Priya Nair '.length);
});

test('only mentions still present in the question are sent', () => {
  const tokens = [
    { kind: 'employee', id: 'HRM4', label: 'Priya Nair', detail: null },
    { kind: 'employee', id: 'OWN01', label: 'Owen Manager', detail: null },
    { kind: 'department', label: 'Operations' },
    { kind: 'all', label: 'all', detail: '' },
  ];
  assert.deepEqual(m.mentionsFromText('How is @Priya Nair doing in #Operations?', tokens), {
    employeeIds: ['HRM4'],
    departments: ['Operations'],
    all: false,
  });
  assert.deepEqual(m.mentionsFromText('@all late days', tokens), { employeeIds: [], departments: [], all: true });
  assert.deepEqual(m.mentionsFromText('plain question', tokens), m.EMPTY_MENTIONS);
});

test('mention lists built from directory entries (Demo / Development)', () => {
  const lists = m.buildMentionable(
    [
      { employeeId: 'A', fullName: 'Ann', department: 'HR' },
      { employeeId: 'B', fullName: 'Bob', department: null },
      { employeeId: 'C', fullName: 'Cid', department: 'Finance' },
    ],
    'organization'
  );
  assert.deepEqual(lists.departments, ['Finance', 'HR']);
  assert.equal(lists.canMentionAll, true);
  assert.equal(m.buildMentionable([], 'self').canMentionAll, false);
});

test('spoken questions mention people and departments said by full name only', async () => {
  const m = await import('../src/services/mentions.ts');
  const mentionable = {
    employees: [
      { employeeId: 'E1', fullName: 'Priya Nair', department: 'HR' },
      { employeeId: 'E2', fullName: 'Will Smith', department: 'Sales' },
    ],
    departments: ['Human Resources', 'Sales'],
    canMentionAll: true,
    allScope: 'organization',
  };
  assert.deepEqual(m.mentionsFromSpeech("What is Priya Nair's attendance?", mentionable), { employeeIds: ['E1'], departments: [], all: false });
  assert.deepEqual(m.mentionsFromSpeech('Headcount in human resources', mentionable).departments, ['Human Resources']);
  assert.deepEqual(m.mentionsFromSpeech('Will anyone join this year?', mentionable).employeeIds, [], 'a first name alone is not a mention');
  assert.deepEqual(m.mentionsFromSpeech('Priya Nair', null), m.EMPTY_MENTIONS);
});
