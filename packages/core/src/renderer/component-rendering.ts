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
import { Fragment } from "../vdom/vdom.js";
import {
  getCurrentComponentInstance,
  setCurrentComponentInstance,
} from "./storage.js";
import {
  isElementVNode,
  isComponentVNode,
  isClassComponent,
  filterValidVNodes,
} from "./types.js";
import { DiffingError } from "./errors.js";
import { createErrorBoundary } from "./errors.js";
import { untrack } from "../reactivity/effect.js";
import { getCachedRender, cacheRender } from "./render-cache.js";

/**
 * Expands slot VNodes into their actual content from the component instance.
 * This ensures slots are resolved before reconciliation, avoiding 1:many VNode-to-DOM issues.
 */
export function expandSlots(
  vnode: VNode,
  slotContent: Map<string, VNode[]>,
): VNode | null {
  if (
    vnode == null ||
    typeof vnode === "boolean" ||
    typeof vnode === "string" ||
    typeof vnode === "number"
  ) {
    return vnode;
  }

  if (isElementVNode(vnode)) {
    // Check if this is a slot element
    if (vnode.type === "slot") {
      const slotName = (vnode.props?.name as string) || "default";
      const content = slotContent.get(slotName) || [];

      // If slot has content, return it (as array if multiple children, single if one, or null if empty)
      if (content.length === 0) {
        // Empty slot - return null to avoid rendering
        return null;
      } else if (content.length === 1) {
        // Single child - expand it recursively
        return expandSlots(content[0], slotContent);
      } else {
        // Multiple children - return as array (fragments are arrays in SwissJS VNode type)
        // isFragmentVNode checks for Array.isArray(vnode), so returning array is correct
        return content
          .map((child) => expandSlots(child, slotContent))
          .filter((c) => c != null) as unknown as VNode;
      }
    }

    // Regular element - expand its children
    const expandedChildren = vnode.children
      ? (vnode.children
          .map((child) => expandSlots(child, slotContent))
          .filter((c) => c != null) as VNode[])
      : [];

    return {
      ...vnode,
      children: expandedChildren,
    };
  }

  // For component VNodes and other types, expand children if they exist
  if (typeof vnode === "object" && vnode !== null && "children" in vnode) {
    const children = (vnode as any).children;
    if (Array.isArray(children)) {
      return {
        ...vnode,
        children: children
          .map((child) => expandSlots(child, slotContent))
          .filter((c) => c != null),
      };
    }
  }

  return vnode;
}

