/*
 * Copyright (c) 2024 Themba Mzumara
 * This file is part of SwissJS Framework. All rights reserved.
 * Licensed under the MIT License. See LICENSE in the project root for license information.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

import { renderToDOM, updateDOMNode } from "../renderer/renderer.js";
import { domToHostComponent, componentInstances } from "../renderer/storage.js";
import { reconcileProps } from "../renderer/props-updates.js";
import { clearRenderCache } from "../renderer/render-cache.js";
import { type VNode } from "../vdom/vdom.js";
import { untrack } from "../reactivity/effect.js";
import type { SwissComponent } from "./component.js";
import { logger } from "../utils/logger.js";

/**
 * Ensure _domNode points at this component's live root in the document.
 * Scans parent's direct children first, then entire app subtree.
 */
export function refreshChildDomNode(component: SwissComponent): void {
  const c = component as any;
  const current = c._domNode;
  let parent: HTMLElement | null =
    c._container ??
    current?.parentElement ??
    c._vnode?.dom?.parentElement ??
    null;

  const findIn = (root: HTMLElement): boolean => {
    for (let i = 0; i < root.children.length; i++) {
      const el = root.children[i];
      if (!(el instanceof HTMLElement)) continue;
      const instance = componentInstances.get(el) ?? domToHostComponent.get(el);
      if (instance === component) {
        if (el !== current) {
          c._domNode = el;
          c._container = root;
          if (c._vnode && typeof c._vnode === "object") (c._vnode as any).dom = el;
          logger.updates(`${component.constructor.name}: refreshed _domNode from live DOM`);
        }
        return true;
      }
      if (findIn(el)) return true;
    }
    return false;
  };

  if (parent && parent instanceof HTMLElement && findIn(parent)) return;

  const app = typeof document !== "undefined" ? document.querySelector("#app") : null;
  if (app && app instanceof HTMLElement && app.firstElementChild instanceof HTMLElement) {
    findIn(app.firstElementChild);
  }
}

export function updateWithDomNode(component: SwissComponent, newVNode: VNode): void {
  const c = component as any;
  const domNode = c._domNode;
  logger.updates(`${component.constructor.name}: update via _domNode`);

  if (typeof newVNode === "object" && newVNode !== null && "type" in newVNode && typeof newVNode.type === "function") {
    (newVNode as any).__componentInstance = component;
  }

  untrack(() => {
    updateDOMNode(domNode, newVNode);
    c._vnode = newVNode;
    (newVNode as any).dom = domNode;
    c._domNode = domNode;
  });
  logger.updates(`${component.constructor.name}: updated ( _domNode )`);
}

export function updateChildComponent(component: SwissComponent, newVNode: VNode, container: HTMLElement | null): void {
  const c = component as any;
  const domNode = (c._vnode as any).dom;

  if (typeof newVNode === "object" && newVNode !== null && "type" in newVNode && typeof newVNode.type === "function") {
    (newVNode as any).__componentInstance = component;
  }

  if (!container && domNode instanceof HTMLElement && domNode.parentElement) {
    const parent = domNode.parentElement;
    if (parent.children.length === 1 || parent.id === "app" || parent.classList.contains("app-root")) {
      container = parent;
      c._container = container;
      const oldVNode = c._vnode;
      untrack(() => {
        if (oldVNode && (oldVNode as any).dom) {
          logger.updates(`${component.constructor.name}: updateDOMNode (recovered root)`);
          updateDOMNode((oldVNode as any).dom, newVNode);
          (newVNode as any).dom = (oldVNode as any).dom;
        } else if (container != null && container instanceof HTMLElement) {
          renderToDOM(newVNode, container);
        } else {
          updateDOMNode(domNode, newVNode);
          (newVNode as any).dom = domNode;
        }
      });
      c._vnode = newVNode;
      if (oldVNode && (oldVNode as any).dom) (newVNode as any).dom = (oldVNode as any).dom;
      if (c._domNode !== domNode) c._domNode = domNode;
      return;
    }
  }

  logger.updates(`${component.constructor.name}: child update, updateDOMNode()`);
  untrack(() => {
    updateDOMNode(domNode, newVNode);
    c._vnode = newVNode;
    (newVNode as any).dom = domNode;
    if (c._domNode !== domNode) c._domNode = domNode;
  });
}

