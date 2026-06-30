/*
 * Copyright (c) 2024 Themba Mzumara
 * This file is part of SwissJS Framework. All rights reserved.
 * Licensed under the MIT License. See LICENSE in the project root for license information.
 */

import { renderToDOM, updateDOMNode } from "../renderer/renderer.js";
import { domToHostComponent, componentInstances } from "../renderer/storage.js";
import { reconcileProps } from "../renderer/props-updates.js";
import { clearRenderCache } from "../renderer/render-cache.js";
import { type VNode } from "../vdom/vdom.js";
import type { VNodeBase } from "../vdom/types/index.js";
import { untrack } from "../reactivity/effect.js";
import type { SwissComponent } from "./component.js";
import { asInternal } from "./internal.js";
import { logger } from "../utils/logger.js";

function vb(vnode: VNode | null | undefined): VNodeBase | null {
  return typeof vnode === "object" && vnode !== null ? vnode as VNodeBase : null;
}

function markInstance(vnode: VNode, component: SwissComponent): void {
  const base = vb(vnode);
  if (base && typeof base.type === "function") {
    base.__componentInstance = component;
  }
}

export function refreshChildDomNode(component: SwissComponent): void {
  const c = asInternal(component);
  const current = c._domNode;
  const vnodeBase = vb(c._vnode);
  let parent: HTMLElement | null =
    c._container ??
    (current instanceof HTMLElement ? current.parentElement : null) ??
    (vnodeBase?.dom instanceof HTMLElement ? vnodeBase.dom.parentElement : null) ??
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
          if (vnodeBase) vnodeBase.dom = el;
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
  const c = asInternal(component);
  const domNode = c._domNode;
  logger.updates(`${component.constructor.name}: update via _domNode`);

  markInstance(newVNode, component);
  const newBase = vb(newVNode);

  untrack(() => {
    updateDOMNode(domNode, newVNode);
    c._vnode = newVNode;
    if (newBase && domNode) newBase.dom = domNode as HTMLElement | Text;
    c._domNode = domNode;
  });
  logger.updates(`${component.constructor.name}: updated ( _domNode )`);
}

export function updateChildComponent(component: SwissComponent, newVNode: VNode, container: HTMLElement | null): void {
  const c = asInternal(component);
  const oldBase = vb(c._vnode);
  const domNode = oldBase?.dom;

  markInstance(newVNode, component);
  const newBase = vb(newVNode);

  if (!container && domNode instanceof HTMLElement && domNode.parentElement) {
    const parent = domNode.parentElement;
    if (parent.children.length === 1 || parent.id === "app" || parent.classList.contains("app-root")) {
      container = parent;
      c._container = container;
      untrack(() => {
        if (oldBase?.dom) {
          logger.updates(`${component.constructor.name}: updateDOMNode (recovered root)`);
          updateDOMNode(oldBase.dom!, newVNode);
          if (newBase) newBase.dom = oldBase.dom;
        } else if (container != null && container instanceof HTMLElement) {
          renderToDOM(newVNode, container);
        } else {
          updateDOMNode(domNode, newVNode);
          if (newBase) newBase.dom = domNode;
        }
      });
      c._vnode = newVNode;
      if (oldBase?.dom && newBase) newBase.dom = oldBase.dom;
      if (c._domNode !== domNode) c._domNode = domNode ?? null;
      return;
    }
  }

  logger.updates(`${component.constructor.name}: child update, updateDOMNode()`);
  untrack(() => {
    updateDOMNode(domNode, newVNode);
    c._vnode = newVNode;
    if (newBase && domNode) newBase.dom = domNode;
    if (c._domNode !== domNode) c._domNode = domNode ?? null;
  });
}

