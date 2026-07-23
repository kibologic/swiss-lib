/*
 * Copyright (c) 2024 Themba Mzumara
 * This file is part of SwissJS Framework. All rights reserved.
 * Licensed under the MIT License. See LICENSE in the project root for license information.
 */

import type { SwissComponent } from "../component/component.js";
import type {
  VNode,
  VElement,
  ComponentVNode,
} from "../vdom/vdom.js";
import type { VNodeBase } from "../vdom/types/index.js";
import { asInternal } from "../component/internal.js";
import {
  vnodeMetadata,
  componentInstances,
  domToHostComponent,
  getCurrentComponentInstance,
  setCurrentComponentInstance,
  containerToInstance,
} from "./storage.js";
import {
  isSignal,
  isTextVNode,
  isFragmentVNode,
  isElementVNode,
  isComponentVNode,
  filterValidVNodes,
  isClassComponent,
} from "./types.js";
import { DiffingError } from "./errors.js";
import { reconcileProps } from "./props-updates.js";
import { logger } from "../utils/logger.js";

/**
 * Arm the one-tick post-initialize update skip on a freshly created child component.
 *
 * dom-creation sets `_skipNextUpdate` right after a child's `initialize()` so the single
 * redundant update that can immediately follow creation (the parent's synchronous
 * post-create re-render of the just-mounted child) is a no-op instead of a double commit.
 * That redundant update, when it happens, runs SYNCHRONOUSLY in this same tick — a child
 * component's `scheduleUpdate()` calls `performUpdate()` synchronously — so it is still
 * skipped.
 *
 * The bug this fixes: `_skipNextUpdate` is only ever consumed by the explicit
 * `performUpdate()` path; the signal-driven `commitVNode()` path never clears it. When the
 * redundant post-init update did not arrive (the common case), the flag lingered
 * indefinitely and silently swallowed the NEXT real update to that child — e.g. the
 * prop-driven re-render of an `AppStrip` icon after a navigation click — producing the
 * "click does nothing, the same click again works, a reload fixes it" symptom. Because it
 * lives here and in `update-manager`, not in `reconcileChildren`, it reproduced on every
 * core version regardless of the insertion-anchor reconciliation fixes.
 *
 * Scoping the flag to this tick via a microtask clear preserves the intended synchronous
 * skip while guaranteeing the flag cannot outlive the creation window to drop a later,
 * genuine update. A stray extra commit is a safe no-op under the hardened reconciler; a
 * dropped update is not.
 */
function armPostInitSkip(ci: ReturnType<typeof asInternal>): void {
  ci._skipNextUpdate = true;
  const clear = () => { ci._skipNextUpdate = false; };
  if (typeof queueMicrotask === "function") queueMicrotask(clear);
  else void Promise.resolve().then(clear);
}

// Forward declarations for functions passed as parameters
type RenderComponentFn = (
  vnode: ComponentVNode,
  existingInstance?: SwissComponent,
) => VNode;
type UpdateDOMNodeFn = (dom: Node, vnode: VNode) => void;

function vb(vnode: VNode | null | undefined): VNodeBase | null {
  if (vnode == null || typeof vnode !== "object") return null;
  return vnode as unknown as VNodeBase;
}

