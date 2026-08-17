/*
 * CROSS-001-B fixture component, shared between server (SSR) and client (hydration)
 * halves of the round-trip test. Deliberately identical to the Counter used in
 * runtime/src/__tests__/ssr-hydration-round-trip.test.ts's jsdom version, so the two
 * suites are provably testing the same contract in different environments.
 */
import { SwissComponent, jsx } from '@swissjs/core';

export class Counter extends SwissComponent {
  constructor(props) {
    super(props);
    this.state = { count: props?.start ?? 0 };
    this.onIncrement = () => {
      this.state.count += 1;
    };
  }

  render() {
    return jsx('button', {
      class: 'counter',
      onClick: this.onIncrement,
      children: `count: ${this.state.count}`,
    });
  }
}
