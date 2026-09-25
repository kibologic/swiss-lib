/*
 * Copyright (c) 2024 Themba Mzumara
 * This file is part of SwissJS Framework. All rights reserved.
 * Licensed under the MIT License. See LICENSE in the project root for license information.
 */

import "reflect-metadata";
import {
  SwissComponent,
  createElement,
  renderToDOM,
  type ComponentType,
  type VNode,
} from "@swissjs/core";
import { createQueries, type BoundQueries } from "./queries.js";
import { waitFor } from "./wait-for.js";
import { flushUpdates } from "./flush.js";

export interface RenderOptions<P extends Record<string, unknown> = Record<string, unknown>> {
  props?: P;
  /** Provide your own container to mount into; otherwise one is created and appended to document.body. */
  container?: HTMLElement;
  /** Attribute getByTestId/queryByTestId look for. Defaults to "data-testid". */
  testIdAttribute?: string;
}

export interface RenderResult extends BoundQueries {
  container: HTMLElement;
  /** The mounted class-component instance, if `component` is a SwissComponent subclass. Undefined for functional components. */
  instance: SwissComponent | undefined;
  unmount(): void;
  /** Re-render the same component with new props (rebuilds and remounts). */
  rerender(props?: Record<string, unknown>): void;
}

const mountedInstances = new Set<{ instance: SwissComponent | undefined; container: HTMLElement; owned: boolean }>();

/**
 * Mounts `component` through the REAL SwissJS mount path — the same dispatch
 * SwissApp.mount uses (runtime/src/framework/app.ts): class components (subclasses
 * of SwissComponent) are instantiated and mounted via instance.mount(container),
 * which drives mountComponent() -> initialize() -> safeRender() -> commitVNode()
 * (component-lifecycle.ts / component.ts). Functional components go through
 * createElement + renderToDOM (renderer/renderer.ts) exactly as SwissApp.mount does.
 *
 * We don't call SwissApp.mount() itself because it doesn't hand back the created
 * instance, and we need that instance to drive a clean unmount (unmountComponent)
 * rather than just detaching DOM.
 */
export function render<P extends Record<string, unknown> = Record<string, unknown>>(
  component: ComponentType,
  options: RenderOptions<P> = {},
): RenderResult {
  const ownedContainer = !options.container;
  const container = options.container ?? document.createElement("div");
  if (ownedContainer) {
    document.body.appendChild(container);
  }

  const props = (options.props ?? {}) as Record<string, unknown>;

  const isClassComponent =
    typeof component === "function" &&
    !!component.prototype &&
    component.prototype instanceof SwissComponent;

  let instance: SwissComponent | undefined;

  const doMount = (mountProps: Record<string, unknown>) => {
    if (isClassComponent) {
      instance = new (component as unknown as new (p: Record<string, unknown>) => SwissComponent)(mountProps);
      instance.mount(container);
    } else {
      const fn = component as (p: Record<string, unknown>) => VNode;
      const vnode = createElement(fn, mountProps);
      renderToDOM(vnode, container);
    }
  };

  doMount(props);

  const record = { instance, container, owned: ownedContainer };
  mountedInstances.add(record);

  const unmount = () => {
    if (!mountedInstances.has(record)) return;
    mountedInstances.delete(record);
    if (instance) {
      instance.unmountComponent();
    }
    // unmountComponent() (for class components whose _container is still attached)
    // removes the container node itself from the DOM. Guard both cases: an
    // already-detached container, and functional-component trees that were never
    // wrapped by a SwissComponent instance at all.
    if (container.parentNode) {
      if (ownedContainer) {
        container.parentNode.removeChild(container);
      } else {
        container.innerHTML = "";
      }
    } else if (!ownedContainer) {
      container.innerHTML = "";
    }
  };

  const rerender = (nextProps?: Record<string, unknown>) => {
    unmount();
    if (ownedContainer) document.body.appendChild(container);
    doMount(nextProps ?? props);
    record.instance = instance;
    mountedInstances.add(record);
  };

  const boundWaitFor = <T>(fn: () => T, timeout?: number) => waitFor(fn, { timeout });

  return {
    container,
    instance,
    unmount,
    rerender,
    ...createQueries(container, boundWaitFor, { testIdAttribute: options.testIdAttribute }),
  };
}

/**
 * Unmounts every component rendered via `render()` that hasn't already been
 * unmounted, and clears document.body. Call from an `afterEach` — see setup.ts
 * for a ready-made hook.
 */
export function cleanup(): void {
  for (const record of Array.from(mountedInstances)) {
    mountedInstances.delete(record);
    if (record.instance) {
      record.instance.unmountComponent();
    }
    record.container.innerHTML = "";
    record.container.parentNode?.removeChild(record.container);
  }
  document.body.innerHTML = "";
}

export { flushUpdates };