export function createDOMNode(
  vnode: VNode | null | undefined | boolean,
  renderComponentFn: RenderComponentFn,
  updateDOMNodeFn: UpdateDOMNodeFn,
): Node {
  try {
    if (vnode === null || vnode === undefined || typeof vnode === "boolean") {
      return document.createTextNode("");
    }

    if (isSignal(vnode)) {
      return createDOMNode(
        vnode.value as VNode,
        renderComponentFn,
        updateDOMNodeFn,
      );
    }

    // Reactive/getter functions from template compiler: call and use return value as child
    if (typeof vnode === "function") {
      try {
        const result = (vnode as () => unknown)();
        const resolved =
          result === null || result === undefined || typeof result === "boolean"
            ? ""
            : result;
        return createDOMNode(
          resolved as VNode,
          renderComponentFn,
          updateDOMNodeFn,
        );
      } catch (e) {
        logger.error("Error calling function child:", e);
        return document.createTextNode("");
      }
    }

    if (isComponentVNode(vnode)) {
      const componentName =
        typeof vnode.type === "function"
          ? (vnode.type as { name?: string }).name ?? "Unknown"
          : "Unknown";
      logger.dom(`Processing ComponentVNode: ${componentName}`);
    }

    if (isTextVNode(vnode)) {
      return createTextNode(vnode);
    } else if (isFragmentVNode(vnode)) {
      const fragment = document.createDocumentFragment();
      const children = Array.isArray(vnode) ? vnode : vnode.children || [];
      filterValidVNodes(children).forEach((child: VNode) =>
        fragment.appendChild(
          createDOMNode(child, renderComponentFn, updateDOMNodeFn),
        ),
      );
      return fragment;
    } else if (isElementVNode(vnode)) {
      const instance = getCurrentComponentInstance();
      const element = createElementNode(
        vnode,
        instance,
        createDOMNode,
        renderComponentFn,
        updateDOMNodeFn,
      );
      return element;
    } else if (isComponentVNode(vnode)) {
      if (vnode == null) {
        logger.error("createDOMNode: Component VNode is null");
        return document.createTextNode("");
      }

      let existingInstance: SwissComponent | undefined = undefined;

      if (vnode.__componentInstance) {
        const foundInstance = vnode.__componentInstance;
        if (foundInstance && foundInstance.constructor === vnode.type) {
          existingInstance = foundInstance;
          logger.reconcile(`${foundInstance.constructor.name}: reusing instance (from __componentInstance)`);
        }
      }

      if (!existingInstance && vnode.dom) {
        const domNode = vnode.dom;
        if (domNode instanceof HTMLElement) {
          const foundInstance = componentInstances.get(domNode);
          if (foundInstance) {
            existingInstance = foundInstance;
            logger.reconcile(`${existingInstance.constructor.name}: reusing instance (from vnode.dom)`);
          }
        }
      }

      // CRITICAL FIX: If no instance found yet, try to find it by component type in the DOM
      if (!existingInstance && isComponentVNode(vnode)) {
        const vnodeKey = vnode.key;
        const componentName = (vnode.type as { name?: string }).name ?? "Unknown";
        logger.reconcile(`${componentName}: searching for existing instance`);

        let searchRoot: HTMLElement | null = null;
        let searchContext = "unknown";

        const currentInstance = getCurrentComponentInstance();
        if (currentInstance) {
          const contextDom = asInternal(currentInstance)._domNode;
          if (contextDom instanceof HTMLElement) {
            searchRoot = contextDom;
            searchContext = currentInstance.constructor.name;
          }
        }

        if (!searchRoot && typeof document !== "undefined") {
          const appContainer =
            document.getElementById("app") ||
            document.getElementById("root") ||
            document.querySelector("[id*='app']") ||
            document.querySelector("[id*='root']");

          if (appContainer instanceof HTMLElement) {
            const rootInstance = containerToInstance.get(appContainer);
            if (rootInstance) {
              const rootDom = asInternal(rootInstance)._domNode;
              if (rootDom instanceof HTMLElement) {
                searchRoot = rootDom;
                searchContext = `${rootInstance.constructor.name} (from container #${appContainer.id})`;
                logger.reconcile(`Using root ${rootInstance.constructor.name} from #${appContainer.id} for search`);
              }
            }
            if (!searchRoot) {
              searchRoot = appContainer;
              searchContext = `container #${appContainer.id}`;
              logger.reconcile(`Using app container #${appContainer.id} as search root`);
            }
          }

          if (!searchRoot) {
            const containers = document.querySelectorAll("[id]");
            for (const container of Array.from(containers)) {
              if (container instanceof HTMLElement) {
                const rootInstance = containerToInstance.get(container);
                if (rootInstance) {
                  const rootDom = asInternal(rootInstance)._domNode;
                  if (rootDom instanceof HTMLElement) {
                    searchRoot = rootDom;
                    searchContext = `${rootInstance.constructor.name} (from container #${container.id})`;
                    logger.reconcile(`Found root ${rootInstance.constructor.name} from #${container.id}`);
                    break;
                  }
                }
              }
            }
          }
        }

        if (!searchRoot && typeof document !== "undefined" && document.body) {
          searchRoot = document.body;
          searchContext = "document.body";
        }

        if (searchRoot) {
          const MAX_SEARCH_DEPTH = 20;
          const searchForInstance = (
            element: HTMLElement,
            depth: number = 0,
          ): { instance: SwissComponent; dom: HTMLElement } | null => {
            if (depth > MAX_SEARCH_DEPTH) {
              logger.reconcile(`${componentName}: max search depth (${MAX_SEARCH_DEPTH}) reached`);
              return null;
            }
            const instance = componentInstances.get(element);
            if (instance && instance.constructor === vnode.type) {
              const instanceKey = asInternal(instance).__vnodeKey;
              if (vnodeKey && instanceKey) {
                if (vnodeKey === instanceKey) {
                  logger.reconcile(`${instance.constructor.name}: reusing instance (key match)`);
                  return { instance, dom: element };
                } else {
                  logger.reconcile(`${instance.constructor.name}: key mismatch, skipping`);
                }
              } else if (!vnodeKey && !instanceKey) {
                logger.reconcile(`${instance.constructor.name}: reusing instance (type match)`);
                return { instance, dom: element };
              }
            }
            for (const child of Array.from(element.children)) {
              if (child instanceof HTMLElement) {
                const found = searchForInstance(child, depth + 1);
                if (found) return found;
              }
            }
            return null;
          };

          logger.reconcile(`${componentName}: searching from ${searchContext}`);
          const found = searchForInstance(searchRoot, 0);
          if (found) {
            existingInstance = found.instance;
            vnode.dom = found.dom;
            vnode.__componentInstance = found.instance;
            if (vnodeKey) {
              asInternal(found.instance).__vnodeKey = vnodeKey;
            }
            logger.reconcile(`${found.instance.constructor.name}: reusing existing instance`);
          } else {
            logger.reconcile(`${componentName}: no existing instance, creating new`);
          }
        } else {
          logger.reconcile(`${componentName}: no search root available`);
        }
      }

      if (existingInstance) {
        const ci = asInternal(existingInstance);
        const isInitialized = ci._initialized || ci.__initialized;
        logger.reconcile(
          `${existingInstance.constructor.name}: reusing (${isInitialized ? "initialized" : "uninitialized"})`,
        );

        if (ci._domNode && ci._domNode instanceof Node) {
          const existingDom = ci._domNode;
          logger.reconcile(`${existingInstance.constructor.name}: reusing existing DOM node`);
          vnode.__componentInstance = existingInstance;
          (vnode as VNodeBase).dom = existingDom;
          const rendered = renderComponentFn(vnode, existingInstance);
          updateDOMNodeFn(existingDom, rendered);
          return existingDom;
        } else {
          logger.reconcile(`${existingInstance.constructor.name}: no DOM yet, creating DOM`);
          const rendered = renderComponentFn(vnode, existingInstance);
          const prevInstance = getCurrentComponentInstance();
          setCurrentComponentInstance(existingInstance);
          const dom = createDOMNode(rendered, renderComponentFn, updateDOMNodeFn);
          setCurrentComponentInstance(prevInstance);
          (vnode as VNodeBase).dom = dom;
          ci._domNode = dom;
          componentInstances.set(dom, existingInstance);
          vnode.__componentInstance = existingInstance;
          const oldVnodeBase = vb(ci._vnode);
          if (oldVnodeBase) oldVnodeBase.dom = dom;
          if (!ci._initialized && !ci.__initialized) {
            if (typeof ci.initialize === "function") {
              logger.lifecycle(`${existingInstance.constructor.name}: initialize (existing instance)`);
              ci.initialize();
              armPostInitSkip(ci);
              if (typeof ci.executeHookPhase === "function") {
                logger.lifecycle(`${existingInstance.constructor.name}: mounted (existing instance)`);
                // DISC-2026-07-21-001: mark the child mounted BEFORE firing its mounted hook,
                // mirroring mountComponent()'s ordering. Only the top-level mount path set
                // _isMounted; child components created during a parent's render fired mounted()
                // but never flipped this flag, so unmountComponent()'s `if (!_isMounted) return`
                // guard silently swallowed their unmounted() forever -- every child leaked its
                // listeners/timers/subscriptions. Symmetry fix, not a new heuristic.
                ci._isMounted = true;
                void ci.executeHookPhase("mounted");
              }
            }
          } else {
            logger.lifecycle(`${existingInstance.constructor.name}: already initialized, skipping`);
          }
          return dom;
        }
      }

      const rendered = renderComponentFn(vnode, existingInstance);

      const Component = vnode.type;
      let instance: SwissComponent | undefined = undefined;
      if (isClassComponent(Component)) {
        instance = vb(rendered)?.__componentInstance;
      }

      const prevInstance = getCurrentComponentInstance();
      if (instance) setCurrentComponentInstance(instance);
      const dom = createDOMNode(rendered, renderComponentFn, updateDOMNodeFn);
      setCurrentComponentInstance(prevInstance);

      if (instance) {
        const ci = asInternal(instance);
        ci._domNode = dom;
        const vnodeKey = vnode.key;
        if (vnodeKey) {
          ci.__vnodeKey = vnodeKey;
        }
        logger.lifecycle(`${instance.constructor.name}: created`);
      }

      (vnode as VNodeBase).dom = dom;

      if (instance) {
        const ci = asInternal(instance);
        const isRenderedComponent =
          rendered != null &&
          typeof rendered === "object" &&
          isComponentVNode(rendered);
        if (isRenderedComponent && vb(rendered)?.__componentInstance === instance) {
          domToHostComponent.set(dom, instance);
        } else {
          componentInstances.set(dom, instance);
        }
        vnode.__componentInstance = instance;
        const oldVnodeBase = vb(ci._vnode);
        if (oldVnodeBase) {
          oldVnodeBase.dom = dom;
        } else {
          logger.warn(`Component ${instance.constructor.name} has no _vnode to set dom on`);
        }
        if (!ci.__componentVNode) {
          ci.__componentVNode = vnode;
        }

        if (!ci._initialized && !ci.__initialized) {
          if (typeof ci.initialize === "function") {
            ci.initialize();
            armPostInitSkip(ci);
            if (typeof ci.executeHookPhase === "function") {
              void ci.executeHookPhase("beforeMount");
              logger.lifecycle(`${instance.constructor.name}: mounted`);
              // DISC-2026-07-21-001: see the sibling site above. Flip _isMounted for child
              // components so unmountComponent()'s guard lets their unmounted() run. Without
              // this, no child component ever unmounts -- a platform-wide lifecycle leak.
              ci._isMounted = true;
              void ci.executeHookPhase("mounted");
            }
          }
        } else {
          logger.lifecycle(`${instance.constructor.name}: already initialized`);
        }
      }
      return dom;
    }

    const vnodeType = typeof vnode;
    const vnodeObj = vnode as unknown;
    const vnodeStr =
      vnodeType === "object" && vnodeObj !== null
        ? JSON.stringify(
            vnodeObj,
            Object.getOwnPropertyNames(vnodeObj).slice(0, 5),
          )
        : String(vnodeObj);
    logger.error(`Unsupported VNode type: ${vnodeType}`, {
      vnode: vnodeStr,
      constructor:
        vnodeObj !== null && typeof vnodeObj === "object"
          ? (vnodeObj as { constructor?: { name?: string } }).constructor?.name
          : undefined,
      keys:
        vnodeObj !== null && typeof vnodeObj === "object"
          ? Object.keys(vnodeObj)
          : undefined,
    });
    throw new DiffingError(`Unsupported VNode type: ${vnodeType}`);
  } catch (error) {
    logger.error("DOM creation error:", error);
    const createErrorMessage =
      error instanceof Error ? error.message : "Unknown error";
    throw new DiffingError(
      `DOM creation failed: ${createErrorMessage}`,
      vnode as VNode,
    );
  }
}

