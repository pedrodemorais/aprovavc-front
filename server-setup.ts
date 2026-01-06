import * as domino from 'domino';

// Provide a minimal DOM for libraries that touch `document` during SSR/prerender.
// Use an empty template to avoid HTMLParser issues in Node bundles.
const window = domino.createWindow('');
globalThis.window = window as any;
globalThis.document = window.document as any;
globalThis.navigator = window.navigator as any;
