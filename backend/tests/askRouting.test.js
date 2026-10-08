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

const OUT_OF_SCOPE = /^Sorry, I can only help with Employee 360 questions/;

test('friendly small talk is answered and carries no Employee 360 classification', async t => {
  silenceLogs(t);
  const generator = new AskGenerator(stubProvider("I'm doing great - thanks for asking! What would you like to know?"));
  const result = await generator.answerGeneral('how are you maple?');
  assert.deepEqual(result, {
    answer: "I'm doing great - thanks for asking! What would you like to know?",
    type: 'Unknown',
    confidence: 'unknown',
    evidence: [],
    limitations: []
  });
});

test('outside-knowledge requests are declined, never answered', async t => {
  silenceLogs(t);
  const declined = await new AskGenerator(stubProvider('OUT_OF_SCOPE')).answerGeneral('How do I make biryani?');
  assert.match(declined.answer, OUT_OF_SCOPE);

  // Even if the model ignores the instruction, an informational answer is replaced.
  const recipe = '*   **Marinate:** Mix chicken with yogurt.\n*   **Cook Rice:** Boil basmati rice.';
  const guarded = await new AskGenerator(stubProvider(recipe)).answerGeneral('How do I make biryani?');
  assert.match(guarded.answer, OUT_OF_SCOPE);
  assert.doesNotMatch(guarded.answer, /chicken|rice/i);

  const long = 'Recursion is a technique where a function calls itself. '.repeat(6);
  assert.match((await new AskGenerator(stubProvider(long)).answerGeneral('Explain recursion')).answer, OUT_OF_SCOPE);
});

test('the out-of-scope prompt forbids outside knowledge', async t => {
  silenceLogs(t);
  const calls = [];
  const generator = new AskGenerator({ model: 'stub', generateCompletion: async (prompt, options) => { calls.push(options); return 'OUT_OF_SCOPE'; } });
  await generator.answerGeneral('What is the capital of France?');
  assert.match(calls[0].systemInstruction, /never provide outside knowledge/);
  assert.match(calls[0].systemInstruction, /OUT_OF_SCOPE/);
});

test('general path hands back to the employee path on the handoff token', async t => {
  silenceLogs(t);
  const generator = new AskGenerator(stubProvider('ROUTE_EMPLOYEE'));
  assert.equal(await generator.answerGeneral('How long have I been here?'), null);
});

test('a failed small-talk call falls back to the scoped reply instead of an error', async t => {
  silenceLogs(t);
  const generator = new AskGenerator(stubProvider(new Error('timeout')));
  const result = await generator.answerGeneral('Explain recursion simply');
  assert.match(result.answer, OUT_OF_SCOPE);
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
  const result = await service.ask('HRM4', 'Where do I usually sit?', {});
  assert.equal(result.route, 'employee');
  assert.equal(calls.canonical, 1);
  assert.equal(provider.prompts.length, 2);
  assert.doesNotMatch(provider.prompts[0], /Priya|Information Technology/);
});