export function renderComponent(
  vnode: ComponentVNode,
  existingInstance: SwissComponent | undefined,
): VNode {
  try {
    const Component = vnode.type;

    let slotContent = new Map<string, VNode[]>();
    const defaultChildren: VNode[] = [];

    const validChildren = filterValidVNodes(vnode.children || []);
    validChildren.forEach((child) => {
      if (isElementVNode(child) && child.props?.slot) {
        const slotName = child.props.slot as string;
        if (!slotContent.has(slotName)) {
          slotContent.set(slotName, []);
        }
        slotContent.get(slotName)!.push(child);
      } else {
        defaultChildren.push(child);
      }
    });

    // CRITICAL: For existing instances, preserve _slotContent BEFORE processing defaultChildren
    // This ensures slots can be expanded even when ComponentVNode has no children during updates
    let preservedSlotContent: Map<string, VNode[]> | undefined;
    if (existingInstance) {
      preservedSlotContent = (existingInstance as any)._slotContent as
        | Map<string, VNode[]>
        | undefined;
      // If new slotContent is empty but existing one has content, use the existing one
      if (
        slotContent.size === 0 &&
        preservedSlotContent &&
        preservedSlotContent.size > 0
      ) {
        slotContent = preservedSlotContent;
      }
    }

    const props = {
      ...vnode.props,
      children: defaultChildren,
      _slotContent: slotContent,
    };

    if (typeof Component === "function") {
      if (isClassComponent(Component)) {
        let instance: SwissComponent;

        if (existingInstance) {
          instance = existingInstance;
          instance.props = props;
          // Set _slotContent (either new or preserved)
          (instance as any)._slotContent = slotContent;
          (instance as any)._initialized = true;
          (instance as any).__initialized = true;
        } else {
          instance = new Component(props);
          const parent = getCurrentComponentInstance();
          if (parent) (instance as any)._parent = parent;
          if (slotContent.size > 0) {
            (instance as any)._slotContent = slotContent;
          }
        }

        const prevInstance = getCurrentComponentInstance();
        setCurrentComponentInstance(instance);

        // IMPORTANT: Add defaultChildren to slotContent so <slot /> can find them
        // This must happen BEFORE checking cache, as slot content can change even if props don't
        // CRITICAL: If defaultChildren is empty but we preserved existing _slotContent, use preserved content
        if (defaultChildren.length > 0) {
          slotContent.set("default", defaultChildren);
        } else if (slotContent.has("default")) {
          // No new defaultChildren but existing default slot exists (preserved) - keep it
          // Preserved slot content will be used
        }
        // Note: No defaultChildren and no existing default slot is normal for components without children

        // Update _slotContent on instance after processing defaultChildren
        (instance as any)._slotContent = slotContent;

        // Check render cache first
        const cachedRender = getCachedRender(instance, props);
        let rendered: VNode | null;

        if (cachedRender) {
          // Use cached render, but STILL expand slots because slot content can change
          // even if props hash is the same (children might be different)
          rendered = cachedRender;

          // CRITICAL: Expand slots even for cached renders
          // Slot content (children) can change even if props hash matches
          if (rendered != null && typeof rendered !== "boolean") {
            const expanded = expandSlots(rendered, slotContent);
            rendered = expanded !== null ? expanded : rendered;
          }
        } else {
          // Cache miss - render component
          rendered = untrack(() => instance.render());

          // CRITICAL: Expand slots into their actual content before reconciliation
          // This prevents 1:many VNode-to-DOM mapping issues during diffing
          // Always expand slots, even if no slot content was passed (to handle empty slots)
          if (rendered != null && typeof rendered !== "boolean") {
            const expanded = expandSlots(rendered, slotContent);
            rendered = expanded !== null ? expanded : rendered;
          }

          // Cache the render result (WITH slots expanded)
          if (rendered != null && typeof rendered !== "boolean") {
            cacheRender(instance, props, rendered);
          }
        }

        setCurrentComponentInstance(prevInstance);

        const oldVNode = (instance as any)._vnode;
        let oldDom = (instance as any)._domNode || null;
        if (!oldDom && oldVNode && (oldVNode as any).dom) {
          oldDom = (oldVNode as any).dom;
        }
        if (
          !oldDom &&
          (instance as any).__componentVNode &&
          ((instance as any).__componentVNode as any).dom
        ) {
          oldDom = ((instance as any).__componentVNode as any).dom;
        }

        if (rendered != null && typeof rendered !== "boolean") {
          (instance as any)._vnode = rendered;
        }

        if (
          oldDom &&
          rendered != null &&
          typeof rendered !== "boolean" &&
          typeof rendered === "object"
        ) {
          (rendered as any).dom = oldDom;
        }
        if (oldDom) {
          (instance as any)._domNode = oldDom;
        }
        if (
          rendered === null ||
          rendered === undefined ||
          typeof rendered === "boolean"
        ) {
          if (rendered === null) {
            console.log(
              `[Renderer] Component ${instance.constructor.name} returned null from render(), skipping __componentInstance assignment`,
            );
            // CRITICAL: Return a placeholder fragment instead of null to prevent renderer issues
            // This ensures the component instance is still tracked even when it returns null
            // Fragment is a Symbol, so we return an empty array (fragments are arrays in SwissJS)
            return [] as unknown as VNode;
          }
          return rendered;
        }

        if (typeof rendered === "object") {
          try {
            (rendered as any).__componentInstance = instance;
          } catch (error) {
            console.error(
              `[Renderer] Failed to set __componentInstance on rendered vnode:`,
              {
                error,
                rendered,
                renderedType: typeof rendered,
                renderedIsNull: rendered === null,
                renderedIsUndefined: rendered === undefined,
                renderedValue: rendered,
                instance: instance?.constructor?.name,
              },
            );
            throw error;
          }
        }
        return rendered;
      } else {
        return untrack(() => Component(props));
      }
    }

    throw new DiffingError("Unsupported component type");
  } catch (error) {
    console.error("Component rendering error:", error);
    const errorMessage =
      error instanceof Error ? error.message : "Unknown error";
    const err = error instanceof Error ? error : new Error(String(error));
    return createErrorBoundary(`Component error: ${errorMessage}`, err);
  }
}
