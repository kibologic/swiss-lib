/*
 * CROSS-001-B fixture component: shared between SSR and client halves of the
 * focus-guard conformance test. Typing "bad" into the input triggers a validation
 * error, inserting a sibling <div> BEFORE the <input> -- the exact reconciliation
 * shape covered by runtime/__tests__/regression/input-focus.test.ts, now driven by a
 * real engine's focus/selection/reconciliation instead of jsdom's.
 *
 * Deliberately triggered by an *input* event on the field itself (validation-as-you-
 * type), not a separate button click: clicking a <button> in a real engine moves
 * focus to the button as part of the click, BEFORE the state-mutation handler runs
 * -- discovered while building this fixture (a real, jsdom-invisible behaviour;
 * jsdom's synthetic .click() does not move focus the way a real engine does). That
 * would make a button-triggered version of this test measure "does focus-guard
 * preserve the button's focus" rather than "does it preserve the input's focus
 * across a reconciliation triggered while still typing" -- a real and separate
 * question, intentionally not conflated with this one (see the button-triggered
 * DOM-identity test below, which is a valid but different assertion).
 */
import { SwissComponent, jsx } from '@swissjs/core';

export class FocusForm extends SwissComponent {
  constructor(props) {
    super(props);
    this.state = { showError: props?.showError ?? false };
  }

  render() {
    const children = [];
    if (this.state.showError) {
      children.push(jsx('div', { class: 'field-error', id: 'field-error', children: 'Required' }));
    }
    children.push(
      jsx('input', {
        type: 'text',
        name: 'email',
        id: 'email-input',
        onInput: (e) => {
          const shouldError = e.target.value.includes('bad');
          if (shouldError !== this.state.showError) this.state.showError = shouldError;
        },
      }),
    );
    children.push(
      jsx('button', {
        type: 'button',
        id: 'toggle-error',
        onClick: () => {
          this.state.showError = !this.state.showError;
        },
        children: 'toggle',
      }),
    );
    // jsx()'s signature is (type, props, key?) -- children come from props.children
    // (matching the real JSX transform), NOT rest args. Rest args are createVNode's
    // shape, not jsx()'s; passing them positionally here would silently drop them.
    return jsx('form', { children });
  }
}
