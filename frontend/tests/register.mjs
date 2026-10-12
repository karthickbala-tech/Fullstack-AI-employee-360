import { register } from 'node:module';

register('./ts-loader.mjs', import.meta.url);

// The services read `window` (setTimeout, ZOHO SDK); in tests it is the global object.
globalThis.window = globalThis;
