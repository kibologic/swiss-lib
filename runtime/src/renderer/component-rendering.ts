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
  ComponentType,
} from "../vdom/vdom.js";
import { Fragment, createVNode } from "../vdom/vdom.js";
import type { VNodeBase } from "../vdom/types/index.js";
import { asInternal } from "../component/internal.js";
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
import { getCachedRender, cacheRender, clearRenderCache } from "./render-cache.js";
import { logger } from "../utils/logger.js";

function vb(vnode: VNode | null | undefined): VNodeBase | null {
  if (vnode == null || typeof vnode !== "object") return null;
  return vnode as unknown as VNodeBase;
}

/**
 * Walk the _parent chain looking for an error boundary component.
 */
function findErrorBoundary(instance: SwissComponent): SwissComponent | null {
  let current: SwissComponent | null = instance._parent;
  while (current) {
    if ((current.constructor as typeof SwissComponent).isErrorBoundary) return current;
    current = current._parent;
  }
  return null;
}

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
    const slotName = vnode.props?.slot as string | undefined;
    if (slotName && slotContent.has(slotName)) {
      const slotNodes = slotContent.get(slotName) || [];
      return slotNodes.length === 1 ? slotNodes[0] : createVNode(Fragment, {}, ...slotNodes);
    }
    if ((vnode as VElement).type === "slot") {
      const name = (vnode.props?.name as string) || "default";
      const slotNodes = slotContent.get(name) || [];
      return slotNodes.length === 1 ? slotNodes[0] : createVNode(Fragment, {}, ...slotNodes);
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
  const base = vb(vnode as VNode);
  if (base && Array.isArray(base.children)) {
    return {
      ...vnode,
      children: base.children
        .map((child) => expandSlots(child as VNode, slotContent))
        .filter((c) => c != null),
    } as VNode;
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
    if (existingInstance) {
      const preservedSlotContent = asInternal(existingInstance)._slotContent;
      // If new slotContent is empty but existing one has content, use the existing one
      if (slotContent.size === 0 && preservedSlotContent && preservedSlotContent.size > 0) {
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
          // Merge incoming props into the existing reactive proxy in-place.
          // Replacing the whole object would lose Signal tracking established
          // by the render effect. Mutating individual keys fires their setters,
          // which notifies the render effect and triggers a re-render.
          const existingProps = instance.props as Record<string, unknown>;
          const incomingProps = props as Record<string, unknown>;

          // Remove keys that are no longer present in the incoming props so
          // the component can react to the absence of a prop (e.g. conditional attributes).
          // Skip internal framework keys that begin with '_' to avoid side-effects.
          for (const key of Object.keys(existingProps)) {
            if (!(key in incomingProps) && !key.startsWith("_")) {
              delete existingProps[key];
            }
          }

          for (const key of Object.keys(incomingProps)) {
            if (existingProps[key] !== incomingProps[key]) {
              existingProps[key] = incomingProps[key];
            }
          }
          clearRenderCache(instance);
          const c = asInternal(instance);
          c._slotContent = slotContent;
          c._initialized = true;
          c.__initialized = true;
        } else {
          instance = new Component(props);
          const parent = getCurrentComponentInstance();
          const c = asInternal(instance);
          if (parent) c._parent = parent;
          if (slotContent.size > 0) {
            c._slotContent = slotContent;
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
        }

        // Update _slotContent on instance after processing defaultChildren
        asInternal(instance)._slotContent = slotContent;

        // Check render cache first
        const cachedRender = getCachedRender(instance, props);
        let rendered: VNode | null;

        if (cachedRender) {
          // Use cached render, but STILL expand slots because slot content can change
          // even if props hash is the same (children might be different)
          rendered = cachedRender;

          // CRITICAL: Expand slots even for cached renders
          if (rendered != null && typeof rendered !== "boolean") {
            const expanded = expandSlots(rendered, slotContent);
            rendered = expanded !== null ? expanded : rendered;
          }
        } else {
          // Cache miss - render component
          try {
            rendered = untrack(() => instance.render());
          } catch (renderError) {
            const boundary = findErrorBoundary(instance);
            if (boundary) {
              asInternal(boundary).captureChildError(instance, { error: renderError });
              rendered = null;
            } else {
              logger.error(
                `[SwissJS] Uncaught render error in ${instance.constructor.name}:`,
                renderError,
              );
              throw renderError;
            }
          }
          // CRITICAL: Expand slots into their actual content before reconciliation
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

        const ci = asInternal(instance);
        const oldVNode = ci._vnode;
        let oldDom = ci._domNode || null;
        const oldVNodeBase = vb(oldVNode);
        if (!oldDom && oldVNodeBase?.dom) {
          oldDom = oldVNodeBase.dom as Node | null;
        }
        const compVNodeBase = vb(ci.__componentVNode);
        if (!oldDom && compVNodeBase?.dom) {
          oldDom = compVNodeBase.dom as Node | null;
        }

        if (rendered != null && typeof rendered !== "boolean") {
          ci._vnode = rendered;
        }

        const renderedBase = vb(rendered);
        if (oldDom && renderedBase) {
          renderedBase.dom = oldDom as HTMLElement;
        }
        if (oldDom) {
          ci._domNode = oldDom;
        }

        if (rendered === null || rendered === undefined || typeof rendered === "boolean") {
          if (rendered === null || rendered === undefined) {
            console.debug(
              `[Renderer] Component ${instance.constructor.name} returned null/undefined from render(), returning placeholder to maintain instance tracking`,
            );
            const placeholder = {
              type: "span",
              props: { style: "display: none;", "data-swiss-null": "true" },
              children: []
            } as unknown as VNode;
            // FABLE-RENDER-001 D3: this branch's own comment says "to maintain instance
            // tracking", but never actually set __componentInstance on the placeholder --
            // only the non-null path below (renderedBase.__componentInstance = instance) did.
            // dom-creation.ts's initial-creation path reads `vb(rendered)?.__componentInstance`
            // to decide which SwissComponent instance owns the DOM node it's about to create,
            // and only THEN wires ci._domNode (and, via other call sites, ci._vnode) back onto
            // the instance. Without this tag, a component whose first render is null never gets
            // that linkage at all -- so once render() later returns real content, performUpdate()
            // finds _container, _domNode AND _vnode all unset, falls through every branch to
            // handleNoUpdatePath(), which itself requires one of those to already point at an
            // HTMLElement to do anything -- and silently no-ops. The placeholder DOM node is
            // physically in the page the whole time; the component just never learned where it
            // is. Tagging it here, like the non-null path already does, is what "maintain
            // instance tracking" was always supposed to mean.
            const placeholderBase = vb(placeholder);
            if (placeholderBase) {
              try {
                placeholderBase.__componentInstance = instance;
              } catch (error) {
                console.error(
                  `[Renderer] Failed to set __componentInstance on null-render placeholder for ${instance.constructor.name}:`,
                  error,
                );
              }
            }
            return placeholder;
          }
          return rendered;
        }

        if (renderedBase) {
          try {
            renderedBase.__componentInstance = instance;
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
        return untrack(() => (Component as (props: Record<string, unknown>) => VNode)(props));
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
