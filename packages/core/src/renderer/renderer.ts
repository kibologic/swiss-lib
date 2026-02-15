/*
 * Copyright (c) 2024 Themba Mzumara
 * This file is part of SwissJS Framework. All rights reserved.
 * Licensed under the MIT License. See LICENSE in the project root for license information.
 */

import type { SwissComponent } from "../component/component.js";
import type { VNode, ComponentVNode } from "../vdom/vdom.js";
import { SWISS_VERSION } from "../framework/version.js";

// Import all modules
import { vnodeMetadata, componentInstances, containerToInstance } from "./storage.js";
import { isComponentVNode, isElementVNode, cleanupNode, canUpdateInPlace } from "./types.js";
import { DiffingError } from "./errors.js";
import { devTools, performanceMonitor } from "./dev-tools.js";
import { reconcileProps } from "./props-updates.js";
import { reconcileChildren } from "./reconciliation.js";
import { hydrate as hydrateImpl, hydrateDOM as hydrateDOMImpl } from "./hydration.js";
import { renderComponent as renderComponentImpl } from "./component-rendering.js";
import { createDOMNode as createDOMNodeImpl, createTextNode, createElementNode } from "./dom-creation.js";
import { updateDOMNode as updateDOMNodeImpl, updateTextNode, updateElementNode, updateComponentNode } from "./dom-updates.js";

// Wire functions together to resolve circular dependencies
// Create bound versions that pass the necessary functions

// Forward declarations for circular dependencies
let renderComponentBound: (vnode: ComponentVNode, existingInstance?: SwissComponent) => VNode;
let updateDOMNodeBound: (dom: Node, vnode: VNode) => void;
let createDOMNodeBound: (vnode: VNode | null | undefined | boolean) => Node;
let updateElementNodeBound: (dom: HTMLElement, vnode: any, oldVNode?: VNode) => void;
let updateComponentNodeBound: (dom: HTMLElement, vnode: ComponentVNode, oldVNode?: VNode) => void;
let reconcileChildrenBound: (parent: HTMLElement, oldChildren: VNode[], newChildren: VNode[]) => void;

// Create bound renderComponent
renderComponentBound = (vnode: ComponentVNode, existingInstance?: SwissComponent): VNode => {
  return renderComponentImpl(vnode, existingInstance);
};

// Create bound reconcileChildren that includes updateDOMNode and createDOMNode
reconcileChildrenBound = (parent: HTMLElement, oldChildren: VNode[], newChildren: VNode[]): void => {
  return reconcileChildren(parent, oldChildren, newChildren, updateDOMNodeBound, createDOMNodeBound);
};

// Create bound updateElementNode that includes reconcileProps and reconcileChildren
updateElementNodeBound = (dom: HTMLElement, vnode: any, oldVNode?: VNode): void => {
  return updateElementNode(dom, vnode, oldVNode, reconcileProps, reconcileChildrenBound);
};

// Create bound updateComponentNode that includes renderComponent, createDOMNode, cleanupNode, canUpdateInPlace
updateComponentNodeBound = (dom: HTMLElement, vnode: ComponentVNode, oldVNode?: VNode): void => {
  return updateComponentNode(dom, vnode, oldVNode, renderComponentBound, createDOMNodeBound, cleanupNode, canUpdateInPlace, updateDOMNodeBound);
};

// Create bound updateDOMNode that includes all update functions
updateDOMNodeBound = (dom: Node, vnode: VNode): void => {
  return updateDOMNodeImpl(dom, vnode, updateTextNode, updateElementNodeBound, updateComponentNodeBound);
};

// Create bound createDOMNode that includes renderComponent and updateDOMNode
createDOMNodeBound = (vnode: VNode | null | undefined | boolean): Node => {
  return createDOMNodeImpl(vnode, renderComponentBound, updateDOMNodeBound);
};

// Create bound hydrate that includes renderToDOM
export const hydrate = (root: VNode, container: HTMLElement): void => {
  return hydrateImpl(root, container, renderToDOM, createDOMNodeBound, renderComponentBound, updateDOMNodeBound);
};

// Create bound hydrateDOM that includes createDOMNode
export const hydrateDOM = (vnode: VNode, domNode: Node): void => {
  return hydrateDOMImpl(vnode, domNode, createDOMNodeBound, renderComponentBound, updateDOMNodeBound);
};

