/*
 * Copyright (c) 2024 Themba Mzumara
 * This file is part of SwissJS Framework. All rights reserved.
 * Licensed under the MIT License. See LICENSE in the project root for license information.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-unused-vars */

import type { SwissComponent } from "../component/component.js";
import type {
  VNode,
  VElement,
  ComponentVNode,
  ComponentType,
} from "../vdom/vdom.js";
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

// Forward declarations for functions passed as parameters
type RenderComponentFn = (
  vnode: ComponentVNode,
  existingInstance?: SwissComponent,
) => VNode;
type UpdateDOMNodeFn = (dom: Node, vnode: VNode) => void;

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
        typeof vnode.type === "function" ? (vnode.type as any).name : "Unknown";
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

      if (
        typeof vnode === "object" &&
        vnode !== null &&
        (vnode as any).__componentInstance
      ) {
        const foundInstance = (vnode as any).__componentInstance;
        if (foundInstance && foundInstance.constructor === vnode.type) {
          existingInstance = foundInstance;
          logger.reconcile(`${foundInstance.constructor.name}: reusing instance (from __componentInstance)`);
        }
      }

      if (!existingInstance && (vnode as any).dom) {
        const domNode = (vnode as any).dom;
        if (domNode instanceof HTMLElement) {
          const foundInstance = componentInstances.get(domNode);
          if (foundInstance) {
            existingInstance = foundInstance;
            logger.reconcile(`${existingInstance.constructor.name}: reusing instance (from vnode.dom)`);
          }
        }
      }

      // CRITICAL FIX: If no instance found yet, try to find it by component type in the DOM
      // This handles the case where reconciliation failed but the component instance still exists
      // We search by matching component type, which is more reliable than position-based matching
      if (!existingInstance && isComponentVNode(vnode)) {
        const vnodeKey = (vnode as any).key;
        const componentName = (vnode.type as any).name || 'Unknown';
        logger.reconcile(`${componentName}: searching for existing instance`);
        
        // Try multiple search strategies (in priority order):
        // 1. Get current component instance (if available) - most specific context
        // 2. Find root App instance from containerToInstance map - app-level context
        // 3. Search from #app or #root container - container-level context
        // 4. Search from document.body (fallback for root-level components)
        
        let searchRoot: HTMLElement | null = null;
        let searchContext = 'unknown';
        
        const currentInstance = getCurrentComponentInstance();
        if (currentInstance && (currentInstance as any)._domNode) {
          const contextDom = (currentInstance as any)._domNode;
          if (contextDom instanceof HTMLElement) {
            searchRoot = contextDom;
            searchContext = currentInstance.constructor.name;
          }
        }
        
        // Priority 2: Find root App instance from containerToInstance map
        // This is critical for finding nested components like TelemetryProvider inside App
        if (!searchRoot && typeof document !== 'undefined') {
          // First, try to find the actual app container (#app, #root, etc.)
          const appContainer = document.getElementById('app') || 
                               document.getElementById('root') ||
                               document.querySelector('[id*="app"]') ||
                               document.querySelector('[id*="root"]');
          
          if (appContainer instanceof HTMLElement) {
            const rootInstance = containerToInstance.get(appContainer);
            if (rootInstance && (rootInstance as any)._domNode) {
              const rootDom = (rootInstance as any)._domNode;
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
          
          // Fallback: Search all containers in containerToInstance map
          if (!searchRoot) {
            const containers = document.querySelectorAll('[id]');
            for (const container of Array.from(containers)) {
              if (container instanceof HTMLElement) {
                const rootInstance = containerToInstance.get(container);
                if (rootInstance && (rootInstance as any)._domNode) {
                  const rootDom = (rootInstance as any)._domNode;
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
        
        // Final fallback: Search from document.body
        if (!searchRoot && typeof document !== 'undefined' && document.body) {
          searchRoot = document.body;
          searchContext = 'document.body';
        }
        
        if (searchRoot) {
          // Search the DOM tree for a component instance of the matching type
          let searchDepth = 0;
          const MAX_SEARCH_DEPTH = 20; // Increased depth for deeply nested components
          const searchForInstance = (
            element: HTMLElement,
            depth: number = 0,
          ): { instance: SwissComponent; dom: HTMLElement } | null => {
            if (depth > MAX_SEARCH_DEPTH) {
              logger.reconcile(`${componentName}: max search depth (${MAX_SEARCH_DEPTH}) reached`);
              return null;
            }
            searchDepth = depth + 1;
            // Check if this element has a component instance of the right type
            const instance = componentInstances.get(element);
            if (instance && instance.constructor === vnode.type) {
              // If both have keys, they must match
              const instanceKey = (instance as any).__vnodeKey;
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
            // Recursively search children
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
            if (typeof vnode === "object" && vnode !== null) {
              (vnode as any).dom = found.dom;
              (vnode as any).__componentInstance = found.instance;
              if (vnodeKey) {
                (found.instance as any).__vnodeKey = vnodeKey;
              }
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
        const isInitialized =
          (existingInstance as any)._initialized ||
          (existingInstance as any).__initialized;
        logger.reconcile(
          `${existingInstance.constructor.name}: reusing (${isInitialized ? "initialized" : "uninitialized"})`,
        );

        if (
          (existingInstance as any)._domNode &&
          (existingInstance as any)._domNode instanceof Node
        ) {
          const existingDom = (existingInstance as any)._domNode;
          logger.reconcile(`${existingInstance.constructor.name}: reusing existing DOM node`);
          if (typeof vnode === "object" && vnode !== null) {
            (vnode as any).__componentInstance = existingInstance;
            (vnode as { dom?: Node }).dom = existingDom;
          }
          const rendered = renderComponentFn(vnode, existingInstance);
          updateDOMNodeFn(existingDom, rendered);
          return existingDom;
        } else {
          logger.reconcile(`${existingInstance.constructor.name}: no DOM yet, creating DOM`);
          const rendered = renderComponentFn(vnode, existingInstance);
          const prevInstance = getCurrentComponentInstance();
          setCurrentComponentInstance(existingInstance);
          const dom = createDOMNode(
            rendered,
            renderComponentFn,
            updateDOMNodeFn,
          );
          setCurrentComponentInstance(prevInstance);
          if (typeof vnode === "object" && vnode !== null) {
            (vnode as { dom?: Node }).dom = dom;
          }
          (existingInstance as any)._domNode = dom;
          componentInstances.set(dom, existingInstance);
          if (typeof vnode === "object" && vnode !== null) {
            (vnode as any).__componentInstance = existingInstance;
          }
          if ((existingInstance as any)._vnode) {
            ((existingInstance as any)._vnode as any).dom = dom;
          }
          if (typeof (existingInstance as any).initialize === "function") {
            const isAlreadyInitialized =
              (existingInstance as any)._initialized ||
              (existingInstance as any).__initialized;
            if (!isAlreadyInitialized) {
              logger.lifecycle(`${existingInstance.constructor.name}: initialize (existing instance)`);
              (existingInstance as any).initialize();
              (existingInstance as any)._skipNextUpdate = true;
              if (typeof (existingInstance as any).executeHookPhase === "function") {
                logger.lifecycle(`${existingInstance.constructor.name}: mounted (existing instance)`);
                (existingInstance as any).executeHookPhase("mounted");
              }
            } else {
              logger.lifecycle(`${existingInstance.constructor.name}: already initialized, skipping`);
            }
          }
          return dom;
        }
      }

      const rendered = renderComponentFn(vnode, existingInstance);

      const Component = vnode.type;
      let instance: SwissComponent | undefined = undefined;
      if (isClassComponent(Component)) {
        instance =
          rendered && typeof rendered === "object" && rendered !== null
            ? (rendered as any).__componentInstance
            : undefined;
      }

      // So context works: children of this component's output must have this component as _parent.
      const prevInstance = getCurrentComponentInstance();
      if (instance) setCurrentComponentInstance(instance);
      const dom = createDOMNode(rendered, renderComponentFn, updateDOMNodeFn);
      setCurrentComponentInstance(prevInstance);

      if (instance) {
        (instance as any)._domNode = dom;
        // Store key for future matching
        const vnodeKey = (vnode as any).key;
        if (vnodeKey) {
          (instance as any).__vnodeKey = vnodeKey;
        }
        logger.lifecycle(`${instance.constructor.name}: created`);
      }

      if (typeof vnode === "object" && vnode !== null) {
        (vnode as { dom?: Node }).dom = dom;
      }

      if (instance) {
        // When rendered output is a child component, instance is the parent (from rendered.__componentInstance).
        // Store parent as "host" so root reconciliation can match; leave componentInstances as the child's root.
        const isRenderedComponent =
          rendered &&
          typeof rendered === "object" &&
          rendered !== null &&
          isComponentVNode(rendered);
        if (
          isRenderedComponent &&
          (rendered as any).__componentInstance === instance
        ) {
          domToHostComponent.set(dom, instance);
        } else {
          componentInstances.set(dom, instance);
        }
        if (typeof vnode === "object" && vnode !== null) {
          (vnode as any).__componentInstance = instance;
        }
        if ((instance as any)._vnode) {
          ((instance as any)._vnode as any).dom = dom;
        } else {
          logger.warn(`Component ${instance.constructor.name} has no _vnode to set dom on`);
        }
        if (!(instance as any).__componentVNode) {
          (instance as any).__componentVNode = vnode;
        }

        if (typeof (instance as any).initialize === "function") {
          const isAlreadyInitialized =
            (instance as any)._initialized || (instance as any).__initialized;
          if (!isAlreadyInitialized) {
            (instance as any).initialize();
            // Skip the first performUpdate() from the effect - DOM was just created and is correct
            (instance as any)._skipNextUpdate = true;
            if (typeof (instance as any).executeHookPhase === "function") {
              logger.lifecycle(`${instance.constructor.name}: mounted`);
              (instance as any).executeHookPhase("mounted");
            }
          } else {
            logger.lifecycle(`${instance.constructor.name}: already initialized`);
          }
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

  // Store DOM reference on VNode if it's an object
  if (typeof vnode === "object" && vnode !== null) {
    (vnode as any).dom = node;
  }

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
  // If we encounter a slot here, it's a bug - log and create placeholder
  if (vnode.type === "slot") {
    logger.error("Unexpected slot VNode in createElementNode - slots should be expanded earlier");
    return document.createComment(
      " unexpected-slot ",
    ) as unknown as HTMLElement;
  }

  const element = document.createElement(vnode.type);
  vnodeMetadata.set(element, vnode);

  // CRITICAL: Store DOM reference directly on VNode for reconciliation
  vnode.dom = element;

  reconcileProps(element, {}, vnode.props || {});

  // Use normalized children if available (from fragment normalization)
  let childrenToProcess: VNode[];
  if ((vnode as any).__normalizedChildren) {
    childrenToProcess = (vnode as any).__normalizedChildren;
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
    const childNode = createDOMNodeFn(
      child,
      renderComponentFn,
      updateDOMNodeFn,
    );
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
