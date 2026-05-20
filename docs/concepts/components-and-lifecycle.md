# Components and lifecycle

How SwissJS components work, from authoring syntax through to runtime lifecycle.

---

## Authoring

Components are authored in `.ui` or `.uix` files using Swiss syntax. The compiler transforms them into TypeScript classes that extend `SwissComponent`.

```typescript
// Greeting.ui

component Greeting {
  props = {
    name: string,
  };

  state {
    let greeting: string = 'Hello';
  }

  computed get message() {
    return `${this.greeting}, ${this.name}!`;
  }

  mount {
    console.log('Greeting mounted for', this.name);
  }

  unmount {
    console.log('Greeting removed');
  }

  render() {
    return html`<h1>${this.message}</h1>`;
  }
}
```

---

## Lifecycle

### Mount sequence

1. `SwissApp.mount(Component, element)` constructs the component
2. `handleMount()` is called after the first render completes and the component is in the DOM
3. `mount {}` blocks in Swiss syntax compile to `private mounted()` which is invoked from `handleMount()`

### Update sequence

Any write to a `state {}` property, `reactive let`, or Signal triggers the reactivity system:
1. Signal notifies its subscribers
2. The component's render effect re-runs
3. The VDOM reconciler diffs against the previous VNode tree
4. Minimal DOM patches are applied
5. `handleUpdate()` is called after patching completes

### Unmount sequence

1. The component is removed from the DOM
2. `handleDestroy()` is called
3. `unmount {}` blocks (compiled to `private unmounted()`) run
4. All effect subscriptions are cleaned up

---

## State

### `state {}` block

Declare reactive state inside a `state {}` block. Each `let` declaration becomes a `Signal<T>`-backed private getter/setter:

```typescript
state {
  let count: number = 0;
  let user: User | null = null;
  let items: string[] = [];
}
```

Reading `this.count` inside `render()` or an `effect {}` registers a dependency. Writing `this.count = 5` notifies all subscribers and schedules a re-render.

### `reactive let`

For a single reactive variable without a Signal wrapper:

```typescript
reactive let loading: boolean = false;
```

### `setState()` (class API)

When writing class-based components, use `setState()`:

```typescript
this.setState({ count: 0 });
this.setState(prev => ({ count: prev.count + 1 }));
```

`setState()` iterates the updates and writes to the Proxy — only properties that actually changed trigger notifications.

---

## Props

### Swiss syntax

```typescript
props = {
  name: string,
  count: number,
  optional: string | undefined,
};
```

The compiler moves `props = {}` off the instance to `static propTypes = {}`. Actual prop values come from the parent via `this.props`.

### Class API

```typescript
interface MyProps { name: string; count?: number }
class MyComponent extends SwissComponent<MyProps, {}> { ... }
```

---

## Computed values

`computed get` declares a derived value recalculated whenever its dependencies change:

```typescript
computed get fullName() {
  return `${this.firstName} ${this.lastName}`;
}
```

Compiles to a private getter. The return value is not cached — reads are synchronous. For expensive computations, use a Signal + effect pattern.

---

## Effects

`effect {}` runs when the component mounts and re-runs whenever any Signal or reactive value read inside it changes:

```typescript
effect {
  console.log('title is now', this.title);
  document.title = this.title;
}
```

Effects are cleaned up automatically on unmount.

---

## Capability requirements

Components can declare required capabilities that are checked at mount time:

```typescript
@requires('network')
component UserList {
  ...
}
```

Or in class syntax:

```typescript
class UserList extends SwissComponent {
  static requires = ['network'];
}
```

If the required capability is not granted by the security gateway, the component will not mount.

---

## Error boundaries

Any component can be made an error boundary:

```typescript
import { ErrorBoundary } from '@swissjs/core';

class AppShell extends ErrorBoundary {
  override renderError(error: unknown): VNode {
    return html`<div class="error-ui">Failed to load</div>`;
  }
}
```

Or wrap an existing component:

```typescript
import { createErrorBoundary } from '@swissjs/core';

const SafeWidget = createErrorBoundary(Widget, FallbackUI);
```

---

## Full lifecycle reference

| Swiss syntax | Compiled to | When |
|---|---|---|
| `mount {}` | `private mounted()` → called from `handleMount()` | After first render, component in DOM |
| `unmount {}` | `private unmounted()` → called from `handleDestroy()` | Before component removed |
| `effect {}` | `private effect()` | Mount + every dependency change |
| — | `handleUpdate()` | After any re-render |
| — | `captureError(error, phase)` | On any thrown error |
