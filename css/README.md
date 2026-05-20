# @swissjs/css

CSS processing utilities for SwissJS. Provides CSS modules, asset handling, and compile-time CSS utilities used by `@swissjs/swite` during development and build.

---

## Exports

```typescript
import { VERSION } from '@swissjs/css';

// CSS Modules
export * from '@swissjs/css'; // modules/index.js

// CSS Compiler utilities
// compiler/index.js

// Asset handling
// assets/index.js

// Utilities
// utils/index.js
```

---

## CSS in components

### `css` tagged template

Use the `css` tagged template from `@swissjs/core` to define scoped styles inside a component:

```typescript
// Button.ui

component Button {
  render() {
    return html`
      <button class="btn">${this.label}</button>
    `;
  }
}

const styles = css`
  .btn {
    padding: 0.5rem 1rem;
    background: #3b82f6;
    color: white;
    border: none;
    border-radius: 4px;
    cursor: pointer;
  }
  .btn:hover {
    background: #2563eb;
  }
`;
```

`css\`\`` is processed by `@swissjs/swite` at dev/build time — styles are extracted and either injected as a `<style>` tag (dev) or bundled into a CSS file (production).

### Asset imports

Static assets can be imported in `.ui` and `.uix` files:

```typescript
import logo from './assets/logo.png';

component Header {
  render() {
    return html`<img src="${logo}" alt="Logo" />`;
  }
}
```

Swite handles asset fingerprinting and copying to `dist/` during build.

---

## CSS Modules

For scoped class name generation:

```typescript
import { cssModule } from '@swissjs/css';

const styles = cssModule({
  button: 'btn-primary',
  active: 'btn-active',
});

// styles.button → 'btn-primary__a8f3c' (scoped at build time)
```

---

## Status

The `@swissjs/css` package provides utilities consumed by Swite internally. Direct application usage is primarily via the `css\`\`` tagged template from `@swissjs/core` and asset imports, which Swite intercepts and processes.

`@swissjs/css` is excluded from the linked changeset versioning group due to a Buffer compatibility constraint in its build.
