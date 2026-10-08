'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { fn, silenceLogs } = require('./helpers');

const QuestionRouter = fn('ai/questionRouter');
const AskGenerator = fn('ai/askGenerator');
const AskService = fn('services/askService');

const { ROUTES } = QuestionRouter;

test('whole-message greetings and small talk take the conversation route', () => {
  for (const q of ['Hi', 'hello!', 'Hey there', 'Good morning', 'thanks', 'Thank you so much!', 'ok', 'bye', 'How are you?', 'What can you do?']) {
    const result = QuestionRouter.classify(q);
    assert.equal(result.route, ROUTES.CONVERSATION, q);
    assert.equal(typeof result.reply, 'string', q);
  }
});

test('a greeting combined with a question is not treated as small talk', () => {
  assert.equal(QuestionRouter.classify('Hi, what is my attendance?').route, ROUTES.EMPLOYEE);
  assert.equal(QuestionRouter.classify('hello how many leaves do I have').route, ROUTES.EMPLOYEE);
});

test('employee and HR questions take the employee route', () => {
  for (const q of [
    'What is my attendance percentage?',
    'Which department is she in?',
    'How long is the tenure?',
    'Who is the reporting manager?',
    'How much salary was provided this month for all employees?',
    'Show the performance rating',
    'Any resignation recorded?'
  ]) {
    assert.equal(QuestionRouter.classify(q).route, ROUTES.EMPLOYEE, q);
  }
});

test('questions without employee signals take the general route', () => {
  for (const q of ['How do I make biryani?', 'What is the capital of France?', 'Explain recursion simply']) {
    assert.equal(QuestionRouter.classify(q).route, ROUTES.GENERAL, q);
  }
});

function stubProvider(reply) {
  const prompts = [];
  return {
    model: 'stub-model',
    prompts,
    generateCompletion: async prompt => {
      prompts.push(prompt);
      if (reply instanceof Error) throw reply;
      return reply;
    }
  };
}

test('general answers carry no Employee 360 classification', async t => {
  silenceLogs(t);
  const generator = new AskGenerator(stubProvider('Soak the rice, then layer it with the masala.'));
  const result = await generator.answerGeneral('How do I make biryani?');
  assert.deepEqual(result, {
    answer: 'Soak the rice, then layer it with the masala.',
    type: 'Unknown',
    confidence: 'unknown',
    evidence: [],
    limitations: []
  });
});

test('general path hands back to the employee path on the handoff token', async t => {
  silenceLogs(t);
  const generator = new AskGenerator(stubProvider('ROUTE_EMPLOYEE'));
  assert.equal(await generator.answerGeneral('How long have I been here?'), null);
});

test('general path failure returns a short retry message instead of an error', async t => {
  silenceLogs(t);
  const generator = new AskGenerator(stubProvider(new Error('timeout')));
  const result = await generator.answerGeneral('Explain recursion simply');
  assert.match(result.answer, /try again/);
  assert.deepEqual(result.evidence, []);
});

function makeService(t, providerReply) {
  silenceLogs(t);
  const service = new AskService();
  const provider = stubProvider(providerReply);
  const calls = { canonical: 0, audit: 0 };
  service.askGenerator = new AskGenerator(provider);
  service.employee360Service = {
    getCanonical360: async () => {
      calls.canonical += 1;
      return {
        isLiveZohoData: true,
        metadata: { employeeId: 'HRM4' },
        employee: { fullName: 'Priya Nair' },
        employment: {},
        organisation: { department: 'Information Technology' },
        deterministicMetrics: {},
        evidence: [],
        limitations: []
      };
    }
  };
  service.aiInteractionRepository = { logInteraction: async () => { calls.audit += 1; } };
  return { service, provider, calls };
}

test('a greeting never builds Employee 360, calls AI, or writes an audit row', async t => {
  const { service, provider, calls } = makeService(t, 'unused');
  const result = await service.ask('HRM4', 'Hi', {});
  assert.equal(result.route, 'conversation');
  assert.equal(calls.canonical, 0);
  assert.equal(calls.audit, 0);
  assert.equal(provider.prompts.length, 0);
});

test('a general question is answered without building Employee 360 or sending employee data', async t => {
  const { service, provider, calls } = makeService(t, 'Paris.');
  const result = await service.ask('HRM4', 'What is the capital of France?', {});
  assert.equal(result.route, 'general');
  assert.equal(result.answer, 'Paris.');
  assert.equal(calls.canonical, 0);
  assert.equal(calls.audit, 1);
  assert.equal(provider.prompts.length, 1);
  assert.doesNotMatch(provider.prompts[0], /Priya|Information Technology|HRM4/);
});

test('a handed-back general question falls through to the employee path', async t => {
  const { service, provider, calls } = makeService(t, 'ROUTE_EMPLOYEE');
  const result = await service.ask('HRM4', 'How long have I been here?', {});
  assert.equal(result.route, 'employee');
  assert.equal(calls.canonical, 1);
  assert.equal(provider.prompts.length, 2);
  assert.doesNotMatch(provider.prompts[0], /Priya|Information Technology/);
});
