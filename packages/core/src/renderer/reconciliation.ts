/*
 * Copyright (c) 2024 Themba Mzumara
 * This file is part of SwissJS Framework. All rights reserved.
 * Licensed under the MIT License. See LICENSE in the project root for license information.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-unused-vars */

import type { VNode, ComponentVNode } from "../vdom/vdom.js";
import { componentInstances, domToHostComponent, vnodeMetadata } from "./storage.js";
import {
  getKey,
  canUpdateInPlace,
  isComponentVNode,
  isElementVNode,
  cleanupNode,
} from "./types.js";

// Forward declarations - these will be imported from other modules
// We use function declarations to allow hoisting and avoid circular dependency issues
declare function updateDOMNode(dom: Node, vnode: VNode): void;
declare function createDOMNode(vnode: VNode | null | undefined | boolean): Node;

// Key-based child diffing algorithm
export function reconcileChildren(
  parent: HTMLElement,
  oldChildren: VNode[],
  newChildren: VNode[],
  updateDOMNodeFn: typeof updateDOMNode,
  createDOMNodeFn: typeof createDOMNode,
) {
  const oldChildNodes = Array.from(parent.childNodes);

  // Build key maps for efficient lookups
  const oldKeyMap = new Map<
    string | number,
    { vnode: VNode; index: number; dom: Node }
  >();
  const newKeyMap = new Map<string | number, { vnode: VNode; index: number }>();

  // Build a map of DOM nodes by id for fallback matching
  // Search recursively in the parent's subtree, not just direct children
  const domByIdMap = new Map<string, Node>();
  const collectElementsById = (element: HTMLElement) => {
    if (element.id) {
      domByIdMap.set(element.id, element);
    }
    // Recursively search children
    for (const child of Array.from(element.children)) {
      if (child instanceof HTMLElement) {
        collectElementsById(child);
      }
    }
  };
  oldChildNodes.forEach((node) => {
    if (node instanceof HTMLElement) {
      collectElementsById(node);
    }
  });

  oldChildren.forEach((vnode, index) => {
    const key = getKey(vnode, index);
    // CRITICAL: Use vnode.dom directly instead of looking up by index
    // This ensures we correctly match old VNodes with their DOM nodes
    let dom =
      typeof vnode === "object" && vnode !== null && (vnode as any).dom
        ? (vnode as any).dom
        : oldChildNodes[index];

    // Fallback: Try to match by id if direct match fails
    if (!dom && isElementVNode(vnode) && vnode.props?.id) {
      const id = String(vnode.props.id);
      const domById = domByIdMap.get(id);
      if (domById) {
        dom = domById;
        // CRITICAL: Set the dom reference on the old VNode so it can be matched later
        if (typeof vnode === "object" && vnode !== null) {
          (vnode as any).dom = dom;
        }
      }
    }

    // Additional fallback: If still no dom and we have an element VNode,
    // try to find it by recursively searching the parent's DOM tree
    if (!dom && isElementVNode(vnode)) {
      const findInDOM = (
        element: HTMLElement,
        targetVNode: VNode,
      ): Node | null => {
        if (!isElementVNode(targetVNode)) return null;
        // Check if this element matches by id
        if (
          targetVNode.props?.id &&
          element.id === String(targetVNode.props.id)
        ) {
          return element;
        }
        // Check if this element matches by tag name and position
        if (element.tagName.toLowerCase() === targetVNode.type.toLowerCase()) {
          return element;
        }
        // Recursively search children
        for (const child of Array.from(element.children)) {
          if (child instanceof HTMLElement) {
            const found = findInDOM(child, targetVNode);
            if (found) return found;
          }
        }
        return null;
      };

      if (parent instanceof HTMLElement) {
        const foundDom = findInDOM(parent, vnode);
        if (foundDom) {
          dom = foundDom;
          // Set the dom reference on the old VNode
          if (typeof vnode === "object" && vnode !== null) {
            (vnode as any).dom = dom;
          }
        }
      }
    }

    if (dom) oldKeyMap.set(key, { vnode, index, dom });
  });

  newChildren.forEach((vnode, index) => {
    const key = getKey(vnode, index);
    newKeyMap.set(key, { vnode, index });
  });

  const processedNodes = new Set<Node>();
  const newDoms: Node[] = [];

  // First pass: update existing nodes
  newChildren.forEach((newVNode, newIndex) => {
    // Skip null/undefined/boolean children (React/SWISS allows these to skip rendering)
    if (newVNode == null || typeof newVNode === "boolean") {
      return;
    }

    const key = getKey(newVNode, newIndex);
    let oldEntry = oldKeyMap.get(key);

    // CRITICAL FIX: For component VNodes, try to match by position FIRST before key matching
    // This is essential for preserving component instances during parent re-renders (e.g., typing in inputs)
    // When a parent re-renders, it creates new VNodes for children, but the DOM structure is stable
    if (!oldEntry && isComponentVNode(newVNode)) {
      // Try to match by position in the DOM - this is the most reliable during re-renders
      const domChildren = Array.from(parent.childNodes);
      if (newIndex < domChildren.length) {
        const childDom = domChildren[newIndex];
        if (childDom instanceof HTMLElement) {
          const direct = componentInstances.get(childDom);
          const host = domToHostComponent.get(childDom);
          const instance =
            (host && host.constructor === newVNode.type ? host : null) ||
            (direct && direct.constructor === newVNode.type ? direct : null);
          if (instance) {
            // Found matching instance at same position - this is likely the same component
            const metadataVNode = vnodeMetadata.get(childDom);
            const oldChild = newIndex < oldChildren.length ? oldChildren[newIndex] : null;
            
            // Use oldChild if it matches, otherwise use metadataVNode, otherwise create synthetic
            const matchingOldVNode = 
              (oldChild && isComponentVNode(oldChild) && oldChild.type === newVNode.type)
                ? oldChild
                : (metadataVNode && isComponentVNode(metadataVNode) && metadataVNode.type === newVNode.type)
                ? metadataVNode
                : ({ type: newVNode.type } as ComponentVNode);
            
            // Restore references
            if (typeof matchingOldVNode === "object" && matchingOldVNode !== null) {
              (matchingOldVNode as any).__componentInstance = instance;
              (matchingOldVNode as any).dom = childDom;
            }
            
            // CRITICAL: Transfer instance to new VNode immediately
            if (typeof newVNode === "object" && newVNode !== null) {
              (newVNode as any).__componentInstance = instance;
              (newVNode as any).dom = childDom;
            }
            
            oldEntry = {
              vnode: matchingOldVNode,
              index: newIndex,
              dom: childDom,
            };
            oldKeyMap.set(key, oldEntry);
          }
        }
      }
    }

    // CRITICAL FIX: For component VNodes, try to match by component instance even if key doesn't match
    // This prevents recreating components that should be updated
    if (!oldEntry && isComponentVNode(newVNode)) {
      // Try to find a matching component by type and instance in the existing DOM
      const domChildren = Array.from(parent.childNodes);
      for (let i = 0; i < domChildren.length; i++) {
        const childDom = domChildren[i];
        if (childDom instanceof HTMLElement) {
          const direct = componentInstances.get(childDom);
          const host = domToHostComponent.get(childDom);
          const instance =
            (host && host.constructor === newVNode.type ? host : null) ||
            (direct && direct.constructor === newVNode.type ? direct : null);
          if (instance) {
            // Found a matching component instance - try to find the corresponding old VNode
            // First check if there's an old VNode at this position
            if (i < oldChildren.length) {
              const oldChild = oldChildren[i];
              if (
                isComponentVNode(oldChild) &&
                oldChild.type === newVNode.type
              ) {
                // Match found! Create an entry for it
                if (typeof oldChild === "object" && oldChild !== null) {
                  (oldChild as any).dom = childDom;
                  (oldChild as any).__componentInstance = instance;
                }
                oldEntry = {
                  vnode: oldChild,
                  index: i,
                  dom: childDom,
                };
                // CRITICAL: Transfer instance to new VNode immediately
                if (typeof newVNode === "object" && newVNode !== null) {
                  (newVNode as any).__componentInstance = instance;
                  (newVNode as any).dom = childDom;
                }
                // Add to map for future lookups
                oldKeyMap.set(key, oldEntry);
                break;
              }
            }
            // If no old VNode at this position, create entry from the DOM node
            // This handles the case where the old VNode tree is missing but DOM exists
            const metadataVNode = vnodeMetadata.get(childDom);
            if (
              metadataVNode &&
              isComponentVNode(metadataVNode) &&
              metadataVNode.type === newVNode.type
            ) {
              // Restore instance reference on metadata VNode
              if (typeof metadataVNode === "object" && metadataVNode !== null) {
                (metadataVNode as any).__componentInstance = instance;
                (metadataVNode as any).dom = childDom;
              }
              oldEntry = {
                vnode: metadataVNode,
                index: i,
                dom: childDom,
              };
              // CRITICAL: Transfer instance to new VNode immediately
              if (typeof newVNode === "object" && newVNode !== null) {
                (newVNode as any).__componentInstance = instance;
                (newVNode as any).dom = childDom;
              }
              oldKeyMap.set(key, oldEntry);
              break;
            }
            // Last resort: match by instance even without old VNode
            // This handles the case where old VNode tree is completely lost
            if (typeof newVNode === "object" && newVNode !== null) {
              (newVNode as any).__componentInstance = instance;
              (newVNode as any).dom = childDom;
              // Create a synthetic old entry from the instance
              const syntheticOldVNode =
                metadataVNode || ({ type: newVNode.type } as ComponentVNode);
              if (
                typeof syntheticOldVNode === "object" &&
                syntheticOldVNode !== null
              ) {
                (syntheticOldVNode as any).__componentInstance = instance;
                (syntheticOldVNode as any).dom = childDom;
              }
              oldEntry = {
                vnode: syntheticOldVNode,
                index: i,
                dom: childDom,
              };
              oldKeyMap.set(key, oldEntry);
              break;
            }
          }
        }
      }
    }

    // ENHANCEMENT: Aggressive ID Matching - try ID matching BEFORE key matching fails
    // This ensures DOM identity is restored early in the process
    if (!oldEntry && isElementVNode(newVNode) && newVNode.props?.id) {
      const id = String(newVNode.props.id);
      const domById = domByIdMap.get(id);
      if (domById) {
        // First, try to find an old VNode that already has this DOM node
        for (const entry of oldKeyMap.values()) {
          if (entry.dom === domById) {
            oldEntry = entry;
            break;
          }
        }

        // If still not found, search recursively in oldChildren by matching id
        if (!oldEntry) {
          const findVNodeById = (vnodes: VNode[]): VNode | null => {
            for (const v of vnodes) {
              if (isElementVNode(v) && v.props?.id === id) {
                return v;
              }
              // Recursively search children
              if (isElementVNode(v) && v.children) {
                const found = findVNodeById(v.children);
                if (found) return found;
              }
            }
            return null;
          };

          const matchingOldVNode = findVNodeById(oldChildren);
          if (matchingOldVNode) {
            const oldIndex = oldChildren.indexOf(matchingOldVNode);
            // CRITICAL: PATCH - Restore the link to the DOM
            // This must happen BEFORE we decide to update or create
            if (
              typeof matchingOldVNode === "object" &&
              matchingOldVNode !== null
            ) {
              (matchingOldVNode as any).dom = domById;
            }
            oldEntry = {
              vnode: matchingOldVNode,
              index: oldIndex >= 0 ? oldIndex : 0, // Use 0 as fallback if not found in direct children
              dom: domById,
            };
            // Add to map for future lookups
            oldKeyMap.set(key, oldEntry);
          }
        }
      }
    }

    if (oldEntry) {
      const { dom, vnode: oldVNode } = oldEntry;

      // CRITICAL FIX: Transfer DOM reference IMMEDIATELY when we find a match
      // This must happen BEFORE any decision about update vs create
      // Without this, the new VNode is treated as "new" and triggers initialize()
      if (typeof newVNode === "object" && newVNode !== null) {
        (newVNode as any).dom = dom;
      }

      // CRITICAL: For component VNodes, preserve the existing instance before updating
      // This prevents creating new instances during reactive updates
      if (
        newVNode &&
        oldVNode &&
        isComponentVNode(newVNode) &&
        isComponentVNode(oldVNode) &&
        newVNode.type === oldVNode.type
      ) {
        // Same component type - preserve the instance. Prefer host (e.g. EventBusProvider)
        // when DOM is the child's root (domToHostComponent) so we don't use the wrong instance (e.g. Shell).
        const direct = componentInstances.get(dom as HTMLElement);
        const host = domToHostComponent.get(dom as HTMLElement);
        const existingInstance =
          (oldVNode as any).__componentInstance ||
          (host && host.constructor === newVNode.type ? host : null) ||
          (direct && direct.constructor === newVNode.type ? direct : null);
        if (
          existingInstance &&
          typeof newVNode === "object" &&
          newVNode !== null
        ) {
          // Store the existing instance on the new VNode
          (newVNode as any).__componentInstance = existingInstance;
          // Mark as initialized to prevent re-initialization
          (existingInstance as any)._initialized = true;
          (existingInstance as any).__initialized = true;
        }
      }

      if (canUpdateInPlace(dom, newVNode, oldVNode)) {
        // DOM reference already set above, just update
        updateDOMNodeFn(dom, newVNode);
        processedNodes.add(dom);
        newDoms.push(dom);
      } else if (
        newVNode &&
        oldVNode &&
        isComponentVNode(newVNode) &&
        isComponentVNode(oldVNode) &&
        newVNode.type === oldVNode.type
      ) {
        // CRITICAL: For same-type component VNodes, ALWAYS update in place
        // Don't create a new DOM node - use updateDOMNode which will call updateComponentNode
        // updateComponentNode knows how to find and reuse the existing instance
        // DOM reference already set above, just update
        updateDOMNodeFn(dom, newVNode);
        processedNodes.add(dom);
        newDoms.push(dom);
      } else {
        // Different types or can't update in place - create new DOM
        const newDom = createDOMNodeFn(newVNode);
        // Store DOM reference on the new VNode
        if (typeof newVNode === "object" && newVNode !== null) {
          (newVNode as any).dom = newDom;
        }
        // Check if dom is still a child of parent before replacing
        // It might have been removed or moved during a previous iteration
        if (dom.parentNode === parent) {
          parent.replaceChild(newDom, dom);
        } else {
          // Node was already removed/moved - insert at the correct position
          const nextSibling = parent.childNodes[newIndex];
          if (nextSibling) {
            parent.insertBefore(newDom, nextSibling);
          } else {
            parent.appendChild(newDom);
          }
        }
        processedNodes.add(newDom);
        newDoms.push(newDom);
      }
    } else {
      // CRITICAL FIX: Before creating a new DOM node, check if this is a component
      // that already exists in the DOM. This is the final fallback to prevent
      // recreating components during re-renders when all other matching logic fails.
      if (isComponentVNode(newVNode)) {
        // Search the DOM for an existing component instance of this type
        // Try position-based matching first (most reliable during re-renders)
        const domChildren = Array.from(parent.childNodes);
        let foundExisting = false;
        
        // Try to find at the expected position
        if (newIndex < domChildren.length) {
          const childDom = domChildren[newIndex];
          if (childDom instanceof HTMLElement) {
            const direct = componentInstances.get(childDom);
            const host = domToHostComponent.get(childDom);
            const instance =
              (host && host.constructor === newVNode.type ? host : null) ||
              (direct && direct.constructor === newVNode.type ? direct : null);
            if (instance) {
              // Found matching instance at expected position!
              // Transfer instance and DOM reference to new VNode
              if (typeof newVNode === "object" && newVNode !== null) {
                (newVNode as any).__componentInstance = instance;
                (newVNode as any).dom = childDom;
                // Mark as initialized to prevent re-initialization
                (instance as any)._initialized = true;
                (instance as any).__initialized = true;
              }
              // Update the existing DOM node instead of creating a new one
              updateDOMNodeFn(childDom, newVNode);
              processedNodes.add(childDom);
              newDoms.push(childDom);
              foundExisting = true;
            }
          }
        }
        
        // If not found at expected position, search all DOM children
        if (!foundExisting) {
          for (let i = 0; i < domChildren.length; i++) {
            const childDom = domChildren[i];
            if (childDom instanceof HTMLElement && !processedNodes.has(childDom)) {
              const direct = componentInstances.get(childDom);
              const host = domToHostComponent.get(childDom);
              const instance =
                (host && host.constructor === newVNode.type ? host : null) ||
                (direct && direct.constructor === newVNode.type ? direct : null);
              if (instance) {
                // Found matching instance!
                // Transfer instance and DOM reference to new VNode
                if (typeof newVNode === "object" && newVNode !== null) {
                  (newVNode as any).__componentInstance = instance;
                  (newVNode as any).dom = childDom;
                  // Mark as initialized to prevent re-initialization
                  (instance as any)._initialized = true;
                  (instance as any).__initialized = true;
                }
                // Update the existing DOM node instead of creating a new one
                updateDOMNodeFn(childDom, newVNode);
                processedNodes.add(childDom);
                newDoms.push(childDom);
                foundExisting = true;
                break;
              }
            }
          }
        }
        
        // Only create new DOM if no existing instance was found
        if (!foundExisting) {
          const newDom = createDOMNodeFn(newVNode);
          // Store DOM reference on the new VNode
          if (typeof newVNode === "object" && newVNode !== null) {
            (newVNode as any).dom = newDom;
          }
          newDoms.push(newDom);
        }
      } else {
        // For non-component VNodes, create as normal
        const newDom = createDOMNodeFn(newVNode);
        // Store DOM reference on the new VNode
        if (typeof newVNode === "object" && newVNode !== null) {
          (newVNode as any).dom = newDom;
        }
        newDoms.push(newDom);
      }
    }
  });

  // Second pass: reorder nodes
  newDoms.forEach((dom, newIndex) => {
    const currentDom = parent.childNodes[newIndex];
    if (currentDom !== dom) {
      if (parent.childNodes[newIndex]) {
        parent.insertBefore(dom, parent.childNodes[newIndex]);
      } else {
        parent.appendChild(dom);
      }
    }
  });

  // Remove leftover nodes (skip when parent has data-preserve-children, e.g. xterm container)
  if (parent instanceof HTMLElement && parent.getAttribute?.("data-preserve-children") != null) {
    return;
  }
  oldChildNodes.forEach((node) => {
    if (!processedNodes.has(node)) {
      cleanupNode(node);
      // Check if node is still a child before removing (it might have been moved/removed during reordering)
      if (node.parentNode === parent) {
        parent.removeChild(node);
      }
    }
  });
}