// Primary render function
// Wrapped in global error boundary for production safety
export function renderToDOM(vnode: VNode, container: HTMLElement) {
  if (container == null || typeof container !== "object") {
    devTools.error("[Renderer] renderToDOM: container is null/undefined", { vnodeType: typeof vnode === "object" && vnode !== null && "type" in vnode ? (vnode.type as any)?.name : "unknown" });
    return;
  }
  if (!(container instanceof HTMLElement) || typeof container.innerHTML === "undefined") {
    devTools.error("[Renderer] renderToDOM: container is not an HTMLElement", { container, vnodeType: typeof vnode === "object" && vnode !== null && "type" in vnode ? (vnode.type as any)?.name : "unknown" });
    return;
  }
  try {
    performanceMonitor.onRenderStart();

    // Check if vnode has a dom property and it's in the container
    if (
      typeof vnode === "object" &&
      vnode !== null &&
      "dom" in vnode &&
      vnode.dom &&
      container.contains(vnode.dom)
    ) {
      // Update existing DOM node
      devTools.log(`[Renderer] renderToDOM: Updating existing DOM node (vnode.dom found)`);
      updateDOMNodeBound(vnode.dom, vnode);
      return;
    }

    // If container has a child, try to update it instead of clearing
    // This happens during reactive updates when render() creates a new VNode
    // but the DOM node already exists
    // CRITICAL: If container has static content (like "Loading...") and we're rendering a component,
    // we should replace the container content instead of trying to update the static div
    if (container.firstChild) {
      const existingDom = container.firstChild;
      const oldVNode = vnodeMetadata.get(existingDom);
      
      // Check if existing DOM is static content (not a component) and new VNode is a component
      // In this case, we should replace the container content
      const isStaticContent = !oldVNode && 
                               existingDom instanceof HTMLElement && 
                               !componentInstances.has(existingDom);
      const isNewComponent = isComponentVNode(vnode);
      
      if (isStaticContent && isNewComponent) {
        devTools.log(`[Renderer] renderToDOM: Container has static content but new VNode is component ${(vnode.type as any).name}, replacing container content`);
        if (container != null && typeof container.innerHTML !== "undefined") container.innerHTML = "";
        const domNode = createDOMNodeBound(vnode);
        container.appendChild(domNode);
        if (typeof vnode === "object" && vnode !== null && "dom" in vnode) {
          (vnode as { dom: Node }).dom = domNode;
        }
        
        // Store instance in containerToInstance map
        if (isComponentVNode(vnode)) {
          const instance = componentInstances.get(domNode as HTMLElement);
          if (instance) {
            if (!(instance as any)._container) {
              (instance as any)._container = container;
              devTools.log(`[Renderer] renderToDOM: Set container on root component instance ${instance.constructor.name} after replacing static content`);
            }
            if (container instanceof HTMLElement) {
              containerToInstance.set(container, instance);
              devTools.log(`[Renderer] renderToDOM: Stored instance in containerToInstance map after replacing static content for ${instance.constructor.name}`);
            }
          }
        }
        return;
      }

      devTools.log(`[Renderer] renderToDOM: Container has child, checking for existing instance. vnode type: ${isComponentVNode(vnode) ? (vnode.type as any).name : 'element'}, oldVNode type: ${oldVNode ? (isComponentVNode(oldVNode) ? (oldVNode.type as any).name : 'element') : 'none'}`);

      // For component VNodes, try to find and preserve the existing instance
      if (isComponentVNode(vnode)) {
        // PRIORITY 0: Check if the new VNode already has the instance stored (from performUpdate)
        // This is the most reliable source since performUpdate() sets it explicitly
        let existingInstance = (vnode as any).__componentInstance;
        if (existingInstance && existingInstance.constructor === vnode.type) {
          devTools.log(`[Renderer] renderToDOM: Found instance from vnode.__componentInstance: ${existingInstance.constructor.name}`);
        } else {
          existingInstance = undefined;
        }

        // PRIORITY 0.5: Check containerToInstance map (for root components)
        // This is the most reliable way to find root component instances
        if (!existingInstance && container instanceof HTMLElement) {
          const containerInstance = containerToInstance.get(container);
          if (containerInstance && containerInstance.constructor === vnode.type) {
            existingInstance = containerInstance;
            devTools.log(`[Renderer] renderToDOM: Found instance from containerToInstance map: ${existingInstance.constructor.name}`);
          }
        }

        // PRIORITY 1: Try to find existing instance from the existing DOM node
        if (!existingInstance) {
          existingInstance = componentInstances.get(existingDom as HTMLElement);
          devTools.log(`[Renderer] renderToDOM: Looked up instance from componentInstances map (existingDom): ${existingInstance ? existingInstance.constructor.name : 'not found'}`);

          // If not found from the root DOM node, try searching in children
          // This handles cases where the root element is a wrapper and the actual component DOM is nested
          if (!existingInstance && existingDom instanceof HTMLElement) {
            for (const child of Array.from(existingDom.children)) {
              const childInstance = componentInstances.get(child as HTMLElement);
              if (childInstance && childInstance.constructor === vnode.type) {
                existingInstance = childInstance;
                devTools.log(`[Renderer] renderToDOM: Found instance from child element: ${existingInstance.constructor.name}`);
                break;
              }
            }
          }

          // PRIORITY 1.1: If still not found, try searching all descendants recursively
          // This is more thorough than just checking direct children
          if (!existingInstance && existingDom instanceof HTMLElement) {
            const searchDescendants = (node: HTMLElement): SwissComponent | null => {
              const instance = componentInstances.get(node);
              if (instance && instance.constructor === vnode.type) {
                return instance;
              }
              for (const child of Array.from(node.children)) {
                if (child instanceof HTMLElement) {
                  const found = searchDescendants(child);
                  if (found) return found;
                }
              }
              return null;
            };
            const foundInstance = searchDescendants(existingDom);
            if (foundInstance) {
              existingInstance = foundInstance;
              devTools.log(`[Renderer] renderToDOM: Found instance by searching all descendants: ${existingInstance.constructor.name}`);
            }
          }

          // PRIORITY 1.5: Check if the container itself has an instance stored
          // This handles root components where the container is the mount point
          if (!existingInstance && container instanceof HTMLElement) {
            const containerInstance = componentInstances.get(container);
            if (containerInstance && containerInstance.constructor === vnode.type) {
              existingInstance = containerInstance;
              devTools.log(`[Renderer] renderToDOM: Found instance from container: ${existingInstance.constructor.name}`);
            }
          }

          // PRIORITY 1.6: Last resort - recursively search the entire DOM tree under the container
          // This handles cases where the DOM structure doesn't match expectations
          if (!existingInstance && container instanceof HTMLElement) {
            const searchTree = (node: Node): SwissComponent | null => {
              if (node instanceof HTMLElement) {
                const instance = componentInstances.get(node);
                if (instance && instance.constructor === vnode.type) {
                  return instance;
                }
                for (const child of Array.from(node.children)) {
                  const found = searchTree(child);
                  if (found) return found;
                }
              }
              return null;
            };
            const foundInstance = searchTree(container);
            if (foundInstance) {
              existingInstance = foundInstance;
              devTools.log(`[Renderer] renderToDOM: Found instance by searching entire tree: ${existingInstance.constructor.name}`);
            }
          }
        }

        // PRIORITY 1.5: If still not found, search all entries in componentInstances for matching type
        // This is a fallback for when the DOM structure has changed but the instance still exists
        if (!existingInstance) {
          // Iterate through componentInstances to find an instance of the same type
          // Note: WeakMap doesn't support iteration, so we can't do this directly
          // Instead, we'll rely on the other lookup methods
          devTools.log(`[Renderer] renderToDOM: Instance not found from direct lookup, will try other methods`);
        }

        // If not found, try to get it from oldVNode (which might be the rendered VNode)
        if (!existingInstance && oldVNode) {
          // oldVNode might be the rendered VNode, check if it has an instance
          const instanceFromOldVNode = (oldVNode as any).__componentInstance;
          if (instanceFromOldVNode) {
            existingInstance = instanceFromOldVNode;
            devTools.log(`[Renderer] renderToDOM: Found instance from oldVNode.__componentInstance: ${instanceFromOldVNode.constructor.name}`);
          }
          // Also check if oldVNode itself is a component VNode
          else if (isComponentVNode(oldVNode)) {
            const instanceFromComponentVNode = (oldVNode as any).__componentInstance;
            if (instanceFromComponentVNode) {
              existingInstance = instanceFromComponentVNode;
              devTools.log(`[Renderer] renderToDOM: Found instance from oldVNode (component VNode): ${instanceFromComponentVNode.constructor.name}`);
            }
          }
        }

        // If still not found, check if oldVNode is a rendered element VNode that has a component instance
        // The oldVNode might be the rendered output of a component, and we need to find the component that rendered it
        if (!existingInstance && oldVNode && isElementVNode(oldVNode)) {
          // The oldVNode is an element VNode (rendered output), check if it has component instance metadata
          // We need to traverse up the tree or check if there's a way to find the component
          // Actually, if oldVNode is the rendered output, the instance should be in componentInstances with existingDom as key
          // But if that didn't work, try checking if any child of existingDom has the instance
          const checkChildren = (node: Node): SwissComponent | null => {
            if (node instanceof HTMLElement) {
              const instance = componentInstances.get(node);
              if (instance && instance.constructor === vnode.type) {
                return instance;
              }
              for (const child of Array.from(node.children)) {
                const found = checkChildren(child);
                if (found) return found;
              }
            }
            return null;
          };
          const foundInstance = checkChildren(existingDom);
          if (foundInstance) {
            existingInstance = foundInstance;
            devTools.log(`[Renderer] renderToDOM: Found instance by checking children: ${existingInstance.constructor.name}`);
          }
        }

        // CRITICAL: If we found an existing instance, check if it's the same component type
        // If so, ALWAYS update in place, regardless of oldVNode type
        if (existingInstance && existingInstance.constructor === vnode.type) {
          // Same component instance - update in place
          devTools.log(`[Renderer] renderToDOM: Found existing instance of ${existingInstance.constructor.name}, updating in place`);

          // CRITICAL: Mark instance as initialized BEFORE storing it on vnode
          // This prevents renderComponent from calling initialize() again
          (existingInstance as any)._initialized = true;
          (existingInstance as any).__initialized = true;

          // Store the existing instance on the new VNode before updating
          if (typeof vnode === "object" && vnode !== null) {
            (vnode as any).__componentInstance = existingInstance;
            (vnode as { dom?: Node }).dom = existingDom;
          }

          // CRITICAL: For root components, ensure the container is set on the instance
          // This allows performUpdate() to find the container
          if ((existingInstance as any)._container !== container) {
            (existingInstance as any)._container = container;
            devTools.log(`[Renderer] renderToDOM: Set container on root component instance ${existingInstance.constructor.name}`);
          }

          // CRITICAL: Store instance in containerToInstance map for future lookups
          if (container instanceof HTMLElement) {
            containerToInstance.set(container, existingInstance);
            devTools.log(`[Renderer] renderToDOM: Stored instance in containerToInstance map for ${existingInstance.constructor.name}`);
          }

          // CRITICAL: Ensure _domNode is set on the instance
          // This is a fallback for performUpdate() when _vnode.dom is not available
          if (!(existingInstance as any)._domNode || (existingInstance as any)._domNode !== existingDom) {
            (existingInstance as any)._domNode = existingDom;
            devTools.log(`[Renderer] renderToDOM: Set _domNode on root component instance ${existingInstance.constructor.name}`);
          }

          // CRITICAL: Also set dom property on the component instance's _vnode
          // This is the rendered VNode (output of render()), and performUpdate() checks this._vnode.dom
          const instanceVNode = (existingInstance as any)._vnode;
          if (instanceVNode) {
            (instanceVNode as any).dom = existingDom;
            devTools.log(`[Renderer] renderToDOM: Set dom property on component instance _vnode for ${existingInstance.constructor.name}`);
          }

          // Update the existing DOM node
          updateDOMNodeBound(existingDom, vnode);

          return;
        } else if (existingInstance) {
          devTools.log(`[Renderer] renderToDOM: Found instance but different type: ${existingInstance.constructor.name} !== ${(vnode.type as any).name}`);
        } else {
          // CRITICAL: If we can't find the instance but the container has a child, this is a serious error
          // We should NOT create a new instance as it will reset all state
          // Instead, log an error and try to recover by using updateDOMNode directly
          devTools.error(`[Renderer] renderToDOM: ⚠️ CRITICAL - No existing instance found for component ${(vnode.type as any).name} but container has child! This will cause state loss.`, { container, existingDom, oldVNode, newVNode: vnode });

          // Try one more time: check if oldVNode is a component VNode and has the instance
          if (oldVNode && isComponentVNode(oldVNode) && oldVNode.type === vnode.type) {
            const instanceFromOld = (oldVNode as any).__componentInstance;
            if (instanceFromOld) {
              existingInstance = instanceFromOld;
              devTools.log(`[Renderer] renderToDOM: Found instance from oldVNode.__componentInstance (last resort): ${existingInstance.constructor.name}`);
              // Store it on the new VNode
              if (typeof vnode === "object" && vnode !== null) {
                (vnode as any).__componentInstance = existingInstance;
              }
              // CRITICAL: Store instance in containerToInstance map
              if (container instanceof HTMLElement) {
                containerToInstance.set(container, existingInstance);
                devTools.log(`[Renderer] renderToDOM: Stored instance in containerToInstance map (fallback) for ${existingInstance.constructor.name}`);
              }
              // Update in place
              updateDOMNodeBound(existingDom, vnode);
              if (typeof vnode === "object" && vnode !== null) {
                (vnode as { dom?: Node }).dom = existingDom;
              }
              return;
            }
          }

          // If we still can't find it, this is a critical error
          // Don't create a new instance - instead, try to update the existing DOM
          // updateDOMNode -> updateComponentNode will try to find the instance again
          devTools.error(`[Renderer] renderToDOM: Cannot find existing instance for ${(vnode.type as any).name}. Attempting to update existing DOM - updateComponentNode will try to find instance.`);
          // CRITICAL: Store the vnode type on the existing DOM so updateComponentNode can match it
          if (typeof vnode === "object" && vnode !== null) {
            (vnode as { dom?: Node }).dom = existingDom;
          }
          updateDOMNodeBound(existingDom, vnode);
          return;
        }

        // Check if it's the same component type by comparing VNode types
        if (oldVNode && isComponentVNode(oldVNode) && oldVNode.type === vnode.type) {
          // Same component type - update in place
          devTools.log('[Renderer] renderToDOM: Same component type (by VNode type), updating in place');
          if (typeof vnode === "object" && vnode !== null) {
            (vnode as { dom?: Node }).dom = existingDom;
          }
          updateDOMNodeBound(existingDom, vnode);
          return;
        }
      } else if (oldVNode && isElementVNode(vnode) && isElementVNode(oldVNode) && oldVNode.type === vnode.type) {
        // Same element type - update in place
        devTools.log('[Renderer] renderToDOM: Same element type, updating in place');
        if (typeof vnode === "object" && vnode !== null) {
          (vnode as { dom?: Node }).dom = existingDom;
        }
        updateDOMNodeBound(existingDom, vnode);
        return;
      }

      // Different component/element or no match - replace
      // CRITICAL: For component VNodes with existing children, ALWAYS try to update instead of replace
      // This prevents creating new instances and losing state
      if (isComponentVNode(vnode) && container.firstChild) {
        devTools.warn(`[Renderer] renderToDOM: Component VNode ${(vnode.type as any).name} but can't find instance. Attempting to update existing DOM instead of replacing (to prevent state loss).`);
        // Try to update the existing DOM - this will give updateComponentNode another chance to find the instance
        const existingDom = container.firstChild;
        if (typeof vnode === "object" && vnode !== null) {
          (vnode as { dom?: Node }).dom = existingDom;
        }
        updateDOMNodeBound(existingDom, vnode);
        return;
      }

      devTools.log('[Renderer] renderToDOM: Different component/element or no match, replacing');
      if (container != null && typeof container.innerHTML !== "undefined") container.innerHTML = "";
      const domNode = createDOMNodeBound(vnode);
      container.appendChild(domNode);
      if (typeof vnode === "object" && vnode !== null && "dom" in vnode) {
        (vnode as { dom: Node }).dom = domNode;
      }
    } else {
      // Container is empty - initial render
      devTools.log('[Renderer] renderToDOM: Initial render (empty container)');
      const domNode = createDOMNodeBound(vnode);
      container.appendChild(domNode);
      if (typeof vnode === "object" && vnode !== null && "dom" in vnode) {
        (vnode as { dom: Node }).dom = domNode;
      }

      // For root component instances, set the container reference
      if (isComponentVNode(vnode)) {
        const instance = componentInstances.get(domNode as HTMLElement);
        if (instance) {
          if (!(instance as any)._container) {
            (instance as any)._container = container;
            devTools.log(`[Renderer] renderToDOM: Set container on root component instance ${instance.constructor.name} during initial render`);
          }
          // CRITICAL: Store instance in containerToInstance map for future lookups
          if (container instanceof HTMLElement) {
            containerToInstance.set(container, instance);
            devTools.log(`[Renderer] renderToDOM: Stored instance in containerToInstance map during initial render for ${instance.constructor.name}`);
          }
        }
      }
    }
  } catch (error) {
    // Global error boundary - prevent app crash
    const err = error instanceof Error ? error : new Error(String(error));
    const errorMessage = err.message || "Unknown error";
    
    // Report to error reporter
    if (typeof window !== 'undefined' && (window as any).__swissErrorReporter) {
      (window as any).__swissErrorReporter.report(err, {
        context: 'renderToDOM',
        vnode: String(vnode),
        container: container?.id || 'unknown',
      });
    }
    
    // Log with version for debugging
    devTools.error(`[SWISS FATAL] Version ${typeof SWISS_VERSION !== 'undefined' ? SWISS_VERSION : 'unknown'} crashed:`, err);
    
    // Render fallback UI instead of crashing
    try {
      const fallbackHTML = `
        <div style="padding: 2rem; border: 2px solid #f00; background: #fee; color: #c00; font-family: system-ui;">
          <h2>⚠️ Application Error</h2>
          <p><strong>SwissJS Framework Error</strong></p>
          <p>${escapeHtml(errorMessage)}</p>
          <details style="margin-top: 1rem;">
            <summary style="cursor: pointer;">Error Details</summary>
            <pre style="background: #fff; padding: 1rem; overflow: auto; max-height: 300px; font-size: 0.875rem;">${escapeHtml(err.stack || String(err))}</pre>
          </details>
          <p style="margin-top: 1rem; font-size: 0.875rem; color: #666;">
            Version: ${typeof SWISS_VERSION !== 'undefined' ? SWISS_VERSION : 'unknown'}
          </p>
        </div>
      `;
      if (container != null && typeof container.innerHTML !== "undefined") container.innerHTML = fallbackHTML;
    } catch (fallbackError) {
      // If even fallback fails, just show a simple message
      if (container != null && typeof container.innerHTML !== "undefined") container.innerHTML = `<div style="padding: 1rem; color: red;">Application Error: ${escapeHtml(errorMessage)}</div>`;
    }
    
    // Still throw for development/debugging, but app won't crash
    const isDev = typeof process !== 'undefined' 
      ? (process.env.NODE_ENV === 'development' || !process.env.NODE_ENV)
      : true; // Default to dev mode in browser
    if (isDev) {
      throw new DiffingError(`Rendering failed: ${errorMessage}`, vnode);
    }
  } finally {
    performanceMonitor.onRenderEnd();
  }
}

