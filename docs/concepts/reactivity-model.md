# Reactivity model

How SwissJS tracks dependencies, propagates changes, and schedules re-renders.

---

## Primitives

### Signal\<T\>

The foundational reactive primitive. A Signal holds a single value and notifies all subscribers when that value changes.

```typescript
import { Signal } from '@swissjs/core';

const count = new Signal(0);

// Reading the value (tracks dependency when inside an effect)
count.value;       // 0

// Writing the value (notifies all subscribers)
count.value = 5;
```

**Options:**

```typescript
const s = new Signal(0, {
  name: 'count',             // debugging label
  equals: (a, b) => a === b, // custom equality — skip notify if equal
  capability: 'admin',       // capability required to read inside effects
});
```

**Internals:** `Signal` maintains a `Set<() => void>` of subscriber callbacks. On read inside an active effect, it calls `trackEffect(this)` to register. On write, it calls each subscriber.

---

### `reactive(obj)`

Wraps a plain object in a `Proxy` that intercepts property sets and notifies any active effects that read those properties.

```typescript
import { reactive } from '@swissjs/core';

const state = reactive({ count: 0, name: 'Swiss' });
state.count = 1; // notifies effects that read state.count
```

`BaseComponent.state` is a `reactive()` Proxy. Writes to `this.state.x` inside `setState()` trigger the component's render effect.

---

### Effects

An effect is a function that runs once immediately and re-runs whenever any Signal or reactive property it reads changes.

```typescript
import { createEffect, Signal } from '@swissjs/core';

const price = new Signal(100);
const quantity = new Signal(2);

createEffect(() => {
  const total = price.value * quantity.value;
  console.log('total:', total);
});
// logs: total: 200

quantity.value = 3;
// logs: total: 300
```

Effects clean up their previous subscriptions before each re-run, so dependency tracking is always current.

---

## How dependency tracking works

SwissJS uses a **push-pull** model:

1. When an effect starts running, it sets itself as the **current effect** (`setCurrentEffect`).
2. Any `Signal.get value` or `reactive` property read calls `trackEffect`, which registers the current effect as a subscriber.
3. When the effect finishes, `setCurrentEffect(null)`.
4. When a Signal is written (`set value`), it calls `notify()` which runs all registered subscribers.
5. The component's render effect is one of these subscribers — it calls `scheduleUpdate()` which batches DOM patches via microtask.

---

## Batching

Multiple signal writes in one synchronous block can be batched to produce a single re-render:

```typescript
import { batch } from '@swissjs/core';

batch(() => {
  this.firstName = 'Themba';
  this.lastName = 'Mzumara';
});
// component re-renders once, not twice
```

`batch()` defers `notify()` calls until the batch function returns, then flushes all pending notifications together.

---

## Component reactivity

Inside a SwissJS component, `state {}` blocks create Signal-backed properties:

```typescript
// Swiss syntax (.ui)
state {
  let count: number = 0;
}

// Compiled output (simplified)
private _count$ = new Signal<number>(0);
private get count()   { return this._count$.value; }
private set count(v)  { this._count$.value = v; }
```

The component's `render()` method is wrapped in an effect. When `this.count` is read inside `render()`, `_count$` records the render effect as a subscriber. Setting `this.count = 5` triggers the effect → `render()` re-runs → VDOM reconciler patches the DOM.

---

## Computed values

`computed get` is a plain getter — not memoized. It runs synchronously each time it is read. If all its dependencies are Signals, it will produce the correct value on every read.

For expensive derivations that should only recompute when inputs change, use a dedicated Signal + effect:

```typescript
// Manual memo pattern
private _expensiveResult$ = new Signal<number>(0);

mount {
  createEffect(() => {
    this._expensiveResult$.value = this.largeDataset.reduce(...);
  });
}

computed get expensiveResult() {
  return this._expensiveResult$.value;
}
```

---

## Effect cleanup

Effects created with `createEffect()` inside a component are tracked and cleaned up on unmount. If you create an effect in `mount {}` that sets up an external subscription (e.g., a DOM event listener), return a cleanup function:

```typescript
mount {
  const handler = (e: Event) => { this.lastKey = (e as KeyboardEvent).key; };
  document.addEventListener('keydown', handler);
  // cleanup returned to the effect system
  return () => document.removeEventListener('keydown', handler);
}
```

---

## Reactivity boundaries

Signal updates do not cross `async` boundaries automatically. If you await inside an effect, dependencies read after the `await` are not tracked. Restructure async work so reads happen synchronously:

```typescript
// Bad — dependencies after await are not tracked
effect {
  const id = this.userId;   // tracked
  const user = await fetchUser(id);
  this.name = user.name;    // write, fine
  console.log(this.theme);  // read after await — NOT tracked
}

// Better — read synchronously, await separately
mount {
  createEffect(() => {
    const id = this.userId;   // tracked
    fetchUser(id).then(user => { this.name = user.name; });
  });
}
```
