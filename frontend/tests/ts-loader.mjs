// Lets Node's built-in test runner import the app's TypeScript service modules
// without extra dependencies: resolves extensionless relative imports to .ts and
// strips types with Node's own stripTypeScriptTypes. `import.meta.env` (a Vite
// build-time object) is replaced by globalThis.__VITE_ENV__ for tests.
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { stripTypeScriptTypes } from 'node:module';
import { fileURLToPath } from 'node:url';

export async function resolve(specifier, context, next) {
  if (specifier.startsWith('.') && context.parentURL && !/\.[cm]?[jt]sx?$/.test(specifier)) {
    for (const extension of ['.ts', '.tsx']) {
      const candidate = new URL(specifier + extension, context.parentURL);
      if (existsSync(fileURLToPath(candidate))) return { url: candidate.href, shortCircuit: true };
    }
  }
  return next(specifier, context);
}

export async function load(url, context, next) {
  if (url.startsWith('file:') && url.endsWith('.ts')) {
    const source = await readFile(fileURLToPath(url), 'utf8');
    const withEnv = source.replace(/import\.meta\.env/g, '(globalThis.__VITE_ENV__ || {})');
    return { format: 'module', source: stripTypeScriptTypes(withEnv), shortCircuit: true };
  }
  return next(url, context);
}