// Re-export public API
export { devTools, performanceMonitor, DiffingError };

// Export updateDOMNode for use in component.ts
export { updateDOMNodeBound as updateDOMNode };

// SSR: Convert VNode to HTML string
export function renderToString(vnode: VNode): string {
  if (typeof vnode === "string" || typeof vnode === "number") {
    return escapeHtml(String(vnode));
  }

  if (vnode === null || vnode === undefined || typeof vnode === "boolean") {
    return "";
  }

  if (isComponentVNode(vnode)) {
    // For component VNodes, render the component (this should be done at a higher level)
    // For now, return empty string - components should be rendered before calling renderToString
    return "";
  }

  if (isElementVNode(vnode)) {
    const { type, props = {}, children = [] } = vnode;
    const isVoid = ["area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "param", "source", "track", "wbr"].includes(type.toLowerCase());
    
    let html = `<${type}`;
    
    // Add SSR ID if present
    if (vnode.ssrId) {
      html += ` data-ssr-id="${escapeHtml(vnode.ssrId)}"`;
    }
    
    // Add props as attributes
    for (const [key, value] of Object.entries(props)) {
      if (key === "children" || key === "key" || key.startsWith("on")) continue;
      if (value === null || value === undefined || value === false) continue;
      if (value === true) {
        html += ` ${escapeHtml(key)}`;
    } else {
        html += ` ${escapeHtml(key)}="${escapeHtml(String(value))}"`;
      }
    }
    
    if (isVoid) {
      html += " />";
      } else {
      html += ">";
      // Render children
      for (const child of children) {
        html += renderToString(child);
      }
      html += `</${type}>`;
    }
    
    return html;
  }

  return "";
}

function escapeHtml(str: string): string {
  const map: Record<string, string> = {
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;",
  };
  return str.replace(/[&<>"']/g, (m) => map[m]);
}
