/*
 * CROSS-001-B fixture: nested click handlers to observe real event ordering/propagation
 * (capture, bubble, stopPropagation) across engines. The SwissJS renderer attaches
 * listeners via standard addEventListener (compiler-output audit, FABLE-CROSS-001 s6) --
 * this fixture proves that attachment behaves identically once real engine event
 * dispatch (not jsdom's) is driving it.
 *
 * jsx()'s signature is (type, props, key?) -- children come from props.children
 * (matching the real JSX transform), not rest args (that's createVNode's shape).
 */
import { SwissComponent, jsx } from '@swissjs/core';

export class EventOrder extends SwissComponent {
  constructor(props) {
    super(props);
    this.state = { log: [] };
  }

  render() {
    const inner = jsx('button', {
      id: 'inner',
      type: 'button',
      onClick: (e) => {
        this.state.log = [...this.state.log, 'inner'];
        if (this.props?.stopAtInner) e.stopPropagation();
      },
      children: 'click me',
    });

    const middle = jsx('div', {
      id: 'middle',
      onClick: () => {
        this.state.log = [...this.state.log, 'middle'];
      },
      children: inner,
    });

    const outer = jsx('div', {
      id: 'outer',
      onClick: () => {
        this.state.log = [...this.state.log, 'outer'];
      },
      children: [middle, jsx('pre', { id: 'log', children: this.state.log.join(',') })],
    });

    return outer;
  }
}
