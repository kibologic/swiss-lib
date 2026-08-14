/*
 * Copyright (c) 2024 Themba Mzumara
 * This file is part of SwissJS Framework. All rights reserved.
 * Licensed under the MIT License. See LICENSE in the project root for license information.
 */

import type { VNode, VElement, ComponentVNode } from "../vdom/vdom.js";
import type { VNodeBase } from "../vdom/types/index.js";
import type { SwissComponent } from "../component/component.js";
import { asInternal } from "../component/internal.js";
import { vnodeMetadata, componentInstances } from "./storage.js";
import { isTextVNode, isElementVNode, isComponentVNode } from "./types.js";
import { DiffingError } from "./errors.js";
import { reconcileProps } from "./props-updates.js";
import { armPostInitSkip } from "./dom-creation.js";

// Forward declarations for functions passed as parameters
type RenderToDOMFn = (vnode: VNode, container: HTMLElement) => void;
type RenderComponentFn = (
  vnode: ComponentVNode,
  existingInstance?: SwissComponent,
) => VNode;
type CreateDOMNodeFn = (vnode: VNode | null | undefined | boolean) => Node;
type UpdateDOMNodeFn = (dom: Node, vnode: VNode) => void;

export function hydrate(
  root: VNode,
  container: HTMLElement,
  renderToDOMFn: RenderToDOMFn,
  createDOMNodeFn: CreateDOMNodeFn,
  renderComponentFn: RenderComponentFn,
  updateDOMNodeFn: UpdateDOMNodeFn,
): void {
  try {
    const stateScript = document.getElementById("ssr-state");
    if (stateScript) {
      const state = JSON.parse(stateScript.textContent || "{}");
      if (typeof root === "object" && root !== null && "props" in root) {
        root.props = { ...root.props, ...state.props };
      }
    }

    const islands = container.querySelectorAll("[data-swiss-island]");
    if (islands.length > 0) {
      islands.forEach((island) => {
        const key = island.getAttribute("data-swiss-island");
        if (
          key &&
          typeof root === "object" &&
          root !== null &&
          "children" in root &&
          Array.isArray(root.children)
        ) {
          const component = root.children.find(
            (child) =>
              typeof child === "object" &&
              child !== null &&
              "key" in child &&
              child.key === key,
          );
          if (component) {
            hydrateIsland(
              component,
              island.parentElement as HTMLElement,
              renderToDOMFn,
              createDOMNodeFn,
              renderComponentFn,
              updateDOMNodeFn,
            );
          }
        }
      });
    } else {
      hydrateDOM(
        root,
        container.firstChild as Node,
        createDOMNodeFn,
        renderComponentFn,
        updateDOMNodeFn,
      );
    }
  } catch (e) {
    console.error("Hydration mismatch:", e);
    container.innerHTML = "";
    renderToDOMFn(root, container);
  }
}

export function hydrateDOM(
  vnode: VNode,
  domNode: Node,
  createDOMNodeFn: CreateDOMNodeFn,
  renderComponentFn: RenderComponentFn,
  updateDOMNodeFn: UpdateDOMNodeFn,
): void {
  if (!domNode) {
    console.warn("Hydration failed: DOM node not found for VNode", vnode);
    return;
  }
  vnodeMetadata.set(domNode, vnode);

  if (isTextVNode(vnode)) {
    hydrateTextNode(vnode, domNode);
  } else if (isElementVNode(vnode)) {
    hydrateElementNode(
      vnode,
      domNode as HTMLElement,
      createDOMNodeFn,
      renderComponentFn,
      updateDOMNodeFn,
    );
  } else if (isComponentVNode(vnode)) {
    hydrateComponentNode(
      vnode,
      domNode as HTMLElement,
      renderComponentFn,
      createDOMNodeFn,
      updateDOMNodeFn,
    );
  }
}

function hydrateIsland(
  component: VNode,
  container: HTMLElement,
  renderToDOMFn: RenderToDOMFn,
  createDOMNodeFn: CreateDOMNodeFn,
  renderComponentFn: RenderComponentFn,
  updateDOMNodeFn: UpdateDOMNodeFn,
): void {
  try {
    const islandStart = container.querySelector("[data-island-start]");
    const islandEnd = container.querySelector("[data-island-end]");

    if (islandStart && islandEnd) {
      const islandContent = islandStart.nextSibling;
      if (islandContent) {
        hydrateDOM(
          component,
          islandContent,
          createDOMNodeFn,
          renderComponentFn,
          updateDOMNodeFn,
        );
      }
    } else {
      if (container.firstChild) {
        hydrateDOM(
          component,
          container.firstChild,
          createDOMNodeFn,
          renderComponentFn,
          updateDOMNodeFn,
        );
      } else {
        renderToDOMFn(component, container);
      }
    }
    container.setAttribute("data-island-hydrated", "true");
  } catch (error) {
    console.error("Island hydration failed:", error);
    container.innerHTML = "";
    renderToDOMFn(component, container);
  }
}

function hydrateTextNode(vnode: string, domNode: Node) {
  if (domNode.nodeType !== Node.TEXT_NODE || domNode.textContent !== vnode) {
    domNode.textContent = vnode;
  }
  vnodeMetadata.set(domNode, vnode as unknown as VNode);
}