export function createTextNode(vnode: string | number): Text {
  const node = document.createTextNode(String(vnode));
  vnodeMetadata.set(node, vnode as unknown as VNode);
  return node;
}

export function createElementNode(
  vnode: VElement,
  componentInstance: SwissComponent | undefined,
  createDOMNodeFn: (
    vnode: VNode | null | undefined | boolean,
    renderComponentFn: RenderComponentFn,
    updateDOMNodeFn: UpdateDOMNodeFn,
  ) => Node,
  renderComponentFn: RenderComponentFn,
  updateDOMNodeFn: UpdateDOMNodeFn,
): HTMLElement {
  // CRITICAL: Slots should be expanded before reaching this point via expandSlots()
  if (vnode.type === "slot") {
    logger.error("Unexpected slot VNode in createElementNode - slots should be expanded earlier");
    return document.createComment(" unexpected-slot ") as unknown as HTMLElement;
  }

  const element = document.createElement(vnode.type);
  vnodeMetadata.set(element, vnode);

  vnode.dom = element;

  const refProp = vnode.props?.ref;
  if (refProp !== null && typeof refProp === "object" && "current" in refProp) {
    (refProp as { current: unknown }).current = element;
  }

  reconcileProps(element, {}, vnode.props || {});

  let childrenToProcess: VNode[];
  if (vnode.__normalizedChildren) {
    childrenToProcess = vnode.__normalizedChildren;
  } else {
    const validChildren = filterValidVNodes(vnode.children || []);
    const expandedChildren: VNode[] = [];
    validChildren.forEach((child) => {
      if (Array.isArray(child)) {
        expandedChildren.push(...filterValidVNodes(child));
      } else {
        expandedChildren.push(child);
      }
    });
    childrenToProcess = expandedChildren;
  }

  childrenToProcess.forEach((child: VNode) => {
    const childNode = createDOMNodeFn(child, renderComponentFn, updateDOMNodeFn);
    if (childNode instanceof DocumentFragment) {
      Array.from(childNode.childNodes).forEach((node) => {
        element.appendChild(node);
      });
    } else {
      element.appendChild(childNode);
    }
  });

  logger.dom(`<${vnode.type}>: ${element.childNodes.length} children`);

  return element;
}
