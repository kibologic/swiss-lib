/*
 * Copyright (c) 2024 Themba Mzumara
 * This file is part of SwissJS Framework. All rights reserved.
 * Licensed under the MIT License. See LICENSE in the project root for license information.
 */

import type { VNode, VElement, ComponentVNode } from "../vdom/vdom.js";
import { vnodeMetadata } from "./storage.js";
import { isTextVNode, isElementVNode, isComponentVNode } from "./types.js";
import { DiffingError } from "./errors.js";
import { reconcileProps } from "./props-updates.js";

// Forward declarations for functions passed as parameters
type RenderToDOMFn = (vnode: VNode, container: HTMLElement) => void;
type RenderComponentFn = (vnode: ComponentVNode, existingInstance?: any) => VNode;
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
            hydrateIsland(component, island.parentElement as HTMLElement, renderToDOMFn, createDOMNodeFn, renderComponentFn, updateDOMNodeFn);
          }
        }
      });
    } else {
      hydrateDOM(root, container.firstChild as Node, createDOMNodeFn, renderComponentFn, updateDOMNodeFn);
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
    hydrateElementNode(vnode, domNode as HTMLElement, createDOMNodeFn, renderComponentFn, updateDOMNodeFn);
  } else if (isComponentVNode(vnode)) {
    hydrateComponentNode(vnode, domNode as HTMLElement, renderComponentFn, createDOMNodeFn, updateDOMNodeFn);
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
        hydrateDOM(component, islandContent, createDOMNodeFn, renderComponentFn, updateDOMNodeFn);
      }
    } else {
      if (container.firstChild) {
        hydrateDOM(component, container.firstChild, createDOMNodeFn, renderComponentFn, updateDOMNodeFn);
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

function hydrateElementNode(vnode: VElement, domNode: HTMLElement, createDOMNodeFn: CreateDOMNodeFn, renderComponentFn: RenderComponentFn, updateDOMNodeFn: UpdateDOMNodeFn) {
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
      hydrateDOM(child, domChild, createDOMNodeFn, renderComponentFn, updateDOMNodeFn);
    } else {
      const newDom = createDOMNodeFn(child);
      domNode.appendChild(newDom);
    }
  });

  for (let i = newVChildren.length; i < domChildren.length; i++) {
    domNode.removeChild(domChildren[i]);
  }
}

function hydrateComponentNode(vnode: ComponentVNode, domNode: HTMLElement, renderComponentFn: RenderComponentFn, createDOMNodeFn: CreateDOMNodeFn, updateDOMNodeFn: UpdateDOMNodeFn) {
  const rendered = renderComponentFn(vnode);
  hydrateDOM(rendered, domNode, createDOMNodeFn, renderComponentFn, updateDOMNodeFn);
}

