import { hydrate, jsx } from '@swissjs/core';
import { EventOrder } from './event-order.component.mjs';

const container = document.getElementById('app');
const stopAtInner = new URLSearchParams(window.location.search).get('stopAtInner') === 'true';
hydrate(jsx(EventOrder, { stopAtInner }), container);

queueMicrotask(() => {
  document.documentElement.setAttribute('data-hydrated', 'true');
});