export function handleNoUpdatePath(component: SwissComponent, newVNode: VNode): void {
  const c = asInternal(component);
  logger.updates(`${component.constructor.name}: no update path (no container/vnode/dom)`);

  const newBase = vb(newVNode);
  const oldBase = vb(c._vnode);
  let domNode: Node | null = c._domNode ?? oldBase?.dom ?? null;

  if (domNode && domNode instanceof HTMLElement) {
    let container: HTMLElement | null = null;
    if (domNode.parentElement) {
      const parent = domNode.parentElement;
      if (parent.children.length === 1 || parent.id === "app" || parent.classList.contains("app-root")) {
        container = parent;
        c._container = container;
      }
    }

    markInstance(newVNode, component);

    untrack(() => {
      if (container && container instanceof HTMLElement) {
        renderToDOM(newVNode, container);
      } else if (domNode) {
        updateDOMNode(domNode, newVNode);
        if (newBase) newBase.dom = domNode as HTMLElement | Text;
      }
    });

    c._vnode = newVNode;
    if (newBase && domNode) newBase.dom = domNode as HTMLElement | Text;
    c._domNode = domNode;
    return;
  }

  if (oldBase?.dom instanceof HTMLElement) {
    const vnodeDom = oldBase.dom;
    markInstance(newVNode, component);
    untrack(() => {
      updateDOMNode(vnodeDom, newVNode);
      c._vnode = newVNode;
      if (newBase) newBase.dom = vnodeDom;
      c._domNode = vnodeDom;
    });
    return;
  }

  if (typeof document !== "undefined") {
    const rootContainer = document.querySelector("#app") || document.querySelector("[data-app-root]");
    if (rootContainer && rootContainer instanceof HTMLElement && (rootContainer.id === "app" || rootContainer.hasAttribute("data-app-root"))) {
      c._container = rootContainer;
      markInstance(newVNode, component);
      logger.updates(`${component.constructor.name}: recovered root container, initial render`);
      untrack(() => {
        if (rootContainer && rootContainer instanceof HTMLElement) renderToDOM(newVNode, rootContainer);
      });
      const firstChild = rootContainer.firstChild;
      if (firstChild && newBase) {
        newBase.dom = firstChild as HTMLElement | Text;
        c._vnode = newVNode;
        c._domNode = firstChild;
      }
      return;
    }
  }

  logger.updates(`${component.constructor.name}: no update path, waiting for renderer`);
}

export function updateRootComponent(component: SwissComponent, container: HTMLElement, newVNode: VNode): void {
  const c = asInternal(component);
  const oldVNode = c._vnode;
  const oldBase = vb(oldVNode);
  logger.updates(`${component.constructor.name}: root update (container, oldVNode=${!!oldVNode})`);

  if (c._container !== container) c._container = container;

  markInstance(newVNode, component);
  const newBase = vb(newVNode);

  const oldDom = oldBase?.dom;
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
        if (newBase) newBase.dom = container.firstChild as HTMLElement | Text;
      }
    });
  } else if (oldBase?.dom) {
    const rootDom = oldBase.dom as HTMLElement;
    let rootHasBoundChildren = false;

    if (rootDom.childNodes && newBase && typeof newBase.type === "string") {
      const newChildren: VNode[] = Array.isArray(newBase.children) ? newBase.children : newBase.children != null ? [newBase.children as VNode] : [];
      const domChildren = Array.from(rootDom.childNodes);
      for (let i = 0; i < newChildren.length && i < domChildren.length; i++) {
        const nc = newChildren[i];
        const childDom = domChildren[i];
        const ncBase = vb(nc);
        if (ncBase && childDom && childDom instanceof HTMLElement) {
          const direct = componentInstances.get(childDom);
          const host = domToHostComponent.get(childDom);
          const type = ncBase.type;
          const instance =
            (host && typeof type === "function" && host.constructor === type ? host : null) ||
            (direct && typeof type === "function" && direct.constructor === type ? direct : null);
          ncBase.dom = childDom;
          if (instance) {
            ncBase.__componentInstance = instance;
            rootHasBoundChildren = true;
            clearRenderCache(instance);
          }
        }
      }
    }

    const rootAlreadyHasContent = rootDom?.childNodes && rootDom.childNodes.length > 0;
    if (rootAlreadyHasContent && rootHasBoundChildren && newBase && oldBase) {
      reconcileProps(rootDom, (oldBase.props ?? {}) as Record<string, unknown>, (newBase.props ?? {}) as Record<string, unknown>);
    }

    untrack(() => {
      updateDOMNode(oldBase.dom!, newVNode);
      if (newBase) newBase.dom = oldBase.dom;
      c._domNode = oldBase.dom ?? null;
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
  if (oldBase?.dom && !shouldReplaceContainer) {
    if (newBase) newBase.dom = oldBase.dom;
  } else if (c._domNode && newBase) {
    newBase.dom = c._domNode as HTMLElement | Text;
  }
}