function hydrateElementNode(
  vnode: VElement,
  domNode: HTMLElement,
  createDOMNodeFn: CreateDOMNodeFn,
  renderComponentFn: RenderComponentFn,
  updateDOMNodeFn: UpdateDOMNodeFn,
) {
  if (domNode.tagName.toLowerCase() !== vnode.type.toLowerCase()) {
    throw new DiffingError(
      `Element type mismatch: expected ${vnode.type}, got ${domNode.tagName}`,
    );
  }

  if (vnode.ssrId && domNode.dataset.ssrId !== vnode.ssrId) {
    console.warn(
      `SSR ID mismatch: expected ${vnode.ssrId}, found ${domNode.dataset.ssrId}`,
    );
  }

  vnodeMetadata.set(domNode, vnode);

  const oldProps = {};
  reconcileProps(domNode, oldProps, vnode.props || {});

  const domChildren = Array.from(domNode.childNodes);
  const newVChildren = vnode.children || [];

  newVChildren.forEach((child, index) => {
    const domChild = domChildren[index];
    if (domChild) {
      hydrateDOM(
        child,
        domChild,
        createDOMNodeFn,
        renderComponentFn,
        updateDOMNodeFn,
      );
    } else {
      const newDom = createDOMNodeFn(child);
      domNode.appendChild(newDom);
    }
  });

  for (let i = newVChildren.length; i < domChildren.length; i++) {
    domNode.removeChild(domChildren[i]);
  }
}

function hydrateComponentNode(
  vnode: ComponentVNode,
  domNode: HTMLElement,
  renderComponentFn: RenderComponentFn,
  createDOMNodeFn: CreateDOMNodeFn,
  updateDOMNodeFn: UpdateDOMNodeFn,
) {
  // Reuse an existing instance if it is already registered for this DOM node.
  let existingInstance: SwissComponent | undefined = vnode.__componentInstance;
  if (!(existingInstance && existingInstance.constructor === vnode.type)) {
    existingInstance = componentInstances.get(domNode);
    if (!(existingInstance && existingInstance.constructor === vnode.type)) {
      existingInstance = undefined;
    }
  }

  // Render component output using the existing instance when possible.
  const rendered = renderComponentFn(vnode, existingInstance);

  // Capture the instance created/used by renderComponent.
  const instanceFromRender = (rendered as unknown as VNodeBase | null)?.__componentInstance;

  const finalInstance = instanceFromRender || existingInstance;
  if (finalInstance) {
    componentInstances.set(domNode, finalInstance);
    vnode.__componentInstance = finalInstance;
    vnode.dom = domNode;
    // Ensure the instance tracks its host DOM node.
    const fci = asInternal(finalInstance);
    fci._domNode = fci._domNode || domNode;

    // dom-creation.ts's createComponentNode calls renderComponentFn to get the FIRST,
    // untracked render (see component-rendering.ts: instantiation renders via
    // `untrack(() => instance.render())`, deliberately not yet subscribed to anything),
    // then explicitly calls initialize() afterward -- which is what wires the reactive
    // effect (reactivity-setup.ts's setupReactivity()) that makes future state/signal
    // writes trigger a re-render at all. hydrateComponentNode calls the exact same
    // renderComponentFn but, before this fix, never took that second step: a hydrated
    // component's constructor ran, its first render was used to satisfy hydration, and
    // then nothing ever subscribed it to its own state again. The component looked
    // hydrated (DOM reused, event listeners attached) but was permanently inert to any
    // state change from that point on. Mirror dom-creation.ts's sequencing exactly.
    if (!fci._initialized && !fci.__initialized && typeof finalInstance.initialize === "function") {
      finalInstance.initialize();
      armPostInitSkip(fci);
      if (typeof finalInstance.executeHookPhase === "function") {
        void finalInstance.executeHookPhase("beforeMount");
        fci._isMounted = true;
        void finalInstance.executeHookPhase("mounted");
      }
    }
  }

  // Hydrate the rendered VNode tree against existing DOM.
  try {
    hydrateDOM(
      rendered,
      domNode,
      createDOMNodeFn,
      renderComponentFn,
      updateDOMNodeFn,
    );
  } catch (e) {
    // A mismatch here (thrown by hydrateElementNode -- see its DiffingError) is caught by
    // the top-level hydrate()'s try/catch, which discards this subtree and does a full
    // client render in its place. That recovery calls renderComponent() again for
    // `finalInstance` and trusts ci._domNode as "the instance's existing DOM node" -- but
    // this function bound ci._domNode = domNode ABOVE, before hydrateDOM ever confirmed
    // domNode's tag actually matches what this component renders. Left in place, the
    // fallback's own update path (dom-updates.ts's updateElementNode, unlike
    // hydrateElementNode, does NOT check tagName) would silently patch the WRONG-tagged
    // node's text/props in place instead of the top-level catch's intended full
    // recreation -- e.g. hydrating a <button> component onto a stale server <span>
    // produces a surviving <span> carrying the button's content. Roll back the poisoned
    // binding so the fallback actually gets the clean slate its own code assumes.
    if (finalInstance) {
      const fci = asInternal(finalInstance);
      if (fci._domNode === domNode) fci._domNode = null;
      if (componentInstances.get(domNode) === finalInstance) {
        componentInstances.delete(domNode);
      }
    }
    throw e;
  }
}
