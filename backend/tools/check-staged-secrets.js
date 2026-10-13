'use strict';

/**
 * Pre-commit check: fails if anything staged would commit a secret.
 *   node backend/tools/check-staged-secrets.js
 *
 * - Any staged catalyst-config.json whose deployment.env_variables has a
 *   non-empty value (GEMINI_API_KEY, E360_IDENTITY_ASSERTION_SECRET, ...).
 * - Any staged added line that looks like a Google API key, or that assigns
 *   a value to E360_IDENTITY_ASSERTION_SECRET.
 * - A staged Deluge identity function whose secret placeholder was replaced.
 * Prints file and variable names only, never values. It does not change git
 * state or hide changes.
 */

const { execFileSync } = require('child_process');

const git = args => execFileSync('git', args, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
const problems = [];

const staged = git(['diff', '--cached', '--name-only', '--diff-filter=ACMR']).split('\n').filter(Boolean);

for (const file of staged.filter(name => name.endsWith('catalyst-config.json'))) {
  try {
    const config = JSON.parse(git(['show', `:${file}`]));
    const variables = (config.deployment && config.deployment.env_variables) || {};
    const filled = Object.keys(variables).filter(name => variables[name] !== '' && variables[name] !== null);
    if (filled.length > 0) problems.push(`${file}: env_variables with values staged (${filled.join(', ')})`);
  } catch (err) {
    problems.push(`${file}: could not be checked (${err.message})`);
  }
}

for (const file of staged.filter(name => name.endsWith('e360_identity_assertion.deluge'))) {
  if (!/secret = "REPLACE_WITH_SIGNING_SECRET";/.test(git(['show', `:${file}`]))) {
    problems.push(`${file}: the secret placeholder was replaced`);
  }
}

const addedLines = git(['diff', '--cached', '-U0']).split('\n').filter(line => line.startsWith('+') && !line.startsWith('+++'));
if (addedLines.some(line => /AIza[0-9A-Za-z_-]{20,}/.test(line))) problems.push('a staged line looks like a Google API key');
// A documentation placeholder such as "<secret>" is not a value (base64url has no < or >).
const assignsSecretValue = line => {
  const match = line.match(/E360_IDENTITY_ASSERTION_SECRET\s*["']?\s*[:=]\s*["']([^"'\s]{8,})/);
  return Boolean(match) && !/^<[^<>]+>$/.test(match[1]);
};
if (addedLines.some(assignsSecretValue)) {
  problems.push('a staged line assigns a value to E360_IDENTITY_ASSERTION_SECRET');
}

if (problems.length > 0) {
  console.error('Secrets would be committed. Unstage them first:');
  for (const problem of problems) console.error(`  - ${problem}`);
  process.exit(1);
}
console.log(`OK: no secrets found in ${staged.length} staged file(s).`);