export function handleNoUpdatePath(component: SwissComponent, newVNode: VNode): void {
  const c = component as any;
  logger.updates(`${component.constructor.name}: no update path (no container/vnode/dom)`);

  let domNode: Node | null = c._domNode ?? (c._vnode && (c._vnode as any).dom) ?? null;

  if (domNode && domNode instanceof HTMLElement) {
    let container: HTMLElement | null = null;
    if (domNode.parentElement) {
      const parent = domNode.parentElement;
      if (parent.children.length === 1 || parent.id === "app" || parent.classList.contains("app-root")) {
        container = parent;
        c._container = container;
      }
    }

    if (typeof newVNode === "object" && newVNode !== null && "type" in newVNode && typeof newVNode.type === "function") {
      (newVNode as any).__componentInstance = component;
    }

    untrack(() => {
      if (container && container instanceof HTMLElement) {
        renderToDOM(newVNode, container);
      } else if (domNode) {
        updateDOMNode(domNode, newVNode);
        (newVNode as any).dom = domNode;
      }
    });

    c._vnode = newVNode;
    if (typeof newVNode === "object" && newVNode !== null) (newVNode as { dom?: Node }).dom = domNode;
    c._domNode = domNode;
    return;
  }

  if (c._vnode && (c._vnode as any).dom) {
    const vnodeDom = (c._vnode as any).dom;
    if (vnodeDom instanceof HTMLElement) {
      if (typeof newVNode === "object" && newVNode !== null && "type" in newVNode && typeof newVNode.type === "function") {
        (newVNode as any).__componentInstance = component;
      }
      untrack(() => {
        updateDOMNode(vnodeDom, newVNode);
        c._vnode = newVNode;
        (newVNode as any).dom = vnodeDom;
        c._domNode = vnodeDom;
      });
      return;
    }
  }

  if (typeof document !== "undefined") {
    const rootContainer = document.querySelector("#app") || document.querySelector("[data-app-root]");
    if (rootContainer && rootContainer instanceof HTMLElement && (rootContainer.id === "app" || rootContainer.hasAttribute("data-app-root"))) {
      c._container = rootContainer;
      if (typeof newVNode === "object" && newVNode !== null && "type" in newVNode && typeof newVNode.type === "function") {
        (newVNode as any).__componentInstance = component;
      }
      logger.updates(`${component.constructor.name}: recovered root container, initial render`);
      untrack(() => {
        if (rootContainer && rootContainer instanceof HTMLElement) renderToDOM(newVNode, rootContainer);
      });
      const firstChild = rootContainer.firstChild;
      if (firstChild && typeof newVNode === "object" && newVNode !== null) {
        (newVNode as { dom?: Node }).dom = firstChild;
        c._vnode = newVNode;
        c._domNode = firstChild;
      }
      return;
    }
  }

  logger.updates(`${component.constructor.name}: no update path, waiting for renderer`);
}

export function updateRootComponent(component: SwissComponent, container: HTMLElement, newVNode: VNode): void {
  const c = component as any;
  const oldVNode = c._vnode;
  logger.updates(`${component.constructor.name}: root update (container, oldVNode=${!!oldVNode})`);

  if (c._container !== container) c._container = container;

  if (typeof newVNode === "object" && newVNode !== null && "type" in newVNode && typeof newVNode.type === "function") {
    (newVNode as any).__componentInstance = component;
  }

  const oldDom = oldVNode && (oldVNode as any).dom;
  const isOldDomDirectChild = oldDom && oldDom.parentElement === container;

  const shouldReplaceContainer =
    (!oldDom && !container.firstChild) ||
    (oldDom && !isOldDomDirectChild && container.firstChild && container.firstChild !== oldDom);

  if (shouldReplaceContainer && oldVNode) {
    logger.updates(`${component.constructor.name}: root structure changed, replacing container`);
    untrack(() => {
      if (container && container instanceof HTMLElement) renderToDOM(newVNode, container);
      if (container && container.firstChild) {
        c._domNode = container.firstChild;
        (newVNode as any).dom = container.firstChild;
      }
    });
  } else if (oldVNode && (oldVNode as any).dom) {
    const rootDom = (oldVNode as any).dom as HTMLElement;
    let rootHasBoundChildren = false;

    if (rootDom?.childNodes && typeof newVNode === "object" && newVNode !== null && "type" in newVNode && typeof (newVNode as any).type === "string") {
      const raw = (newVNode as any).children;
      const newChildren: VNode[] = Array.isArray(raw) ? raw : raw != null && typeof raw !== "boolean" ? [raw] : [];
      const domChildren = Array.from(rootDom.childNodes);
      for (let i = 0; i < newChildren.length && i < domChildren.length; i++) {
        const nc = newChildren[i];
        const childDom = domChildren[i];
        if (nc && typeof nc === "object" && nc !== null && childDom && childDom instanceof HTMLElement) {
          const direct = componentInstances.get(childDom);
          const host = domToHostComponent.get(childDom);
          const type = (nc as any).type;
          const instance =
            (host && typeof type === "function" && host.constructor === type ? host : null) ||
            (direct && typeof type === "function" && direct.constructor === type ? direct : null);
          (nc as any).dom = childDom;
          if (instance) {
            (nc as any).__componentInstance = instance;
            rootHasBoundChildren = true;
            clearRenderCache(instance);
          }
        }
      }
    }

    const rootAlreadyHasContent = rootDom && rootDom.childNodes && rootDom.childNodes.length > 0;
    if (rootAlreadyHasContent && rootHasBoundChildren) {
      reconcileProps(rootDom, (oldVNode as any).props ?? {}, (newVNode as any).props ?? {});
    }

    untrack(() => {
      updateDOMNode((oldVNode as any).dom, newVNode);
      (newVNode as any).dom = (oldVNode as any).dom;
      c._domNode = (oldVNode as any).dom;
    });
    logger.updates(`${component.constructor.name}: updateDOMNode completed`);
  } else {
    if (!container || !(container instanceof HTMLElement)) {
      logger.warn(`Skipping renderToDOM for ${component.constructor.name}: container invalid`);
      c._vnode = newVNode;
      return;
    }
    logger.updates(`${component.constructor.name}: renderToDOM (initial)`);
    untrack(() => {
      renderToDOM(newVNode, container);
      if (container.firstChild && !c._domNode) c._domNode = container.firstChild;
    });
  }

  c._vnode = newVNode;
  if (oldVNode && (oldVNode as any).dom && !shouldReplaceContainer) {
    (newVNode as any).dom = (oldVNode as any).dom;
  } else if (c._domNode) {
    (newVNode as any).dom = c._domNode;
  }
}
