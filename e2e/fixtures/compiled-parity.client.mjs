/*
 * CROSS-001-B fixture: loads the ONE compiled artifact (Greeting.compiled.js, built by
 * e2e/server/compile-fixtures.mjs through the real UiCompiler + esbuild pipeline) and
 * renders it client-side. The same file is requested by all three engine projects --
 * this is the "compiled once, executed everywhere" parity check.
 */
import { renderToDOM, jsx } from '@swissjs/core';
import { Greeting } from './Greeting.compiled.js';

const container = document.getElementById('app');
renderToDOM(jsx(Greeting, { name: 'Engine' }), container);

queueMicrotask(() => {
  document.documentElement.setAttribute('data-hydrated', 'true');
});
