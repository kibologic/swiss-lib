---
"@swissjs/core": patch
---

Fix prop reactivity so child components re-render when parent passes new props.

Props are now wrapped in reactive() at construction (base-component.ts), matching
how state is handled. Parent-to-child prop updates now mutate the existing reactive
proxy in-place rather than replacing it, so Signal tracking is preserved and the
render effect re-runs on prop changes (component-rendering.ts). clearRenderCache is
called on every prop update. Child components created via createDOMNode() now also
receive the beforeMount lifecycle hook before mounted, matching root component
behaviour (dom-creation.ts).
