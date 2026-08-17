import '@swissjs/core';
import { renderToString, jsx } from '@swissjs/core';
import { EventOrder } from './event-order.component.mjs';

export function renderMarkup() {
  return renderToString(jsx(EventOrder, { stopAtInner: false }));
}
